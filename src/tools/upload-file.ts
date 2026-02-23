import { ToolHandler } from '../types.js';

export const uploadFileTool: ToolHandler = {
  definition: {
    name: 'upload_file',
    description:
      'Upload a file from the local machine to the sandbox environment. Use this to transfer local files into the sandbox for processing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        local_path: {
          type: 'string',
          description: 'Path to the file on the local machine',
        },
        remote_path: {
          type: 'string',
          description: 'Destination path in the sandbox',
        },
      },
      required: ['local_path', 'remote_path'],
    },
  },

  async execute(input, executor) {
    const localPath = input.local_path as string;
    const remotePath = input.remote_path as string;

    await executor.uploadFile(localPath, remotePath);

    return `Uploaded ${localPath} → ${remotePath}`;
  },
};
