import { ToolHandler } from '../types.js';

export const createFolderTool: ToolHandler = {
  definition: {
    name: 'create_folder',
    description:
      'Create a new directory. Creates parent directories automatically if they do not exist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path of the directory to create',
        },
        mode: {
          type: 'string',
          description: 'Directory permissions (e.g., "755"). Default: "755"',
        },
      },
      required: ['path'],
    },
  },

  async execute(input, executor) {
    const dirPath = input.path as string;
    const mode = (input.mode as string) || '755';

    await executor.createFolder(dirPath, mode);

    return `Created directory: ${dirPath} (mode: ${mode})`;
  },
};
