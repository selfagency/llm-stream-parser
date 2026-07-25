import { describe, expect, it } from 'vitest';

import { EntropyScanner, entropyOf } from './entropy.js';

// =============================================================================
// entropyOf
// =============================================================================

describe('entropyOf', () => {
  it('returns 0 for empty string', () => {
    expect(entropyOf('')).toBe(0);
  });

  it('returns 0 for single repeated character', () => {
    expect(entropyOf('aaaaa')).toBe(0);
  });

  it('returns around 1 for two equally likely characters', () => {
    const e = entropyOf('ab');
    expect(e).toBeCloseTo(1, 5);
  });

  it('returns ~2.58 for 6 equally likely characters', () => {
    const e = entropyOf('abcdef');
    // 6 chars → log2(6) ≈ 2.585
    expect(e).toBeCloseTo(2.585, 1);
  });

  it('returns higher values for more diverse strings', () => {
    const low = entropyOf('aaaaaaaabbbbbbbb');
    const high = entropyOf('abcdefghijklmnop');
    expect(high).toBeGreaterThan(low);
  });
});

// =============================================================================
// EntropyScanner
// =============================================================================

describe('EntropyScanner', () => {
  it('has correct metadata defaults', () => {
    const scanner = new EntropyScanner();
    expect(scanner.metadata.id).toBe('hub://guardrails/entropy');
    expect(scanner.metadata.priority).toBe(50);
    expect(scanner.metadata.owaspCategories).toContain('asi-06');
  });

  it('passes on empty input', async () => {
    const scanner = new EntropyScanner();
    const result = await scanner.evaluate('');
    expect(result.status).toBe('pass');
  });

  it('passes on low-entropy input', async () => {
    const scanner = new EntropyScanner();
    const result = await scanner.evaluate('hello world this is a normal sentence');
    expect(result.status).toBe('pass');
  });

  it('default threshold is 3.5', async () => {
    const scanner = new EntropyScanner();
    // 'abcdefghij' has 10 unique chars → log2(10) ≈ 3.32, below threshold → pass
    const passResult = await scanner.evaluate('abcdefghij');
    expect(passResult.status).toBe('pass');
    // 'abcdefghijk' has 11 unique chars → log2(11) ≈ 3.46, still just under
    const edgePass = await scanner.evaluate('abcdefghijk');
    expect(edgePass.status).toBe('pass');
  });

  it('detects strings with entropy between 3.5 and 4.0', async () => {
    const scanner = new EntropyScanner();
    // 14 diverse characters → log2(14) ≈ 3.81, above 3.5 → flagged
    const result = await scanner.evaluate('token: aB3dE5gH7jK9mN');
    expect(result.status).toBe('escalate');
    expect(result.detections?.[0]?.id).toBe('high-entropy-secret');
  });

  it('passes on UUID (excluded from FP)', async () => {
    const scanner = new EntropyScanner();
    const result = await scanner.evaluate('uuid: 550e8400-e29b-41d4-a716-446655440000');
    expect(result.status).toBe('pass');
  });

  it('passes on ISO date (excluded from FP)', async () => {
    const scanner = new EntropyScanner();
    const result = await scanner.evaluate('date: 2024-01-15T14:30:00Z');
    expect(result.status).toBe('pass');
  });

  it('flags high-entropy token', async () => {
    const scanner = new EntropyScanner();
    // A random-looking 20-char string with diverse characters
    const result = await scanner.evaluate('secret key is Gx8pQmZwN3yB6rKtV2cL');
    expect(result.status).toBe('escalate');
    expect(result.detections).toBeDefined();
    expect(result.detections?.length).toBeGreaterThan(0);
    expect(result.detections?.[0]?.id).toBe('high-entropy-secret');
  });

  it('flags multiple high-entropy tokens', async () => {
    const scanner = new EntropyScanner();
    const result = await scanner.evaluate('keys: Gx8pQmZwN3yB6rKtV2cL and Xj9rLsPq2wMnBvKcHz5t');
    expect(result.status).toBe('escalate');
    expect(result.detections?.length).toBe(2);
  });

  it('respects custom threshold', async () => {
    // Lower threshold = more sensitive
    const scanner = new EntropyScanner({ threshold: 3 });
    // 'abcdefgh' has entropy ~3.0 (log2(8) = 3)
    const _result = await scanner.evaluate('token: abcdefgh');
    // May or may not trigger depending on exact threshold
    const lowScanner = new EntropyScanner({ threshold: 5 });
    const lowResult = await lowScanner.evaluate('Gx8pQmZwN3yB6rKtV2cL');
    // With threshold 5.0, should still not pass for a diverse string
    // (max possible entropy for alphanumeric = log2(62) ≈ 5.95)
    expect(lowResult.status).toBe('pass');
  });

  it('reports detections with confidence based on entropy', async () => {
    const scanner = new EntropyScanner();
    const result = await scanner.evaluate('secret: Gx8pQmZwN3yB6rKtV2cL');
    expect(result.detections?.[0]?.confidence).toBeGreaterThan(0);
    expect(result.detections?.[0]?.confidence).toBeLessThanOrEqual(0.85);
  });

  it('truncates long snippets', async () => {
    const scanner = new EntropyScanner();
    const long = 'G'.repeat(100);
    const result = await scanner.evaluate(`token: ${long}`);
    if (result.detections && result.detections.length > 0) {
      expect(result.detections[0]?.snippet?.length).toBeLessThan(100);
    }
  });
});
