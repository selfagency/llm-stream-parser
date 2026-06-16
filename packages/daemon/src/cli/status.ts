import { IPCClient } from '../ipc/client.js';

export async function daemonStatus(socketPath = '/tmp/agentsy-daemon.sock'): Promise<Record<string, unknown>> {
  const client = new IPCClient();
  try {
    await client.connect(socketPath);
    const status = await client.request('daemon.status');
    return status as Record<string, unknown>;
  } finally {
    await client.disconnect();
  }
}
