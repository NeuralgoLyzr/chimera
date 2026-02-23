import { ToolHandler, truncateOutput } from '../types.js';

export const gitTool: ToolHandler = {
  definition: {
    name: 'git',
    description:
      'Run a git command. Supports status, diff, log, add, commit, branch, checkout, and other git subcommands.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subcommand: {
          type: 'string',
          description:
            'The git subcommand and arguments (e.g., "status", "diff --staged", "log --oneline -10")',
        },
      },
      required: ['subcommand'],
    },
  },

  async execute(input, executor) {
    const subcommand = input.subcommand as string;
    const cmd = `git ${subcommand}`;

    const result = await executor.runCommand(cmd, { timeout: 30_000 });

    let output = '';
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? '\n' : '') + result.stderr;
    if (!output) output = '(no output)';

    return truncateOutput(output);
  },
};
