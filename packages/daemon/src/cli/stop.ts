import { IPCClient } from '../ipc/client.js';

export async function stopDaemon(socketPath = '/tmp/agentsy-daemon.sock'): Promise<void> {
  const client = new IPCClient();
  try {
    await client.connect(socketPath);
    await client.request('daemon.shutdown');
  } finally {
    await client.disconnect();
  }
}
