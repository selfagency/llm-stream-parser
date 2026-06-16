/**
 * @agentsy/daemon — Long-lived daemon process with IPC, ACP, subprocess management, and lifecycle orchestration
 *
 * ## Subsystems
 *
 * - {@link ./ipc/index.ts | ipc } — JSON-RPC 2.0 over Unix domain sockets
 * - {@link ./acp/index.ts | acp } — ACP Agent interface for editor integration
 * - {@link ./processes/index.ts | processes } — Subprocess management with stall detection
 * - {@link ./lifecycle/index.ts | lifecycle } — Crash recovery and sleep/wake
 * - {@link ./services/index.ts | services } — Generic service host
 * - {@link ./agents/index.ts | agents } — Multi-agent lifecycle and scope isolation
 * - {@link ./jobs/index.ts | jobs } — Cron + one-time job scheduler
 * - {@link ./connectors/index.ts | connectors } — Third-party connector manager
 * - {@link ./display/index.ts | display } — TUI display over IPC
 * - {@link ./cli/index.ts | cli } — Daemon CLI commands
 *
 * @module
 */

export { type DaemonConfig, DaemonConfigSchema, resolveConfig } from './config.js';
export { Daemon, type DaemonDeps, type DaemonState } from './daemon.js';
export type { Logger } from './types.js';
