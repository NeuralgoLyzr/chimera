import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: 'builtin' | 'workspace' | 'remote';
  available: boolean;
  always: boolean;
}

interface SkillMetadata {
  name: string;
  description: string;
  always?: boolean;
  requires?: {
    bins?: string[];
    env?: string[];
  };
}

export class SkillsLoader {
  private builtinDir: string;
  private workspaceDir: string;
  private remoteApiUrl: string | null;

  constructor(opts?: { workspaceDir?: string; builtinDir?: string }) {
    this.builtinDir = opts?.builtinDir || join(homedir(), '.architect', 'skills');
    this.workspaceDir = opts?.workspaceDir || join(process.cwd(), 'skills');
    this.remoteApiUrl = process.env.SKILLS_API_URL || null;
  }

  // ─── List all skills ─────────────────────────────────────────────────────

  listSkills(): SkillInfo[] {
    const skills: SkillInfo[] = [];
    const seen = new Set<string>();

    // Workspace skills (highest priority)
    this.loadFromDir(this.workspaceDir, 'workspace', skills, seen);

    // Builtin skills
    this.loadFromDir(this.builtinDir, 'builtin', skills, seen);

    return skills;
  }

  private loadFromDir(
    dir: string,
    source: 'builtin' | 'workspace',
    skills: SkillInfo[],
    seen: Set<string>,
  ): void {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir)) {
      const skillDir = join(dir, entry);
      if (!statSync(skillDir).isDirectory()) continue;

      const skillFile = join(skillDir, 'SKILL.md');
      if (!existsSync(skillFile)) continue;

      if (seen.has(entry)) continue; // workspace overrides builtin
      seen.add(entry);

      const meta = this.parseSkillMd(skillFile);
      const available = this.checkRequirements(meta);

      skills.push({
        name: meta.name || entry,
        description: meta.description || entry,
        path: skillFile,
        source,
        available,
        always: meta.always || false,
      });
    }
  }

  // ─── Load skill content ──────────────────────────────────────────────────

  loadSkill(name: string): string | null {
    // Check workspace first
    const workspaceSkill = join(this.workspaceDir, name, 'SKILL.md');
    if (existsSync(workspaceSkill)) {
      return readFileSync(workspaceSkill, 'utf-8');
    }

    // Check builtin
    const builtinSkill = join(this.builtinDir, name, 'SKILL.md');
    if (existsSync(builtinSkill)) {
      return readFileSync(builtinSkill, 'utf-8');
    }

    return null;
  }

  // ─── Load always-on skills content ───────────────────────────────────────

  loadAlwaysSkills(): string {
    const skills = this.listSkills().filter((s) => s.always && s.available);
    if (skills.length === 0) return '';

    const parts: string[] = [];
    for (const skill of skills) {
      const content = this.loadSkill(skill.name);
      if (content) {
        const body = this.stripFrontmatter(content);
        parts.push(`### Skill: ${skill.name}\n\n${body}`);
      }
    }

    return parts.length > 0
      ? `## Active Skills\n\n${parts.join('\n\n---\n\n')}`
      : '';
  }

  // ─── Build XML skills summary for system prompt ──────────────────────────

  buildSkillsSummary(): string {
    const skills = this.listSkills();
    if (skills.length === 0) return '';

    const escXml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = ['<skills>'];
    for (const s of skills) {
      lines.push(`  <skill available="${s.available}">`);
      lines.push(`    <name>${escXml(s.name)}</name>`);
      lines.push(`    <description>${escXml(s.description)}</description>`);
      lines.push(`    <location>${s.path}</location>`);
      lines.push(`  </skill>`);
    }
    lines.push('</skills>');

    return lines.join('\n');
  }

  // ─── Fetch remote skills from Skills API ─────────────────────────────────

  async fetchRemoteSkills(): Promise<SkillInfo[]> {
    if (!this.remoteApiUrl) return [];

    try {
      const resp = await fetch(`${this.remoteApiUrl}/v1/skills`);
      if (!resp.ok) return [];

      const data = (await resp.json()) as {
        skills: Array<{
          id: string;
          name: string;
          description: string;
        }>;
      };

      return data.skills.map((s) => ({
        name: s.name,
        description: s.description,
        path: `${this.remoteApiUrl}/v1/skills/${s.id}/content`,
        source: 'remote' as const,
        available: true,
        always: false,
      }));
    } catch {
      return [];
    }
  }

  async loadRemoteSkill(skillId: string): Promise<string | null> {
    if (!this.remoteApiUrl) return null;

    try {
      const resp = await fetch(`${this.remoteApiUrl}/v1/skills/${skillId}/content`);
      if (!resp.ok) return null;

      const data = (await resp.json()) as {
        files: Record<string, string>;
      };

      return data.files['SKILL.md'] || null;
    } catch {
      return null;
    }
  }

  // ─── Build full system prompt section ────────────────────────────────────

  async buildSkillsContext(): Promise<string> {
    const parts: string[] = [];

    // Always-on skills (full content)
    const alwaysContent = this.loadAlwaysSkills();
    if (alwaysContent) parts.push(alwaysContent);

    // Skills summary (metadata only — agent reads full content on-demand)
    const summary = this.buildSkillsSummary();

    // Add remote skills to summary
    const remoteSkills = await this.fetchRemoteSkills();
    if (remoteSkills.length > 0) {
      const escXml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const remoteLines = remoteSkills.map(
        (s) =>
          `  <skill available="true" source="remote">\n    <name>${escXml(s.name)}</name>\n    <description>${escXml(s.description)}</description>\n    <location>${s.path}</location>\n  </skill>`,
      );

      // Merge into summary or create new one
      if (summary) {
        const merged = summary.replace(
          '</skills>',
          `${remoteLines.join('\n')}\n</skills>`,
        );
        parts.push(`## Available Skills\n\nTo use a skill, read its SKILL.md file using file_read.\n\n${merged}`);
      } else {
        parts.push(
          `## Available Skills\n\nTo use a skill, read its SKILL.md file using file_read.\n\n<skills>\n${remoteLines.join('\n')}\n</skills>`,
        );
      }
    } else if (summary) {
      parts.push(`## Available Skills\n\nTo use a skill, read its SKILL.md file using file_read.\n\n${summary}`);
    }

    return parts.join('\n\n');
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private parseSkillMd(filePath: string): SkillMetadata {
    const content = readFileSync(filePath, 'utf-8');
    const meta: SkillMetadata = { name: '', description: '' };

    if (content.startsWith('---')) {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const lines = match[1].split('\n');
        let currentSection: string | null = null;
        let currentSubSection: string | null = null;

        for (const line of lines) {
          // Detect YAML list items (e.g. "  - SUPABASE_ACCESS_TOKEN")
          const listMatch = line.match(/^\s+-\s+(.+)$/);
          if (listMatch && currentSection === 'requires' && currentSubSection) {
            if (!meta.requires) meta.requires = {};
            const key = currentSubSection as 'bins' | 'env';
            if (!meta.requires[key]) meta.requires[key] = [];
            meta.requires[key]!.push(listMatch[1].trim());
            continue;
          }

          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const rawKey = line.slice(0, colonIdx).trim();
          const key = rawKey.toLowerCase();
          const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');

          // Handle nested keys like "requires:" and sub-keys like "  env:"
          const indent = line.length - line.trimStart().length;

          if (indent === 0) {
            currentSection = key;
            currentSubSection = null;
            if (key === 'name') meta.name = val;
            if (key === 'description') meta.description = val;
            if (key === 'always') meta.always = val === 'true';
            if (key === 'requires' && !val) {
              meta.requires = meta.requires || {};
            }
          } else if (indent > 0 && currentSection === 'requires') {
            currentSubSection = key;
            // Handle inline list: "env: [FOO, BAR]"
            if (val.startsWith('[') && val.endsWith(']')) {
              if (!meta.requires) meta.requires = {};
              const items = val
                .slice(1, -1)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              meta.requires[key as 'bins' | 'env'] = items;
            }
          }
        }
      }
    }

    if (!meta.name) meta.name = basename(join(filePath, '..'));
    return meta;
  }

  private stripFrontmatter(content: string): string {
    if (content.startsWith('---')) {
      const match = content.match(/^---\n[\s\S]*?\n---\n/);
      if (match) return content.slice(match[0].length).trim();
    }
    return content;
  }

  private checkRequirements(meta: SkillMetadata): boolean {
    if (!meta.requires) return true;
    // For now, basic env var checking
    for (const env of meta.requires.env || []) {
      if (!process.env[env]) return false;
    }
    return true;
  }
}
