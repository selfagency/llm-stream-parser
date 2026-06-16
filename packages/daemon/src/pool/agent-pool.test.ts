import { describe, expect, it } from 'vitest';
import { AgentPool } from './agent-pool.js';

// AgentPool requires a worker entry file path. In tests, we pass
// a non-existent path because we don't actually run tasks.
const TEST_FILENAME = '/tmp/test-worker.mjs';

describe('AgentPool', () => {
  it('should create a pool with config', () => {
    const pool = new AgentPool({
      filename: TEST_FILENAME,
      minThreads: 1,
      maxThreads: 1
    });
    expect(pool).toBeDefined();
    expect(typeof pool.stats).toBe('function');
    expect(typeof pool.destroy).toBe('function');
  });

  it('should return stats structure', () => {
    const pool = new AgentPool({
      filename: TEST_FILENAME,
      minThreads: 1,
      maxThreads: 1
    });
    const stats = pool.stats();
    expect(stats).toHaveProperty('threads');
    expect(stats).toHaveProperty('queueSize');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('utilization');
    expect(stats).toHaveProperty('runTime');
    expect(stats).toHaveProperty('waitTime');
    expect(stats).toHaveProperty('duration');
  });

  it('should destroy cleanly', async () => {
    const pool = new AgentPool({
      filename: TEST_FILENAME,
      minThreads: 1,
      maxThreads: 1
    });
    await expect(pool.destroy()).resolves.toBeUndefined();
  });
});
