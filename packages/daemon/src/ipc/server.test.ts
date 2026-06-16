import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { IPCClient } from './client.js';
import { IPCServer } from './server.js';

const SOCKET_PATH = join(tmpdir(), `agentsy-test-${randomUUID().slice(0, 8)}.sock`);

describe('IPCServer + IPCClient integration', () => {
  const logger = createMockLogger();
  let server: IPCServer;

  beforeEach(async () => {
    server = new IPCServer({ socketPath: SOCKET_PATH, logger });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    try {
      await unlink(SOCKET_PATH);
    } catch {
      /* fine */
    }
  });

  it('should handle request/response', async () => {
    server.handle('test.ping', async () => ({ pong: true }));

    const client = new IPCClient();
    await client.connect(SOCKET_PATH);
    const result = await client.request('test.ping');
    expect(result).toEqual({ pong: true });
    await client.disconnect();
  });

  it('should handle errors', async () => {
    server.handle('test.error', () => {
      throw new Error('oops');
    });

    const client = new IPCClient();
    await client.connect(SOCKET_PATH);
    await expect(client.request('test.error')).rejects.toThrow('oops');
    await client.disconnect();
  });

  it('should handle method not found', async () => {
    const client = new IPCClient();
    await client.connect(SOCKET_PATH);
    await expect(client.request('nonexistent')).rejects.toThrow('Method not found');
    await client.disconnect();
  });

  it('should broadcast to all connected clients', async () => {
    server.handle('test.notify', (_params, ctx) => {
      ctx.sendNotification('test.event', { data: 42 });
      return Promise.resolve({ sent: true });
    });

    const client1 = new IPCClient();
    const client2 = new IPCClient();
    await client1.connect(SOCKET_PATH);
    await client2.connect(SOCKET_PATH);

    const result = await client1.request('test.notify');
    expect(result).toEqual({ sent: true });

    await client1.disconnect();
    await client2.disconnect();
  });

  it('should start and stop cleanly', async () => {
    const srv = new IPCServer({
      socketPath: join(tmpdir(), `agentsy-test-stop-${randomUUID().slice(0, 8)}.sock`),
      logger
    });
    await srv.start();
    await expect(srv.stop()).resolves.toBeUndefined();
  });
});
