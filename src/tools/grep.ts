import { ToolHandler, truncateOutput } from '../types.js';

export const grepTool: ToolHandler = {
  definition: {
    name: 'grep',
    description:
      'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        path: {
          type: 'string',
          description:
            'File or directory to search in. Defaults to current working directory.',
        },
        include: {
          type: 'string',
          description: 'Glob to filter files (e.g., "*.ts", "*.py")',
        },
      },
      required: ['pattern'],
    },
  },

  async execute(input, executor) {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) || executor.getCwd();
    const include = input.include as string | undefined;

    const args = ['-rn', '--color=never'];
    if (include) args.push(`--include=${include}`);

    // Escape single quotes in pattern for shell safety
    const escapedPattern = pattern.replace(/'/g, "'\\''");
    const cmd = `grep ${args.join(' ')} -e '${escapedPattern}' '${searchPath}'`;

    const result = await executor.runCommand(cmd, { timeout: 30_000 });

    const stdout = result.stdout;
    if (!stdout.trim()) {
      return 'No matches found.';
    }

    const lines = stdout.split('\n').filter(Boolean);
    let output: string;
    if (lines.length > 100) {
      output =
        lines.slice(0, 100).join('\n') +
        `\n... and ${lines.length - 100} more matches`;
    } else {
      output = lines.join('\n');
    }

    return truncateOutput(output);
  },
};
