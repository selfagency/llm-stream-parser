import { describe, expect, it } from 'vitest';
import {
  getProviderEthicsPolicy,
  isProviderBlocked,
  PROVIDER_ETHICS_POLICY,
  requiresAcknowledgement
} from './provider-policy.js';

describe('PROVIDER_ETHICS_POLICY', () => {
  it('contains 6 entries', () => {
    expect(PROVIDER_ETHICS_POLICY).toHaveLength(6);
  });

  it('contains xai block entry', () => {
    const entry = getProviderEthicsPolicy('xai');
    expect(entry).toBeDefined();
    expect(entry?.action).toBe('block');
    expect(entry?.sources.length).toBeGreaterThan(0);
  });

  it('contains openai warn entry', () => {
    const entry = getProviderEthicsPolicy('openai');
    expect(entry).toBeDefined();
    expect(entry?.action).toBe('warn');
  });

  it('contains microsoft warn entry', () => {
    const entry = getProviderEthicsPolicy('microsoft');
    expect(entry).toBeDefined();
    expect(entry?.action).toBe('warn');
  });

  it('contains google warn entry', () => {
    const entry = getProviderEthicsPolicy('google');
    expect(entry).toBeDefined();
    expect(entry?.action).toBe('warn');
  });

  it('contains amazon warn entry', () => {
    const entry = getProviderEthicsPolicy('amazon');
    expect(entry).toBeDefined();
    expect(entry?.action).toBe('warn');
  });

  it('contains meta warn entry', () => {
    const entry = getProviderEthicsPolicy('meta');
    expect(entry).toBeDefined();
    expect(entry?.action).toBe('warn');
  });

  it('returns undefined for unknown provider', () => {
    expect(getProviderEthicsPolicy('anthropic')).toBeUndefined();
    expect(getProviderEthicsPolicy('unknown')).toBeUndefined();
  });
});

describe('isProviderBlocked', () => {
  it('returns true for xai', () => {
    expect(isProviderBlocked('xai')).toBe(true);
  });

  it('returns false for openai', () => {
    expect(isProviderBlocked('openai')).toBe(false);
  });

  it('returns false for microsoft', () => {
    expect(isProviderBlocked('microsoft')).toBe(false);
  });

  it('returns false for google', () => {
    expect(isProviderBlocked('google')).toBe(false);
  });

  it('returns false for amazon', () => {
    expect(isProviderBlocked('amazon')).toBe(false);
  });

  it('returns false for meta', () => {
    expect(isProviderBlocked('meta')).toBe(false);
  });

  it('returns false for unlisted provider', () => {
    expect(isProviderBlocked('anthropic')).toBe(false);
    expect(isProviderBlocked('unknown')).toBe(false);
  });
});

describe('requiresAcknowledgement', () => {
  it('returns true for openai', () => {
    expect(requiresAcknowledgement('openai')).toBe(true);
  });

  it('returns true for microsoft', () => {
    expect(requiresAcknowledgement('microsoft')).toBe(true);
  });

  it('returns true for google', () => {
    expect(requiresAcknowledgement('google')).toBe(true);
  });

  it('returns true for amazon', () => {
    expect(requiresAcknowledgement('amazon')).toBe(true);
  });

  it('returns true for meta', () => {
    expect(requiresAcknowledgement('meta')).toBe(true);
  });

  it('returns false for xai (blocked, not warn)', () => {
    expect(requiresAcknowledgement('xai')).toBe(false);
  });

  it('returns false for anthropic', () => {
    expect(requiresAcknowledgement('anthropic')).toBe(false);
  });
});
