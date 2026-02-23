import { ToolHandler, truncateOutput } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
} from './supabase-client.js';

export const supabaseGetEdgeFunctionTool: ToolHandler = {
  definition: {
    name: 'supabase_get_edge_function',
    description:
      'Get details and source code of a specific edge function by slug.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slug: {
          type: 'string',
          description: 'The slug (name) of the edge function',
        },
      },
      required: ['slug'],
    },
  },

  async execute(input) {
    const slug = input.slug as string;
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    // Fetch metadata
    const metaResp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/functions/${slug}`,
      config,
    );

    if (!metaResp.ok) {
      return formatError(metaResp, `fetching edge function "${slug}"`);
    }

    const meta = (await metaResp.json()) as Record<string, unknown>;

    // Fetch source code
    const bodyResp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/functions/${slug}/body`,
      config,
    );

    let source = '(could not retrieve source code)';
    if (bodyResp.ok) {
      source = await bodyResp.text();
    }

    const url = `${config.url}/functions/v1/${slug}`;
    const lines = [
      `Edge Function: ${slug}`,
      `Status: ${meta.status}`,
      `URL: ${url}`,
      `Version: ${meta.version}`,
      `Created: ${meta.created_at}`,
      `Updated: ${meta.updated_at}`,
      `Verify JWT: ${meta.verify_jwt}`,
      '',
      '--- Source Code ---',
      source,
    ];

    return truncateOutput(lines.join('\n'));
  },
};
