import { ToolHandler } from '../types.js';

export const fileWriteTool: ToolHandler = {
  definition: {
    name: 'file_write',
    description:
      'Create or overwrite a file with the given content. Creates parent directories if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },

  async execute(input, executor) {
    const filePath = input.file_path as string;
    const content = input.content as string;

    await executor.writeFile(filePath, content);

    return `Wrote ${Buffer.byteLength(content, 'utf-8')} bytes to ${filePath}`;
  },
};
