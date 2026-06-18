import { describe, expect, it, vi } from 'vitest';
import type { HonkerQueueAdapter } from '../jobs/honker-queue.js';
import type { Logger } from '../types.js';
import { HonkerEventBus } from './event-bus.js';

const testLogger: Logger = {
  child: () => testLogger,
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined
};

function createMockQueue(): HonkerQueueAdapter {
  return {
    enqueue: vi.fn().mockResolvedValue('job-1'),
    claim: vi.fn().mockResolvedValue(null),
    ack: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockReturnValue(0)
  } as unknown as HonkerQueueAdapter;
}

describe('HonkerEventBus', () => {
  it('publishes an event to the queue', () => {
    const queue = createMockQueue();
    const bus = new HonkerEventBus({ logger: testLogger, queue });

    bus.publish({ type: 'memory.canary', timestamp: new Date().toISOString() });

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const [payload, options] = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      { queue: string }
    ];
    expect(payload).toHaveProperty('type', 'memory.canary');
    expect(options).toEqual({ queue: 'events' });
  });

  it('fires in-process subscribers on publish', async () => {
    const queue = createMockQueue();
    const bus = new HonkerEventBus({ logger: testLogger, queue });
    const handler = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('memory.canary', handler);
    bus.publish({ type: 'memory.canary', timestamp: new Date().toISOString() });

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'memory.canary' }));
  });

  it('does not fire subscribers for different event types', async () => {
    const queue = createMockQueue();
    const bus = new HonkerEventBus({ logger: testLogger, queue });
    const handler = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('learning.completed', handler);
    bus.publish({ type: 'memory.canary', timestamp: new Date().toISOString() });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the handler', async () => {
    const queue = createMockQueue();
    const bus = new HonkerEventBus({ logger: testLogger, queue });
    const handler = vi.fn().mockResolvedValue(undefined);

    const unsubscribe = bus.subscribe('memory.canary', handler);
    unsubscribe();
    bus.publish({ type: 'memory.canary', timestamp: new Date().toISOString() });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(handler).not.toHaveBeenCalled();
  });

  it('tracks subscription count', () => {
    const queue = createMockQueue();
    const bus = new HonkerEventBus({ logger: testLogger, queue });

    expect(bus.subscriptionCount).toBe(0);

    const unsub1 = bus.subscribe('memory.canary', vi.fn().mockResolvedValue(undefined));
    expect(bus.subscriptionCount).toBe(1);

    const unsub2 = bus.subscribe('learning.completed', vi.fn().mockResolvedValue(undefined));
    expect(bus.subscriptionCount).toBe(2);

    unsub1();
    expect(bus.subscriptionCount).toBe(1);

    unsub2();
    expect(bus.subscriptionCount).toBe(0);
  });

  it('handles subscriber errors gracefully', async () => {
    const queue = createMockQueue();
    const bus = new HonkerEventBus({ logger: testLogger, queue });
    const errorHandler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const goodHandler = vi.fn().mockResolvedValue(undefined);

    bus.subscribe('memory.canary', errorHandler);
    bus.subscribe('memory.canary', goodHandler);
    bus.publish({ type: 'memory.canary', timestamp: new Date().toISOString() });

    await new Promise(resolve => setTimeout(resolve, 10));
    // Good handler should still be called even if error handler fails
    expect(goodHandler).toHaveBeenCalledTimes(1);
  });
});
