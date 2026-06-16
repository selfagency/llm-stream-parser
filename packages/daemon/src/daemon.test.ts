import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Daemon } from './daemon.js';
import { UnifiedDB } from './db/unified-db.js';
import { createMockLogger } from './test-utils.js';

function createTestDB(): UnifiedDB {
  return new UnifiedDB({ path: ':memory:', logger: createMockLogger() });
}

function createMockPool() {
  return {
    runTask: vi.fn().mockResolvedValue({}),
    stats: vi.fn().mockReturnValue({
      threads: 0,
      queueSize: 0,
      completed: 0,
      utilization: 0,
      waitTime: 0,
      runTime: 0,
      duration: 0
    }),
    destroy: vi.fn().mockResolvedValue(undefined)
  } as never;
}

function testConfig(suffix: string) {
  return {
    ipc: { socketPath: join(tmpdir(), `agentsy-test-daemon-${suffix}.sock`) },
    acp: { enabled: false },
    supervisor: { restartPolicy: 'never' as const },
    sleep: { enabled: false },
    subprocess: { memoryCheckIntervalMs: 1 },
    database: { path: ':memory:' }
  };
}

describe('Daemon', () => {
  it('should start and stop', async () => {
    const daemon = new Daemon({ config: testConfig('1'), db: createTestDB(), pool: createMockPool() });
    expect(daemon.state).toBe('stopped');
    await daemon.start();
    expect(daemon.state).toBe('running');
    await daemon.stop();
    expect(daemon.state).toBe('stopped');
  });

  it('should reject start when already running', async () => {
    const daemon = new Daemon({ config: testConfig('2'), db: createTestDB(), pool: createMockPool() });
    await daemon.start();
    await expect(daemon.start()).rejects.toThrow('Cannot start daemon in state "running"');
    await daemon.stop();
  });

  it('should notify state change listeners', async () => {
    const daemon = new Daemon({ config: testConfig('3'), db: createTestDB(), pool: createMockPool() });
    const states: string[] = [];
    daemon.onStateChange(s => states.push(s));
    await daemon.start();
    await daemon.stop();
    expect(states).toContain('starting');
    expect(states).toContain('running');
    expect(states).toContain('stopping');
    expect(states).toContain('stopped');
  });

  it('should return status with state and pid', async () => {
    const daemon = new Daemon({ config: testConfig('4'), db: createTestDB(), pool: createMockPool() });
    await daemon.start();
    expect(daemon.state).toBe('running');
    await daemon.stop();
  });
});
