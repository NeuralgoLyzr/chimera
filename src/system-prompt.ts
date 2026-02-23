import { SkillsLoader } from './skills.js';
import { WorkspaceLoader } from './workspace.js';

export const workspace = new WorkspaceLoader();

function buildToolDescriptions(): string {
  let desc = `## Tools Available

### File Operations
- file_read: Read file contents with line numbers
- file_write: Create or overwrite files
- file_edit: Find-and-replace exact strings in files
- list_files: List directory contents with metadata (size, type, permissions, modified time)
- file_info: Get metadata for a single file or directory
- create_folder: Create directories with optional permissions
- delete_file: Remove files or directories
- move_file: Move or rename files and directories
- set_permissions: Set file/directory permissions (chmod)
- replace_in_files: Find and replace text across multiple files using regex

### File Transfer
- upload_file: Transfer a file from the user's local machine into the sandbox
- download_file: Transfer a file from the sandbox to the user's local machine

### Search
- glob: Find files by pattern
- grep: Search file contents with regex

### Execution
- bash: Run shell commands
- git: Run git commands

### Web
- web_search: Search the web using Brave Search (requires BRAVE_API_KEY)
- web_fetch: Fetch a URL and extract readable content (HTML → markdown/text)

### Subagents
- spawn: Spawn a background subagent to handle a task independently. The subagent gets its own conversation, can use all tools, and reports back when done. Use for complex or time-consuming tasks that can run in parallel.
- subagent_status: Check status of spawned subagents and retrieve their results.

### Skills
- load_skill: Load a skill's full instructions by name
- create_skill: Create a new skill and upload it to the Skills API`;

  if (process.env.SUPABASE_ACCESS_TOKEN) {
    desc += `

### Supabase (Database & Backend)
- supabase_execute_sql: Execute SQL queries (SELECT, INSERT, UPDATE, DELETE, DDL)
- supabase_list_tables: List tables in a schema with optional column details
- supabase_apply_migration: Apply a named, versioned database migration
- supabase_get_logs: Retrieve project logs (api, database, auth, realtime, storage, edge-functions)
- supabase_list_edge_functions: List all deployed edge functions
- supabase_get_edge_function: Get edge function metadata and source code
- supabase_deploy_edge_function: Create or update an edge function`;
  }

  return desc;
}

function buildSkillsHeader(): string {
  return `## Skills

You have access to skills — reusable instruction sets that teach you how to perform specific tasks.
- Skills marked as "Active" are already loaded below. Follow their instructions when relevant.
- Other skills are listed in the Available Skills summary. When a user's request matches a skill, use the load_skill tool to load its full instructions before proceeding.
- Workspace skills (in ./skills/) override built-in skills with the same name.`;
}

function buildRuntimeContext(): string {
  return `## Runtime
- Working directory: ${process.cwd()}
- Workspace: ${workspace.getWorkspacePath()}
- Today's journal: ${workspace.getTodayJournalPath()}
- Permanent memory: ${workspace.getWorkspacePath()}/memory/MEMORY.md
- Date: ${new Date().toISOString().split('T')[0]}`;
}

export async function buildSystemPrompt(): Promise<string> {
  const parts: string[] = [];

  // 1. Foundation files (SOUL.md identity, AGENTS.md guidelines, USER.md profile)
  const foundation = workspace.loadFoundationFiles();
  if (foundation) parts.push(foundation);

  // 2. Auto-generated tool descriptions (conditional Supabase stays in code)
  parts.push(buildToolDescriptions());

  // 3. Supplementary workspace files (TOOLS.md tips)
  const supplementary = workspace.loadSupplementaryFiles();
  if (supplementary) parts.push(supplementary);

  // 4. Skills
  parts.push(buildSkillsHeader());
  const loader = new SkillsLoader();
  const skillsContext = await loader.buildSkillsContext();
  if (skillsContext) parts.push(skillsContext);

  // 5. Permanent memory
  const memory = workspace.loadMemory();
  if (memory) parts.push(`## Permanent Memory\n\n${memory}`);

  // 6. Journal (today + recent days)
  workspace.ensureTodayJournal();
  const todayJournal = workspace.loadTodayJournal();
  if (todayJournal) parts.push(`## Today's Journal\n\n${todayJournal}`);

  const recentJournals = workspace.loadRecentJournals(7);
  if (recentJournals && recentJournals !== todayJournal) {
    parts.push(`## Recent Journal Entries (last 7 days)\n\n${recentJournals}`);
  }

  // 7. Runtime context
  parts.push(buildRuntimeContext());

  return parts.join('\n\n');
}
