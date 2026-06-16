import { describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { JobQueue } from './job-queue.js';

describe('JobQueue', () => {
  const logger = createMockLogger();

  it('should enqueue and dequeue items', () => {
    const queue = new JobQueue({ logger });
    queue.enqueue({ task: 'a' });
    queue.enqueue({ task: 'b' });
    expect(queue.size()).toBe(2);
    expect(queue.dequeue()?.payload).toEqual({ task: 'a' });
    expect(queue.dequeue()?.payload).toEqual({ task: 'b' });
    expect(queue.size()).toBe(0);
  });

  it('should peek without removing', () => {
    const queue = new JobQueue({ logger });
    queue.enqueue({ task: 'a' });
    queue.enqueue({ task: 'b' });
    expect(queue.peek()?.payload).toEqual({ task: 'a' });
    expect(queue.size()).toBe(2);
  });

  it('should remove by id', () => {
    const queue = new JobQueue({ logger });
    const id = queue.enqueue({ task: 'a' });
    queue.enqueue({ task: 'b' });
    expect(queue.remove(id)).toBe(true);
    expect(queue.size()).toBe(1);
    expect(queue.remove('nonexistent')).toBe(false);
  });

  it('should clear all items', () => {
    const queue = new JobQueue({ logger });
    queue.enqueue({ task: 'a' });
    queue.enqueue({ task: 'b' });
    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });

  it('should return undefined when dequeuing empty queue', () => {
    const queue = new JobQueue({ logger });
    expect(queue.dequeue()).toBeUndefined();
    expect(queue.peek()).toBeUndefined();
  });
});
