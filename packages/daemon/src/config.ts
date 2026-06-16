import os from 'node:os';
import path from 'node:path';
import type { DeepPartial } from './types.js';

// ── Helper: resolve default paths ─────────────────────

export function defaultDbPath(): string {
  return path.join(os.homedir(), '.agentsy', 'agentsy.db');
}

export function defaultSocketPath(): string {
  return path.join(os.homedir(), '.agentsy', 'daemon.sock');
}

export function defaultJobDirectory(): string {
  return path.join(os.homedir(), '.agentsy', 'jobs');
}

// ── Zod Schema ────────────────────────────────────────

import { z } from 'zod';

export const DaemonConfigSchema = z.object({
  ipc: z
    .object({
      socketPath: z.string().default(defaultSocketPath()),
      maxConnections: z.number().int().positive().default(10),
      requestTimeoutMs: z.number().int().positive().default(30_000)
    })
    .default({}),

  acp: z
    .object({
      enabled: z.boolean().default(true),
      transport: z.enum(['stdio', 'websocket']).default('websocket'),
      websocketPort: z.number().int().positive().default(9380),
      maxSessions: z.number().int().positive().default(5)
    })
    .default({}),

  database: z
    .object({
      path: z.string().default(defaultDbPath()),
      extensionPath: z.string().optional(),
      blake3ExtensionPath: z.string().optional(),
      walMode: z.boolean().default(true),
      busyTimeoutMs: z.number().int().positive().default(5000)
    })
    .default({}),

  pool: z
    .object({
      minThreads: z.number().int().positive().default(2),
      maxThreads: z.number().int().positive().default(os.cpus().length),
      idleTimeoutMs: z.number().int().positive().default(30_000),
      maxQueueSize: z.number().int().positive().default(100),
      concurrentTasksPerWorker: z.number().int().positive().default(1),
      resourceLimits: z
        .object({
          maxOldGenerationSizeMb: z.number().positive().default(256),
          maxYoungGenerationSizeMb: z.number().positive().default(64)
        })
        .default({})
    })
    .default({}),

  jobs: z
    .object({
      jobDirectory: z.string().default(defaultJobDirectory()),
      defaultRetries: z.number().int().nonnegative().default(3),
      defaultRetryDelayMs: z.number().int().positive().default(1000),
      defaultTimeoutMs: z.number().int().positive().default(30_000),
      queues: z.array(z.string()).default(['default', 'agents', 'maintenance', 'indexing'])
    })
    .default({}),

  memory: z
    .object({
      enabled: z.boolean().default(true),
      syncMode: z.enum(['local-only', 'remote-shadow']).default('local-only'),
      consolidationThreshold: z.number().min(0).max(1).default(0.7),
      decayIntervalMs: z.number().int().positive().default(60_000)
    })
    .default({}),

  sleep: z
    .object({
      enabled: z.boolean().default(true),
      idleTimeoutMs: z.number().int().positive().default(300_000),
      pollIntervalMs: z.number().int().positive().default(10_000),
      wakeTimeoutMs: z.number().int().positive().default(5000),
      minActiveMs: z.number().int().positive().default(30_000)
    })
    .default({}),

  supervisor: z
    .object({
      restartPolicy: z.enum(['always', 'on-failure', 'never']).default('always'),
      maxRestarts: z.number().int().positive().default(5),
      restartWindowMs: z.number().int().positive().default(60_000),
      backoffBaseMs: z.number().int().positive().default(1000),
      backoffMaxMs: z.number().int().positive().default(30_000),
      backoffJitter: z.boolean().default(true)
    })
    .default({}),

  subprocess: z
    .object({
      defaultTimeoutMs: z.number().int().positive().default(120_000),
      defaultStallTimeoutMs: z.number().int().positive().default(30_000),
      defaultMemoryLimitMb: z.number().int().positive().default(512),
      memoryCheckIntervalMs: z.number().int().positive().default(5000),
      defaultRestartPolicy: z.enum(['always', 'on-failure', 'never']).default('on-failure')
    })
    .default({}),

  logging: z
    .object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      file: z.string().optional(),
      maxSizeBytes: z.number().int().positive().default(10_485_760),
      maxFiles: z.number().int().positive().default(3)
    })
    .default({}),

  metrics: z
    .object({
      enabled: z.boolean().default(true),
      otelEndpoint: z.string().optional()
    })
    .default({}),

  connectors: z
    .object({
      discord: z.object({ token: z.string() }).optional(),
      slack: z.object({ token: z.string() }).optional(),
      telegram: z.object({ token: z.string() }).optional()
    })
    .default({}),

  shutdownTimeoutMs: z.number().int().positive().default(30_000)
});

export type DaemonConfig = z.infer<typeof DaemonConfigSchema>;

export function resolveConfig(partial: DeepPartial<DaemonConfig> = {}): DaemonConfig {
  return DaemonConfigSchema.parse(partial);
}
