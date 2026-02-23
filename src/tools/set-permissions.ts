import { ToolHandler } from '../types.js';

export const setPermissionsTool: ToolHandler = {
  definition: {
    name: 'set_permissions',
    description:
      'Set file or directory permissions (chmod).',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file or directory',
        },
        mode: {
          type: 'string',
          description: 'Permission mode (e.g., "755", "644", "600")',
        },
      },
      required: ['file_path', 'mode'],
    },
  },

  async execute(input, executor) {
    const filePath = input.file_path as string;
    const mode = input.mode as string;

    await executor.setPermissions(filePath, mode);

    return `Set permissions on ${filePath} to ${mode}`;
  },
};
