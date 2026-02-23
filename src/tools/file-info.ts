import { ToolHandler } from '../types.js';

export const fileInfoTool: ToolHandler = {
  definition: {
    name: 'file_info',
    description:
      'Get metadata for a file or directory (name, type, size, modified time, permissions).',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file or directory',
        },
      },
      required: ['file_path'],
    },
  },

  async execute(input, executor) {
    const filePath = input.file_path as string;

    const info = await executor.getFileInfo(filePath);

    return [
      `Name:        ${info.name}`,
      `Type:        ${info.isDir ? 'directory' : 'file'}`,
      `Size:        ${info.size} bytes`,
      `Modified:    ${info.modTime}`,
      `Permissions: ${info.permissions}`,
    ].join('\n');
  },
};
