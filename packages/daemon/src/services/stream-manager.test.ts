/**
 * Tests for StreamManager.
 */

import { describe, expect, it, vi } from 'vitest';
import type { StreamChunk } from '@agentsy/shared';
import type { IPCServer } from '../ipc/server.js';
import type { Logger } from '../types.js';
import type { RoutingService } from './routing-service.js';
import { StreamManager, type StreamProvider } from './stream-manager.js';

// =============================================================================
// Mocks
// =============================================================================

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  };
}

function createMockIPCServer(): IPCServer {
  return {
    broadcast: vi.fn(),
    handle: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined)
  } as unknown as IPCServer;
}

function createMockRoutingService(): RoutingService {
  return {
    name: 'routing',
    state: 'active',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    wakeup: vi.fn().mockResolvedValue(undefined),
    selectModel: vi.fn(),
    spillover: vi.fn(),
    gatewayInstance: null
  } as unknown as RoutingService;
}

function createMockStreamProvider(chunks: StreamChunk[] = []): StreamProvider {
  return {
    stream() {
      return {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            next() {
              if (i < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[i++]! });
              }
              return Promise.resolve({ done: true, value: undefined });
            }
          };
        }
      };
    }
  };
}

// =============================================================================
// Lifecycle
// =============================================================================

describe('StreamManager lifecycle', () => {
  it('starts in stopped state', () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    expect(manager.state).toBe('stopped');
  });

  it('transitions to running after start', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();
    expect(manager.state).toBe('running');
  });

  it('transitions to stopped on sleep', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();
    await manager.sleep();
    expect(manager.state).toBe('stopped');
  });

  it('transitions back to running on wakeup', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();
    await manager.sleep();
    await manager.wakeup();
    expect(manager.state).toBe('running');
  });

  it('transitions to stopped after stop', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();
    await manager.stop();
    expect(manager.state).toBe('stopped');
  });
});

// =============================================================================
// Stream management
// =============================================================================

describe('StreamManager stream management', () => {
  it('starts a stream and returns a streamId', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();

    const provider = createMockStreamProvider([{ content: 'Hello' }]);
    const result = manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    expect(result).toHaveProperty('streamId');
    expect(result.streamId).toMatch(/^s-/);
  });

  it('broadcasts stream.chunk notifications', async () => {
    const ipc = createMockIPCServer();
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService()
    });
    await manager.start();

    const provider = createMockStreamProvider([{ content: 'Hello' }, { content: ' world' }]);
    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    // Wait for async stream to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(ipc.broadcast).toHaveBeenCalledWith(
      'stream.chunk',
      expect.objectContaining({ streamId: expect.stringMatching(/^s-/) })
    );
  });

  it('broadcasts stream.end on completion', async () => {
    const ipc = createMockIPCServer();
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService()
    });
    await manager.start();

    const provider = createMockStreamProvider([{ content: 'Done' }]);
    manager.startStream({ messages: [{ role: 'user', content: 'Go' }] }, provider);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(ipc.broadcast).toHaveBeenCalledWith(
      'stream.end',
      expect.objectContaining({ streamId: expect.stringMatching(/^s-/) })
    );
  });

  it('cancels a running stream', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();

    const provider = createMockStreamProvider([{ content: 'Hello' }]);
    const { streamId } = manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    const cancelled = manager.cancelStream(streamId);
    expect(cancelled).toBe(true);
  });

  it('returns false when cancelling unknown stream', () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });

    expect(manager.cancelStream('s-unknown')).toBe(false);
  });

  it('reports active stream count', async () => {
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc: createMockIPCServer(),
      routing: createMockRoutingService()
    });
    await manager.start();

    expect(manager.count()).toBe(0);

    const provider = createMockStreamProvider([{ content: 'Hello' }]);
    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    // Stream is still active until the async pipeline completes
    expect(manager.count()).toBe(1);
  });
});

// =============================================================================
// Error handling
// =============================================================================

describe('StreamManager error handling', () => {
  it('broadcasts stream.error on provider failure', async () => {
    const ipc = createMockIPCServer();
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService()
    });
    await manager.start();

    const failingProvider: StreamProvider = {
      stream() {
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return Promise.reject(new Error('Provider error'));
              }
            };
          }
        };
      }
    };

    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, failingProvider);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(ipc.broadcast).toHaveBeenCalledWith(
      'stream.error',
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Provider error' })
      })
    );
  });
});
