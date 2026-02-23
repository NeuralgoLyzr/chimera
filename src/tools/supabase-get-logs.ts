import { ToolHandler, truncateOutput } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
} from './supabase-client.js';

const LOG_SOURCES = [
  'api',
  'database',
  'auth',
  'realtime',
  'storage',
  'edge-functions',
] as const;

export const supabaseGetLogsTool: ToolHandler = {
  definition: {
    name: 'supabase_get_logs',
    description:
      'Retrieve logs from the Supabase project. Can filter by source (api, database, auth, realtime, storage, edge-functions) or run a custom log query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description:
            'Log source to filter by. One of: api, database, auth, realtime, storage, edge-functions',
          enum: LOG_SOURCES as unknown as string[],
        },
        sql: {
          type: 'string',
          description:
            'Custom SQL query to run against the log data. If provided, overrides source.',
        },
        hours: {
          type: 'number',
          description:
            'Number of hours of logs to retrieve. Default: 1. Max: 72.',
        },
      },
      required: [],
    },
  },

  async execute(input) {
    const source = input.source as string | undefined;
    const customSql = input.sql as string | undefined;
    const hours = Math.min((input.hours as number) || 1, 72);
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    const now = new Date();
    const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const isoStart = start.toISOString();
    const isoEnd = now.toISOString();

    const params = new URLSearchParams({
      iso_timestamp_start: isoStart,
      iso_timestamp_end: isoEnd,
    });

    if (customSql) {
      params.set('sql', customSql);
    } else if (source) {
      // Use the source-specific collection
      params.set(
        'sql',
        `select id, timestamp, event_message, metadata from edge_logs where metadata.source = '${source}' order by timestamp desc limit 100`,
      );
    }

    const resp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/analytics/endpoints/logs.all?${params.toString()}`,
      config,
    );

    if (!resp.ok) {
      return formatError(resp, 'fetching logs');
    }

    const data = (await resp.json()) as {
      result?: Record<string, unknown>[];
    };

    const rows = data.result || [];
    if (rows.length === 0) {
      return `No logs found for the past ${hours} hour(s)${source ? ` (source: ${source})` : ''}.`;
    }

    // Format log entries
    const lines = rows.map((row) => {
      const ts = row.timestamp || row.id;
      const msg = row.event_message || JSON.stringify(row);
      return `[${ts}] ${msg}`;
    });

    return truncateOutput(
      `Logs (${rows.length} entries, past ${hours}h):\n\n${lines.join('\n')}`,
    );
  },
};
