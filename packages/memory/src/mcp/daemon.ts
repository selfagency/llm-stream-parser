// Daemon process management for @agentsy/memory MCP server
// Provides PID file tracking, auto-restart, and health monitoring

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { createMemoryEngine } from '../cognitive/memory-engine.js';
import { loadConfig } from '../config.js';
import { createMemoryMCPServer, type MemoryMCPServerOptions } from './server.js';

export interface DaemonConfig {
  /** Log file path. Default: .agentsy/memory-daemon.log */
  logFile?: string;
  /** Max restarts within window. Default: 5 */
  maxRestarts?: number;
  /** PID file path. Default: .agentsy/memory-daemon.pid */
  pidFile?: string;
  /** Auto-restart on crash. Default: true */
  restart?: boolean;
  /** Delay between restarts in ms. Default: 1000 */
  restartDelay?: number;
  /** Restart window in ms. Default: 60000 */
  restartWindow?: number;
}

export interface DaemonStatus {
  engineStats: {
    totalItems: number;
    totalTokens: number;
    budgetUtilization: number;
  } | null;
  pid: number | null;
  running: boolean;
  uptime: number | null;
}

const DEFAULT_DAEMON_CONFIG: Required<DaemonConfig> = {
  pidFile: '.agentsy/memory-daemon.pid',
  logFile: '.agentsy/memory-daemon.log',
  restart: true,
  restartDelay: 1000,
  maxRestarts: 5,
  restartWindow: 60_000
};

/**
 * Ensure the directory for a file path exists.
 */
function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if a daemon is currently running by reading its PID file
 * and checking if the process exists.
 */
export function isDaemonRunning(pidFile?: string): Promise<boolean> {
  const pidPath = pidFile ?? DEFAULT_DAEMON_CONFIG.pidFile;
  if (!existsSync(pidPath)) {
    return Promise.resolve(false);
  }

  try {
    const pid = Number.parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    if (Number.isNaN(pid)) {
      return Promise.resolve(false);
    }

    // Check if the process is still alive
    try {
      process.kill(pid, 0); // signal 0 = existence check
      return Promise.resolve(true);
    } catch {
      // Process doesn't exist — stale PID file
      unlinkSync(pidPath);
      return Promise.resolve(false);
    }
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Get the current daemon status.
 */
export async function getDaemonStatus(pidFile?: string): Promise<DaemonStatus> {
  const running = await isDaemonRunning(pidFile);

  if (!running) {
    return { running: false, pid: null, uptime: null, engineStats: null };
  }

  const pidPath = pidFile ?? DEFAULT_DAEMON_CONFIG.pidFile;
  let pid: number | null = null;
  try {
    pid = Number.parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  } catch {
    pid = null;
  }

  return {
    running: true,
    pid,
    uptime: null, // Can't determine uptime without connecting to the daemon
    engineStats: null
  };
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

export function buildDaemonConfig(daemonConfig: DaemonConfig): Required<DaemonConfig> {
  return {
    pidFile: withDefault(daemonConfig.pidFile, DEFAULT_DAEMON_CONFIG.pidFile),
    logFile: withDefault(daemonConfig.logFile, DEFAULT_DAEMON_CONFIG.logFile),
    restart: withDefault(daemonConfig.restart, DEFAULT_DAEMON_CONFIG.restart),
    restartDelay: withDefault(daemonConfig.restartDelay, DEFAULT_DAEMON_CONFIG.restartDelay),
    maxRestarts: withDefault(daemonConfig.maxRestarts, DEFAULT_DAEMON_CONFIG.maxRestarts),
    restartWindow: withDefault(daemonConfig.restartWindow, DEFAULT_DAEMON_CONFIG.restartWindow)
  };
}

export function cleanOldRestartTimestamps(timestamps: number[], now: number, window: number): void {
  while (timestamps.length > 0) {
    const first = timestamps[0];
    if (first === undefined || now - first <= window) {
      break;
    }
    timestamps.shift();
  }
}

function formatRestartError(maxRestarts: number, window: number): Error {
  return new Error(`Daemon crashed ${maxRestarts} times within ${window}ms. Giving up.`);
}

/**
 * Start the memory daemon with auto-restart capability.
 *
 * This creates a MemoryEngine, wraps it in an MCP server, and starts
 * listening. If `restart` is enabled, it will auto-restart on crashes
 * up to `maxRestarts` within `restartWindow`.
 */
export async function startDaemon(
  serverOptions: MemoryMCPServerOptions = {},
  daemonConfig: DaemonConfig = {},
  engineOptions?: Parameters<typeof createMemoryEngine>[0]
): Promise<void> {
  const config = buildDaemonConfig(daemonConfig);

  // Check if already running
  if (await isDaemonRunning(config.pidFile)) {
    throw new Error(`Daemon is already running (PID file: ${config.pidFile})`);
  }

  // Ensure directories exist
  ensureDir(config.pidFile);
  ensureDir(config.logFile);

  // Load full config for engine creation
  const fullConfig = loadConfig();
  const engine = createMemoryEngine(engineOptions);
  const server = createMemoryMCPServer(engine, {
    ...serverOptions,
    ...fullConfig.mcp
  });

  // Write PID file
  writeFileSync(config.pidFile, String(process.pid), 'utf-8');

  // Mutable reference to the active server — updated on restart
  const activeServer: { current: ReturnType<typeof createMemoryMCPServer> } = { current: server };

  // Track restarts for crash recovery
  const restartTimestamps: number[] = [];

  async function runWithRestart(): Promise<void> {
    try {
      await activeServer.current.start();
      // Server runs until crash — this line won't be reached unless it exits normally
    } catch (err) {
      if (!config.restart) {
        throw err;
      }

      const now = Date.now();
      cleanOldRestartTimestamps(restartTimestamps, now, config.restartWindow);

      if (restartTimestamps.length >= config.maxRestarts) {
        throw formatRestartError(config.maxRestarts, config.restartWindow);
      }

      restartTimestamps.push(now);
      console.error(
        `Daemon crashed, restarting in ${config.restartDelay}ms (attempt ${restartTimestamps.length}/${config.maxRestarts})...`
      );

      // Wait before restarting
      await new Promise(resolve => setTimeout(resolve, config.restartDelay));

      // Create fresh engine and server for clean state
      const newEngine = createMemoryEngine(engineOptions);
      const newServer = createMemoryMCPServer(newEngine, {
        ...serverOptions,
        ...fullConfig.mcp
      });
      // Update the mutable reference so shutdown() closes the new server
      activeServer.current = newServer;

      return runWithRestart();
    }
  }

  // Handle graceful shutdown
  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    try {
      await activeServer.current.close();
    } catch {
      // Ignore close errors during shutdown
    }

    try {
      if (existsSync(config.pidFile)) {
        unlinkSync(config.pidFile);
      }
    } catch {
      // Ignore PID file cleanup errors
    }

    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await runWithRestart();
}

/**
 * Stop a running daemon by sending SIGTERM to its process.
 */
export async function stopDaemon(pidFile?: string): Promise<void> {
  const pidPath = pidFile ?? DEFAULT_DAEMON_CONFIG.pidFile;

  if (!(await isDaemonRunning(pidPath))) {
    return; // Not running, nothing to do
  }

  const pid = Number.parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  if (Number.isNaN(pid)) {
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may have died between check and kill
  }

  // Wait briefly for the process to exit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Clean up PID file if still present
  try {
    if (existsSync(pidPath)) {
      unlinkSync(pidPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
