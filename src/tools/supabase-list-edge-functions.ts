import { ToolHandler } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
} from './supabase-client.js';

export const supabaseListEdgeFunctionsTool: ToolHandler = {
  definition: {
    name: 'supabase_list_edge_functions',
    description:
      'List all edge functions deployed to the Supabase project. Returns name, status, and URL for each function.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  async execute() {
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    const resp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/functions`,
      config,
    );

    if (!resp.ok) {
      return formatError(resp, 'listing edge functions');
    }

    const functions = (await resp.json()) as Array<{
      id: string;
      slug: string;
      name: string;
      status: string;
      version: number;
      created_at: string;
      updated_at: string;
    }>;

    if (functions.length === 0) {
      return 'No edge functions found.';
    }

    const lines = functions.map((fn, i) => {
      const url = `${config.url}/functions/v1/${fn.slug}`;
      return `${i + 1}. ${fn.slug} (${fn.status})\n   URL: ${url}\n   Updated: ${fn.updated_at}`;
    });

    return `Edge Functions (${functions.length}):\n\n${lines.join('\n\n')}`;
  },
};
