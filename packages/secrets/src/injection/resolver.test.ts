import { describe, expect, it, vi } from 'vitest';

import { CredentialBroker } from '../broker/index.js';
import { resolveCredentials } from './resolver.js';
import type { ResolutionContext } from './types.js';

const createContext = (overrides: Partial<ResolutionContext> = {}): ResolutionContext => ({
  sessionId: 'test-session',
  justification: 'test-justification',
  ...overrides
});

const createBroker = (): CredentialBroker => {
  const keyring = {
    get(resourceType: string): Promise<string | undefined> {
      return Promise.resolve(resourceType === 'missing' ? undefined : `secret-${resourceType}`);
    }
  };
  return new CredentialBroker({ keyring, defaultTtlSeconds: 300 });
};

describe('resolveCredentials', () => {
  it('resolves a simple $CRED token', async () => {
    const broker = createBroker();
    const ctx = createContext();
    const [result, secrets] = await resolveCredentials('connect to $CRED(database)', broker, ctx);

    expect(result).toBe('connect to secret-database');
    expect(secrets.size).toBe(1);
    expect(secrets.get('$CRED(database)')?.value).toBe('secret-database');
  });

  it('resolves a field-qualified token', async () => {
    const broker = createBroker();
    const ctx = createContext();
    const [result] = await resolveCredentials('$CRED(database:password)', broker, ctx);

    expect(result).toBe('secret-database:password');
  });

  it('resolves multiple distinct tokens', async () => {
    const broker = createBroker();
    const ctx = createContext();
    const [result] = await resolveCredentials('$CRED(db) and $CRED(api)', broker, ctx);

    expect(result).toBe('secret-db and secret-api');
  });

  it('caches duplicate tokens (same broker call)', async () => {
    const broker = createBroker();
    const issueSpy = vi.spyOn(broker, 'issue');
    const ctx = createContext();

    const [result] = await resolveCredentials('$CRED(db) $CRED(db)', broker, ctx);

    expect(result).toBe('secret-db secret-db');
    // issue should be called once per unique token raw string
    expect(issueSpy).toHaveBeenCalledTimes(1);
  });

  it('returns input untouched when no tokens present', async () => {
    const broker = createBroker();
    const ctx = createContext();
    const [result, secrets] = await resolveCredentials('hello world', broker, ctx);

    expect(result).toBe('hello world');
    expect(secrets.size).toBe(0);
  });

  it('throws UnresolvedCredentialError for missing resources', async () => {
    const broker = createBroker();
    const ctx = createContext();

    const promise = resolveCredentials('$CRED(missing)', broker, ctx);
    await expect(promise).rejects.toThrow('Cannot resolve');
    await expect(promise).rejects.toThrow('No provider can resolve resource type "missing"');
  });

  it('leaves $CRED() with empty resource type as-is (not a match)', async () => {
    const broker = createBroker();
    const ctx = createContext();

    const [result] = await resolveCredentials('$CRED()', broker, ctx);
    expect(result).toBe('$CRED()');
  });
});
