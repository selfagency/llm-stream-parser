import { describe, expect, it } from 'vitest';
import {
  createUntrustedContentEnvelope,
  defaultTrustLevel,
  requiresQuarantine,
  sanitizationLevel
} from './untrusted-content-envelope.js';

describe('defaultTrustLevel', () => {
  it('returns untrusted for web', () => {
    expect(defaultTrustLevel('web')).toBe('untrusted');
  });

  it('returns medium for mcp', () => {
    expect(defaultTrustLevel('mcp')).toBe('medium');
  });

  it('returns low for http_fetch', () => {
    expect(defaultTrustLevel('http_fetch')).toBe('low');
  });

  it('returns medium for model_output', () => {
    expect(defaultTrustLevel('model_output')).toBe('medium');
  });

  it('returns medium for tool_result', () => {
    expect(defaultTrustLevel('tool_result')).toBe('medium');
  });

  it('returns low for user_input', () => {
    expect(defaultTrustLevel('user_input')).toBe('low');
  });

  it('returns trusted for internal', () => {
    expect(defaultTrustLevel('internal')).toBe('trusted');
  });
});

describe('createUntrustedContentEnvelope', () => {
  it('creates an envelope with correct structure', () => {
    const envelope = createUntrustedContentEnvelope('hello world', 'web', { sink: 'model_context' });
    expect(envelope.content).toBe('hello world');
    expect(envelope.source).toBe('web');
    expect(envelope.trustLevel).toBe('untrusted');
    expect(envelope.trustScore).toBe(0.1);
    expect(envelope.sink).toBe('model_context');
    expect(envelope.receivedAt).toBeDefined();
    expect(envelope.sizeBytes).toBe(11);
  });

  it('respects trustScore override', () => {
    const envelope = createUntrustedContentEnvelope('test', 'mcp', { trustScore: 0.85 });
    expect(envelope.trustScore).toBe(0.85);
    expect(envelope.trustLevel).toBe('medium');
  });

  it('computes sizeBytes correctly', () => {
    const envelope = createUntrustedContentEnvelope('日本語', 'internal');
    // '日本語' is 9 bytes in UTF-8
    expect(envelope.sizeBytes).toBe(9);
  });

  it('allows metadata override', () => {
    const envelope = createUntrustedContentEnvelope('data', 'http_fetch', {
      metadata: { url: 'https://example.com' }
    });
    expect(envelope.metadata).toEqual({ url: 'https://example.com' });
  });

  it('generates a valid ISO timestamp', () => {
    const envelope = createUntrustedContentEnvelope('x', 'web');
    const parsed = new Date(envelope.receivedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });
});

describe('sanitizationLevel', () => {
  it('returns none for trusted', () => {
    expect(sanitizationLevel('trusted')).toBe('none');
  });
  it('returns light for medium', () => {
    expect(sanitizationLevel('medium')).toBe('light');
  });
  it('returns moderate for low', () => {
    expect(sanitizationLevel('low')).toBe('moderate');
  });
  it('returns aggressive for untrusted', () => {
    expect(sanitizationLevel('untrusted')).toBe('aggressive');
  });
});

describe('requiresQuarantine', () => {
  it('requires quarantine for untrusted content', () => {
    expect(requiresQuarantine('untrusted')).toBe(true);
  });
  it('does not require quarantine for medium trust', () => {
    expect(requiresQuarantine('medium')).toBe(false);
  });
  it('does not require quarantine for low trust', () => {
    expect(requiresQuarantine('low')).toBe(false);
  });
  it('does not require quarantine for trusted', () => {
    expect(requiresQuarantine('trusted')).toBe(false);
  });
});
