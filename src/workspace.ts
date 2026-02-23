import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FOUNDATION_FILES = ['SOUL.md', 'AGENTS.md', 'USER.md'];
const SUPPLEMENTARY_FILES = ['TOOLS.md'];
const MEMORY_PATH = 'memory/MEMORY.md';

/** All workspace files that should be synced to/from sandbox */
export const ALL_WORKSPACE_FILES = [
  'SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md', 'HEARTBEAT.md', 'memory/MEMORY.md',
];

/** Files that may be modified by the agent and should be synced back from sandbox */
export const SYNC_BACK_FILES = ['memory/MEMORY.md', 'HEARTBEAT.md'];

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEFAULT_FILES: Record<string, string> = {
  'SOUL.md': `# Identity

You are Architect, an AI coding agent running in the user's terminal. You help with software engineering tasks by reading, writing, and editing files, running shell commands, searching codebases, and managing git workflows.

You are direct, thorough, and efficient. You explore before assuming, read before editing, and confirm before destroying.
`,

  'AGENTS.md': `# Agent Guidelines

## Core Rules
- Always read a file before editing it.
- Use tools to explore the codebase before making changes. Do not guess at file contents.
- When editing files, provide enough surrounding context in old_string to match exactly once.
- Use list_files to explore directories before working with files.
- Use upload_file/download_file to transfer files between the user's machine and the sandbox.
- Be careful with destructive operations (deleting files, force-pushing, etc). Confirm with the user first.
- Keep responses concise. Show what you did and why.

## Custom Instructions
<!-- Add your own instructions below. They will be included in every prompt. -->
`,

  'USER.md': `# User Profile

<!-- Fill in your details so Architect can personalize responses. -->

- **Name**:
- **Timezone**:
- **Preferred language**: English
- **Work context**:

## Preferences
<!-- e.g., "Always use TypeScript", "Prefer functional style", "Use pnpm not npm" -->
`,

  'TOOLS.md': `# Tool Reference

<!-- Supplementary tool tips beyond the auto-generated API schemas. -->

## Tips
- file_edit requires exact string matches. Copy-paste the old_string precisely.
- bash has a 30-second default timeout. Pass timeout for long-running commands.
- glob patterns use standard glob syntax: **/*.ts matches all TypeScript files recursively.
- grep supports full regex. Use include patterns to narrow searches.
- web_search requires BRAVE_API_KEY to be set in .env.
`,

  'HEARTBEAT.md': `# Heartbeat Tasks

<!-- Tasks listed here are intended for periodic review. -->
<!-- Future: these will be checked automatically every 30 minutes. -->

## Active Tasks

## Completed
`,

  'memory/MEMORY.md': `# Long-Term Memory

<!-- Architect reads this file on every request. -->
<!-- Update it with important context that should persist across sessions. -->

## Project Context

## Decisions Made

## Known Issues
`,
};

export class WorkspaceLoader {
  private workspacePath: string;

  constructor(workspacePath?: string) {
    this.workspacePath = workspacePath || join(process.cwd(), 'workspace');
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }

  /**
   * Ensure workspace directory exists with default template files.
   * Called once at startup. Never overwrites existing files.
   */
  ensureDefaults(): void {
    if (!existsSync(this.workspacePath)) {
      mkdirSync(this.workspacePath, { recursive: true });
    }

    const memoryDir = join(this.workspacePath, 'memory');
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }

    const journalDir = join(this.workspacePath, 'journal');
    if (!existsSync(journalDir)) {
      mkdirSync(journalDir, { recursive: true });
    }

    for (const [filename, content] of Object.entries(DEFAULT_FILES)) {
      const filepath = join(this.workspacePath, filename);
      if (!existsSync(filepath)) {
        writeFileSync(filepath, content, 'utf-8');
      }
    }

    // Create today's journal file if it doesn't exist
    this.ensureTodayJournal();
  }

  /**
   * Load foundation files (SOUL.md, AGENTS.md, USER.md).
   * Skips missing or empty files.
   */
  loadFoundationFiles(): string {
    const fragments: string[] = [];
    for (const filename of FOUNDATION_FILES) {
      const content = this.readFile(filename);
      if (content) fragments.push(content);
    }
    return fragments.join('\n\n');
  }

  /**
   * Load supplementary files (TOOLS.md).
   * Skips missing or empty files.
   */
  loadSupplementaryFiles(): string {
    const fragments: string[] = [];
    for (const filename of SUPPLEMENTARY_FILES) {
      const content = this.readFile(filename);
      if (content) fragments.push(content);
    }
    return fragments.join('\n\n');
  }

  /**
   * Load permanent memory (memory/MEMORY.md).
   */
  loadMemory(): string {
    return this.readFile(MEMORY_PATH) || '';
  }

  /**
   * Ensure today's journal file exists.
   */
  ensureTodayJournal(): void {
    const date = todayDateString();
    const filepath = join(this.workspacePath, 'journal', `${date}.md`);
    if (!existsSync(filepath)) {
      writeFileSync(filepath, `# Journal — ${date}\n\n`, 'utf-8');
    }
  }

  /**
   * Load today's journal entry.
   */
  loadTodayJournal(): string {
    const date = todayDateString();
    return this.readFile(join('journal', `${date}.md`)) || '';
  }

  /**
   * Load recent journal entries (last N days including today).
   */
  loadRecentJournals(daysBack: number = 7): string {
    const journalDir = join(this.workspacePath, 'journal');
    if (!existsSync(journalDir)) return '';

    const files = readdirSync(journalDir)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, daysBack);

    if (files.length === 0) return '';

    const entries: string[] = [];
    for (const file of files) {
      const content = this.readFile(join('journal', file));
      if (content) entries.push(content);
    }
    return entries.join('\n\n---\n\n');
  }

  /**
   * Get the path to today's journal file (for the agent to write to).
   */
  getTodayJournalPath(): string {
    return join(this.workspacePath, 'journal', `${todayDateString()}.md`);
  }

  private readFile(relativePath: string): string | null {
    const filepath = join(this.workspacePath, relativePath);
    if (!existsSync(filepath)) return null;
    try {
      const content = readFileSync(filepath, 'utf-8').trim();
      return content || null;
    } catch {
      return null;
    }
  }
}
