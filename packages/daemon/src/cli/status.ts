import { homedir } from 'node:os';
import { join } from 'node:path';
import { IPCClient } from '../ipc/client.js';

const DEFAULT_SOCKET_PATH = join(homedir(), '.agentsy', 'daemon.sock');

export async function daemonStatus(socketPath = DEFAULT_SOCKET_PATH): Promise<Record<string, unknown>> {
  const client = new IPCClient();
  try {
    await client.connect(socketPath);
    const status = await client.request('daemon.status');
    return status as Record<string, unknown>;
  } finally {
    await client.disconnect();
  }
}
