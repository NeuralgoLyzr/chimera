import { ToolHandler, truncateOutput } from '../types.js';

export const replaceInFilesTool: ToolHandler = {
  definition: {
    name: 'replace_in_files',
    description:
      'Find and replace text across multiple files using a regex pattern. Returns a summary of replacements made in each file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of file paths to search and replace in',
        },
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for',
        },
        replacement: {
          type: 'string',
          description: 'Replacement string',
        },
      },
      required: ['files', 'pattern', 'replacement'],
    },
  },

  async execute(input, executor) {
    const files = input.files as string[];
    const pattern = input.pattern as string;
    const replacement = input.replacement as string;

    const result = await executor.replaceInFiles(files, pattern, replacement);

    return truncateOutput(result);
  },
};
