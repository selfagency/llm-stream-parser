import { describe, expect, it } from 'vitest';
import { InteractionSafeguardsScanner } from './interaction-safeguards.js';

describe('InteractionSafeguardsScanner', () => {
  const createSessionState = (overrides?: Record<string, unknown>) => ({
    crisisMode: false,
    emotionalIntensityScore: 0,
    frustrationTurnCount: 0,
    lastScopeDriftTurn: null,
    reassuranceSeekingCount: 0,
    scopeDeclarations: [],
    sensitiveContext: false,
    turnCount: 0,
    ...overrides
  });

  it('passes when no session state is provided', async () => {
    const scanner = new InteractionSafeguardsScanner();
    const result = await scanner.evaluate('hello', {});
    expect(result.status).toBe('pass');
  });

  it('passes when session state is within normal ranges', async () => {
    const scanner = new InteractionSafeguardsScanner();
    const ctx = { sessionState: createSessionState() };
    const result = await scanner.evaluate('hello', ctx);
    expect(result.status).toBe('pass');
  });

  it('detects high emotional intensity', async () => {
    const scanner = new InteractionSafeguardsScanner();
    const ctx = { sessionState: createSessionState({ emotionalIntensityScore: 0.85 }) };
    const result = await scanner.evaluate('I am so upset about this', ctx);
    expect((result as Record<string, unknown>).detections as unknown[]).toBeDefined();
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'ia-high-emotional-intensity')).toBe(true);
  });

  it('detects extreme emotional intensity', async () => {
    const scanner = new InteractionSafeguardsScanner();
    const ctx = { sessionState: createSessionState({ emotionalIntensityScore: 0.97 }) };
    const result = await scanner.evaluate('I cannot take this anymore', ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'ia-extreme-emotional-intensity')).toBe(true);
  });

  it('detects excessive reassurance seeking', async () => {
    const scanner = new InteractionSafeguardsScanner();
    const ctx = { sessionState: createSessionState({ reassuranceSeekingCount: 6 }) };
    const result = await scanner.evaluate('do you think I should do this?', ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'ia-excessive-reassurance-seeking')).toBe(true);
  });

  it('detects turn limit reached', async () => {
    const scanner = new InteractionSafeguardsScanner();
    const ctx = { sessionState: createSessionState({ turnCount: 100 }) };
    const result = await scanner.evaluate('keep going', ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'ia-turn-limit-reached')).toBe(true);
  });

  it('respects custom config thresholds', async () => {
    const scanner = new InteractionSafeguardsScanner({ maxEmotionalIntensity: 0.5, maxReassuranceSeeking: 2 });
    const ctx = { sessionState: createSessionState({ emotionalIntensityScore: 0.6, reassuranceSeekingCount: 3 }) };
    const result = await scanner.evaluate('test', ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'ia-high-emotional-intensity')).toBe(true);
    expect(detections.some(d => d.id === 'ia-excessive-reassurance-seeking')).toBe(true);
  });

  it('returns escalate when hard limits are exceeded', async () => {
    const scanner = new InteractionSafeguardsScanner({ enforceHardLimits: true, maxEmotionalIntensity: 0.5 });
    const ctx = { sessionState: createSessionState({ emotionalIntensityScore: 0.97 }) };
    const result = await scanner.evaluate('I cannot handle this anymore', ctx);
    expect(result.status).toBe('escalate');
  });

  it('does not escalate when enforceHardLimits is false', async () => {
    const scanner = new InteractionSafeguardsScanner({ enforceHardLimits: false });
    const ctx = { sessionState: createSessionState({ emotionalIntensityScore: 0.97 }) };
    const result = await scanner.evaluate('I cannot handle this anymore', ctx);
    expect(result.status).toBe('pass');
  });

  it('accumulates multiple detection types', async () => {
    const scanner = new InteractionSafeguardsScanner({
      maxTurns: 5,
      maxEmotionalIntensity: 0.5,
      maxReassuranceSeeking: 2
    });
    const ctx = {
      sessionState: createSessionState({ emotionalIntensityScore: 0.85, reassuranceSeekingCount: 5, turnCount: 10 })
    };
    const result = await scanner.evaluate('test', ctx);
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.length).toBeGreaterThanOrEqual(3);
  });
});
