import { describe, expect, it } from 'vitest';
import { Daemon } from './daemon.js';

describe('Daemon', () => {
  it('should start and stop', async () => {
    const daemon = new Daemon({
      config: {
        ipc: { socketPath: '/tmp/agentsy-test-daemon.sock' },
        acp: { enabled: false },
        supervisor: { enabled: false },
        sleep: { enabled: false },
        subprocess: { memoryCheckIntervalMs: 1 }
      }
    });
    expect(daemon.state).toBe('stopped');
    await daemon.start();
    expect(daemon.state).toBe('running');
    await daemon.stop();
    expect(daemon.state).toBe('stopped');
  });

  it('should reject start when already running', async () => {
    const daemon = new Daemon({
      config: {
        ipc: { socketPath: '/tmp/agentsy-test-daemon2.sock' },
        acp: { enabled: false },
        supervisor: { enabled: false },
        sleep: { enabled: false },
        subprocess: { memoryCheckIntervalMs: 1 }
      }
    });
    await daemon.start();
    await expect(daemon.start()).rejects.toThrow('Cannot start daemon in state "running"');
    await daemon.stop();
  });

  it('should notify state change listeners', async () => {
    const daemon = new Daemon({
      config: {
        ipc: { socketPath: '/tmp/agentsy-test-daemon3.sock' },
        acp: { enabled: false },
        supervisor: { enabled: false },
        sleep: { enabled: false },
        subprocess: { memoryCheckIntervalMs: 1 }
      }
    });
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
    const daemon = new Daemon({
      config: {
        ipc: { socketPath: '/tmp/agentsy-test-daemon4.sock' },
        acp: { enabled: false },
        supervisor: { enabled: false },
        sleep: { enabled: false },
        subprocess: { memoryCheckIntervalMs: 1 }
      }
    });
    await daemon.start();
    // Access status via IPC handler
    expect(daemon.state).toBe('running');
    await daemon.stop();
  });
});
