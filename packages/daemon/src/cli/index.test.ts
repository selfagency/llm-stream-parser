import { describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { restartDaemon } from './restart.js';
import { startDaemon } from './start.js';
import { daemonStatus } from './status.js';
import { stopDaemon } from './stop.js';

describe('CLI commands', () => {
  const _logger = createMockLogger();

  it('startDaemon should create and start a daemon', async () => {
    const daemon = await startDaemon({
      ipc: { socketPath: '/tmp/agentsy-test-cli.sock' },
      acp: { enabled: false },
      supervisor: { enabled: false },
      sleep: { enabled: false },
      subprocess: { memoryCheckIntervalMs: 1 }
    });
    expect(daemon.state).toBe('running');
    await daemon.stop();
  });

  it('stopDaemon should attempt to connect and shutdown', async () => {
    // This will fail to connect since no daemon is running on the test socket
    await expect(stopDaemon('/tmp/agentsy-nonexistent.sock')).rejects.toThrow();
  });

  it('daemonStatus should attempt to connect and get status', async () => {
    await expect(daemonStatus('/tmp/agentsy-nonexistent.sock')).rejects.toThrow();
  });

  it('restartDaemon should handle missing daemon gracefully', async () => {
    // Should not throw even if daemon isn't running
    await expect(restartDaemon('/tmp/agentsy-nonexistent.sock')).resolves.not.toThrow();
  });
});
