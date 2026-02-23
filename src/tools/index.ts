import { ToolHandler } from '../types.js';
import { Executor } from '../executor.js';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { bashTool } from './bash.js';
import { gitTool } from './git.js';
import { uploadFileTool } from './upload-file.js';
import { downloadFileTool } from './download-file.js';
import { listFilesTool } from './list-files.js';
import { fileInfoTool } from './file-info.js';
import { createFolderTool } from './create-folder.js';
import { deleteFileTool } from './delete-file.js';
import { moveFileTool } from './move-file.js';
import { setPermissionsTool } from './set-permissions.js';
import { replaceInFilesTool } from './replace-in-files.js';
import { loadSkillTool } from './load-skill.js';
import { createSkillTool } from './create-skill.js';
import { webSearchTool } from './web-search.js';
import { webFetchTool } from './web-fetch.js';
import { spawnTool, subagentStatusTool } from './spawn.js';
import { supabaseExecuteSqlTool } from './supabase-execute-sql.js';
import { supabaseListTablesTool } from './supabase-list-tables.js';
import { supabaseApplyMigrationTool } from './supabase-apply-migration.js';
import { supabaseGetLogsTool } from './supabase-get-logs.js';
import { supabaseListEdgeFunctionsTool } from './supabase-list-edge-functions.js';
import { supabaseGetEdgeFunctionTool } from './supabase-get-edge-function.js';
import { supabaseDeployEdgeFunctionTool } from './supabase-deploy-edge-function.js';

const supabaseTools: ToolHandler[] = process.env.SUPABASE_ACCESS_TOKEN
  ? [
      supabaseExecuteSqlTool,
      supabaseListTablesTool,
      supabaseApplyMigrationTool,
      supabaseGetLogsTool,
      supabaseListEdgeFunctionsTool,
      supabaseGetEdgeFunctionTool,
      supabaseDeployEdgeFunctionTool,
    ]
  : [];

const tools: ToolHandler[] = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  listFilesTool,
  fileInfoTool,
  createFolderTool,
  deleteFileTool,
  moveFileTool,
  setPermissionsTool,
  uploadFileTool,
  downloadFileTool,
  replaceInFilesTool,
  globTool,
  grepTool,
  bashTool,
  gitTool,
  loadSkillTool,
  createSkillTool,
  webSearchTool,
  webFetchTool,
  spawnTool,
  subagentStatusTool,
  ...supabaseTools,
];

const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

export const toolDefinitions = tools.map((t) => t.definition);

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  executor: Executor,
): Promise<string> {
  const handler = toolMap.get(name);
  if (!handler) return `Error: unknown tool "${name}"`;
  try {
    return await handler.execute(input, executor);
  } catch (err: unknown) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
