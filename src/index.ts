#!/usr/bin/env node
import 'dotenv/config';
import { startRepl } from './repl.js';
import { createExecutor, SandboxExecutor } from './executor.js';
import { SubagentManager } from './subagent.js';
import { setSubagentManager } from './tools/spawn.js';
import { workspace } from './system-prompt.js';

const args = process.argv.slice(2);

const cwdIndex = args.indexOf('--cwd');
if (cwdIndex !== -1 && args[cwdIndex + 1]) {
  process.chdir(args[cwdIndex + 1]);
}

const useSandbox = !args.includes('--local');

if (useSandbox) {
  // Sandbox mode: workspace lives inside E2B, cloned from GitHub
  // Set workspace path to the E2B clone destination
  workspace.setWorkspacePath('/home/user/workspace');
} else {
  // Local mode: workspace on local disk
  workspace.ensureDefaults();
}

const executor = createExecutor(useSandbox);

// Initialize subagent manager and wire it into the spawn tool
const subagentManager = new SubagentManager(executor);
setSubagentManager(subagentManager);

startRepl(executor);
