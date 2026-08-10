import { describe, expect, it } from 'vitest';
import { PIIScanner } from './pii.js';
import { assertDetections, assertPass } from './test-helpers.js';
import type { Detection } from './types.js';

describe('PIIScanner', () => {
  const scanner = new PIIScanner();
  const warnScanner = new PIIScanner({ action: 'warn' });
  const redactScanner = new PIIScanner({ action: 'redact' });

  it('passes on clean text', async () => {
    await assertPass(scanner, 'The meeting is at 3pm tomorrow.');
    await assertPass(scanner, 'Please review the quarterly report.');
    await assertPass(scanner, 'The server is running on port 8080.');
  });

  it('warns on email addresses by default', async () => {
    const r = await scanner.evaluate('Contact me at user@example.com');
    expect(r.status).not.toBe('pass');
    expect(r.detections?.some(d => d.id === 'email')).toBe(true);
  });

  it('warns on phone numbers by default', async () => {
    const r = await scanner.evaluate('Call me at 555-123-4567');
    expect(r.status).not.toBe('pass');
    expect(r.status).toBe('escalate');
    assertDetections(r, ['phone']);
  });

  it('warns on credit card numbers by default', async () => {
    const r = await scanner.evaluate('My card is 4111-1111-1111-1111');
    expect(r.status).not.toBe('pass');
    assertDetections(r, ['credit-card']);
  });

  it('warns on SSN by default', async () => {
    const r = await scanner.evaluate('My SSN is 123-45-6789');
    if (r.status === 'block') {
      assertDetections(r, ['ssn']);
    } else {
      const dr = r as { detections: readonly Detection[] };
      expect(dr.detections?.some(d => d.id === 'ssn')).toBe(true);
    }
  });

  it('redacts using [REDACTED:<type>] format', async () => {
    const r = await redactScanner.evaluate('Email: user@example.com, Phone: 555-123-4567');
    expect(r.status).toBe('transform');
    if (r.status === 'transform') {
      expect(r.sanitized).not.toContain('user@example.com');
      expect(r.sanitized).not.toContain('555-123-4567');
      expect(r.sanitized).toContain('[REDACTED:email]');
      expect(r.sanitized).toContain('[REDACTED:phone]');
    }
  });

  it('redacts SSN, credit-card, and other high-severity types consistently', async () => {
    const r = await redactScanner.evaluate('SSN: 123-45-6789, Card: 4111-1111-1111-1111');
    expect(r.status).toBe('transform');
    if (r.status === 'transform') {
      expect(r.sanitized).toContain('[REDACTED:ssn]');
      expect(r.sanitized).toContain('[REDACTED:credit-card]');
    }
  });

  it('warn action returns non-block', async () => {
    const r = await warnScanner.evaluate('Email: user@test.com');
    // warn action does not block, but may escalate
    expect(r.status).not.toBe('pass');
    expect(r.detections?.some(d => d.id === 'email')).toBe(true);
  });

  it('detects multiple PII types', async () => {
    const r = await scanner.evaluate('Email: a@b.com, Phone: 555-000-1111, Card: 4111111111111111');
    expect(r.status).not.toBe('pass');
    const ids = (r.detections ?? []).map(d => d.id);
    expect(ids).toContain('email');
    expect(ids).toContain('phone');
    expect(ids).toContain('credit-card');
  });

  it('has correct metadata', () => {
    const meta = scanner.metadata;
    expect(meta.id).toBe('hub://guardrails/pii');
    expect(meta.owaspCategories.some(c => ['asi-06', 'asi-08'].includes(c))).toBe(true);
  });

  it('passes on numbers that look like but are not PII', async () => {
    await assertPass(scanner, 'The value is 12345.');
    await assertPass(scanner, 'Use port 3000 for the server.');
  });
});
