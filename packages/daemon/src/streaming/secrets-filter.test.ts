/**
 * Tests for StreamingSecretsFilter.
 */

import { describe, expect, it } from 'vitest';
import { StreamingSecretsFilter } from './secrets-filter.js';

// =============================================================================
// Helper: feed all chunks and collect complete output
// =============================================================================

function feedAll(filter: StreamingSecretsFilter, ...chunks: string[]): string {
  let result = '';
  for (const chunk of chunks) {
    const part = filter.feed(chunk);
    if (part !== null) {
      result += part;
    }
  }
  const flushed = filter.flush();
  if (flushed !== null) {
    result += flushed;
  }
  return result;
}

// =============================================================================
// Tests
// =============================================================================

describe('StreamingSecretsFilter', () => {
  it('passes through non-secret text unchanged', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    const result = feedAll(filter, 'Hello, world!');
    expect(result).toBe('Hello, world!');
  });

  it('masks a secret in a single chunk', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    const result = feedAll(filter, 'My key is sk-proj-abc123def456ghi789jkl012');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-proj-abc123def456ghi789jkl012');
  });

  it('masks a secret split across two chunks', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 50 });

    // First chunk: partial secret prefix — stays in buffer
    const first = filter.feed('My key is sk-proj-');
    expect(first).toBeNull();

    // Second chunk: completes the secret — still under buffer threshold
    const second = filter.feed('abc123def456ghi789jkl012');
    expect(second).toBeNull();

    // Flush returns the masked result
    const flushed = filter.flush();
    expect(flushed).toContain('[REDACTED]');
    expect(flushed).not.toContain('sk-proj-abc123def456ghi789jkl012');
  });

  it('flushes remaining buffered text', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 50 });

    const first = filter.feed('short');
    expect(first).toBeNull();

    const flushed = filter.flush();
    expect(flushed).toBe('short');
  });

  it('returns null from flush when buffer is empty', () => {
    const filter = new StreamingSecretsFilter();
    expect(filter.flush()).toBeNull();
  });

  it('resets the buffer on reset()', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 50 });
    filter.feed('some text');
    filter.reset();
    expect(filter.flush()).toBeNull();
  });

  it('masks multiple secrets in the same chunk', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    const result = feedAll(filter, 'sk-proj-abc123def456ghi789jkl012 and sk-proj-xyz789def456ghi789jkl012');
    const maskedCount = (result.match(/\[REDACTED\]/g) ?? []).length;
    expect(maskedCount).toBe(2);
  });

  it('masks JWT tokens', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    // nosemgrep: test fixture with fake JWT payload, not a real token
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNqP0JqGZ3g3qJw6xQ';
    const result = feedAll(filter, `Token: ${jwt}`);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain(jwt);
  });

  it('masks AWS access keys', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    const result = feedAll(filter, 'AWS key: AKIAIOSFODNN7EXAMPLE');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('masks private key headers', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    const result = feedAll(filter, '-----BEGIN RSA PRIVATE KEY-----');
    expect(result).toContain('[REDACTED]');
  });

  it('masks database connection strings', () => {
    const filter = new StreamingSecretsFilter({ maxSecretLength: 5 });
    const result = feedAll(filter, 'postgresql://user:pass@localhost:5432/db');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('postgresql://user:pass@');
  });

  it('handles empty input', () => {
    const filter = new StreamingSecretsFilter();
    expect(filter.feed('')).toBeNull();
  });

  it('uses extra patterns when provided', () => {
    const filter = new StreamingSecretsFilter({
      maxSecretLength: 5,
      extraPatterns: [
        { pattern: /\bCUSTOM_SECRET_[A-Z0-9]{10,}\b/g, id: 'custom-secret', severity: 'high', confidence: 0.9 }
      ]
    });
    const result = feedAll(filter, 'My custom: CUSTOM_SECRET_ABCDEF1234');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('CUSTOM_SECRET_ABCDEF1234');
  });
});
