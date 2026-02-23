import { ToolHandler, truncateOutput } from '../types.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36';
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_CHARS = 50_000;

function stripTags(text: string): string {
  // Remove scripts and styles first
  let t = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove all remaining tags
  t = t.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  t = t
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return t.trim();
}

function normalize(text: string): string {
  let t = text.replace(/[ \t]+/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function htmlToMarkdown(html: string): string {
  let text = html;
  // Convert links
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, inner) => `[${stripTags(inner)}](${href})`,
  );
  // Convert headings
  text = text.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_, level, inner) => `\n${'#'.repeat(Number(level))} ${stripTags(inner)}\n`,
  );
  // Convert list items
  text = text.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_, inner) => `\n- ${stripTags(inner)}`,
  );
  // Block-level breaks
  text = text.replace(/<\/(p|div|section|article)>/gi, '\n\n');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  return normalize(stripTags(text));
}

function extractReadableContent(html: string): { title: string; content: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).trim() : '';

  // Try to find main content areas (article, main, or body fallback)
  let content = '';
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  if (articleMatch) {
    content = articleMatch[1];
  } else if (mainMatch) {
    content = mainMatch[1];
  } else {
    // Fallback: extract body content, stripping nav/header/footer/aside
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    content = bodyMatch ? bodyMatch[1] : html;
    content = content.replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, '');
  }

  return { title, content };
}

function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `Only http/https allowed, got '${parsed.protocol}'`;
    }
    if (!parsed.hostname) {
      return 'Missing domain';
    }
    return null;
  } catch (e) {
    return `Invalid URL: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export const webFetchTool: ToolHandler = {
  definition: {
    name: 'web_fetch',
    description:
      'Fetch a URL and extract its readable content. Converts HTML to markdown or plain text. Works with HTML, JSON, and plain text responses.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch',
        },
        extract_mode: {
          type: 'string',
          description: 'Output format: "markdown" or "text". Default: "markdown"',
          enum: ['markdown', 'text'],
        },
        max_chars: {
          type: 'integer',
          description: 'Maximum characters to return. Default: 50000',
          minimum: 100,
        },
      },
      required: ['url'],
    },
  },

  async execute(input) {
    const url = input.url as string;
    const extractMode = (input.extract_mode as string) || 'markdown';
    const maxChars = (input.max_chars as number) || DEFAULT_MAX_CHARS;

    const urlError = validateUrl(url);
    if (urlError) {
      return JSON.stringify({ error: `URL validation failed: ${urlError}`, url });
    }

    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      return JSON.stringify({
        error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`,
        url,
      });
    }

    if (!resp.ok) {
      return JSON.stringify({
        error: `HTTP ${resp.status} ${resp.statusText}`,
        url,
        finalUrl: resp.url,
      });
    }

    const ctype = resp.headers.get('content-type') || '';
    let text: string;
    let extractor: string;

    const rawBody = await resp.text();

    if (ctype.includes('application/json')) {
      // JSON: pretty-print
      try {
        text = JSON.stringify(JSON.parse(rawBody), null, 2);
      } catch {
        text = rawBody;
      }
      extractor = 'json';
    } else if (
      ctype.includes('text/html') ||
      rawBody.slice(0, 256).toLowerCase().startsWith('<!doctype') ||
      rawBody.slice(0, 256).toLowerCase().startsWith('<html')
    ) {
      // HTML: extract readable content
      const { title, content } = extractReadableContent(rawBody);
      const converted =
        extractMode === 'markdown' ? htmlToMarkdown(content) : stripTags(content);
      text = title ? `# ${title}\n\n${normalize(converted)}` : normalize(converted);
      extractor = 'readability';
    } else {
      text = rawBody;
      extractor = 'raw';
    }

    const truncated = text.length > maxChars;
    if (truncated) {
      text = text.slice(0, maxChars);
    }

    return truncateOutput(
      JSON.stringify({
        url,
        finalUrl: resp.url,
        status: resp.status,
        extractor,
        truncated,
        length: text.length,
        text,
      }),
    );
  },
};
