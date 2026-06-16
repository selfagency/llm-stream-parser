import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { SubprocessManager } from './subprocess-manager.js';

describe('SubprocessManager', () => {
  it('should start and stop cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const mgr = new SubprocessManager({
      logger,
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 5000,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    expect(logger.info).toHaveBeenCalledWith('SubprocessManager started');
    await mgr.stop();
  });

  it('should spawn a process and return an id', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    const id = await mgr.spawnProcess({ command: 'echo', args: ['hello'] });
    expect(id).toMatch(/^proc_/);
    expect(mgr.count()).toBe(1);
    await mgr.stop();
  });

  it('should list processes', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    await mgr.spawnProcess({ command: 'echo', args: ['a'] });
    await mgr.spawnProcess({ command: 'echo', args: ['b'] });
    expect(mgr.listProcesses()).toHaveLength(2);
    await mgr.stop();
  });

  it('should kill a process', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    const id = await mgr.spawnProcess({ command: 'sleep', args: ['30'] });
    expect(mgr.killProcess(id)).toBe(true);
    expect(mgr.killProcess('nonexistent')).toBe(false);
    await mgr.stop();
  });

  it('should get process output', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    const id = await mgr.spawnProcess({ command: 'echo', args: ['hello world'] });
    const output = mgr.getOutput(id);
    expect(output).not.toBeNull();
    expect(mgr.getOutput('nonexistent')).toBeNull();
    await mgr.stop();
  });

  it('should kill all processes on killAll', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    await mgr.spawnProcess({ command: 'sleep', args: ['30'] });
    await mgr.spawnProcess({ command: 'sleep', args: ['30'] });
    await mgr.killAll();
    expect(mgr.count()).toBe(2);
    await mgr.stop();
  });
});
