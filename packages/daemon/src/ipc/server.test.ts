import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { IPCClient } from './client.js';
import { IPCServer } from './server.js';

const SOCKET_PATH = `/tmp/agentsy-test-${randomUUID().slice(0, 8)}.sock`;

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
      /* ok */
    }
  });

  it('should handle a request-response cycle', async () => {
    server.handle('test.echo', async params => params);

    const client = new IPCClient();
    await client.connect(SOCKET_PATH);
    const result = await client.request('test.echo', { message: 'hello' });
    expect(result).toEqual({ message: 'hello' });
    await client.disconnect();
  });

  it('should return MethodNotFound for unknown methods', async () => {
    const client = new IPCClient();
    await client.connect(SOCKET_PATH);
    await expect(client.request('unknown.method')).rejects.toThrow('Method not found');
    await client.disconnect();
  });

  it('should handle multiple concurrent clients', async () => {
    server.handle('test.ping', async () => ({ pong: true }));

    const client1 = new IPCClient();
    const client2 = new IPCClient();
    await client1.connect(SOCKET_PATH);
    await client2.connect(SOCKET_PATH);

    const [r1, r2] = await Promise.all([client1.request('test.ping'), client2.request('test.ping')]);
    expect(r1).toEqual({ pong: true });
    expect(r2).toEqual({ pong: true });

    await client1.disconnect();
    await client2.disconnect();
  });

  it('should broadcast to all connected clients', async () => {
    const client1 = new IPCClient();
    const client2 = new IPCClient();
    await client1.connect(SOCKET_PATH);
    await client2.connect(SOCKET_PATH);

    // Register a handler that sends a notification
    server.handle('test.notify', (_params, ctx) => {
      ctx.sendNotification('test.event', { data: 42 });
      return Promise.resolve({ sent: true });
    });

    const result = await client1.request('test.notify');
    expect(result).toEqual({ sent: true });

    await client1.disconnect();
    await client2.disconnect();
  });

  it('should handle max connections without crashing', async () => {
    await server.stop();
    server = new IPCServer({ socketPath: SOCKET_PATH, maxConnections: 1, logger });
    await server.start();

    const client1 = new IPCClient();
    await client1.connect(SOCKET_PATH);

    // Second connection attempt should not crash the server
    const client2 = new IPCClient();
    try {
      await client2.connect(SOCKET_PATH);
    } catch {
      // Connection rejected — expected
    }

    // First client should still work
    server.handle('test.ping', async () => ({ pong: true }));
    const result = await client1.request('test.ping');
    expect(result).toEqual({ pong: true });
  }, 5000);
});
