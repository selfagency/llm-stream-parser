import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { applyNetworkPolicy, SubprocessManager } from './subprocess-manager.js';

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

// =============================================================================
// Network policy tests
// =============================================================================

describe('applyNetworkPolicy', () => {
  it('returns empty for allow-all', () => {
    expect(applyNetworkPolicy({ type: 'allow-all' })).toEqual({});
  });

  it('returns empty for undefined policy', () => {
    expect(applyNetworkPolicy(undefined)).toEqual({});
  });

  it('sets proxy to discard address for block-all', () => {
    const env = applyNetworkPolicy({ type: 'block-all' });
    expect(env.ALL_PROXY).toBe('http://127.0.0.1:9');
    expect(env.http_proxy).toBe('http://127.0.0.1:9');
    expect(env.https_proxy).toBe('http://127.0.0.1:9');
    expect(env.NO_PROXY).toBe('');
  });

  it('sets NO_PROXY to allowed domains for allow-domains', () => {
    const env = applyNetworkPolicy({ type: 'allow-domains', domains: ['api.github.com', 'registry.npmjs.org'] });
    expect(env.ALL_PROXY).toBe('http://127.0.0.1:9');
    expect(env.NO_PROXY).toBe('api.github.com,registry.npmjs.org');
  });

  it('sets NO_PROXY to blocked domains for block-domains', () => {
    const env = applyNetworkPolicy({ type: 'block-domains', domains: ['evil.com', 'malware.net'] });
    expect(env.NO_PROXY).toBe('evil.com,malware.net');
    expect(env.ALL_PROXY).toBeUndefined();
  });
});

describe('SubprocessManager with network policy', () => {
  it('spawns process with block-all network policy env', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    const id = await mgr.spawnProcess({
      command: 'echo',
      args: ['hello'],
      networkPolicy: { type: 'block-all' }
    });
    const output = mgr.getOutput(id);
    expect(output).not.toBeNull();
    // Process should still run — proxy env only affects network, not local execution
    expect(mgr.count()).toBe(1);
    await mgr.stop();
  });

  it('spawns process with allow-domains network policy', async () => {
    const mgr = new SubprocessManager({
      logger: createMockLogger(),
      defaultStallTimeoutMs: 30_000,
      defaultMemoryLimitMb: 256,
      memoryCheckIntervalMs: 0,
      defaultRestartPolicy: 'on-failure'
    });
    await mgr.start();
    const id = await mgr.spawnProcess({
      command: 'echo',
      args: ['test'],
      networkPolicy: { type: 'allow-domains', domains: ['api.example.com'] }
    });
    expect(id).toMatch(/^proc_/);
    await mgr.stop();
  });
});
