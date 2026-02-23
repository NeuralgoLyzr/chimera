import { ToolHandler } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
} from './supabase-client.js';

export const supabaseApplyMigrationTool: ToolHandler = {
  definition: {
    name: 'supabase_apply_migration',
    description:
      'Apply a named database migration to the Supabase project. Migrations are tracked and can be listed later. Use this for schema changes that should be versioned.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description:
            'Migration name (e.g. "create_users_table"). Will be prefixed with a timestamp automatically.',
        },
        sql: {
          type: 'string',
          description: 'The SQL to execute as part of this migration',
        },
      },
      required: ['name', 'sql'],
    },
  },

  async execute(input) {
    const name = input.name as string;
    const sql = input.sql as string;
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    const resp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/database/migrations`,
      config,
      {
        method: 'POST',
        body: JSON.stringify({ name, query: sql }),
      },
    );

    if (!resp.ok) {
      return formatError(resp, 'applying migration');
    }

    return `Migration "${name}" applied successfully.`;
  },
};
