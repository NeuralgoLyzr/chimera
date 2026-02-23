import * as readline from 'node:readline';
import { Agent } from './agent.js';
import { Executor } from './executor.js';
import { MODEL, MAX_TOKENS } from './client.js';

export function startRepl(executor: Executor): void {
  const agent = new Agent(executor);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\narchitect> ',
  });

  const mode = executor.constructor.name === 'SandboxExecutor' ? 'sandbox' : 'local';
  const baseUrl = process.env.ARCHITECT_BASE_URL || 'https://api.anthropic.com';
  console.log('Architect CLI — AI Coding Agent');
  console.log(`  Model:    ${MODEL}`);
  console.log(`  API:      ${baseUrl}`);
  console.log(`  Max Tokens: ${MAX_TOKENS}`);
  console.log(`  Mode:     ${mode}`);
  console.log('\nType your message. Press Ctrl+C to exit.\n');
  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === '/quit' || input === '/exit') {
      rl.close();
      return;
    }

    try {
      await agent.sendMessage(input);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
    }
    rl.prompt();
  });

  rl.on('close', async () => {
    await executor.destroy();
    console.log('\nGoodbye.');
    process.exit(0);
  });
}
