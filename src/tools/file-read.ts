import { ToolHandler, truncateOutput } from '../types.js';

export const fileReadTool: ToolHandler = {
  definition: {
    name: 'file_read',
    description:
      'Read the contents of a file. Returns lines with line numbers. Supports offset and limit for large files.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to read (absolute or relative)',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-based). Default: 1',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read. Default: 2000',
        },
      },
      required: ['file_path'],
    },
  },

  async execute(input, executor) {
    const filePath = input.file_path as string;
    const offset = Math.max(1, (input.offset as number) || 1);
    const limit = (input.limit as number) || 2000;

    const content = await executor.readFile(filePath);
    const allLines = content.split('\n');
    const lines = allLines.slice(offset - 1, offset - 1 + limit);

    const numbered = lines.map(
      (line, i) => `${String(offset + i).padStart(5)}\t${line}`,
    );

    let result = numbered.join('\n');
    if (offset + limit - 1 < allLines.length) {
      result += `\n... (${allLines.length - offset - limit + 1} more lines)`;
    }

    return truncateOutput(result);
  },
};
