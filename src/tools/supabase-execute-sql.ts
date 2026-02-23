import { ToolHandler, truncateOutput } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
  formatResultTable,
} from './supabase-client.js';

export const supabaseExecuteSqlTool: ToolHandler = {
  definition: {
    name: 'supabase_execute_sql',
    description:
      'Execute a SQL query against the Supabase database. Returns formatted results for SELECT queries, row counts for DML (INSERT/UPDATE/DELETE), and success messages for DDL (CREATE/ALTER/DROP).',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL query to execute',
        },
      },
      required: ['sql'],
    },
  },

  async execute(input) {
    const sql = input.sql as string;
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    const resp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/database/query`,
      config,
      {
        method: 'POST',
        body: JSON.stringify({ query: sql }),
      },
    );

    if (!resp.ok) {
      return formatError(resp, 'executing SQL');
    }

    const data = await resp.json();

    // The API returns an array of rows for SELECT, or a status object for DML/DDL
    if (Array.isArray(data)) {
      if (data.length === 0) return '(query returned 0 rows)';
      return truncateOutput(formatResultTable(data));
    }

    // DML/DDL responses
    if (typeof data === 'object' && data !== null) {
      // Some responses have a command_tag like "INSERT 0 1"
      const tag = (data as Record<string, unknown>).command_tag;
      if (tag) return `Success: ${tag}`;
    }

    return 'Query executed successfully.';
  },
};
