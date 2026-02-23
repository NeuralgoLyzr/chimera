import { ToolHandler } from '../types.js';
import {
  getSupabaseConfig,
  validateConfig,
  managementApiFetch,
  formatError,
} from './supabase-client.js';

export const supabaseDeployEdgeFunctionTool: ToolHandler = {
  definition: {
    name: 'supabase_deploy_edge_function',
    description:
      'Deploy (create or update) a Supabase edge function. Provide the slug and the TypeScript/JavaScript source code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        slug: {
          type: 'string',
          description: 'The slug (name) for the edge function',
        },
        code: {
          type: 'string',
          description: 'The TypeScript or JavaScript source code for the edge function',
        },
        verify_jwt: {
          type: 'boolean',
          description:
            'Whether to verify JWT tokens on requests. Default: true',
        },
      },
      required: ['slug', 'code'],
    },
  },

  async execute(input) {
    const slug = input.slug as string;
    const code = input.code as string;
    const verifyJwt = (input.verify_jwt as boolean) ?? true;
    const config = getSupabaseConfig();
    const err = validateConfig(config);
    if (err) return err;

    // Check if function already exists
    const checkResp = await managementApiFetch(
      `/v1/projects/${config.projectRef}/functions/${slug}`,
      config,
    );

    const exists = checkResp.ok;

    // Build the request body as FormData-like payload
    // The Management API expects multipart for function deployment,
    // but also accepts JSON with inline code for simpler cases
    const body = JSON.stringify({
      slug,
      name: slug,
      body: code,
      verify_jwt: verifyJwt,
    });

    let resp: Response;

    if (exists) {
      // Update existing function
      resp = await managementApiFetch(
        `/v1/projects/${config.projectRef}/functions/${slug}`,
        config,
        { method: 'PATCH', body },
      );
    } else {
      // Create new function
      resp = await managementApiFetch(
        `/v1/projects/${config.projectRef}/functions`,
        config,
        { method: 'POST', body },
      );
    }

    if (!resp.ok) {
      return formatError(
        resp,
        `${exists ? 'updating' : 'creating'} edge function "${slug}"`,
      );
    }

    const url = `${config.url}/functions/v1/${slug}`;
    return `Edge function "${slug}" ${exists ? 'updated' : 'created'} successfully.\nURL: ${url}`;
  },
};
