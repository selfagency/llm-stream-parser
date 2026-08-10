import { describe, expect, it } from 'vitest';
import { DelayedExfiltrationScanner } from './delayed-exfiltration.js';

describe('DelayedExfiltrationScanner', () => {
  const createSessionState = (overrides?: Record<string, unknown>) => ({
    crisisMode: false,
    emotionalIntensityScore: 0,
    frustrationTurnCount: 0,
    lastScopeDriftTurn: null,
    reassuranceSeekingCount: 0,
    scopeDeclarations: [],
    sensitiveContext: false,
    sessionStartTime: '2026-07-22T00:00:00Z',
    turnCount: 0,
    ...overrides
  });

  it('passes when no session state', async () => {
    const scanner = new DelayedExfiltrationScanner();
    const result = await scanner.evaluate('small output', {});
    expect(result.status).toBe('pass');
  });

  it('passes on small single outputs', async () => {
    const scanner = new DelayedExfiltrationScanner();
    const result = await scanner.evaluate('hi', { sessionState: createSessionState() });
    expect(result.status).toBe('pass');
  });

  it('flags cumulative data across turns', async () => {
    const scanner = new DelayedExfiltrationScanner({ maxCumulativeBytes: 100 });
    const ctx = { sessionState: createSessionState({ turnCount: 20 }) };
    const result = await scanner.evaluate('x'.repeat(100), ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'de-cumulative-data-exceeds-limit')).toBe(true);
  });

  it('flags repeat egress target', async () => {
    const scanner = new DelayedExfiltrationScanner();
    const ctx = {
      sessionState: createSessionState({ turnCount: 5 }),
      url: 'https://evil.com/collect'
    };
    const result = await scanner.evaluate('user data: xyz', ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'de-repeat-egress-target')).toBe(true);
  });
});
