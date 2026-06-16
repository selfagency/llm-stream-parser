import { describe, expect, it, vi } from 'vitest';
import { restartDaemon } from './restart.js';
import { startDaemon } from './start.js';
import { daemonStatus } from './status.js';
import { stopDaemon } from './stop.js';

// Mock agent pool — never actually used in CLI tests
const mockPool = {
  runTask: vi.fn().mockResolvedValue({}),
  stats: vi
    .fn()
    .mockReturnValue({ threads: 0, queueSize: 0, completed: 0, utilization: 0, waitTime: 0, runTime: 0, duration: 0 }),
  destroy: vi.fn().mockResolvedValue(undefined)
};

describe('CLI commands', () => {
  const testConfig = {
    ipc: { socketPath: '/tmp/agentsy-test-cli.sock' },
    acp: { enabled: false },
    supervisor: { restartPolicy: 'never' as const },
    sleep: { enabled: false },
    subprocess: { memoryCheckIntervalMs: 1 },
    database: { path: ':memory:' },
    pool: mockPool
  };

  it('startDaemon should create and start a daemon', async () => {
    const daemon = await startDaemon(testConfig, { pool: mockPool as never });
    expect(daemon.state).toBe('running');
    await daemon.stop();
  });

  it('stopDaemon should attempt to connect and shutdown', async () => {
    await expect(stopDaemon('/tmp/agentsy-nonexistent.sock')).rejects.toThrow();
  });

  it('daemonStatus should attempt to connect and get status', async () => {
    await expect(daemonStatus('/tmp/agentsy-nonexistent.sock')).rejects.toThrow();
  });

  it('restartDaemon should handle missing daemon gracefully', async () => {
    await expect(
      restartDaemon(
        '/tmp/agentsy-nonexistent.sock',
        {
          database: { path: ':memory:' },
          sleep: { enabled: false },
          supervisor: { restartPolicy: 'never' },
          subprocess: { memoryCheckIntervalMs: 1 }
        },
        { pool: mockPool as never }
      )
    ).resolves.not.toThrow();
  });
});
