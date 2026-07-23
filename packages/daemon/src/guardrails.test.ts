import { describe, expect, it } from 'vitest';
import { Daemon } from './daemon.js';

describe('Daemon guardrails integration', () => {
  it('creates a guardrail pipeline with all built-in scanners', () => {
    const daemon = new Daemon({
      config: {
        logging: { level: 'warn' },
        pool: { minThreads: 1, maxThreads: 2, idleTimeoutMs: 1000, maxQueueSize: 10, concurrentTasksPerWorker: 1 },
        subprocess: { defaultStallTimeoutMs: 30_000, defaultMemoryLimitMb: 256, memoryCheckIntervalMs: 5000 },
        connectors: { enabled: false },
        supervisor: { enabled: false },
        sleep: { enabled: false },
        jobs: { queues: [] },
        streaming: { idleTimeoutMs: 60_000, secretsFilterEnabled: false },
        observability: { enabled: false, envFiles: [] }
      }
    });
    expect(daemon.guardrails).toBeDefined();
  });

  it('guardrail pipeline passes clean input', async () => {
    const daemon = new Daemon({
      config: {
        logging: { level: 'warn' },
        pool: { minThreads: 1, maxThreads: 2, idleTimeoutMs: 1000, maxQueueSize: 10, concurrentTasksPerWorker: 1 },
        subprocess: { defaultStallTimeoutMs: 30_000, defaultMemoryLimitMb: 256, memoryCheckIntervalMs: 5000 },
        connectors: { enabled: false },
        supervisor: { enabled: false },
        sleep: { enabled: false },
        jobs: { queues: [] },
        streaming: { idleTimeoutMs: 60_000, secretsFilterEnabled: false },
        observability: { enabled: false, envFiles: [] }
      }
    });
    const result = await daemon.guardrails.evaluate('Hello, how are you?', 'input');
    expect(result.result.status).toBe('pass');
  });
});
