import { ToolHandler, truncateOutput } from '../types.js';

export const globTool: ToolHandler = {
  definition: {
    name: 'glob',
    description:
      'Find files matching a glob pattern. Returns matching file paths relative to the search directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.test.ts")',
        },
        path: {
          type: 'string',
          description:
            'Directory to search in. Defaults to current working directory.',
        },
      },
      required: ['pattern'],
    },
  },

  async execute(input, executor) {
    const pattern = input.pattern as string;
    const searchPath = input.path as string | undefined;

    const matches = await executor.glob(pattern, searchPath);

    if (matches.length === 0) {
      return 'No files matched the pattern.';
    }

    const maxResults = 1000;
    const display = matches.slice(0, maxResults);
    let result = display.join('\n');
    if (matches.length > maxResults) {
      result += `\n... and ${matches.length - maxResults} more files`;
    }

    return truncateOutput(result);
  },
};
