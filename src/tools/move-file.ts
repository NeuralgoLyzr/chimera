import { ToolHandler } from '../types.js';

export const moveFileTool: ToolHandler = {
  definition: {
    name: 'move_file',
    description:
      'Move or rename a file or directory. Creates parent directories at the destination automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'Source path of the file or directory',
        },
        destination: {
          type: 'string',
          description: 'Destination path',
        },
      },
      required: ['source', 'destination'],
    },
  },

  async execute(input, executor) {
    const source = input.source as string;
    const destination = input.destination as string;

    await executor.moveFile(source, destination);

    return `Moved: ${source} → ${destination}`;
  },
};
