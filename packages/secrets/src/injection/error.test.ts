import { describe, expect, it } from 'vitest';
import { ExpiredCredentialError, MalformedTokenError, UnresolvedCredentialError } from './error.js';

describe('UnresolvedCredentialError', () => {
  it('sets name and token properties', () => {
    const err = new UnresolvedCredentialError('$CRED(missing)', 'not found');
    expect(err.name).toBe('UnresolvedCredentialError');
    expect(err.token).toBe('$CRED(missing)');
    expect(err.message).toContain('not found');
  });
});

describe('ExpiredCredentialError', () => {
  it('sets name and resourceType', () => {
    const err = new ExpiredCredentialError('slack_token');
    expect(err.name).toBe('ExpiredCredentialError');
    expect(err.resourceType).toBe('slack_token');
    expect(err.credentialId).toBeUndefined();
    expect(err.message).toContain('slack_token');
  });

  it('includes credentialId when provided', () => {
    const err = new ExpiredCredentialError('slack_token', 'cred_123');
    expect(err.credentialId).toBe('cred_123');
    expect(err.message).toContain('cred_123');
  });
});

describe('MalformedTokenError', () => {
  it('sets name, raw, and position', () => {
    const err = new MalformedTokenError('$CRED(bad', 42);
    expect(err.name).toBe('MalformedTokenError');
    expect(err.raw).toBe('$CRED(bad');
    expect(err.position).toBe(42);
    expect(err.message).toContain('42');
    expect(err.message).toContain('$CRED(bad');
  });
});
