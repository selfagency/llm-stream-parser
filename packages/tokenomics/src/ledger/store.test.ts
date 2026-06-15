import { describe, expect, it } from 'vitest';
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByWeek,
  aggregateLedger,
  formatDay,
  formatMonth,
  formatWeek,
  queryLedger
} from './query.js';
import { createSqliteLedgerStore } from './store.js';
import type { SessionLedgerEntry } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<SessionLedgerEntry> & { id: string; sessionId: string }): SessionLedgerEntry {
  return {
    agentId: 'agent-1',
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    startedAt: new Date('2026-06-01T00:00:00Z'),
    endedAt: new Date('2026-06-01T00:05:00Z'),
    durationMs: 300_000,
    spend: { requestCount: 5, totalCost: 0.03, totalTokens: 1500 },
    artifacts: { generated: 3, cached: 1 },
    quality: { score: 0.92, feedbackCount: 2 },
    frustration: { count: 0, reasons: [] },
    survivalRate30d: null,
    tags: ['production'],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Store tests
// ---------------------------------------------------------------------------

describe('createSqliteLedgerStore', () => {
  it('inserts and retrieves an entry', () => {
    const store = createSqliteLedgerStore(':memory:');

    const entry = makeEntry({ id: 'e1', sessionId: 's1' });
    store.insert(entry);

    const retrieved = store.get('e1');
    expect(retrieved).toBeTruthy();
    expect(retrieved?.id).toBe('e1');
    expect(retrieved?.sessionId).toBe('s1');
    expect(retrieved?.agentId).toBe('agent-1');
    expect(retrieved?.spend.totalCost).toBe(0.03);
    expect(retrieved?.artifacts.generated).toBe(3);
    expect(retrieved?.quality.score).toBe(0.92);
    expect(retrieved?.frustration.count).toBe(0);
    expect(retrieved?.tags).toEqual(['production']);

    store.close();
  });

  it('returns undefined for a missing entry', () => {
    const store = createSqliteLedgerStore(':memory:');
    expect(store.get('nonexistent')).toBeUndefined();
    store.close();
  });

  it('round-trips replica-aware fields', () => {
    const store = createSqliteLedgerStore(':memory:');

    const entry = makeEntry({
      id: 'e2',
      sessionId: 's2',
      logicalModelId: 'claude-sonnet',
      replicaId: 'rep-01',
      providerId: 'anthropic-us-east-1',
      failoverChain: ['rep-02', 'rep-03']
    });
    store.insert(entry);

    const retrieved = store.get('e2');
    expect(retrieved).toBeTruthy();
    expect(retrieved?.logicalModelId).toBe('claude-sonnet');
    expect(retrieved?.replicaId).toBe('rep-01');
    expect(retrieved?.providerId).toBe('anthropic-us-east-1');
    expect(retrieved?.failoverChain).toEqual(['rep-02', 'rep-03']);

    store.close();
  });

  it('queries with no filter returns all entries', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(makeEntry({ id: 'a', sessionId: 's1' }));
    store.insert(makeEntry({ id: 'b', sessionId: 's2', agentId: 'agent-2' }));

    const all = store.query();
    expect(all).toHaveLength(2);

    store.close();
  });

  it('queries by agentId', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(makeEntry({ id: 'a', sessionId: 's1' }));
    store.insert(makeEntry({ id: 'b', sessionId: 's2', agentId: 'agent-2' }));

    const results = store.query({ agentId: 'agent-2' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('b');

    store.close();
  });

  it('queries by time range', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(
      makeEntry({
        id: 'a',
        sessionId: 's1',
        startedAt: new Date('2026-06-01T00:00:00Z')
      })
    );
    store.insert(
      makeEntry({
        id: 'b',
        sessionId: 's2',
        startedAt: new Date('2026-06-15T00:00:00Z')
      })
    );

    const results = store.query({
      since: new Date('2026-06-10T00:00:00Z'),
      until: new Date('2026-06-20T00:00:00Z')
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('b');

    store.close();
  });

  it('queries by frustration range', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(makeEntry({ id: 'a', sessionId: 's1', frustration: { count: 0, reasons: [] } }));
    store.insert(makeEntry({ id: 'b', sessionId: 's2', frustration: { count: 3, reasons: ['timeout'] } }));
    store.insert(makeEntry({ id: 'c', sessionId: 's3', frustration: { count: 7, reasons: ['loop'] } }));

    const results = store.query({ frustrationMin: 2, frustrationMax: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('b');

    store.close();
  });

  it('queries by tags', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(makeEntry({ id: 'a', sessionId: 's1', tags: ['production'] }));
    store.insert(makeEntry({ id: 'b', sessionId: 's2', tags: ['staging'] }));
    store.insert(makeEntry({ id: 'c', sessionId: 's3', tags: ['production', 'high-priority'] }));

    const results = store.query({ tags: ['production'] });
    expect(results).toHaveLength(2);
    expect(results.map(r => r.id).sort()).toEqual(['a', 'c']);

    store.close();
  });

  it('updates survival rate', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(makeEntry({ id: 'e1', sessionId: 's1' }));
    store.updateSurvivalRate('e1', 0.85);

    const retrieved = store.get('e1');
    expect(retrieved).toBeTruthy();
    expect(retrieved?.survivalRate30d).toBe(0.85);

    store.close();
  });

  it('aggregate returns correct metrics', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(
      makeEntry({
        id: 'a',
        sessionId: 's1',
        spend: { requestCount: 5, totalCost: 0.03, totalTokens: 1500 },
        artifacts: { generated: 3, cached: 1 },
        frustration: { count: 0, reasons: [] }
      })
    );
    store.insert(
      makeEntry({
        id: 'b',
        sessionId: 's2',
        spend: { requestCount: 10, totalCost: 0.07, totalTokens: 3000 },
        artifacts: { generated: 5, cached: 2 },
        frustration: { count: 2, reasons: ['timeout'] }
      })
    );

    const agg = store.aggregate();
    expect(agg.sessionCount).toBe(2);
    expect(agg.totalCostUsd).toBe(0.1);
    expect(agg.totalTokens).toBe(4500);
    expect(agg.totalRequests).toBe(15);
    expect(agg.totalArtifactsGenerated).toBe(8);
    expect(agg.totalArtifactsCached).toBe(3);
    expect(agg.avgFrustrationScore).toBe(1);
    expect(agg.totalCostAtFrustration).toBe(0.07);
    expect(agg.avgQualityScore).toBe(0.92);

    store.close();
  });

  it('aggregate with filter scopes correctly', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(makeEntry({ id: 'a', sessionId: 's1', agentId: 'agent-1' }));
    store.insert(makeEntry({ id: 'b', sessionId: 's2', agentId: 'agent-2' }));

    const agg = store.aggregate({ agentId: 'agent-1' });
    expect(agg.sessionCount).toBe(1);

    store.close();
  });

  it('aggregate returns zeros when no entries match', () => {
    const store = createSqliteLedgerStore(':memory:');

    const agg = store.aggregate({ agentId: 'nonexistent' });
    expect(agg.sessionCount).toBe(0);
    expect(agg.totalCostUsd).toBe(0);
    expect(agg.totalTokens).toBe(0);
    expect(agg.avgFrustrationScore).toBe(0);

    store.close();
  });

  it('close works without error', () => {
    const store = createSqliteLedgerStore(':memory:');
    expect(() => store.close()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Query API tests
// ---------------------------------------------------------------------------

describe('queryLedger', () => {
  it('delegates to store.query', () => {
    const store = createSqliteLedgerStore(':memory:');
    store.insert(makeEntry({ id: 'a', sessionId: 's1' }));

    const results = queryLedger(store);
    expect(results).toHaveLength(1);

    store.close();
  });
});

describe('aggregateLedger', () => {
  it('computes cache efficiency', () => {
    const store = createSqliteLedgerStore(':memory:');
    store.insert(
      makeEntry({
        id: 'a',
        sessionId: 's1',
        artifacts: { generated: 3, cached: 1 }
      })
    );

    const agg = aggregateLedger(store, undefined, '2026-W22');
    expect(agg.period).toBe('2026-W22');
    expect(agg.cacheEfficiencyAvg).toBe(0.25);
    expect(agg.totalCommits).toBe(0);
    expect(agg.totalLinesAdded).toBe(0);

    store.close();
  });
});

describe('aggregateByWeek', () => {
  it('groups entries by ISO week', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(
      makeEntry({
        id: 'a',
        sessionId: 's1',
        startedAt: new Date('2026-06-01T00:00:00Z'), // Monday of W23
        spend: { requestCount: 5, totalCost: 0.03, totalTokens: 1500 }
      })
    );
    store.insert(
      makeEntry({
        id: 'b',
        sessionId: 's2',
        startedAt: new Date('2026-06-08T00:00:00Z'), // Monday of W24
        spend: { requestCount: 5, totalCost: 0.05, totalTokens: 2000 }
      })
    );

    const results = aggregateByWeek(store, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-14T00:00:00Z'));

    expect(results).toHaveLength(2);
    expect(results[0]?.period).toBe('2026-W23');
    expect(results[0]?.totalCostUsd).toBe(0.03);
    expect(results[1]?.period).toBe('2026-W24');
    expect(results[1]?.totalCostUsd).toBe(0.05);

    store.close();
  });
});

describe('aggregateByMonth', () => {
  it('groups entries by month', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(
      makeEntry({
        id: 'a',
        sessionId: 's1',
        startedAt: new Date('2026-06-01T00:00:00Z'),
        spend: { requestCount: 5, totalCost: 0.03, totalTokens: 1500 }
      })
    );
    store.insert(
      makeEntry({
        id: 'b',
        sessionId: 's2',
        startedAt: new Date('2026-07-01T00:00:00Z'),
        spend: { requestCount: 5, totalCost: 0.07, totalTokens: 2000 }
      })
    );

    const results = aggregateByMonth(store, new Date('2026-06-01T00:00:00Z'), new Date('2026-07-31T00:00:00Z'));

    expect(results).toHaveLength(2);
    expect(results[0]?.period).toBe('2026-06');
    expect(results[0]?.totalCostUsd).toBe(0.03);
    expect(results[1]?.period).toBe('2026-07');
    expect(results[1]?.totalCostUsd).toBe(0.07);

    store.close();
  });
});

describe('aggregateByDay', () => {
  it('groups entries by day', () => {
    const store = createSqliteLedgerStore(':memory:');

    store.insert(
      makeEntry({
        id: 'a',
        sessionId: 's1',
        startedAt: new Date('2026-06-01T00:00:00Z'),
        spend: { requestCount: 5, totalCost: 0.03, totalTokens: 1500 }
      })
    );
    store.insert(
      makeEntry({
        id: 'b',
        sessionId: 's2',
        startedAt: new Date('2026-06-02T00:00:00Z'),
        spend: { requestCount: 5, totalCost: 0.04, totalTokens: 2000 }
      })
    );

    const results = aggregateByDay(store, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-02T00:00:00Z'));

    expect(results).toHaveLength(2);
    expect(results[0]?.period).toBe('2026-06-01');
    expect(results[1]?.period).toBe('2026-06-02');

    store.close();
  });
});

describe('format helpers', () => {
  it('formatWeek returns ISO week string', () => {
    // June 1, 2026 is a Monday → W23
    expect(formatWeek(new Date('2026-06-01T00:00:00Z'))).toBe('2026-W23');
  });

  it('formatMonth returns YYYY-MM', () => {
    expect(formatMonth(new Date('2026-06-15T00:00:00Z'))).toBe('2026-06');
  });

  it('formatDay returns YYYY-MM-DD', () => {
    expect(formatDay(new Date('2026-06-15T00:00:00Z'))).toBe('2026-06-15');
  });
});
