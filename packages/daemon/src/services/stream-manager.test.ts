/**
 * Tests for StreamManager.
 */

import type { StreamChunk } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';
import type { IPCServer } from '../ipc/server.js';
import { StreamingSecretsFilter } from '../streaming/secrets-filter.js';
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
                // nosemgrep: detect-object-injection — chunks is a local array, not user input
                const chunk = chunks[i];
                if (!chunk) {
                  return Promise.resolve({ done: true, value: undefined });
                }
                i++;
                return Promise.resolve({ done: false, value: chunk });
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
      routing: createMockRoutingService(),
      secretsFilterEnabled: false
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
      routing: createMockRoutingService(),
      secretsFilterEnabled: false
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
      routing: createMockRoutingService(),
      secretsFilterEnabled: false
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
      routing: createMockRoutingService(),
      secretsFilterEnabled: false
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

// =============================================================================
// Secrets filter
// =============================================================================

async function runFilterTest(
  ipc: ReturnType<typeof createMockIPCServer>,
  opts: { secretsFilterEnabled: boolean; filterFactory?: () => StreamingSecretsFilter }
): Promise<string | undefined> {
  const manager = new StreamManager({
    logger: createMockLogger(),
    ipc,
    routing: createMockRoutingService(),
    ...opts
  });
  await manager.start();

  const provider = createMockStreamProvider([{ content: 'My key is sk-proj-abc123def456ghi789jkl012' }]);
  manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);
  await new Promise(resolve => setTimeout(resolve, 50));

  const calls = (ipc.broadcast as ReturnType<typeof vi.fn>).mock.calls;
  const chunkCall = calls.find((c: unknown[]) => c[0] === 'stream.chunk');
  if (!chunkCall) {
    return;
  }
  return (chunkCall as [string, { chunk: { content: string } }])[1].chunk.content;
}

describe('StreamManager secrets filter', () => {
  it('masks secrets when filter is enabled', async () => {
    const ipc = createMockIPCServer();
    const content = await runFilterTest(ipc, {
      secretsFilterEnabled: true,
      filterFactory: () => new StreamingSecretsFilter({ maxSecretLength: 5 })
    });
    expect(content).toContain('[REDACTED]');
  });

  it('skips masking when filter is disabled', async () => {
    const ipc = createMockIPCServer();
    const content = await runFilterTest(ipc, { secretsFilterEnabled: false });
    expect(content).toContain('sk-proj-abc123def456ghi789jkl012');
  });

  it('uses custom filter factory when provided', async () => {
    const ipc = createMockIPCServer();
    const filterFactory = vi.fn().mockReturnValue({
      feed: vi.fn().mockReturnValue('masked-output'),
      flush: vi.fn().mockReturnValue(null),
      reset: vi.fn()
    });
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService(),
      filterFactory
    });
    await manager.start();

    const provider = createMockStreamProvider([{ content: 'Hello' }]);
    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(filterFactory).toHaveBeenCalled();
  });
});

// =============================================================================
// Tool call tracking
// =============================================================================

describe('StreamManager tool call tracking', () => {
  it('tracks pending tool calls from nativeToolCallDeltas', async () => {
    const ipc = createMockIPCServer();
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService()
    });
    await manager.start();

    const provider = createMockStreamProvider([
      {
        nativeToolCallDeltas: [{ index: 0, id: 'call-1', name: 'get_weather', argumentsDelta: '{"city":"London"}' }]
      }
    ]);
    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    await new Promise(resolve => setTimeout(resolve, 50));

    const calls = (ipc.broadcast as ReturnType<typeof vi.fn>).mock.calls;
    const chunkCall = calls.find((c: unknown[]) => c[0] === 'stream.chunk');
    expect(chunkCall).toBeDefined();
    const payload = (chunkCall as [string, { chunk: { nativeToolCallDeltas: unknown[] } }])[1];
    expect(payload.chunk.nativeToolCallDeltas).toHaveLength(1);
  });
});

// =============================================================================
// Content types
// =============================================================================

describe('StreamManager content types', () => {
  it('broadcasts thinking chunks', async () => {
    const ipc = createMockIPCServer();
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService()
    });
    await manager.start();

    const provider = createMockStreamProvider([{ thinking: 'I am thinking...' }]);
    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(ipc.broadcast).toHaveBeenCalledWith(
      'stream.chunk',
      expect.objectContaining({
        chunk: expect.objectContaining({ thinking: 'I am thinking...' })
      })
    );
  });

  it('skips chunks with no content', async () => {
    const ipc = createMockIPCServer();
    const manager = new StreamManager({
      logger: createMockLogger(),
      ipc,
      routing: createMockRoutingService()
    });
    await manager.start();

    // Empty chunk — should not be broadcast
    const provider = createMockStreamProvider([{}]);
    manager.startStream({ messages: [{ role: 'user', content: 'Hi' }] }, provider);

    await new Promise(resolve => setTimeout(resolve, 50));

    // stream.end should still be broadcast, but no stream.chunk for the empty chunk
    const chunkCalls = (ipc.broadcast as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'stream.chunk'
    );
    // The empty chunk should not produce a stream.chunk notification
    expect(chunkCalls.length).toBe(0);
  });
});
