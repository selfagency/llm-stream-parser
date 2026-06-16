import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { JobScheduler } from './scheduler.js';

describe('JobScheduler', () => {
  it('should start and stop cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const sched = new JobScheduler({ logger });
    await sched.start();
    expect(logger.info).toHaveBeenCalledWith('JobScheduler started');
    await sched.stop();
  });

  it('should schedule and list jobs', async () => {
    const sched = new JobScheduler({ logger: createMockLogger() });
    await sched.start();
    const _id1 = await sched.schedule({ type: 'once' });
    const _id2 = await sched.schedule({ type: 'recurring' });
    const jobs = sched.list();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.type).toBe('once');
    expect(sched.count()).toBe(2);
    await sched.stop();
  });

  it('should cancel a job', async () => {
    const sched = new JobScheduler({ logger: createMockLogger() });
    await sched.start();
    const id = await sched.schedule({ type: 'once' });
    expect(sched.cancel(id)).toBe(true);
    expect(sched.count()).toBe(0);
    expect(sched.cancel('nonexistent')).toBe(false);
    await sched.stop();
  });

  it('should clear jobs on stop', async () => {
    const sched = new JobScheduler({ logger: createMockLogger() });
    await sched.start();
    await sched.schedule({ type: 'once' });
    await sched.stop();
    expect(sched.count()).toBe(0);
  });
});
