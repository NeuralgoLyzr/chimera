import { ToolHandler, truncateOutput } from '../types.js';

export const webSearchTool: ToolHandler = {
  definition: {
    name: 'web_search',
    description:
      'Search the web using Brave Search API. Returns titles, URLs, and snippets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        count: {
          type: 'integer',
          description: 'Number of results (1-10). Default: 5',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },

  async execute(input) {
    const query = input.query as string;
    const count = Math.min(Math.max((input.count as number) || 5, 1), 10);

    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return 'Error: BRAVE_API_KEY not configured. Set it in your .env file.';
    }

    const params = new URLSearchParams({ q: query, count: String(count) });
    const resp = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return `Error: Brave Search API returned ${resp.status} ${resp.statusText}${body ? `\n${body}` : ''}`;
    }

    const data = (await resp.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    const results = data.web?.results || [];
    if (results.length === 0) {
      return `No results for: ${query}`;
    }

    const lines = [`Results for: ${query}\n`];
    for (let i = 0; i < Math.min(results.length, count); i++) {
      const item = results[i];
      lines.push(`${i + 1}. ${item.title || '(no title)'}\n   ${item.url || ''}`);
      if (item.description) {
        lines.push(`   ${item.description}`);
      }
    }

    return truncateOutput(lines.join('\n'));
  },
};
