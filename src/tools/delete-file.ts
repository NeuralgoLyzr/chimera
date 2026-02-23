import { ToolHandler } from '../types.js';

export const deleteFileTool: ToolHandler = {
  definition: {
    name: 'delete_file',
    description:
      'Delete a file or directory. Directories are deleted recursively.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file or directory to delete',
        },
      },
      required: ['file_path'],
    },
  },

  async execute(input, executor) {
    const filePath = input.file_path as string;

    await executor.deleteFile(filePath);

    return `Deleted: ${filePath}`;
  },
};
