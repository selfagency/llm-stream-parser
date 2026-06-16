/**
 * @agentsy/daemon — Long-lived daemon process with IPC, ACP, subprocess management, and lifecycle orchestration
 *
 * @module
 */

export { type DaemonConfig, DaemonConfigSchema, resolveConfig } from './config.js';
export { Daemon, type DaemonDeps, type DaemonState } from './daemon.js';
export type { Logger } from './types.js';
