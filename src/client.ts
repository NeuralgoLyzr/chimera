import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ARCHITECT_MODEL || 'claude-sonnet-4-5-20250929';
export const MAX_TOKENS = Number(process.env.ARCHITECT_MAX_TOKENS) || 8192;

const clientOptions: Record<string, unknown> = {};

if (process.env.ARCHITECT_API_KEY) {
  clientOptions.apiKey = process.env.ARCHITECT_API_KEY;
}

if (process.env.ARCHITECT_BASE_URL) {
  clientOptions.baseURL = process.env.ARCHITECT_BASE_URL;
}

export const anthropic = new Anthropic(clientOptions as ConstructorParameters<typeof Anthropic>[0]);
