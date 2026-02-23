import Anthropic from '@anthropic-ai/sdk';
import { Executor } from './executor.js';

export interface ToolHandler {
  definition: Anthropic.Tool;
  execute: (input: Record<string, unknown>, executor: Executor) => Promise<string>;
}

export type ConversationMessage = Anthropic.MessageParam;

const MAX_TOOL_OUTPUT = 100_000;

export function truncateOutput(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT) return text;
  return text.slice(0, MAX_TOOL_OUTPUT) + '\n...[truncated]';
}
