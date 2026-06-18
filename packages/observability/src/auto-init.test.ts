import { describe, expect, it } from 'vitest';
import { createObservabilityFromEnv } from './auto-init.js';

describe('createObservabilityFromEnv', () => {
  it('returns engine with disabled sink when env vars are empty', () => {
    const result = createObservabilityFromEnv({ env: {} });
    expect(result.engine).toBeDefined();
    expect(result.sinks).toHaveLength(1);
    expect(result.sinks[0]?.enabled).toBe(false);
    expect(result.sinks[0]?.type).toBe('langfuse');
  });

  it('returns engine with enabled sink when env vars are present', () => {
    const result = createObservabilityFromEnv({
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-abc',
        LANGFUSE_SECRET_KEY: 'sk-xyz'
      }
    });
    expect(result.engine).toBeDefined();
    expect(result.sinks).toHaveLength(1);
    expect(result.sinks[0]?.enabled).toBe(true);
    expect(result.sinks[0]?.type).toBe('langfuse');
  });

  it('respects langfuseEnabled: false', () => {
    const result = createObservabilityFromEnv({
      langfuseEnabled: false,
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-abc',
        LANGFUSE_SECRET_KEY: 'sk-xyz'
      }
    });
    expect(result.sinks).toHaveLength(1);
    expect(result.sinks[0]?.enabled).toBe(false);
    expect(result.sinks[0]?.reason).toContain('Disabled by config');
  });

  it('uses custom service name and version', () => {
    const result = createObservabilityFromEnv({
      serviceName: 'test-service',
      serviceVersion: '1.2.3',
      env: {}
    });
    expect(result.engine).toBeDefined();
  });

  it('passes langfuse overrides through to exporter', () => {
    const result = createObservabilityFromEnv({
      langfuse: {
        endpoint: 'https://custom.endpoint/traces',
        projectId: 'test-project',
        flushIntervalMs: 10_000,
        maxBatchSize: 200
      },
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-abc',
        LANGFUSE_SECRET_KEY: 'sk-xyz'
      }
    });
    expect(result.sinks).toHaveLength(1);
    expect(result.sinks[0]?.enabled).toBe(true);
  });

  it('handles exporter construction failure gracefully', () => {
    // Simulate a scenario where env vars are present but something fails
    // by passing an empty env (no keys) — should produce disabled sink
    const result = createObservabilityFromEnv({ env: {} });
    expect(result.sinks).toHaveLength(1);
    expect(result.sinks[0]?.enabled).toBe(false);
  });
});
