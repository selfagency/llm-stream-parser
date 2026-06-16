import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentPool } from './agent-pool.js';

// Create a minimal worker file so Piscina doesn't fail on eager spawn
const TEST_FILENAME = join(tmpdir(), 'agentsy-test-worker.mjs');

beforeAll(() => {
  writeFileSync(TEST_FILENAME, 'export default () => {};\n', 'utf-8');
});

afterAll(() => {
  try {
    if (existsSync(TEST_FILENAME)) {
      unlinkSync(TEST_FILENAME);
    }
  } catch {
    /* fine */
  }
});

describe('AgentPool', () => {
  it('should create a pool with config', () => {
    const pool = new AgentPool({ filename: TEST_FILENAME, minThreads: 1, maxThreads: 1 });
    expect(pool).toBeDefined();
    expect(typeof pool.stats).toBe('function');
    expect(typeof pool.destroy).toBe('function');
  });

  it('should return stats structure', () => {
    const pool = new AgentPool({ filename: TEST_FILENAME, minThreads: 1, maxThreads: 1 });
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
    const pool = new AgentPool({ filename: TEST_FILENAME, minThreads: 1, maxThreads: 1 });
    await expect(pool.destroy()).resolves.toBeUndefined();
  });
});
