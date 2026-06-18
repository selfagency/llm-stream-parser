import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentPool } from './agent-pool.js';

// Create a minimal worker file at module load time so Piscina can find it.
// The file persists across test runs (small, harmless) to avoid race conditions
// between Piscina's async worker spawning and test teardown.
const TEST_FILENAME = join(tmpdir(), 'agentsy-test-worker.mjs');
if (!existsSync(TEST_FILENAME)) {
  writeFileSync(TEST_FILENAME, 'export default () => {};\n', 'utf-8');
}

describe('AgentPool', () => {
  it('should create a pool with config', async () => {
    const pool = new AgentPool({ filename: TEST_FILENAME, minThreads: 1, maxThreads: 1 });
    expect(pool).toBeDefined();
    expect(typeof pool.stats).toBe('function');
    expect(typeof pool.destroy).toBe('function');
    await pool.destroy();
  });

  it('should return stats structure', async () => {
    const pool = new AgentPool({ filename: TEST_FILENAME, minThreads: 1, maxThreads: 1 });
    const stats = pool.stats();
    expect(stats).toHaveProperty('threads');
    expect(stats).toHaveProperty('queueSize');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('utilization');
    expect(stats).toHaveProperty('runTime');
    expect(stats).toHaveProperty('waitTime');
    expect(stats).toHaveProperty('duration');
    await pool.destroy();
  });

  it('should destroy cleanly', async () => {
    const pool = new AgentPool({ filename: TEST_FILENAME, minThreads: 1, maxThreads: 1 });
    await expect(pool.destroy()).resolves.toBeUndefined();
  });
});
