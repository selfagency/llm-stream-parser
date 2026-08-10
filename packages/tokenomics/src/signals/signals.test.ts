import { describe, expect, it, vi } from 'vitest';
import { detectAbandonment } from './abandonment-detector.js';
import { SignalCollector } from './collector.js';
import { RetryDetector } from './retry-detector.js';
import { RewriteDetector } from './rewrite-detector.js';
import { computeFrustrationScore } from './scorer.js';
import type { FrustrationEvent, SatisfactionEvent } from './types.js';

// ---------------------------------------------------------------------------
// RewriteDetector
// ---------------------------------------------------------------------------

describe('RewriteDetector', () => {
  it('emits immediate_rewrite when file changed within window', () => {
    const onEvent = vi.fn();
    const detector = new RewriteDetector(onEvent);
    detector.onWriteToolCall('/nonexistent-test-path/test.ts', 'sess_1', 0, Date.now());
    detector.onFileChanged('/nonexistent-test-path/test.ts', 10);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'immediate_rewrite', sessionId: 'sess_1' }));
  });

  it('does not emit when file not in window', () => {
    const onEvent = vi.fn();
    const detector = new RewriteDetector(onEvent);
    detector.onFileChanged('/nonexistent-test-path/test.ts', 10);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('does not emit when delta is too small', () => {
    const onEvent = vi.fn();
    const detector = new RewriteDetector(onEvent);
    detector.onWriteToolCall('/nonexistent-test-path/test.ts', 'sess_1', 0, Date.now());
    detector.onFileChanged('/nonexistent-test-path/test.ts', 2);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('does not emit when window expired', () => {
    const onEvent = vi.fn();
    const detector = new RewriteDetector(onEvent);
    detector.onWriteToolCall('/nonexistent-test-path/test.ts', 'sess_1', 0, Date.now() - 100_000);
    detector.onFileChanged('/nonexistent-test-path/test.ts', 10);
    expect(onEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RetryDetector
// ---------------------------------------------------------------------------

describe('RetryDetector', () => {
  it('emits rapid_retry on similar consecutive messages', async () => {
    const onEvent = vi.fn();
    const detector = new RetryDetector(onEvent);
    const embed = vi.fn().mockResolvedValue([1, 0, 0]);

    await detector.onUserMessage('hello', 'sess_1', 0, embed);
    await detector.onUserMessage('hello again', 'sess_1', 1, embed);

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rapid_retry' }));
  });

  it('does not emit on first message', async () => {
    const onEvent = vi.fn();
    const detector = new RetryDetector(onEvent);
    const embed = vi.fn().mockResolvedValue([1, 0, 0]);

    await detector.onUserMessage('hello', 'sess_1', 0, embed);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('does not emit when messages are dissimilar', async () => {
    const onEvent = vi.fn();
    const detector = new RetryDetector(onEvent);
    const embedA = vi.fn().mockResolvedValue([1, 0, 0]);
    const embedB = vi.fn().mockResolvedValue([0, 1, 0]);

    await detector.onUserMessage('hello', 'sess_1', 0, embedA);
    await detector.onUserMessage('goodbye', 'sess_1', 1, embedB);

    expect(onEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AbandonmentDetector
// ---------------------------------------------------------------------------

describe('detectAbandonment', () => {
  it('emits session_abandonment when no artifacts', () => {
    const event = detectAbandonment('sess_1', 60_000, [], []);
    expect(event).not.toBeUndefined();
    expect(event?.kind).toBe('session_abandonment');
  });

  it('returns undefined when session has artifacts', () => {
    const event = detectAbandonment(
      'sess_1',
      60_000,
      [{ sha: 'abc', message: 'fix', branch: 'main', timestamp: new Date() }],
      ['/nonexistent-test-path/test.ts']
    );
    expect(event).toBeUndefined();
  });

  it('returns undefined when session is too short', () => {
    const event = detectAbandonment('sess_1', 5000, [], []);
    expect(event).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// SignalCollector
// ---------------------------------------------------------------------------

describe('SignalCollector', () => {
  it('accumulates frustration events', () => {
    const collector = new SignalCollector();
    const event: FrustrationEvent = {
      kind: 'immediate_rewrite',
      sessionId: 'sess_1',
      turnIndex: 0,
      timestampMs: Date.now(),
      metadata: {},
      weight: 0.3
    };
    collector.emit(event);
    const drained = collector.drain();
    expect(drained.frustration).toHaveLength(1);
    expect(drained.satisfaction).toHaveLength(0);
  });

  it('accumulates satisfaction events', () => {
    const collector = new SignalCollector();
    const event: SatisfactionEvent = {
      kind: 'clean_commit',
      sessionId: 'sess_1',
      timestampMs: Date.now(),
      metadata: {}
    };
    collector.emit(event);
    const drained = collector.drain();
    expect(drained.frustration).toHaveLength(0);
    expect(drained.satisfaction).toHaveLength(1);
  });

  it('drain clears accumulated events', () => {
    const collector = new SignalCollector();
    collector.emit({
      kind: 'immediate_rewrite',
      sessionId: 'sess_1',
      turnIndex: 0,
      timestampMs: Date.now(),
      metadata: {},
      weight: 0.3
    });
    collector.drain();
    const drained = collector.drain();
    expect(drained.frustration).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FrustrationScorer
// ---------------------------------------------------------------------------

describe('computeFrustrationScore', () => {
  it('returns green for no signals', () => {
    const result = computeFrustrationScore([], [], 0);
    expect(result.score).toBe(0);
    expect(result.category).toBe('green');
  });

  it('computes score from frustration events', () => {
    const events: FrustrationEvent[] = [
      { kind: 'immediate_rewrite', sessionId: 'sess_1', turnIndex: 0, timestampMs: 0, metadata: {}, weight: 0.3 },
      { kind: 'rapid_retry', sessionId: 'sess_1', turnIndex: 1, timestampMs: 0, metadata: {}, weight: 0.2 }
    ];
    const result = computeFrustrationScore(events, [], 1.0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.signals).toHaveLength(2);
  });

  it('applies satisfaction offset', () => {
    const frustration: FrustrationEvent[] = [
      { kind: 'immediate_rewrite', sessionId: 'sess_1', turnIndex: 0, timestampMs: 0, metadata: {}, weight: 0.3 }
    ];
    const satisfaction: SatisfactionEvent[] = [
      { kind: 'clean_commit', sessionId: 'sess_1', timestampMs: 0, metadata: {} }
    ];
    const withSat = computeFrustrationScore(frustration, satisfaction, 1.0);
    const withoutSat = computeFrustrationScore(frustration, [], 1.0);
    expect(withSat.score).toBeLessThan(withoutSat.score);
  });

  it('caps satisfaction offset at 0.3', () => {
    const frustration: FrustrationEvent[] = [
      { kind: 'immediate_rewrite', sessionId: 'sess_1', turnIndex: 0, timestampMs: 0, metadata: {}, weight: 0.3 }
    ];
    const satisfaction: SatisfactionEvent[] = Array.from({ length: 10 }, (_, i) => ({
      kind: 'clean_commit' as const,
      sessionId: 'sess_1',
      timestampMs: i,
      metadata: {}
    }));
    const result = computeFrustrationScore(frustration, satisfaction, 1.0);
    expect(result.satisfactionOffset).toBe(0.3);
  });

  it('clamps score to [0, 1]', () => {
    const events: FrustrationEvent[] = Array.from({ length: 20 }, (_, i) => ({
      kind: 'immediate_rewrite' as const,
      sessionId: 'sess_1',
      turnIndex: i,
      timestampMs: i,
      metadata: {},
      weight: 0.3
    }));
    const result = computeFrustrationScore(events, [], 1.0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('categorizes scores correctly', () => {
    const green = computeFrustrationScore([], [], 0);
    expect(green.category).toBe('green');

    const yellow = computeFrustrationScore(
      [
        { kind: 'immediate_rewrite', sessionId: 'sess_1', turnIndex: 0, timestampMs: 0, metadata: {}, weight: 0.3 },
        { kind: 'rapid_retry', sessionId: 'sess_1', turnIndex: 1, timestampMs: 0, metadata: {}, weight: 0.2 }
      ],
      [],
      0
    );
    expect(yellow.category).toBe('yellow');

    const red = computeFrustrationScore(
      [
        { kind: 'immediate_rewrite', sessionId: 'sess_1', turnIndex: 0, timestampMs: 0, metadata: {}, weight: 0.3 },
        { kind: 'rapid_retry', sessionId: 'sess_1', turnIndex: 1, timestampMs: 0, metadata: {}, weight: 0.2 },
        { kind: 'tool_rejection', sessionId: 'sess_1', turnIndex: 2, timestampMs: 0, metadata: {}, weight: 0.15 },
        { kind: 'repair_loop', sessionId: 'sess_1', turnIndex: 3, timestampMs: 0, metadata: {}, weight: 0.15 },
        { kind: 'explicit_negative', sessionId: 'sess_1', turnIndex: 4, timestampMs: 0, metadata: {}, weight: 0.05 }
      ],
      [],
      0
    );
    expect(red.category).toBe('red');
  });
});
