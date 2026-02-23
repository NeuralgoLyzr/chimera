import { ToolHandler } from '../types.js';
import { Executor } from '../executor.js';

const SKILLS_API_URL = process.env.SKILLS_API_URL || null;

export const createSkillTool: ToolHandler = {
  definition: {
    name: 'create_skill',
    description:
      'Create a new skill by uploading it to the Skills API. The skill must include a SKILL.md file with YAML frontmatter (name, description). Optionally include additional files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        skill_md: {
          type: 'string',
          description:
            'The full content of the SKILL.md file, including YAML frontmatter with name and description.',
        },
        extra_files: {
          type: 'object',
          description:
            'Optional additional files to include with the skill. Keys are filenames, values are file contents.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['skill_md'],
    },
  },

  async execute(input: Record<string, unknown>, _executor: Executor): Promise<string> {
    if (!SKILLS_API_URL) {
      return 'Error: SKILLS_API_URL is not configured. Set it in your .env file to use remote skills.';
    }

    const skillMd = input.skill_md as string;
    const extraFiles = (input.extra_files as Record<string, string>) || {};

    // Validate SKILL.md has frontmatter
    if (!skillMd.startsWith('---')) {
      return 'Error: SKILL.md must start with YAML frontmatter (---). Include at least name and description fields.';
    }

    // Build multipart form data
    const boundary = '----ArchitectSkillBoundary' + Date.now();
    const parts: string[] = [];

    // Add SKILL.md
    parts.push(`--${boundary}`);
    parts.push('Content-Disposition: form-data; name="files"; filename="SKILL.md"');
    parts.push('Content-Type: text/markdown');
    parts.push('');
    parts.push(skillMd);

    // Add extra files
    for (const [filename, content] of Object.entries(extraFiles)) {
      parts.push(`--${boundary}`);
      parts.push(`Content-Disposition: form-data; name="files"; filename="${filename}"`);
      parts.push('Content-Type: application/octet-stream');
      parts.push('');
      parts.push(content);
    }

    parts.push(`--${boundary}--`);
    const body = parts.join('\r\n');

    try {
      const resp = await fetch(`${SKILLS_API_URL}/v1/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return `Error creating skill (${resp.status}): ${errText}`;
      }

      const data = (await resp.json()) as {
        id: string;
        name: string;
        description: string;
        version: number;
        message: string;
      };

      return `Skill created successfully!\n  ID: ${data.id}\n  Name: ${data.name}\n  Description: ${data.description}\n  Version: ${data.version}`;
    } catch (err) {
      return `Error: Failed to connect to Skills API at ${SKILLS_API_URL}. Is the server running?\n${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
