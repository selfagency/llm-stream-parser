import { describe, expect, it } from 'vitest';
import { DaemonConfigSchema, resolveConfig } from './config.js';

describe('DaemonConfigSchema', () => {
  it('should apply defaults for empty config', () => {
    const config = DaemonConfigSchema.parse({});
    expect(config.ipc.socketPath).toContain('daemon.sock');
    expect(config.ipc.maxConnections).toBe(10);
    expect(config.ipc.requestTimeoutMs).toBe(30_000);
    expect(config.acp.enabled).toBe(true);
    expect(config.acp.transport).toBe('websocket');
    expect(config.supervisor.restartPolicy).toBe('always');
    expect(config.supervisor.maxRestarts).toBe(5);
    expect(config.sleep.enabled).toBe(true);
    expect(config.sleep.idleTimeoutMs).toBe(300_000);
    expect(config.subprocess.defaultStallTimeoutMs).toBe(30_000);
    expect(config.subprocess.defaultMemoryLimitMb).toBe(512);
    expect(config.logging.level).toBe('info');
    expect(config.shutdownTimeoutMs).toBe(30_000);
  });

  it('should override specific fields', () => {
    const config = DaemonConfigSchema.parse({
      ipc: { socketPath: '/var/run/custom.sock' },
      acp: { enabled: true, transport: 'stdio' as const },
      logging: { level: 'debug' as const }
    });
    expect(config.ipc.socketPath).toBe('/var/run/custom.sock');
    expect(config.acp.enabled).toBe(true);
    expect(config.acp.transport).toBe('stdio');
    expect(config.logging.level).toBe('debug');
  });

  it('should reject invalid log levels', () => {
    expect(() => DaemonConfigSchema.parse({ logging: { level: 'trace' } })).toThrow();
  });

  it('should reject negative maxConnections', () => {
    expect(() => DaemonConfigSchema.parse({ ipc: { maxConnections: -1 } })).toThrow();
  });
});

describe('resolveConfig', () => {
  it('should return full config from partial', () => {
    const config = resolveConfig({ ipc: { socketPath: '/var/run/test.sock' } });
    expect(config.ipc.socketPath).toBe('/var/run/test.sock');
    expect(config.shutdownTimeoutMs).toBe(30_000);
  });

  it('should return defaults for empty input', () => {
    const config = resolveConfig({});
    expect(config.ipc.socketPath).toContain('daemon.sock');
  });
});
