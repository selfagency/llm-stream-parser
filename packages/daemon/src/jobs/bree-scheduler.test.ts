import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UnifiedDB } from '../db/unified-db.js';
import { createMockLogger } from '../test-utils.js';
import { TimerScheduler } from './bree-scheduler.js';
import { HonkerQueueAdapter } from './honker-queue.js';

async function createTestScheduler(): Promise<TimerScheduler> {
  const db = new UnifiedDB({ path: ':memory:', logger: createMockLogger() });
  await db.open();
  const queue = new HonkerQueueAdapter({ db, queues: ['default'], logger: createMockLogger() });
  return new TimerScheduler({ queue, root: join(tmpdir(), 'test-jobs'), logger: createMockLogger() });
}

describe('TimerScheduler', () => {
  it('should start and stop', async () => {
    const scheduler = await createTestScheduler();
    await scheduler.start();
    await scheduler.stop();
  });

  it('should schedule a one_time job', async () => {
    const scheduler = await createTestScheduler();
    await scheduler.start();
    const id = await scheduler.schedule({
      name: 'test-job',
      type: 'one_time',
      schedule: '100',
      handler: './test-handler.js'
    });
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    await scheduler.stop();
  });

  it('should list scheduled jobs', async () => {
    const scheduler = await createTestScheduler();
    await scheduler.start();
    await scheduler.schedule({
      name: 'job1',
      type: 'one_time',
      schedule: '500',
      handler: './handler1.js'
    });
    await scheduler.schedule({
      name: 'job2',
      type: 'one_time',
      schedule: '1000',
      handler: './handler2.js'
    });
    const jobs = await scheduler.list();
    expect(jobs).toHaveLength(2);
    await scheduler.stop();
  });

  it('should cancel a scheduled job', async () => {
    const scheduler = await createTestScheduler();
    await scheduler.start();
    const id = await scheduler.schedule({
      name: 'cancel-test',
      type: 'one_time',
      schedule: '5000',
      handler: './cancel-test.js'
    });
    await scheduler.cancel(id);
    const jobs = await scheduler.list();
    expect(jobs).toHaveLength(0);
    await scheduler.stop();
  });

  it('should enqueue via the queue adapter', async () => {
    const scheduler = await createTestScheduler();
    await scheduler.start();
    const id = await scheduler.enqueue({ task: 'test' });
    expect(id).toBeTruthy();
    await scheduler.stop();
  });
});
