import { ToolHandler } from '../types.js';
import { SkillsLoader } from '../skills.js';
import { Executor } from '../executor.js';

const loader = new SkillsLoader();

export const loadSkillTool: ToolHandler = {
  definition: {
    name: 'load_skill',
    description:
      'Load the full content of a skill by name. Use this to read a skill\'s SKILL.md instructions before following them. Works for local (builtin/workspace) and remote skills.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'The skill name (e.g. "code-review", "git-commit", "trello")',
        },
      },
      required: ['name'],
    },
  },

  async execute(input: Record<string, unknown>, _executor: Executor): Promise<string> {
    const name = input.name as string;

    // Try local skills first (workspace + builtin)
    const localContent = loader.loadSkill(name);
    if (localContent) {
      return localContent;
    }

    // Try remote skills
    const remoteSkills = await loader.fetchRemoteSkills();
    const remoteMatch = remoteSkills.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );

    if (remoteMatch) {
      // Extract skill ID from the path URL
      const idMatch = remoteMatch.path.match(/\/skills\/([^/]+)\/content/);
      if (idMatch) {
        const content = await loader.loadRemoteSkill(idMatch[1]);
        if (content) return content;
      }
    }

    return `Error: skill "${name}" not found. Use the skills summary in the system prompt to see available skills.`;
  },
};
