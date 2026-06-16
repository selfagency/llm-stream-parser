import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { restartDaemon } from './restart.js';
import { startDaemon } from './start.js';
import { daemonStatus } from './status.js';
import { stopDaemon } from './stop.js';

const mockPool = {
  runTask: vi.fn().mockResolvedValue({}),
  stats: vi
    .fn()
    .mockReturnValue({ threads: 0, queueSize: 0, completed: 0, utilization: 0, waitTime: 0, runTime: 0, duration: 0 }),
  destroy: vi.fn().mockResolvedValue(undefined)
};

const testSocket = join(tmpdir(), 'agentsy-test-cli.sock');
const missingSocket = join(tmpdir(), 'agentsy-test-missing.sock');

function baseConfig(socketPath: string) {
  return {
    ipc: { socketPath },
    acp: { enabled: false },
    supervisor: { restartPolicy: 'never' as const },
    sleep: { enabled: false },
    subprocess: { memoryCheckIntervalMs: 1 },
    database: { path: ':memory:' }
  };
}

describe('CLI commands', () => {
  it('startDaemon should create and start a daemon', async () => {
    const daemon = await startDaemon(baseConfig(testSocket), { pool: mockPool as never });
    expect(daemon.state).toBe('running');
    await daemon.stop();
  });

  it('stopDaemon should attempt to connect and shutdown', async () => {
    await expect(stopDaemon(missingSocket)).rejects.toThrow();
  });

  it('daemonStatus should attempt to connect and get status', async () => {
    await expect(daemonStatus(missingSocket)).rejects.toThrow();
  });

  it('restartDaemon should handle missing daemon gracefully', async () => {
    await expect(
      restartDaemon(
        missingSocket,
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
