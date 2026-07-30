import { describe, expect, it } from 'vitest';
import { type JobPollerConfig, pollUntilDone } from './job-poller.js';

describe('pollUntilDone', () => {
  const baseConfig: Omit<JobPollerConfig, 'isDone' | 'getJobState'> = {
    initialIntervalMs: 10,
    maxIntervalMs: 100,
    backoffStrategy: 'exponential',
    multiplier: 2,
    maxPolls: 10,
    sleep: async () => {} // no-op for instant tests
  };

  it('returns done when job completes', async () => {
    let polls = 0;
    const result = await pollUntilDone({
      ...baseConfig,
      isDone: s => s === 'done',
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      getJobState: async () => {
        polls++;
        return polls >= 3 ? 'done' : 'running';
      }
    });
    expect(result.done).toBe(true);
    expect(result.polls).toBe(3);
    expect(result.history).toHaveLength(3);
  });

  it('returns not done after max polls', async () => {
    const result = await pollUntilDone({
      ...baseConfig,
      maxPolls: 3,
      isDone: () => false,
      getJobState: async () => 'running'
    });
    expect(result.done).toBe(false);
    expect(result.polls).toBe(3);
  });

  it('uses exponential backoff for intervals', async () => {
    const result = await pollUntilDone({
      ...baseConfig,
      initialIntervalMs: 10,
      maxPolls: 4,
      isDone: s => s === 'done',
      getJobState: async () => 'running'
    });
    // After 4 polls (none done), intervals should be: 10, 20, 40, 80
    expect(result.history[0]?.intervalMs).toBe(10);
    expect(result.history[1]?.intervalMs).toBe(20);
    expect(result.history[2]?.intervalMs).toBe(40);
    expect(result.history[3]?.intervalMs).toBe(80);
  });

  it('caps at maxIntervalMs', async () => {
    const result = await pollUntilDone({
      ...baseConfig,
      initialIntervalMs: 50,
      maxIntervalMs: 75,
      maxPolls: 5,
      isDone: () => false,
      getJobState: async () => 'running'
    });
    // 50, 100→capped to 75, 75, 75
    expect(result.history[0]?.intervalMs).toBe(50);
    expect(result.history[1]?.intervalMs).toBe(75);
    expect(result.history[2]?.intervalMs).toBe(75);
  });

  it('supports linear backoff', async () => {
    const result = await pollUntilDone({
      ...baseConfig,
      backoffStrategy: 'linear',
      initialIntervalMs: 10,
      maxPolls: 4,
      isDone: () => false,
      getJobState: async () => 'running'
    });
    // 10, 20, 30, 40
    expect(result.history[0]?.intervalMs).toBe(10);
    expect(result.history[1]?.intervalMs).toBe(20);
    expect(result.history[2]?.intervalMs).toBe(30);
  });

  it('supports fixed backoff', async () => {
    const result = await pollUntilDone({
      ...baseConfig,
      backoffStrategy: 'fixed',
      initialIntervalMs: 15,
      maxPolls: 3,
      isDone: () => false,
      getJobState: async () => 'running'
    });
    expect(result.history[0]?.intervalMs).toBe(15);
    expect(result.history[1]?.intervalMs).toBe(15);
    expect(result.history[2]?.intervalMs).toBe(15);
  });
});
