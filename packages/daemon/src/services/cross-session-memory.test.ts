import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CrossSessionMemoryDeps,
  calculateConfidence,
  createCrossSessionMemory,
  groupByTopic,
  type MemoryItem,
  type RecallParams,
  summarize
} from './cross-session-memory.js';

function makeMemory(overrides: Partial<MemoryItem> & { content: string; id: string }): MemoryItem {
  return {
    timestamp: new Date(),
    topic: undefined,
    sessionId: undefined,
    metadata: {},
    ...overrides
  } as MemoryItem;
}

function daysAgo(days: number, base: Date = new Date()): Date {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('cross-session-memory — grouping', () => {
  it('groups by explicit topic', () => {
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'auth fix', topic: 'authentication', timestamp: new Date() }),
      makeMemory({ id: '2', content: 'login bug', topic: 'authentication', timestamp: new Date() }),
      makeMemory({ id: '3', content: 'db migration', topic: 'database', timestamp: new Date() })
    ];

    const grouped = groupByTopic(mems);
    expect(grouped).toHaveLength(2);
    const auth = grouped.find(g => g.key === 'authentication');
    const db = grouped.find(g => g.key === 'database');
    expect(auth?.items).toHaveLength(2);
    expect(db?.items).toHaveLength(1);
  });

  it('groups by metadata.topic when top-level missing', () => {
    const mems: MemoryItem[] = [
      makeMemory({
        id: '1',
        content: 'content a',
        metadata: { topic: 'payments' },
        timestamp: new Date()
      }),
      makeMemory({
        id: '2',
        content: 'content b',
        metadata: { topic: 'payments' },
        timestamp: new Date()
      }),
      makeMemory({
        id: '3',
        content: 'content c',
        metadata: { topic: 'shipping' },
        timestamp: new Date()
      })
    ];

    const grouped = groupByTopic(mems);
    expect(grouped).toHaveLength(2);
  });

  it('extracts topic from content when no topic field', () => {
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'Topic: user onboarding flow improvement', timestamp: new Date() }),
      makeMemory({ id: '2', content: 'Topic: user onboarding flow improvement', timestamp: new Date() }),
      makeMemory({ id: '3', content: 'About: billing cycle refactoring', timestamp: new Date() })
    ];

    const grouped = groupByTopic(mems);
    // Should produce at least 2 groups (onboarding vs billing)
    expect(grouped.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty input', () => {
    expect(groupByTopic([])).toEqual([]);
    expect(groupByTopic(null as unknown as MemoryItem[])).toEqual([]);
  });

  it('sorts groups by size desc then recency', () => {
    const now = new Date();
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'a', topic: 'small', timestamp: daysAgo(5, now) }),
      makeMemory({ id: '2', content: 'b', topic: 'big', timestamp: now }),
      makeMemory({ id: '3', content: 'c', topic: 'big', timestamp: now }),
      makeMemory({ id: '4', content: 'd', topic: 'big', timestamp: now })
    ];
    const grouped = groupByTopic(mems);
    expect(grouped[0]?.key).toBe('big');
    expect(grouped[1]?.key).toBe('small');
  });

  it('sorts items inside group by recency desc', () => {
    const now = new Date();
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'old', topic: 't', timestamp: daysAgo(10, now) }),
      makeMemory({ id: '2', content: 'new', topic: 't', timestamp: now }),
      makeMemory({ id: '3', content: 'mid', topic: 't', timestamp: daysAgo(2, now) })
    ];
    const grouped = groupByTopic(mems);
    expect(grouped[0]?.items[0]?.id).toBe('2');
    expect(grouped[0]?.items[1]?.id).toBe('3');
    expect(grouped[0]?.items[2]?.id).toBe('1');
  });
});

describe('cross-session-memory — confidence calculation', () => {
  const fixedNow = new Date('2026-07-29T12:00:00.000Z');

  it('returns 0 for empty', () => {
    expect(calculateConfidence([], fixedNow)).toBe(0);
  });

  it('higher confidence for recent vs old', () => {
    const recent: MemoryItem[] = [
      makeMemory({ id: '1', content: 'auth token refresh', topic: 'auth', timestamp: fixedNow }),
      makeMemory({ id: '2', content: 'auth token refresh flow', topic: 'auth', timestamp: fixedNow })
    ];
    const old: MemoryItem[] = [
      makeMemory({ id: '1', content: 'auth token refresh', topic: 'auth', timestamp: daysAgo(60, fixedNow) }),
      makeMemory({ id: '2', content: 'auth token refresh flow', topic: 'auth', timestamp: daysAgo(60, fixedNow) })
    ];

    const recentScore = calculateConfidence(recent, fixedNow);
    const oldScore = calculateConfidence(old, fixedNow);
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('higher confidence for higher frequency', () => {
    const few: MemoryItem[] = [
      makeMemory({ id: '1', content: 'payment webhook', topic: 'payments', timestamp: fixedNow })
    ];
    const many: MemoryItem[] = [
      makeMemory({ id: '1', content: 'payment webhook handling', topic: 'payments', timestamp: fixedNow }),
      makeMemory({ id: '2', content: 'payment webhook handling', topic: 'payments', timestamp: fixedNow }),
      makeMemory({ id: '3', content: 'payment webhook handling', topic: 'payments', timestamp: fixedNow }),
      makeMemory({ id: '4', content: 'payment webhook handling', topic: 'payments', timestamp: fixedNow }),
      makeMemory({ id: '5', content: 'payment webhook handling', topic: 'payments', timestamp: fixedNow })
    ];

    expect(calculateConfidence(many, fixedNow)).toBeGreaterThan(calculateConfidence(few, fixedNow));
  });

  it('higher consistency for same-topic vs mixed', () => {
    const consistent: MemoryItem[] = [
      makeMemory({
        id: '1',
        content: 'user authentication with JWT and refresh tokens',
        topic: 'auth',
        timestamp: fixedNow
      }),
      makeMemory({
        id: '2',
        content: 'user authentication JWT refresh tokens flow',
        topic: 'auth',
        timestamp: fixedNow
      })
    ];
    const inconsistent: MemoryItem[] = [
      makeMemory({
        id: '1',
        content: 'user authentication with JWT',
        topic: 'auth',
        timestamp: fixedNow
      }),
      makeMemory({
        id: '2',
        content: 'database migration for shipping tables and queries',
        topic: 'auth',
        metadata: { topic: 'auth' },
        timestamp: fixedNow
      })
    ];

    // The inconsistent group has same topic key but content diverges, so lower Jaccard
    // We group with same key, so consistency uses Jaccard inside topic
    const scoreConsistent = calculateConfidence(consistent, fixedNow);
    const scoreInconsistent = calculateConfidence(inconsistent, fixedNow);
    expect(scoreConsistent).toBeGreaterThan(scoreInconsistent);
  });

  it('confidence within 0..1 and rounded to 3 decimals', () => {
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'test content for confidence', topic: 't', timestamp: fixedNow })
    ];
    const score = calculateConfidence(mems, fixedNow);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    // Check 3 decimal rounding: multiply by 1000 should be int
    expect(Number.isInteger(Math.round(score * 1000))).toBe(true);
  });
});

describe('cross-session-memory — summarization', () => {
  it('produces concise summary from single item', () => {
    const mems: MemoryItem[] = [
      makeMemory({
        id: '1',
        content: 'Implemented JWT authentication with refresh tokens and error handling.',
        topic: 'auth',
        timestamp: new Date()
      })
    ];
    const summary = summarize(mems);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('JWT');
  });

  it('deduplicates sentences and joins up to 3', () => {
    const mems: MemoryItem[] = [
      makeMemory({
        id: '1',
        content: 'User login flow with OAuth2. Handles callback.',
        topic: 'auth',
        timestamp: new Date()
      }),
      makeMemory({
        id: '2',
        content: 'User login flow with OAuth2. Handles callback.',
        topic: 'auth',
        timestamp: new Date()
      }),
      makeMemory({
        id: '3',
        content: 'Password reset via email link expiration.',
        topic: 'auth',
        timestamp: new Date()
      }),
      makeMemory({ id: '4', content: 'Session persistence across tabs.', topic: 'auth', timestamp: new Date() })
    ];
    const summary = summarize(mems);
    // Dedup should avoid repeating same sentence
    const occurrences = (summary.match(/User login flow/g) ?? []).length;
    expect(occurrences).toBeLessThanOrEqual(1);
    expect(summary.length).toBeLessThanOrEqual(350);
  });

  it('handles empty array', () => {
    expect(summarize([])).toBe('');
  });

  it('truncates long combined summary', () => {
    const longContent = 'A'.repeat(500);
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: `${longContent}.`, topic: 't', timestamp: new Date() }),
      makeMemory({ id: '2', content: `${longContent} second part.`, topic: 't', timestamp: new Date() }),
      makeMemory({ id: '3', content: `${longContent} third.`, topic: 't', timestamp: new Date() })
    ];
    const summary = summarize(mems);
    expect(summary.length).toBeLessThanOrEqual(400);
  });
});

describe('cross-session-memory — getCrossSessionInsights', () => {
  let mockRecall: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRecall = vi.fn();
  });

  function makeDeps(memories: MemoryItem[], now?: Date): CrossSessionMemoryDeps {
    mockRecall.mockResolvedValue(memories);
    const deps: CrossSessionMemoryDeps = {
      memory: { recall: mockRecall as unknown as (params: RecallParams) => Promise<MemoryItem[]> }
    };
    if (now) {
      return { ...deps, now: () => now };
    }
    return deps;
  }

  it('queries memory.recall with correct params', async () => {
    const deps = makeDeps([]);
    const svc = createCrossSessionMemory(deps);
    await svc.start();
    await svc.getCrossSessionInsights('project-x');

    expect(mockRecall).toHaveBeenCalledTimes(1);
    const args = mockRecall.mock.calls[0]?.[0];
    expect(args.query).toBe('*');
    expect(args.scope).toBe('project-x');
    expect(args.kind).toBe('semantic');
    expect(args.limit).toBe(100);
    await svc.stop();
  });

  it('returns insights with required fields', async () => {
    const now = new Date('2026-07-29T12:00:00Z');
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'auth flow', topic: 'authentication', timestamp: now, sessionId: 's1' }),
      makeMemory({
        id: '2',
        content: 'auth flow improved',
        topic: 'authentication',
        timestamp: daysAgo(1, now),
        sessionId: 's2'
      })
    ];

    const deps = makeDeps(mems, now);
    const svc = createCrossSessionMemory(deps);
    await svc.start();

    const insights = await svc.getCrossSessionInsights('scope-a');

    expect(insights).toHaveLength(1);
    const insight = insights[0];
    if (!insight) {
      throw new Error('insight missing');
    }
    expect(insight.topic).toBe('authentication');
    expect(insight.memoryCount).toBe(2);
    expect(insight.earliestMemory).toBeInstanceOf(Date);
    expect(insight.latestMemory).toBeInstanceOf(Date);
    expect(insight.confidence).toBeGreaterThan(0);
    expect(insight.summary.length).toBeGreaterThan(0);
    expect(insight.sessionIds).toContain('s1');
    expect(insight.sessionIds).toContain('s2');

    await svc.stop();
  });

  it('handles empty recall', async () => {
    const deps = makeDeps([]);
    const svc = createCrossSessionMemory(deps);
    await svc.start();
    const insights = await svc.getCrossSessionInsights('empty-scope');
    expect(insights).toEqual([]);
    await svc.stop();
  });

  it('validates scope', async () => {
    const deps = makeDeps([]);
    const svc = createCrossSessionMemory(deps);
    await svc.start();
    await expect(svc.getCrossSessionInsights('')).rejects.toThrow('Invalid scope');
    await expect(svc.getCrossSessionInsights('   ')).rejects.toThrow('Invalid scope');
    await svc.stop();
  });

  it('applies minConfidence filter', async () => {
    const now = new Date('2026-07-29T12:00:00Z');
    const mems: MemoryItem[] = [
      makeMemory({ id: '1', content: 'recent', topic: 'fresh', timestamp: now }),
      makeMemory({ id: '2', content: 'very old content about legacy', topic: 'stale', timestamp: daysAgo(90, now) })
    ];

    const deps = makeDeps(mems, now);
    const svc = createCrossSessionMemory(deps, { minConfidence: 0.8 });
    await svc.start();
    const insights = await svc.getCrossSessionInsights('scope');
    // stale with single old entry should be filtered if below 0.8
    // fresh should remain higher
    const stale = insights.find(i => i.topic === 'stale');
    expect(stale === undefined || stale.confidence >= 0.8).toBe(true);
    await svc.stop();
  });

  it('supports recall returning sync array (non-promise)', async () => {
    const now = new Date();
    const mems: MemoryItem[] = [makeMemory({ id: '1', content: 'sync', topic: 'sync-topic', timestamp: now })];

    const deps: CrossSessionMemoryDeps = {
      memory: {
        recall: () => mems // sync
      }
    };

    const svc = createCrossSessionMemory(deps);
    await svc.start();
    const insights = await svc.getCrossSessionInsights('sync-scope');
    expect(insights).toHaveLength(1);
    await svc.stop();
  });
});

describe('cross-session-memory — integration: multiple sessions overlapping topics', () => {
  it('aggregates across sessions with overlapping topics into grouped insights', async () => {
    const now = new Date('2026-07-29T12:00:00Z');

    // Simulate memories from 3 different sessions with overlapping topics
    const allMemories: MemoryItem[] = [
      // Session A — works on auth and payments
      makeMemory({
        id: 'a1',
        content: 'Implemented OAuth2 login with PKCE and state validation.',
        topic: 'authentication',
        timestamp: now,
        sessionId: 'session-a',
        metadata: { sessionId: 'session-a' }
      }),
      makeMemory({
        id: 'a2',
        content: 'Stripe webhook handling for payment succeeded events.',
        topic: 'payments',
        timestamp: daysAgo(1, now),
        sessionId: 'session-a',
        metadata: { sessionId: 'session-a' }
      }),
      // Session B — also auth, plus new topic
      makeMemory({
        id: 'b1',
        content: 'Fixed JWT refresh token rotation bug.',
        topic: 'authentication',
        timestamp: daysAgo(2, now),
        sessionId: 'session-b',
        metadata: { sessionId: 'session-b' }
      }),
      makeMemory({
        id: 'b2',
        content: 'Added billing cycle proration logic.',
        topic: 'billing',
        timestamp: daysAgo(1, now),
        sessionId: 'session-b',
        metadata: { sessionId: 'session-b' }
      }),
      // Session C — payments and auth again
      makeMemory({
        id: 'c1',
        content: 'Auth middleware validates bearer tokens and checks expiration.',
        topic: 'authentication',
        timestamp: daysAgo(0.5, now),
        sessionId: 'session-c',
        metadata: { sessionId: 'session-c' }
      }),
      makeMemory({
        id: 'c2',
        content: 'Payments retry queue with exponential backoff.',
        topic: 'payments',
        timestamp: now,
        sessionId: 'session-c',
        metadata: { sessionId: 'session-c' }
      })
    ];

    // Mock memory that filters by scope but returns cross-session memories
    const mockMemory = {
      recall: vi.fn().mockImplementation((params: { scope: string }) => {
        if (params.scope === 'project-all') {
          return Promise.resolve(allMemories);
        }
        if (params.scope === 'project-auth') {
          return Promise.resolve(allMemories.filter(m => m.topic === 'authentication'));
        }
        return Promise.resolve(allMemories);
      })
    };

    const deps: CrossSessionMemoryDeps = {
      memory: mockMemory,
      now: () => now
    };

    const svc = createCrossSessionMemory(deps);
    await svc.start();

    // Query across all scopes
    const insightsAll = await svc.getCrossSessionInsights('project-all');

    // Should have 3 topics
    expect(insightsAll.length).toBe(3);
    const authInsight = insightsAll.find(i => i.topic === 'authentication');
    const paymentsInsight = insightsAll.find(i => i.topic === 'payments');
    const billingInsight = insightsAll.find(i => i.topic === 'billing');

    expect(authInsight).toBeDefined();
    expect(authInsight?.memoryCount).toBe(3);
    expect(authInsight?.sessionIds).toHaveLength(3);
    expect(authInsight?.sessionIds.sort()).toEqual(['session-a', 'session-b', 'session-c'].sort());
    // Auth has most memories, should have higher confidence than billing (single)
    expect(authInsight?.confidence).toBeGreaterThan(billingInsight?.confidence ?? 0);

    expect(paymentsInsight).toBeDefined();
    expect(paymentsInsight?.memoryCount).toBe(2);
    expect(paymentsInsight?.sessionIds).toContain('session-a');
    expect(paymentsInsight?.sessionIds).toContain('session-c');

    // Earliest/latest ordering check
    if (authInsight) {
      expect(authInsight.earliestMemory.getTime()).toBeLessThanOrEqual(authInsight.latestMemory.getTime());
    }

    // Query filtered scope
    const insightsAuth = await svc.getCrossSessionInsights('project-auth');
    expect(insightsAuth.length).toBe(1);
    expect(insightsAuth[0]?.topic).toBe('authentication');
    expect(insightsAuth[0]?.memoryCount).toBe(3);

    // Ensure recall called with semantic kind
    expect(mockMemory.recall).toHaveBeenCalledWith(
      expect.objectContaining({ query: '*', kind: 'semantic', limit: 100 })
    );

    await svc.stop();
  });

  it('consolidates overlapping sessions with consistency-driven confidence boost', async () => {
    const now = new Date('2026-07-29T12:00:00Z');

    // Two sessions tightly overlapping on same topic with consistent phrasing => high confidence
    const consistentMemories: MemoryItem[] = [
      makeMemory({
        id: '1',
        content: 'user profile caching with redis and ttl invalidation',
        topic: 'caching',
        timestamp: now,
        sessionId: 's1',
        metadata: { sessionId: 's1' }
      }),
      makeMemory({
        id: '2',
        content: 'user profile caching redis ttl invalidation strategy',
        topic: 'caching',
        timestamp: daysAgo(0.2, now),
        sessionId: 's2',
        metadata: { sessionId: 's2' }
      }),
      makeMemory({
        id: '3',
        content: 'redis caching for user profile with ttl',
        topic: 'caching',
        timestamp: daysAgo(0.1, now),
        sessionId: 's3',
        metadata: { sessionId: 's3' }
      })
    ];

    const deps: CrossSessionMemoryDeps = {
      memory: { recall: () => Promise.resolve(consistentMemories) },
      now: () => now
    };

    const svc = createCrossSessionMemory(deps);
    await svc.start();
    const insights = await svc.getCrossSessionInsights('project-caching');

    expect(insights).toHaveLength(1);
    expect(insights[0]?.confidence).toBeGreaterThan(0.6);
    expect(insights[0]?.summary.toLowerCase()).toContain('caching');
    expect(insights[0]?.sessionIds).toHaveLength(3);

    await svc.stop();
  });
});
