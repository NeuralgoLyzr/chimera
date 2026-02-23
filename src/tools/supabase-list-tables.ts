import { ToolHandler, truncateOutput } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
  formatResultTable,
} from './supabase-client.js';

export const supabaseListTablesTool: ToolHandler = {
  definition: {
    name: 'supabase_list_tables',
    description:
      'List all tables in the Supabase database. Optionally include column details for each table.',
    input_schema: {
      type: 'object' as const,
      properties: {
        schema: {
          type: 'string',
          description: 'Schema to list tables from. Default: "public"',
        },
        include_columns: {
          type: 'boolean',
          description:
            'If true, include column names, types, and nullability for each table. Default: false',
        },
      },
      required: [],
    },
  },

  async execute(input) {
    const schema = (input.schema as string) || 'public';
    const includeColumns = (input.include_columns as boolean) || false;
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    if (!includeColumns) {
      const sql = `SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = '${schema}'
ORDER BY table_name;`;

      const resp = await managementApiFetch(
        `/v1/projects/${config.projectRef}/database/query`,
        config,
        { method: 'POST', body: JSON.stringify({ query: sql }) },
      );

      if (!resp.ok) return formatError(resp, 'listing tables');
      const data = (await resp.json()) as Record<string, unknown>[];
      if (!Array.isArray(data) || data.length === 0)
        return `No tables found in schema "${schema}".`;
      return truncateOutput(formatResultTable(data));
    }

    // Include columns: query tables + columns in one go
    const sql = `SELECT
  t.table_name,
  t.table_type,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.tables t
JOIN information_schema.columns c
  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
WHERE t.table_schema = '${schema}'
ORDER BY t.table_name, c.ordinal_position;`;

    const resp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/database/query`,
      config,
      { method: 'POST', body: JSON.stringify({ query: sql }) },
    );

    if (!resp.ok) return formatError(resp, 'listing tables');
    const data = (await resp.json()) as Record<string, unknown>[];
    if (!Array.isArray(data) || data.length === 0)
      return `No tables found in schema "${schema}".`;

    // Group by table for a nicer output
    const tables = new Map<string, { type: string; columns: string[] }>();
    for (const row of data) {
      const name = row.table_name as string;
      if (!tables.has(name)) {
        tables.set(name, {
          type: row.table_type as string,
          columns: [],
        });
      }
      const nullable = row.is_nullable === 'YES' ? ' (nullable)' : '';
      const def = row.column_default ? ` default=${row.column_default}` : '';
      tables
        .get(name)!
        .columns.push(`  ${row.column_name}: ${row.data_type}${nullable}${def}`);
    }

    const lines: string[] = [];
    for (const [name, info] of tables) {
      lines.push(`${name} (${info.type})`);
      lines.push(info.columns.join('\n'));
      lines.push('');
    }

    return truncateOutput(lines.join('\n').trim());
  },
};
