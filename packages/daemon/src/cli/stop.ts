import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SOCKET_PATH = join(homedir(), '.agentsy', 'daemon.sock');

export async function stopDaemon(socketPath = DEFAULT_SOCKET_PATH): Promise<void> {
  const { IPCClient } = await import('../ipc/client.js');
  const client = new IPCClient();
  await client.connect(socketPath);
  try {
    await client.request('daemon.shutdown');
  } finally {
    await client.disconnect();
  }
}
