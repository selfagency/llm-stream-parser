import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DaemonDeps } from '../daemon.js';
import { startDaemon } from './start.js';
import { stopDaemon } from './stop.js';

const DEFAULT_SOCKET_PATH = join(homedir(), '.agentsy', 'daemon.sock');

export async function restartDaemon(
  socketPath = DEFAULT_SOCKET_PATH,
  extraConfig?: Record<string, unknown>,
  deps?: Partial<DaemonDeps>
): Promise<void> {
  try {
    await stopDaemon(socketPath);
  } catch {
    // Daemon may not be running — that's fine
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  await startDaemon({ ipc: { socketPath }, ...extraConfig }, deps);
}
