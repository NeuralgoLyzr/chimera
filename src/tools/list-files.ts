import { ToolHandler, truncateOutput } from '../types.js';

export const listFilesTool: ToolHandler = {
  definition: {
    name: 'list_files',
    description:
      'List files and directories in a given path with metadata (name, type, size, modified time, permissions).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list. Defaults to current working directory.',
        },
      },
      required: [],
    },
  },

  async execute(input, executor) {
    const dirPath = (input.path as string) || executor.getCwd();

    const files = await executor.listFiles(dirPath);

    if (files.length === 0) {
      return 'Directory is empty.';
    }

    const lines = files.map((f) => {
      const type = f.isDir ? 'dir ' : 'file';
      const size = f.isDir ? '-' : formatSize(f.size);
      return `${f.permissions}  ${type}  ${size.padStart(8)}  ${f.modTime.slice(0, 19)}  ${f.name}`;
    });

    return truncateOutput(lines.join('\n'));
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
