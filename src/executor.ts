import { Sandbox } from 'e2b';
import { exec } from 'node:child_process';
import {
  readFile,
  writeFile,
  mkdir,
  stat,
  readdir,
  rm,
  rename,
  chmod,
} from 'node:fs/promises';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { glob } from 'glob';
import { ALL_WORKSPACE_FILES, SYNC_BACK_FILES } from './workspace.js';

export interface FileInfo {
  name: string;
  isDir: boolean;
  size: number;
  modTime: string;
  permissions: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface Executor {
  /** Run a shell command */
  runCommand(command: string, opts?: { timeout?: number; cwd?: string }): Promise<CommandResult>;

  /** Read a file's content */
  readFile(filePath: string): Promise<string>;

  /** Write content to a file (creates parent dirs) */
  writeFile(filePath: string, content: string): Promise<void>;

  /** Find files matching a glob pattern */
  glob(pattern: string, cwd?: string): Promise<string[]>;

  /** Get the working directory */
  getCwd(): string;

  /** List files in a directory with metadata */
  listFiles(dirPath: string): Promise<FileInfo[]>;

  /** Get metadata for a single file */
  getFileInfo(filePath: string): Promise<FileInfo>;

  /** Create a directory */
  createFolder(dirPath: string, mode?: string): Promise<void>;

  /** Delete a file or directory */
  deleteFile(filePath: string): Promise<void>;

  /** Move or rename a file/directory */
  moveFile(source: string, destination: string): Promise<void>;

  /** Set file permissions */
  setPermissions(filePath: string, mode: string): Promise<void>;

  /** Upload a file from local machine to executor environment */
  uploadFile(localPath: string, remotePath: string): Promise<void>;

  /** Download a file from executor environment to local machine */
  downloadFile(remotePath: string, localPath: string): Promise<void>;

  /** Find and replace text across multiple files */
  replaceInFiles(files: string[], pattern: string, replacement: string): Promise<string>;

  /** Sync workspace memory files back from executor to local (no-op for local) */
  syncMemory(): Promise<void>;

  /** Clean up resources */
  destroy(): Promise<void>;
}

// ─── Local Executor ──────────────────────────────────────────────────────────

export class LocalExecutor implements Executor {
  getCwd(): string {
    return process.cwd();
  }

  async runCommand(
    command: string,
    opts?: { timeout?: number; cwd?: string },
  ): Promise<CommandResult> {
    const timeout = opts?.timeout ?? 30_000;
    const cwd = opts?.cwd ?? process.cwd();

    return new Promise((res) => {
      exec(command, { cwd, timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        res({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
        });
      });
    });
  }

  async readFile(filePath: string): Promise<string> {
    const absPath = resolve(filePath);
    return readFile(absPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const absPath = resolve(filePath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf-8');
  }

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    const searchDir = resolve(cwd || process.cwd());
    return glob(pattern, { cwd: searchDir, nodir: true });
  }

  async listFiles(dirPath: string): Promise<FileInfo[]> {
    const absPath = resolve(dirPath);
    const entries = await readdir(absPath, { withFileTypes: true });
    const results: FileInfo[] = [];
    for (const entry of entries) {
      const entryPath = resolve(absPath, entry.name);
      const s = await stat(entryPath);
      results.push({
        name: entry.name,
        isDir: entry.isDirectory(),
        size: s.size,
        modTime: s.mtime.toISOString(),
        permissions: '0' + (s.mode & 0o777).toString(8),
      });
    }
    return results;
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    const absPath = resolve(filePath);
    const s = await stat(absPath);
    return {
      name: basename(absPath),
      isDir: s.isDirectory(),
      size: s.size,
      modTime: s.mtime.toISOString(),
      permissions: '0' + (s.mode & 0o777).toString(8),
    };
  }

  async createFolder(dirPath: string, mode?: string): Promise<void> {
    const absPath = resolve(dirPath);
    await mkdir(absPath, { recursive: true, mode: mode ? parseInt(mode, 8) : 0o755 });
  }

  async deleteFile(filePath: string): Promise<void> {
    const absPath = resolve(filePath);
    await rm(absPath, { recursive: true, force: true });
  }

  async moveFile(source: string, destination: string): Promise<void> {
    const srcPath = resolve(source);
    const destPath = resolve(destination);
    await mkdir(dirname(destPath), { recursive: true });
    await rename(srcPath, destPath);
  }

  async setPermissions(filePath: string, mode: string): Promise<void> {
    const absPath = resolve(filePath);
    await chmod(absPath, parseInt(mode, 8));
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    // Local mode: just copy the file
    const content = await readFile(resolve(localPath));
    const destPath = resolve(remotePath);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, content);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    // Local mode: just copy the file
    const content = await readFile(resolve(remotePath));
    const destPath = resolve(localPath);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, content);
  }

  async replaceInFiles(files: string[], pattern: string, replacement: string): Promise<string> {
    const results: string[] = [];
    for (const file of files) {
      const absPath = resolve(file);
      const content = await readFile(absPath, 'utf-8');
      const regex = new RegExp(pattern, 'g');
      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        const newContent = content.replace(regex, replacement);
        await writeFile(absPath, newContent, 'utf-8');
        results.push(`${file}: ${matches.length} replacement(s)`);
      } else {
        results.push(`${file}: no matches`);
      }
    }
    return results.join('\n');
  }

  async syncMemory(): Promise<void> {
    // Already on local disk, no-op
  }

  async destroy(): Promise<void> {
    // Nothing to clean up locally
  }
}

// ─── Sandbox Executor (E2B) ─────────────────────────────────────────────────

export class SandboxExecutor implements Executor {
  private sandbox: Sandbox | null = null;
  private initPromise: Promise<Sandbox> | null = null;
  private cwd = '/home/user';
  private workspacePath: string;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || join(process.cwd(), 'workspace');
  }

  private ensureSandbox(): Promise<Sandbox> {
    if (this.sandbox) return Promise.resolve(this.sandbox);
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('\n  Starting E2B sandbox...');
      this.sandbox = await Sandbox.create({ timeoutMs: 300_000 });
      console.log(`  Sandbox ready (id: ${this.sandbox.sandboxId})`);
      await this.syncWorkspaceToSandbox();
      return this.sandbox;
    })();

    return this.initPromise;
  }

  /** Upload local workspace files into the sandbox */
  private async syncWorkspaceToSandbox(): Promise<void> {
    if (!this.sandbox) return;
    const remoteDir = `${this.cwd}/workspace`;
    await this.sandbox.commands.run(`mkdir -p ${remoteDir}/memory ${remoteDir}/journal`);

    let count = 0;
    // Sync static workspace files
    for (const file of ALL_WORKSPACE_FILES) {
      const localPath = join(this.workspacePath, file);
      if (!existsSync(localPath)) continue;
      const content = readFileSync(localPath, 'utf-8');
      await this.sandbox.files.write(`${remoteDir}/${file}`, content);
      count++;
    }
    // Sync journal files
    const journalDir = join(this.workspacePath, 'journal');
    if (existsSync(journalDir)) {
      for (const file of readdirSync(journalDir).filter(f => f.endsWith('.md'))) {
        const content = readFileSync(join(journalDir, file), 'utf-8');
        await this.sandbox.files.write(`${remoteDir}/journal/${file}`, content);
        count++;
      }
    }
    console.log(`  Synced ${count} workspace files → sandbox\n`);
  }

  /** Download modified workspace files from the sandbox back to local */
  private async syncWorkspaceFromSandbox(): Promise<void> {
    if (!this.sandbox) return;
    const remoteDir = `${this.cwd}/workspace`;

    let count = 0;
    for (const file of SYNC_BACK_FILES) {
      try {
        const content = await this.sandbox.files.read(`${remoteDir}/${file}`);
        const localPath = join(this.workspacePath, file);
        mkdirSync(dirname(localPath), { recursive: true });
        writeFileSync(localPath, content, 'utf-8');
        count++;
      } catch {
        // File may not exist in sandbox, skip
      }
    }
    if (count > 0) {
      console.log(`  Synced ${count} workspace files ← sandbox`);
    }
  }

  private resolvePath(filePath: string): string {
    return filePath.startsWith('/') ? filePath : `${this.cwd}/${filePath}`;
  }

  getCwd(): string {
    return this.cwd;
  }

  async runCommand(
    command: string,
    opts?: { timeout?: number; cwd?: string },
  ): Promise<CommandResult> {
    const sbx = await this.ensureSandbox();
    const timeout = opts?.timeout ?? 30_000;
    const cwd = opts?.cwd ?? this.cwd;

    const result = await sbx.commands.run(command, {
      cwd,
      timeoutMs: timeout,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async readFile(filePath: string): Promise<string> {
    const sbx = await this.ensureSandbox();
    return sbx.files.read(this.resolvePath(filePath));
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    await sbx.files.write(this.resolvePath(filePath), content);
  }

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    const sbx = await this.ensureSandbox();
    const searchDir = cwd || this.cwd;
    const result = await sbx.commands.run(
      `find ${searchDir} -type f -name '${pattern.replace(/\*\*/g, '*')}' 2>/dev/null | head -1000`,
      { timeoutMs: 15_000 },
    );
    if (!result.stdout.trim()) return [];
    return result.stdout.trim().split('\n');
  }

  async listFiles(dirPath: string): Promise<FileInfo[]> {
    const sbx = await this.ensureSandbox();
    const absPath = this.resolvePath(dirPath);
    const result = await sbx.commands.run(
      `stat --format='%n|%F|%s|%Y|%a' ${absPath}/* ${absPath}/.* 2>/dev/null || true`,
      { timeoutMs: 10_000 },
    );
    if (!result.stdout.trim()) return [];
    return result.stdout
      .trim()
      .split('\n')
      .filter((line) => {
        const name = basename(line.split('|')[0]);
        return name !== '.' && name !== '..';
      })
      .map((line) => {
        const [fullPath, type, size, mtime, perms] = line.split('|');
        return {
          name: basename(fullPath),
          isDir: type === 'directory',
          size: parseInt(size) || 0,
          modTime: new Date(parseInt(mtime) * 1000).toISOString(),
          permissions: '0' + perms,
        };
      });
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    const sbx = await this.ensureSandbox();
    const absPath = this.resolvePath(filePath);
    const result = await sbx.commands.run(
      `stat --format='%n|%F|%s|%Y|%a' '${absPath}'`,
      { timeoutMs: 5_000 },
    );
    const [fullPath, type, size, mtime, perms] = result.stdout.trim().split('|');
    return {
      name: basename(fullPath),
      isDir: type === 'directory',
      size: parseInt(size) || 0,
      modTime: new Date(parseInt(mtime) * 1000).toISOString(),
      permissions: '0' + perms,
    };
  }

  async createFolder(dirPath: string, mode?: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    const absPath = this.resolvePath(dirPath);
    await sbx.commands.run(`mkdir -p -m ${mode || '755'} '${absPath}'`);
  }

  async deleteFile(filePath: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    const absPath = this.resolvePath(filePath);
    await sbx.commands.run(`rm -rf '${absPath}'`);
  }

  async moveFile(source: string, destination: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    await sbx.commands.run(`mkdir -p '${dirname(destPath)}' && mv '${srcPath}' '${destPath}'`);
  }

  async setPermissions(filePath: string, mode: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    const absPath = this.resolvePath(filePath);
    await sbx.commands.run(`chmod ${mode} '${absPath}'`);
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    const content = await readFile(resolve(localPath), 'utf-8');
    await sbx.files.write(this.resolvePath(remotePath), content);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const sbx = await this.ensureSandbox();
    const content = await sbx.files.read(this.resolvePath(remotePath));
    const destPath = resolve(localPath);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, content, 'utf-8');
  }

  async replaceInFiles(files: string[], pattern: string, replacement: string): Promise<string> {
    const sbx = await this.ensureSandbox();
    const results: string[] = [];
    for (const file of files) {
      const absPath = this.resolvePath(file);
      const content = await sbx.files.read(absPath);
      const regex = new RegExp(pattern, 'g');
      const matches = content.match(regex);
      if (matches && matches.length > 0) {
        const newContent = content.replace(regex, replacement);
        await sbx.files.write(absPath, newContent);
        results.push(`${file}: ${matches.length} replacement(s)`);
      } else {
        results.push(`${file}: no matches`);
      }
    }
    return results.join('\n');
  }

  async syncMemory(): Promise<void> {
    if (!this.sandbox) return;
    const remoteDir = `${this.cwd}/workspace`;
    // Sync back memory + heartbeat
    for (const file of SYNC_BACK_FILES) {
      try {
        const content = await this.sandbox.files.read(`${remoteDir}/${file}`);
        const localPath = join(this.workspacePath, file);
        mkdirSync(dirname(localPath), { recursive: true });
        writeFileSync(localPath, content, 'utf-8');
      } catch {
        // File may not exist in sandbox yet
      }
    }
    // Sync back journal files
    await this.syncJournalFromSandbox();
  }

  private async syncJournalFromSandbox(): Promise<void> {
    if (!this.sandbox) return;
    const remoteJournalDir = `${this.cwd}/workspace/journal`;
    try {
      const result = await this.sandbox.commands.run(
        `ls ${remoteJournalDir}/*.md 2>/dev/null || true`,
        { timeoutMs: 5_000 },
      );
      if (!result.stdout.trim()) return;
      const files = result.stdout.trim().split('\n');
      const localJournalDir = join(this.workspacePath, 'journal');
      mkdirSync(localJournalDir, { recursive: true });
      for (const remotePath of files) {
        try {
          const content = await this.sandbox.files.read(remotePath);
          const filename = basename(remotePath);
          writeFileSync(join(localJournalDir, filename), content, 'utf-8');
        } catch {
          // skip
        }
      }
    } catch {
      // journal dir may not exist
    }
  }

  async destroy(): Promise<void> {
    if (this.sandbox) {
      await this.syncWorkspaceFromSandbox();
      console.log('  Shutting down sandbox...');
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createExecutor(useSandbox: boolean): Executor {
  if (useSandbox) {
    if (!process.env.E2B_API_KEY) {
      console.error('Error: E2B_API_KEY is required for sandbox mode.');
      console.error('Set it in your .env file or environment, or use --local to run locally.');
      process.exit(1);
    }
    return new SandboxExecutor();
  }
  return new LocalExecutor();
}
