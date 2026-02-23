import { ToolHandler } from '../types.js';

export const downloadFileTool: ToolHandler = {
  definition: {
    name: 'download_file',
    description:
      'Download a file from the sandbox environment to the local machine. Use this to retrieve files generated or modified in the sandbox.',
    input_schema: {
      type: 'object' as const,
      properties: {
        remote_path: {
          type: 'string',
          description: 'Path to the file in the sandbox',
        },
        local_path: {
          type: 'string',
          description: 'Destination path on the local machine',
        },
      },
      required: ['remote_path', 'local_path'],
    },
  },

  async execute(input, executor) {
    const remotePath = input.remote_path as string;
    const localPath = input.local_path as string;

    await executor.downloadFile(remotePath, localPath);

    return `Downloaded ${remotePath} → ${localPath}`;
  },
};
