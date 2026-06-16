import { z } from 'zod';
import type { DeepPartial } from './types.js';

/**
 * Daemon configuration schema with Zod validation.
 * All fields have sensible defaults.
 */

export const DaemonConfigSchema = z.object({
  /** IPC server configuration */
  ipc: z
    .object({
      /** Unix domain socket path */
      socketPath: z.string().default('/tmp/agentsy-daemon.sock'),
      /** Maximum concurrent client connections */
      maxConnections: z.number().int().positive().default(10),
      /** Request timeout in milliseconds */
      requestTimeoutMs: z.number().int().positive().default(30_000)
    })
    .default({}),

  /** ACP server configuration */
  acp: z
    .object({
      /** Enable ACP server */
      enabled: z.boolean().default(false),
      /** Transport type */
      transport: z.enum(['stdio', 'websocket']).default('stdio'),
      /** WebSocket port (when transport is 'websocket') */
      websocketPort: z.number().int().positive().default(9380),
      /** Maximum concurrent ACP sessions */
      maxSessions: z.number().int().positive().default(10)
    })
    .default({}),

  /** Supervisor crash recovery policy */
  supervisor: z
    .object({
      /** Enable supervisor crash watching */
      enabled: z.boolean().default(true),
      /** Maximum restarts within the restart window */
      maxRestarts: z.number().int().positive().default(5),
      /** Restart window in milliseconds */
      restartWindowMs: z.number().int().positive().default(60_000),
      /** Delay before restart in milliseconds */
      restartDelayMs: z.number().int().positive().default(1000)
    })
    .default({}),

  /** Sleep policy for idle subsystems */
  sleep: z
    .object({
      /** Enable sleep/wake for idle subsystems */
      enabled: z.boolean().default(true),
      /** Idle timeout in milliseconds before sleeping */
      idleTimeoutMs: z.number().int().positive().default(300_000),
      /** Poll interval in milliseconds for checking idle state */
      pollIntervalMs: z.number().int().positive().default(10_000)
    })
    .default({}),

  /** Subprocess manager configuration */
  subprocess: z
    .object({
      /** Default stall timeout in milliseconds */
      defaultStallTimeoutMs: z.number().int().positive().default(30_000),
      /** Default memory limit in bytes */
      defaultMemoryLimitBytes: z
        .number()
        .int()
        .positive()
        .default(256 * 1024 * 1024),
      /** Memory check interval in milliseconds */
      memoryCheckIntervalMs: z.number().int().positive().default(5000)
    })
    .default({}),

  /** Connector configuration */
  connectors: z
    .object({
      /** Enable connector host */
      enabled: z.boolean().default(true)
    })
    .default({}),

  /** Logging configuration */
  logging: z
    .object({
      /** Log level */
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      /** Enable structured JSON logging */
      json: z.boolean().default(false)
    })
    .default({}),

  /** Metrics configuration */
  metrics: z
    .object({
      /** Enable metrics collection */
      enabled: z.boolean().default(true)
    })
    .default({}),

  /** Database configuration */
  database: z
    .object({
      /** SQLite database path */
      path: z.string().default(':memory:')
    })
    .default({}),

  /** Shutdown timeout in milliseconds */
  shutdownTimeoutMs: z.number().int().positive().default(30_000)
});

export type DaemonConfig = z.infer<typeof DaemonConfigSchema>;

/**
 * Resolve partial config with defaults.
 */
export function resolveConfig(partial: DeepPartial<DaemonConfig> = {}): DaemonConfig {
  return DaemonConfigSchema.parse(partial);
}
