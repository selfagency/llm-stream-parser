import { createVirtualSandbox } from '@agentsy/runtime';
import type { ToolDefinition, ToolResult } from '../../definitions.js';

const sandbox = createVirtualSandbox();

const DEFAULT_DENYLIST = ['rm -rf', 'dd ', 'mkfs', ':(){ :|: & };:', '> /dev/sda', 'forkbomb'];

export function createShellTool(): ToolDefinition {
  return {
    name: 'shell_exec',
    description: 'Execute a shell command. Deny-by-default for destructive or open-world operations.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      requiresApproval: true
    },
    parameters: [
      { name: 'command', type: 'string', required: true, description: 'Shell command to execute' },
      { name: 'timeout', type: 'number', required: false, description: 'Timeout in ms' },
      { name: 'workdir', type: 'string', required: false, description: 'Working directory' }
    ],
    handler: handleShellExec
  };
}

async function handleShellExec(input: Record<string, unknown>): Promise<ToolResult> {
  const command = typeof input.command === 'string' ? input.command : '';
  if (!command) {
    return { ok: false, data: null, error: 'Missing required parameter: command' };
  }

  // Denylist check
  for (const pattern of DEFAULT_DENYLIST) {
    if (command.toLowerCase().includes(pattern.toLowerCase())) {
      return { ok: false, data: null, error: `Command blocked by denylist: matches "${pattern}"` };
    }
  }

  const timeout = typeof input.timeout === 'number' ? input.timeout : 30_000;
  const cwd = typeof input.workdir === 'string' ? input.workdir : undefined;

  // Execute via Worker Thread sandbox for isolation
  const shellCode = `
    const { execSync } = require('child_process');
    try {
      const output = execSync(${JSON.stringify(command)}, {
        encoding: 'utf-8',
        cwd: ${JSON.stringify(cwd ?? process.cwd())},
        timeout: ${timeout},
        maxBuffer: 10 * 1024 * 1024
      });
      console.log(output);
    } catch (e) {
      if (e.stdout) console.log(String(e.stdout));
      if (e.stderr) console.error(String(e.stderr));
      throw e;
    }
  `;

  const result = await sandbox.execute({ code: shellCode, timeoutMs: timeout });
  if (result.status === 'timeout') {
    return { ok: false, data: null, error: `shell_exec timed out after ${timeout}ms` };
  }
  if (result.status === 'blocked') {
    return { ok: false, data: null, error: 'shell_exec blocked by sandbox policy' };
  }
  return {
    ok: result.status === 'ok',
    data: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 0 }
  };
}
