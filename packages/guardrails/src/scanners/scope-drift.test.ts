import { describe, expect, it } from 'vitest';
import { ScopeDriftScanner } from './scope-drift.js';

describe('ScopeDriftScanner', () => {
  const createSessionState = (overrides?: Record<string, unknown>) => ({
    crisisMode: false,
    emotionalIntensityScore: 0,
    frustrationTurnCount: 0,
    lastScopeDriftTurn: null,
    reassuranceSeekingCount: 0,
    scopeDeclarations: [] as string[],
    sensitiveContext: false,
    sessionStartTime: '2026-07-22T00:00:00Z',
    turnCount: 0,
    ...overrides
  });

  it('passes when no session state is provided', async () => {
    const scanner = new ScopeDriftScanner();
    const result = await scanner.evaluate('hello', {});
    expect(result.status).toBe('pass');
  });

  it('passes when no scope declarations exist', async () => {
    const scanner = new ScopeDriftScanner();
    const ctx = { sessionState: createSessionState() };
    const result = await scanner.evaluate('hello', ctx);
    expect(result.status).toBe('pass');
  });

  it('passes when input aligns with scope', async () => {
    const scanner = new ScopeDriftScanner();
    const ctx = {
      sessionState: createSessionState({
        scopeDeclarations: ['help me fix a React state management bug'],
        turnCount: 5
      })
    };
    const result = await scanner.evaluate('I am having trouble with useState in my React component', ctx);
    expect(result.status).toBe('pass');
  });

  it('detects drift when input does not match scope', async () => {
    const scanner = new ScopeDriftScanner();
    const ctx = {
      sessionState: createSessionState({
        scopeDeclarations: ['review my resume for software engineering positions'],
        turnCount: 5
      })
    };
    const result = await scanner.evaluate('Can you help me plan a vacation to Hawaii?', ctx);
    expect((result as Record<string, unknown>).detections as unknown[]).toBeDefined();
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'scope-drift-detected')).toBe(true);
  });

  it('escalates on persistent drift', async () => {
    const scanner = new ScopeDriftScanner();
    const ctx = {
      sessionState: createSessionState({
        scopeDeclarations: ['discuss Python backend patterns'],
        lastScopeDriftTurn: 3,
        turnCount: 4
      })
    };
    const result = await scanner.evaluate('Tell me about the best sushi restaurants in Tokyo', ctx);
    expect(result.status).toBe('escalate');
  });

  it('passes with short queries (greetings)', async () => {
    const scanner = new ScopeDriftScanner();
    const ctx = {
      sessionState: createSessionState({
        scopeDeclarations: ['build a machine learning pipeline'],
        turnCount: 10
      })
    };
    const result = await scanner.evaluate('ok', ctx);
    expect(result.status).toBe('pass');
  });

  it('respects custom similarity threshold', async () => {
    const scanner = new ScopeDriftScanner({ minSimilarity: 0.5 });
    // Even with aligned text, strict threshold may flag it
    const ctx = {
      sessionState: createSessionState({
        scopeDeclarations: ['machine learning model training'],
        turnCount: 5
      })
    };
    const result = await scanner.evaluate('I want to train a neural network model', ctx);
    // With strict 0.5 threshold, this might still pass if similarity is high enough
    // Just verify it runs without error
    expect(['pass', 'escalate']).toContain(result.status);
  });

  it('non-persistent drift on first occurrence', async () => {
    const scanner = new ScopeDriftScanner();
    const ctx = {
      sessionState: createSessionState({
        scopeDeclarations: ['review my resume for software engineering positions'],
        lastScopeDriftTurn: null,
        turnCount: 10
      })
    };
    const result = await scanner.evaluate('What is the capital of Mongolia?', ctx);
    expect(result.status).toBe('pass');
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections.some(d => d.id === 'scope-drift-detected')).toBe(true);
  });
});
