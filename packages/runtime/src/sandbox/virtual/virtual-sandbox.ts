import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type { WorkerMessage } from './worker-messages.js';

export type SandboxExecutionStatus = 'ok' | 'error' | 'timeout' | 'blocked';

export interface SandboxInput {
  readonly code: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface SandboxOutput {
  readonly durationMs: number;
  readonly exitCode?: number;
  readonly status: SandboxExecutionStatus;
  readonly stderr: string;
  readonly stdout: string;
}

export interface VirtualSandbox {
  execute(input: SandboxInput): Promise<SandboxOutput>;
  readonly mode: 'virtual';
}

const DEFAULT_TIMEOUT_MS = 5000;
const WORKER_PATH = join(process.cwd(), 'packages/runtime/dist/sandbox/virtual/sandbox-worker.js');

/**
 * Mark a handler as resolved and terminate the worker if provided.
 * Returns true if this call claimed the resolution (first time), false if already resolved.
 */
function resolveOnce(
  resolved: { value: boolean },
  worker: Worker | undefined,
  timeout: NodeJS.Timeout | undefined
): boolean {
  if (resolved.value) {
    return false;
  }
  resolved.value = true;
  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
  worker?.terminate().catch(() => undefined);
  return true;
}

interface SandboxTimeoutHandlerOptions {
  resolve: (value: SandboxOutput) => void;
  resolved: { value: boolean };
  start: number;
  stderr: string[];
  stdout: string[];
  timeoutMs: number;
  worker: Worker;
}

function createSandboxTimeoutHandler(options: SandboxTimeoutHandlerOptions) {
  return () => {
    if (options.resolved.value) {
      return;
    }
    options.resolved.value = true;
    options.worker.terminate().catch(() => undefined);
    options.resolve({
      durationMs: Date.now() - options.start,
      status: 'timeout',
      stderr: `${options.stderr.join('\n')}\nExecution timed out after ${options.timeoutMs}ms`.trim(),
      stdout: options.stdout.join('\n')
    });
  };
}

interface MessageHandlerOptions {
  resolve: (value: SandboxOutput) => void;
  resolved: { value: boolean };
  start: number;
  stderr: string[];
  stdout: string[];
  timeout: NodeJS.Timeout;
  worker: Worker;
}

function createMessageHandler(options: MessageHandlerOptions) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactor planned
  return (msg: WorkerMessage) => {
    if (msg.type === 'log') {
      options.stdout.push(msg.args.map(String).join(' '));
    } else if (msg.type === 'error' || msg.type === 'runtime-error' || msg.type === 'warn' || msg.type === 'info') {
      const output = Array.isArray(msg.args) ? msg.args.map(String).join(' ') : String(msg.args ?? '');
      options.stderr.push(output);

      if (msg.type === 'runtime-error') {
        if (!resolveOnce(options.resolved, options.worker, options.timeout)) {
          return;
        }
        options.resolve({
          durationMs: Date.now() - options.start,
          exitCode: 1,
          status: 'error',
          stderr: options.stderr.join('\n'),
          stdout: options.stdout.join('\n')
        });
      }
    } else if (msg.type === 'result') {
      if (!resolveOnce(options.resolved, options.worker, options.timeout)) {
        return;
      }
      options.resolve({
        durationMs: Date.now() - options.start,
        exitCode: 0,
        status: 'ok',
        stderr: options.stderr.join('\n'),
        stdout: options.stdout.join('\n')
      });
    }
  };
}

interface ErrorHandlerOptions {
  resolve: (value: SandboxOutput) => void;
  resolved: { value: boolean };
  start: number;
  stderr: string[];
  stdout: string[];
  timeout: NodeJS.Timeout;
  worker: Worker;
}

function createErrorHandler(options: ErrorHandlerOptions) {
  return (err: Error) => {
    if (!resolveOnce(options.resolved, options.worker, options.timeout)) {
      return;
    }
    options.resolve({
      durationMs: Date.now() - options.start,
      exitCode: 1,
      status: 'error',
      stderr: err instanceof Error ? err.message : String(err),
      stdout: options.stdout.join('\n')
    });
  };
}

interface ExitHandlerOptions {
  resolve: (value: SandboxOutput) => void;
  resolved: { value: boolean };
  start: number;
  stderr: string[];
  stdout: string[];
  timeout: NodeJS.Timeout;
}

function createExitHandler(options: ExitHandlerOptions) {
  return (code: number) => {
    if (!resolveOnce(options.resolved, undefined, options.timeout)) {
      return;
    }
    if (code === 0) {
      options.resolve({
        durationMs: Date.now() - options.start,
        exitCode: 0,
        status: 'ok',
        stderr: options.stderr.join('\n'),
        stdout: options.stdout.join('\n')
      });
    } else {
      options.resolve({
        durationMs: Date.now() - options.start,
        exitCode: code,
        status: 'error',
        stderr: `Worker exited with code ${code}`,
        stdout: options.stdout.join('\n')
      });
    }
  };
}

export function createVirtualSandbox(): VirtualSandbox {
  return {
    async execute(input): Promise<SandboxOutput> {
      const start = Date.now();
      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const stdout: string[] = [];
      const stderr: string[] = [];
      const resolved = { value: false };

      return await new Promise(resolve => {
        const worker = new Worker(WORKER_PATH, {
          workerData: {
            code: input.code,
            env: input.env ?? {},
            timeout: timeoutMs
          }
        });

        const timeout = setTimeout(
          createSandboxTimeoutHandler({
            worker,
            resolve,
            start,
            timeoutMs,
            stdout,
            stderr,
            resolved
          }),
          timeoutMs
        );

        worker.on(
          'message',
          createMessageHandler({
            worker,
            resolve,
            timeout,
            start,
            stdout,
            stderr,
            resolved
          })
        );
        worker.on(
          'error',
          createErrorHandler({
            worker,
            resolve,
            timeout,
            start,
            stdout,
            stderr,
            resolved
          })
        );
        worker.on(
          'exit',
          createExitHandler({
            resolve,
            timeout,
            start,
            stdout,
            stderr,
            resolved
          })
        );
      });
    },

    mode: 'virtual'
  };
}
