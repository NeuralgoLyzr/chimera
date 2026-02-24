import Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, MAX_TOKENS } from './client.js';
import { toolDefinitions, executeTool } from './tools/index.js';
import { ConversationMessage } from './types.js';
import { Executor } from './executor.js';
import { buildSystemPrompt } from './system-prompt.js';

export class Agent {
  private messages: ConversationMessage[] = [];
  private executor: Executor;

  constructor(executor: Executor) {
    this.executor = executor;
  }

  private async getSystemPrompt(): Promise<string> {
    // In sandbox mode: git push memory changes, then read workspace from E2B
    // In local mode: reads from local filesystem directly
    await this.executor.syncMemory();
    return buildSystemPrompt(this.executor);
  }

  private formatToolDetail(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'bash':
        return ` $ ${input.command}`;
      case 'git':
        return ` $ git ${input.subcommand}`;
      case 'file_read':
      case 'file_write':
      case 'file_edit':
      case 'file_info':
      case 'delete_file':
      case 'set_permissions':
        return ` ${input.file_path}`;
      case 'glob':
        return ` ${input.pattern}`;
      case 'grep':
        return ` ${input.pattern}${input.path ? ' in ' + input.path : ''}`;
      case 'list_files':
      case 'create_folder':
        return ` ${input.path || '.'}`;
      case 'move_file':
        return ` ${input.source} → ${input.destination}`;
      case 'upload_file':
        return ` ${input.local_path} → ${input.remote_path}`;
      case 'download_file':
        return ` ${input.remote_path} → ${input.local_path}`;
      case 'replace_in_files':
        return ` "${input.pattern}" → "${input.replacement}" in ${(input.files as string[])?.length || 0} files`;
      case 'load_skill':
        return ` ${input.name}`;
      case 'create_skill':
        return ` (uploading to Skills API)`;
      case 'web_search':
        return ` "${input.query}"`;
      case 'web_fetch':
        return ` ${input.url}`;
      case 'spawn':
        return ` "${input.label || (input.task as string || '').slice(0, 60)}"`;
      case 'subagent_status':
        return input.id ? ` ${input.id}` : '';
      case 'supabase_execute_sql':
        return ` ${(input.sql as string || '').slice(0, 80)}`;
      case 'supabase_list_tables':
        return ` ${input.schema || 'public'}`;
      case 'supabase_apply_migration':
        return ` ${input.name}`;
      case 'supabase_get_logs':
        return input.source ? ` ${input.source}` : '';
      case 'supabase_list_edge_functions':
        return '';
      case 'supabase_get_edge_function':
      case 'supabase_deploy_edge_function':
        return ` ${input.slug}`;
      default:
        return '';
    }
  }

  /**
   * Validate and repair message history before sending to the API.
   * Ensures every tool_use block in an assistant message has a matching
   * tool_result in the immediately following user message.
   */
  private repairHistory(): void {
    const repaired: ConversationMessage[] = [];

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];

      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const toolUseIds = (msg.content as Anthropic.ContentBlock[])
          .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          .map((b) => b.id);

        if (toolUseIds.length > 0) {
          // Check if the next message has all the tool_results
          const next = this.messages[i + 1];
          if (
            next &&
            next.role === 'user' &&
            Array.isArray(next.content)
          ) {
            const resultIds = new Set(
              (next.content as Anthropic.ToolResultBlockParam[])
                .filter((b) => b.type === 'tool_result')
                .map((b) => b.tool_use_id),
            );

            const missingIds = toolUseIds.filter((id) => !resultIds.has(id));
            if (missingIds.length > 0) {
              // Add missing tool_results with error content
              const patched = [
                ...(next.content as Anthropic.ToolResultBlockParam[]),
                ...missingIds.map(
                  (id): Anthropic.ToolResultBlockParam => ({
                    type: 'tool_result',
                    tool_use_id: id,
                    content: 'Error: tool execution was interrupted.',
                  }),
                ),
              ];
              repaired.push(msg);
              repaired.push({ role: 'user', content: patched });
              i++; // skip the next message, we already handled it
              continue;
            }
          } else {
            // No following user message with results — add one
            repaired.push(msg);
            repaired.push({
              role: 'user',
              content: toolUseIds.map(
                (id): Anthropic.ToolResultBlockParam => ({
                  type: 'tool_result',
                  tool_use_id: id,
                  content: 'Error: tool execution was interrupted.',
                }),
              ),
            });
            continue;
          }
        }
      }

      repaired.push(msg);
    }

    this.messages = repaired;
  }

  async sendMessage(userText: string): Promise<void> {
    this.messages.push({ role: 'user', content: userText });

    while (true) {
      // Repair any corrupted history before each API call
      this.repairHistory();

      let response: Anthropic.Message;
      try {
        const sysPrompt = await this.getSystemPrompt();
        const stream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: sysPrompt,
          messages: this.messages,
          tools: toolDefinitions,
        });

        stream.on('text', (text: string) => process.stdout.write(text));

        response = await stream.finalMessage();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`\n  [API error: ${errMsg}]`);

        // Remove the last message if it was our user input that caused the error
        // so the conversation can continue cleanly
        if (
          this.messages.length > 0 &&
          this.messages[this.messages.length - 1].role === 'user'
        ) {
          this.messages.pop();
        }
        return;
      }

      this.messages.push({ role: 'assistant', content: response.content });

      // Collect all tool_use blocks regardless of stop_reason
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        process.stdout.write('\n');
        return;
      }

      // Execute all tool calls and send results back
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const input = block.input as Record<string, unknown>;
        const detail = this.formatToolDetail(block.name, input);
        console.log(`\n  [tool: ${block.name}]${detail}`);
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          this.executor,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      this.messages.push({ role: 'user', content: toolResults });
    }
  }

  /**
   * API-driven message handling. Returns the assistant's text response
   * instead of streaming to stdout. Used by the Next.js API layer.
   */
  async sendMessageAPI(userText: string): Promise<string> {
    this.messages.push({ role: 'user', content: userText });
    let responseText = '';

    while (true) {
      this.repairHistory();

      let response: Anthropic.Message;
      try {
        const sysPrompt = await this.getSystemPrompt();
        response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: sysPrompt,
          messages: this.messages,
          tools: toolDefinitions,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          this.messages.length > 0 &&
          this.messages[this.messages.length - 1].role === 'user'
        ) {
          this.messages.pop();
        }
        return `Error: ${errMsg}`;
      }

      this.messages.push({ role: 'assistant', content: response.content });

      // Collect text from this response
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        return responseText;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          this.executor,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      this.messages.push({ role: 'user', content: toolResults });
    }
  }
}
