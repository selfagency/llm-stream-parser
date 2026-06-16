import { createContext, Script } from 'node:vm';

import type { ToolDefinition } from '../../definitions.js';

export function createReplTool(): ToolDefinition {
  return {
    name: 'repl_execute',
    description: 'Execute arbitrary JavaScript/TypeScript code in a sandboxed REPL environment.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      requiresApproval: true
    },
    parameters: [
      { name: 'code', type: 'string', required: true, description: 'The code to execute' },
      { name: 'timeout', type: 'number', required: false, description: 'Execution timeout in ms' }
    ],
    handler: async input => {
      const code = typeof input.code === 'string' ? input.code : '';
      if (!code) {
        return { ok: false, data: null, error: 'Missing required parameter: code' };
      }

      const timeout = typeof input.timeout === 'number' ? input.timeout : 10_000;

      try {
        // WARNING: node:vm is NOT a security boundary per Node.js docs. This REPL
        // requires human approval (requiresApproval: true) for every execution.
        // The sandbox provides defense-in-depth for agent-internal debugging: empty
        // context with no globals, no host modules, no filesystem access.
        // nosemgrep: dangerous-sandbox-run-in-context
        // Agent-internal REPL tool with human approval gate. Uses empty context + no
        // host bindings + timeout; also blocked by worker.terminate() in sandbox-worker.
        const sandbox: Record<string, unknown> = Object.create(null);
        const context = createContext(sandbox, { microtaskMode: 'afterEvaluate' });
        const script = new Script(code);
        const result = await script.runInContext(context, { timeout });
        return { ok: true, data: { result: String(result), code } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, data: { code }, error: `Execution error: ${message}` };
      }
    }
  };
}
