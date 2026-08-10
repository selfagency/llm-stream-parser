import { describe, expect, it } from 'vitest';
import { UnifiedDB } from '../db/unified-db.js';
import { createMockLogger } from '../test-utils.js';
import { HonkerQueueAdapter } from './honker-queue.js';

function createTestAdapter(): HonkerQueueAdapter {
  const db = new UnifiedDB({ path: ':memory:', logger: createMockLogger() });
  return new HonkerQueueAdapter({
    db,
    queues: ['default', 'agents', 'maintenance'],
    logger: createMockLogger()
  });
}

describe('HonkerQueueAdapter', () => {
  it('should start and initialize queues', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    expect(adapter.count()).toBe(0);
  });

  it('should enqueue jobs', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    const id = await adapter.enqueue({ task: 'test' });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('should enqueue jobs with queue option', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    const id = await adapter.enqueue({ task: 'agent' }, { queue: 'agents' });
    expect(id).toBeTruthy();
  });

  it('should claim jobs in FIFO order', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    await adapter.enqueue({ task: 'first' });
    await adapter.enqueue({ task: 'second' });

    const job1 = await adapter.claim('worker1');
    expect(job1).not.toBeNull();
    expect(job1?.payload).toEqual({ task: 'first' });

    const job2 = await adapter.claim('worker1');
    expect(job2).not.toBeNull();
    expect(job2?.payload).toEqual({ task: 'second' });
  });

  it('should return null when queue is empty', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    const job = await adapter.claim('worker1');
    expect(job).toBeNull();
  });

  it('should ack jobs without error', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    await adapter.ack('job_1');
    // Should not throw
  });

  it('should cancel jobs without error', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    await adapter.cancel('job_1');
    // Should not throw
  });

  it('should list jobs', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    const jobs = await adapter.list();
    expect(Array.isArray(jobs)).toBe(true);
  });

  it('should stop cleanly', async () => {
    const adapter = createTestAdapter();
    await adapter.start();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });
});
