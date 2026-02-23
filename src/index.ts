#!/usr/bin/env node
import 'dotenv/config';
import { startRepl } from './repl.js';
import { createExecutor } from './executor.js';
import { SubagentManager } from './subagent.js';
import { setSubagentManager } from './tools/spawn.js';
import { workspace } from './system-prompt.js';

const args = process.argv.slice(2);

const cwdIndex = args.indexOf('--cwd');
if (cwdIndex !== -1 && args[cwdIndex + 1]) {
  process.chdir(args[cwdIndex + 1]);
}

const useSandbox = !args.includes('--local');

// Ensure workspace directory and default .md files exist
workspace.ensureDefaults();

const executor = createExecutor(useSandbox);

// Initialize subagent manager and wire it into the spawn tool
const subagentManager = new SubagentManager(executor);
setSubagentManager(subagentManager);

startRepl(executor);
