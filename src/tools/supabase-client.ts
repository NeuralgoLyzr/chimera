/**
 * Shared Supabase helpers for all Supabase tools.
 */

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  accessToken: string;
  projectRef: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    accessToken: process.env.SUPABASE_ACCESS_TOKEN || '',
    projectRef: process.env.SUPABASE_PROJECT_REF || '',
  };
}

export function validateConfig(
  config: SupabaseConfig,
  needs: ('accessToken' | 'projectRef' | 'url' | 'serviceRoleKey')[] = [
    'accessToken',
    'projectRef',
  ],
): string | null {
  const missing: string[] = [];
  if (needs.includes('accessToken') && !config.accessToken)
    missing.push('SUPABASE_ACCESS_TOKEN');
  if (needs.includes('projectRef') && !config.projectRef)
    missing.push('SUPABASE_PROJECT_REF');
  if (needs.includes('url') && !config.url) missing.push('SUPABASE_URL');
  if (needs.includes('serviceRoleKey') && !config.serviceRoleKey)
    missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    return `Missing required environment variables: ${missing.join(', ')}`;
  }
  return null;
}

export async function managementApiFetch(
  path: string,
  config: SupabaseConfig,
  options: RequestInit = {},
): Promise<Response> {
  const url = `https://api.supabase.com${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

export async function postgrestFetch(
  path: string,
  config: SupabaseConfig,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${config.url}/rest/v1${path}`;
  return fetch(url, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

export async function formatError(
  resp: Response,
  context: string,
): Promise<string> {
  let body = '';
  try {
    body = await resp.text();
  } catch {
    // ignore
  }
  return `Error ${context}: ${resp.status} ${resp.statusText}${body ? `\n${body}` : ''}`;
}

export function formatResultTable(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return '(no rows returned)';

  const columns = Object.keys(rows[0]);
  // Calculate column widths
  const widths = columns.map((col) =>
    Math.max(
      col.length,
      ...rows.map((row) => String(row[col] ?? 'NULL').length),
    ),
  );

  // Cap individual column width at 40 chars
  const cappedWidths = widths.map((w) => Math.min(w, 40));

  const pad = (val: string, width: number) =>
    val.length > width ? val.slice(0, width - 1) + '…' : val.padEnd(width);

  const header = columns.map((c, i) => pad(c, cappedWidths[i])).join(' | ');
  const separator = cappedWidths.map((w) => '-'.repeat(w)).join('-+-');
  const body = rows.map((row) =>
    columns
      .map((c, i) => pad(String(row[c] ?? 'NULL'), cappedWidths[i]))
      .join(' | '),
  );

  return [header, separator, ...body].join('\n');
}
