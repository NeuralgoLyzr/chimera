import Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, MAX_TOKENS } from './client.js';
import { toolDefinitions, executeTool } from './tools/index.js';
import { Executor } from './executor.js';
import { buildSystemPrompt } from './system-prompt.js';

export interface SubagentResult {
  id: string;
  label: string;
  task: string;
  status: 'running' | 'completed' | 'failed';
  result: string;
  startedAt: number;
  completedAt?: number;
}

type SubagentCallback = (result: SubagentResult) => void;

// Tools that subagents are NOT allowed to use (no nesting, no status checks)
const BLOCKED_TOOLS = new Set(['spawn', 'subagent_status']);

/**
 * Manages background subagents. Each subagent gets its own conversation
 * context and runs tool loops independently from the main agent.
 */
export class SubagentManager {
  private executor: Executor;
  private subagents = new Map<string, SubagentResult>();
  private counter = 0;
  private onComplete: SubagentCallback | null = null;

  constructor(executor: Executor) {
    this.executor = executor;
  }

  /** Register a callback for when subagents complete. */
  setOnComplete(cb: SubagentCallback): void {
    this.onComplete = cb;
  }

  /** Spawn a new subagent to handle a task in the background. */
  async spawn(task: string, label?: string): Promise<string> {
    const id = `subagent-${++this.counter}`;
    const displayLabel = label || task.slice(0, 60) + (task.length > 60 ? '...' : '');

    const entry: SubagentResult = {
      id,
      label: displayLabel,
      task,
      status: 'running',
      result: '',
      startedAt: Date.now(),
    };

    this.subagents.set(id, entry);

    // Run in background — don't await
    this.runSubagent(id, task).catch((err) => {
      const e = this.subagents.get(id);
      if (e) {
        e.status = 'failed';
        e.result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        e.completedAt = Date.now();
        this.onComplete?.(e);
      }
    });

    return `Subagent spawned: [${id}] "${displayLabel}"\nIt will run in the background and report back when done.`;
  }

  /** List all subagents and their status. */
  list(): SubagentResult[] {
    return Array.from(this.subagents.values());
  }

  /** Get a specific subagent's status. */
  get(id: string): SubagentResult | undefined {
    return this.subagents.get(id);
  }

  /** Get count of currently running subagents. */
  getRunningCount(): number {
    return Array.from(this.subagents.values()).filter((s) => s.status === 'running').length;
  }

  // ─── Subagent System Prompt ─────────────────────────────────────────────────

  private buildSubagentPrompt(task: string, id: string): string {
    return `# Subagent

You are a background subagent (ID: ${id}) spawned by the main Architect agent to complete a specific task.

## Your Task
${task}

## Rules
1. **Stay focused** — complete only the assigned task, nothing else.
2. **Be autonomous** — do not ask clarifying questions. Make reasonable decisions and proceed.
3. **Be efficient** — you have a limited number of iterations. Don't waste them on unnecessary exploration.
4. **Be thorough** — always read files before editing. Explore before assuming.
5. **Report clearly** — your final response will be reported back to the main agent. Provide a clear summary of:
   - What you did (files created/changed, commands run)
   - The outcome (success, partial, or what failed)
   - Any follow-up the main agent should know about

## What You Can Do
- Read, write, and edit files in the workspace
- Execute shell commands (bash, git)
- Search files with glob and grep
- Search the web and fetch web pages
- Run SQL queries and manage the Supabase backend (if configured)
- Use any available tool except spawn/subagent_status

## What You Cannot Do
- Spawn other subagents (no nesting)
- Check subagent status
- Send messages directly to the user
- Access the main agent's conversation history

## Workspace
Working directory: ${process.cwd()}

## Constraints
- Maximum of 50 tool-call iterations before you are stopped.
- If you encounter an error, try to recover once, then report the failure clearly.

When you have completed the task, provide a clear, concise summary of your findings or actions.`;
  }

  // ─── Run Subagent ───────────────────────────────────────────────────────────

  private async runSubagent(id: string, task: string): Promise<void> {
    const entry = this.subagents.get(id)!;

    // Build a focused system prompt with the task embedded
    const subagentSystem = this.buildSubagentPrompt(task, id);

    // Filter out blocked tools so the subagent can't spawn or check status
    const subagentTools = toolDefinitions.filter(
      (t) => !BLOCKED_TOOLS.has(t.name),
    );

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task },
    ];

    console.log(`\n  [${id}] Started: "${entry.label}"`);

    // Tool loop
    let iterations = 0;
    const maxIterations = 50;

    while (iterations++ < maxIterations) {
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: subagentSystem,
          messages,
          tools: subagentTools,
        });
      } catch (err) {
        entry.status = 'failed';
        entry.result = `API error: ${err instanceof Error ? err.message : String(err)}`;
        entry.completedAt = Date.now();
        console.log(`\n  [${id}] Failed: ${entry.result}`);
        this.onComplete?.(entry);
        return;
      }

      messages.push({ role: 'assistant', content: response.content });

      // Collect tool_use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        // Done — extract final text
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        );
        entry.status = 'completed';
        entry.result =
          textBlocks.map((b) => b.text).join('\n') ||
          '(subagent completed with no text output)';
        entry.completedAt = Date.now();
        const elapsed = ((entry.completedAt - entry.startedAt) / 1000).toFixed(1);
        console.log(`\n  [${id}] Completed in ${elapsed}s: "${entry.label}"`);
        this.onComplete?.(entry);
        return;
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const input = block.input as Record<string, unknown>;
        console.log(`  [${id}] tool: ${block.name}`);
        const result = await executeTool(block.name, input, this.executor);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // Hit iteration limit
    entry.status = 'completed';
    entry.result = '(subagent reached maximum iteration limit)';
    entry.completedAt = Date.now();
    console.log(`\n  [${id}] Hit iteration limit`);
    this.onComplete?.(entry);
  }
}
