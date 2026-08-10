import { createContext, runInContext } from 'node:vm';
import { parentPort, workerData } from 'node:worker_threads';

import type { WorkerOutputMessage, WorkerResultMessage, WorkerRuntimeErrorMessage } from './worker-messages.js';

if (parentPort === null) {
  process.exit(1);
}

const { code, env, timeout } = workerData as {
  code: string;
  env: Record<string, string>;
  timeout: number;
};

function sendMessage(message: WorkerOutputMessage): void {
  parentPort?.postMessage(message);
}

// Create a safe realm.
// WARNING: node:vm is NOT a security boundary per Node.js docs. This sandbox is
// defense-in-depth for agent-authored tool code — it prevents accidental global
// access and is backed by worker.terminate() for timeout enforcement. It does NOT
// protect against a determined attacker.
const context = createContext(
  {
    console: {
      error: (...args: unknown[]) => {
        sendMessage({ args, type: 'error' });
      },
      info: (...args: unknown[]) => {
        sendMessage({ args, type: 'info' });
      },
      log: (...args: unknown[]) => {
        sendMessage({ args, type: 'log' });
      },
      warn: (...args: unknown[]) => {
        sendMessage({ args, type: 'warn' });
      }
    },
    process: {
      env: Object.freeze({ ...env })
    },
    // Intentional omissions: Buffer (abused for escapes), require, global,
    // process.exit, __dirname, __filename, and fetch.
    URL,
    TextEncoder,
    TextDecoder
  },
  { microtaskMode: 'afterEvaluate' }
);

Object.freeze(context);

try {
  // nosemgrep: dangerous-sandbox-run-in-context
  // vm.runInContext is NOT a security boundary (per Node.js docs). This code
  // runs agent-authored tool output, not external untrusted input. Hardening:
  // - frozen context with no Buffer, no require, no filesystem, no globals
  // - microtaskMode: 'afterEvaluate' prevents microtask-based escapes
  // - timeout kills divergent code; worker.terminate() is the hard fallback
  const result: unknown = runInContext(code, context, {
    displayErrors: true,
    timeout // vm timeout provides a first layer, but worker.terminate() is the fallback
  });

  const resultMessage: WorkerResultMessage = { type: 'result', value: result };
  parentPort.postMessage(resultMessage);
} catch (error) {
  const errorPayload =
    error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };

  const runtimeError: WorkerRuntimeErrorMessage = {
    args: [errorPayload.message],
    type: 'runtime-error'
  };
  parentPort.postMessage(runtimeError);
}
