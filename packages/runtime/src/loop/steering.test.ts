import { describe, expect, it } from 'vitest';
import { SteeringQueue } from './steering.js';

describe('SteeringQueue', () => {
  it('drainSteers returns empty when no steers queued', () => {
    const q = new SteeringQueue();
    expect(q.drainSteers()).toEqual([]);
  });

  it('steer adds a message to pending steers', () => {
    const q = new SteeringQueue();
    q.steer({ role: 'user', content: 'fix this' });
    expect(q.drainSteers()).toEqual([{ role: 'user', content: 'fix this' }]);
  });

  it('drainSteers returns all steers and clears the queue', () => {
    const q = new SteeringQueue();
    q.steer({ role: 'user', content: 'first' });
    q.steer({ role: 'user', content: 'second' });
    expect(q.drainSteers()).toHaveLength(2);
    expect(q.drainSteers()).toEqual([]);
  });

  it('promoteQueued(all) returns all messages and clears', () => {
    const q = new SteeringQueue();
    q.queue({ role: 'user', content: 'a' });
    q.queue({ role: 'user', content: 'b' });
    expect(q.promoteQueued('all')).toEqual([
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' }
    ]);
    expect(q.promoteQueued('all')).toEqual([]);
  });

  it('promoteQueued(one-at-a-time) returns first only', () => {
    const q = new SteeringQueue();
    q.queue({ role: 'user', content: 'first' });
    q.queue({ role: 'user', content: 'second' });
    expect(q.promoteQueued('one-at-a-time')).toEqual([{ role: 'user', content: 'first' }]);
    expect(q.promoteQueued('one-at-a-time')).toEqual([{ role: 'user', content: 'second' }]);
    expect(q.promoteQueued('one-at-a-time')).toEqual([]);
  });

  it('promoteQueued(one-at-a-time) returns empty when no messages', () => {
    const q = new SteeringQueue();
    expect(q.promoteQueued('one-at-a-time')).toEqual([]);
  });

  it('steer and queue maintain separate buffers', () => {
    const q = new SteeringQueue();
    q.steer({ role: 'user', content: 'steer1' });
    q.queue({ role: 'user', content: 'queue1' });
    expect(q.drainSteers()).toEqual([{ role: 'user', content: 'steer1' }]);
    expect(q.promoteQueued('all')).toEqual([{ role: 'user', content: 'queue1' }]);
  });
});
