import type { DaemonDeps } from '../daemon.js';
import { startDaemon } from './start.js';
import { stopDaemon } from './stop.js';

export async function restartDaemon(
  socketPath = '/tmp/agentsy-daemon.sock',
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
