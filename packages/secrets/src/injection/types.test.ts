import { describe, expect, it } from 'vitest';

import { CRED_TOKEN_PATTERN, parseSecretTokens } from './types.js';

describe('parseSecretTokens', () => {
  it('extracts simple $CRED tokens', () => {
    const tokens = parseSecretTokens('connect to $CRED(database)');
    expect(tokens).toHaveLength(1);
    const [t] = tokens;
    expect(t).toMatchObject({
      resourceType: 'database',
      raw: '$CRED(database)'
    });
    expect('field' in (t ?? {})).toBe(false);
  });

  it('extracts field-qualified tokens', () => {
    const tokens = parseSecretTokens('$CRED(database:password)');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      resourceType: 'database',
      field: 'password',
      raw: '$CRED(database:password)'
    });
  });

  it('extracts multiple tokens from the same string', () => {
    const tokens = parseSecretTokens('$CRED(db1) and $CRED(db2)');
    expect(tokens).toHaveLength(2);
    const [t1, t2] = tokens;
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t1?.resourceType).toBe('db1');
    expect(t2?.resourceType).toBe('db2');
  });

  it('extracts duplicate tokens separately', () => {
    const tokens = parseSecretTokens('$CRED(db) $CRED(db)');
    expect(tokens).toHaveLength(2);
    const [t1, t2] = tokens;
    expect(t1?.start).toBeLessThan(t2?.start ?? 0);
  });

  it('tracks correct positions', () => {
    const tokens = parseSecretTokens('prefix $CRED(a:b) suffix');
    expect(tokens).toHaveLength(1);
    const [t] = tokens;
    expect(t?.start).toBe(7);
    expect(t?.end).toBe(17);
  });

  it('returns empty array for text without tokens', () => {
    expect(parseSecretTokens('no tokens here')).toHaveLength(0);
    expect(parseSecretTokens('')).toHaveLength(0);
  });

  it('handles hyphens and underscores in resource types', () => {
    const tokens = parseSecretTokens('$CRED(vercel_prod) $CRED(aws-creds:v1)');
    expect(tokens).toHaveLength(2);
    const [t1, t2] = tokens;
    expect(t1?.resourceType).toBe('vercel_prod');
    expect(t2?.resourceType).toBe('aws-creds');
    expect(t2?.field).toBe('v1');
  });

  it('does not match $CRED without parentheses', () => {
    expect(parseSecretTokens('$CREDx')).toHaveLength(0);
  });

  it('resets lastIndex for safety', () => {
    // Run the regex manually first to advance lastIndex
    CRED_TOKEN_PATTERN.lastIndex = 100;
    const tokens = parseSecretTokens('$CRED(foo)');
    expect(tokens).toHaveLength(1);
  });
});
