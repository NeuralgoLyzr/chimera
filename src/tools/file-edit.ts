import { ToolHandler } from '../types.js';

export const fileEditTool: ToolHandler = {
  definition: {
    name: 'file_edit',
    description:
      'Edit a file by replacing an exact string match with new content. The old_string must appear exactly once in the file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find (must match exactly once)',
        },
        new_string: {
          type: 'string',
          description: 'The string to replace it with',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },

  async execute(input, executor) {
    const filePath = input.file_path as string;
    const oldString = input.old_string as string;
    const newString = input.new_string as string;

    const content = await executor.readFile(filePath);

    // Count occurrences
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = content.indexOf(oldString, searchFrom);
      if (idx === -1) break;
      count++;
      searchFrom = idx + 1;
    }

    if (count === 0) {
      return 'Error: old_string not found in file.';
    }
    if (count > 1) {
      return `Error: old_string found ${count} times. It must match exactly once. Provide more surrounding context to make it unique.`;
    }

    const newContent = content.replace(oldString, newString);
    await executor.writeFile(filePath, newContent);

    return `Edited ${filePath} — replaced 1 occurrence.`;
  },
};
