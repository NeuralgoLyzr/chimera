import { ToolHandler } from '../types.js';
import { SubagentManager } from '../subagent.js';

let manager: SubagentManager | null = null;

/** Set the SubagentManager instance. Called once at startup. */
export function setSubagentManager(m: SubagentManager): void {
  manager = m;
}

export const spawnTool: ToolHandler = {
  definition: {
    name: 'spawn',
    description:
      'Spawn a subagent to handle a task in the background. The subagent gets its own conversation, can use all tools, and reports back when done. Use for complex or time-consuming tasks that can run independently.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task: {
          type: 'string',
          description: 'The task for the subagent to complete',
        },
        label: {
          type: 'string',
          description:
            'Optional short label for the task (shown in status output)',
        },
      },
      required: ['task'],
    },
  },

  async execute(input) {
    if (!manager) {
      return 'Error: SubagentManager not initialized';
    }

    const task = input.task as string;
    const label = input.label as string | undefined;
    return manager.spawn(task, label);
  },
};

export const subagentStatusTool: ToolHandler = {
  definition: {
    name: 'subagent_status',
    description:
      'Check the status of spawned subagents. Returns their current status, result if complete, and elapsed time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description:
            'Specific subagent ID to check. If omitted, lists all subagents.',
        },
      },
      required: [],
    },
  },

  async execute(input) {
    if (!manager) {
      return 'Error: SubagentManager not initialized';
    }

    const id = input.id as string | undefined;

    if (id) {
      const entry = manager.get(id);
      if (!entry) return `No subagent found with id "${id}"`;
      return formatEntry(entry);
    }

    const all = manager.list();
    if (all.length === 0) return 'No subagents have been spawned.';

    return all.map(formatEntry).join('\n\n');
  },
};

function formatEntry(e: { id: string; label: string; status: string; result: string; startedAt: number; completedAt?: number }): string {
  const elapsed = e.completedAt
    ? `${((e.completedAt - e.startedAt) / 1000).toFixed(1)}s`
    : `${((Date.now() - e.startedAt) / 1000).toFixed(1)}s (running)`;

  const lines = [
    `[${e.id}] "${e.label}"`,
    `  Status: ${e.status}`,
    `  Elapsed: ${elapsed}`,
  ];

  if (e.status !== 'running' && e.result) {
    // Truncate result for status display
    const preview = e.result.length > 500 ? e.result.slice(0, 500) + '...' : e.result;
    lines.push(`  Result: ${preview}`);
  }

  return lines.join('\n');
}
