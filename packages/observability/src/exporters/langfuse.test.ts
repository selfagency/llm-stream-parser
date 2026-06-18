import { describe, expect, it } from 'vitest';
import { createLangfuseExporterFromEnv, detectLangfuseFromEnv, LANGFUSE_ENV_VARS } from './langfuse.js';

describe('LANGFUSE_ENV_VARS', () => {
  it('lists all known env vars', () => {
    expect(LANGFUSE_ENV_VARS).toContain('LANGFUSE_PUBLIC_KEY');
    expect(LANGFUSE_ENV_VARS).toContain('LANGFUSE_SECRET_KEY');
    expect(LANGFUSE_ENV_VARS).toContain('LANGFUSE_HOST');
    expect(LANGFUSE_ENV_VARS).toContain('LANGFUSE_PROJECT_ID');
    expect(LANGFUSE_ENV_VARS).toContain('LANGFUSE_FLUSH_INTERVAL_MS');
    expect(LANGFUSE_ENV_VARS).toContain('LANGFUSE_MAX_BATCH_SIZE');
  });
});

describe('detectLangfuseFromEnv', () => {
  it('returns disabled when both keys are missing', () => {
    const result = detectLangfuseFromEnv({});
    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('LANGFUSE_PUBLIC_KEY');
    expect(result.reason).toContain('LANGFUSE_SECRET_KEY');
  });

  it('returns disabled when only public key is present', () => {
    const result = detectLangfuseFromEnv({ LANGFUSE_PUBLIC_KEY: 'pk-abc' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('LANGFUSE_SECRET_KEY');
  });

  it('returns disabled when only secret key is present', () => {
    const result = detectLangfuseFromEnv({ LANGFUSE_SECRET_KEY: 'sk-abc' });
    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('LANGFUSE_PUBLIC_KEY');
  });

  it('returns enabled when both keys are present', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz'
    });
    expect(result.enabled).toBe(true);
    expect(result.reason).toContain('Loaded from LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY');
  });

  it('returns disabled when keys are whitespace-only', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: '   ',
      LANGFUSE_SECRET_KEY: '   '
    });
    expect(result.enabled).toBe(false);
  });

  it('returns disabled when keys are empty strings', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: '',
      LANGFUSE_SECRET_KEY: ''
    });
    expect(result.enabled).toBe(false);
  });

  it('uses default endpoint when LANGFUSE_HOST is absent', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz'
    });
    expect(result.endpoint).toBe('https://cloud.langfuse.com/api/public/otlp/v1/traces');
  });

  it('appends OTLP path to LANGFUSE_HOST root URL', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_HOST: 'https://selfhosted.langfuse.com'
    });
    expect(result.endpoint).toBe('https://selfhosted.langfuse.com/api/public/otlp/v1/traces');
  });

  it('handles LANGFUSE_HOST with trailing slash', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_HOST: 'https://selfhosted.langfuse.com/'
    });
    expect(result.endpoint).toBe('https://selfhosted.langfuse.com/api/public/otlp/v1/traces');
  });

  it('handles LANGFUSE_HOST with existing OTLP path', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_HOST: 'https://selfhosted.langfuse.com/api/public/otlp/v1/traces'
    });
    expect(result.endpoint).toBe('https://selfhosted.langfuse.com/api/public/otlp/v1/traces');
  });

  it('handles LANGFUSE_HOST with partial OTLP path', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_HOST: 'https://selfhosted.langfuse.com/api/public'
    });
    expect(result.endpoint).toBe('https://selfhosted.langfuse.com/api/public/otlp/v1/traces');
  });

  it('parses optional LANGFUSE_PROJECT_ID', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_PROJECT_ID: 'my-project'
    });
    expect(result.projectId).toBe('my-project');
  });

  it('parses optional LANGFUSE_FLUSH_INTERVAL_MS', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_FLUSH_INTERVAL_MS: '10000'
    });
    expect(result.flushIntervalMs).toBe(10_000);
  });

  it('ignores invalid LANGFUSE_FLUSH_INTERVAL_MS', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_FLUSH_INTERVAL_MS: 'not-a-number'
    });
    expect(result.flushIntervalMs).toBeUndefined();
  });

  it('parses optional LANGFUSE_MAX_BATCH_SIZE', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_MAX_BATCH_SIZE: '128'
    });
    expect(result.maxBatchSize).toBe(128);
  });

  it('ignores invalid LANGFUSE_MAX_BATCH_SIZE', () => {
    const result = detectLangfuseFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz',
      LANGFUSE_MAX_BATCH_SIZE: '-1'
    });
    expect(result.maxBatchSize).toBeUndefined();
  });
});

describe('createLangfuseExporterFromEnv', () => {
  it('returns null when env vars are missing', () => {
    const exporter = createLangfuseExporterFromEnv(undefined, {});
    expect(exporter).toBeNull();
  });

  it('returns exporter when env vars are present', () => {
    const exporter = createLangfuseExporterFromEnv(undefined, {
      LANGFUSE_PUBLIC_KEY: 'pk-abc',
      LANGFUSE_SECRET_KEY: 'sk-xyz'
    });
    expect(exporter).not.toBeNull();
    expect(exporter?.enabled).toBe(true);
    expect(exporter?.type).toBe('otlp');
  });

  it('overrides take precedence over env vars', () => {
    const exporter = createLangfuseExporterFromEnv(
      {
        publicKey: 'override-pk',
        secretKey: 'override-sk',
        endpoint: 'https://custom.endpoint/traces'
      },
      {
        LANGFUSE_PUBLIC_KEY: 'env-pk',
        LANGFUSE_SECRET_KEY: 'env-sk'
      }
    );
    expect(exporter).not.toBeNull();
  });

  it('honors optional projectId override', () => {
    const exporter = createLangfuseExporterFromEnv(
      { projectId: 'override-project' },
      {
        LANGFUSE_PUBLIC_KEY: 'pk-abc',
        LANGFUSE_SECRET_KEY: 'sk-xyz'
      }
    );
    expect(exporter).not.toBeNull();
  });

  it('honors optional flushIntervalMs override', () => {
    const exporter = createLangfuseExporterFromEnv(
      { flushIntervalMs: 30_000 },
      {
        LANGFUSE_PUBLIC_KEY: 'pk-abc',
        LANGFUSE_SECRET_KEY: 'sk-xyz'
      }
    );
    expect(exporter).not.toBeNull();
  });

  it('honors optional maxBatchSize override', () => {
    const exporter = createLangfuseExporterFromEnv(
      { maxBatchSize: 200 },
      {
        LANGFUSE_PUBLIC_KEY: 'pk-abc',
        LANGFUSE_SECRET_KEY: 'sk-xyz'
      }
    );
    expect(exporter).not.toBeNull();
  });
});
