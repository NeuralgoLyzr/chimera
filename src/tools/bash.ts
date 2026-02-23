import { ToolHandler, truncateOutput } from '../types.js';

export const bashTool: ToolHandler = {
  definition: {
    name: 'bash',
    description:
      'Execute a shell command. Returns stdout and stderr. Commands run in the current working directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        timeout: {
          type: 'number',
          description:
            'Timeout in milliseconds. Default: 30000 (30s). Max: 120000 (2min).',
        },
      },
      required: ['command'],
    },
  },

  async execute(input, executor) {
    const command = input.command as string;
    const timeout = Math.min((input.timeout as number) || 30_000, 120_000);

    const result = await executor.runCommand(command, { timeout });

    let output = '';
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? '\n' : '') + result.stderr;
    if (!output) output = '(no output)';

    return truncateOutput(output);
  },
};
