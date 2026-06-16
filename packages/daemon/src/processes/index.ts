/**
 * Subprocess management subsystem.
 *
 * Manages child process lifecycle with stall detection, memory limits,
 * and auto-restart for MCP servers.
 *
 * @module
 */

export {
  SubprocessManager,
  type SubprocessManagerDeps,
  type SubprocessSpec,
  type SubprocessState
} from './subprocess-manager.js';
export { TerminalBridge, type TerminalBridgeDeps } from './terminal-bridge.js';
