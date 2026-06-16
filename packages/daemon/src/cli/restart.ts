import { startDaemon } from './start.js';
import { stopDaemon } from './stop.js';

export async function restartDaemon(socketPath = '/tmp/agentsy-daemon.sock'): Promise<void> {
  try {
    await stopDaemon(socketPath);
  } catch {
    // Daemon may not be running — that's fine
  }

  // Wait for socket cleanup
  await new Promise(resolve => setTimeout(resolve, 1000));

  await startDaemon({ ipc: { socketPath } });
}
