/**
 * Tests for InMemoryPersistenceAdapter.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryPersistenceAdapter } from './in-memory.js';
import type { HealthRecord, QuotaSnapshot, RoutingDecision } from './records.js';

describe('InMemoryPersistenceAdapter', () => {
  let adapter: InMemoryPersistenceAdapter;

  beforeEach(() => {
    adapter = new InMemoryPersistenceAdapter();
  });

  // ── Quota state ──────────────────────────────────────

  it('saves and loads quota state', async () => {
    const state: QuotaSnapshot = {
      rpmLimit: 100,
      rpmRemaining: 50,
      tpmLimit: 10_000,
      tpmRemaining: 5000,
      updatedAt: new Date().toISOString()
    };

    await adapter.saveQuotaState('openai', state);
    const loaded = await adapter.loadQuotaState('openai');
    expect(loaded).toEqual(state);
  });

  it('returns null for unknown quota state', async () => {
    const loaded = await adapter.loadQuotaState('nonexistent');
    expect(loaded).toBeNull();
  });

  it('overwrites existing quota state', async () => {
    const state1: QuotaSnapshot = {
      rpmLimit: 100,
      rpmRemaining: 50,
      tpmLimit: 10_000,
      tpmRemaining: 5000,
      updatedAt: '2024-01-01T00:00:00Z'
    };
    const state2: QuotaSnapshot = {
      rpmLimit: 200,
      rpmRemaining: 100,
      tpmLimit: 20_000,
      tpmRemaining: 10_000,
      updatedAt: '2024-01-02T00:00:00Z'
    };

    await adapter.saveQuotaState('openai', state1);
    await adapter.saveQuotaState('openai', state2);
    const loaded = await adapter.loadQuotaState('openai');
    expect(loaded).toEqual(state2);
  });

  // ── Health history ───────────────────────────────────

  it('saves and loads health records', async () => {
    const record: HealthRecord = {
      success: true,
      latencyMs: 150,
      timestamp: new Date().toISOString()
    };

    await adapter.saveHealthRecord('openai', record);
    const history = await adapter.loadHealthHistory('openai', new Date(0));
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(record);
  });

  it('filters health records by since date', async () => {
    const oldRecord: HealthRecord = {
      success: true,
      timestamp: '2024-01-01T00:00:00Z'
    };
    const newRecord: HealthRecord = {
      success: false,
      error: 'timeout',
      timestamp: '2024-06-01T00:00:00Z'
    };

    await adapter.saveHealthRecord('openai', oldRecord);
    await adapter.saveHealthRecord('openai', newRecord);

    const since = new Date('2024-03-01T00:00:00Z');
    const history = await adapter.loadHealthHistory('openai', since);
    expect(history).toHaveLength(1);
    expect(history[0]?.success).toBe(false);
  });

  it('returns empty array for unknown provider health', async () => {
    const history = await adapter.loadHealthHistory('nonexistent', new Date(0));
    expect(history).toEqual([]);
  });

  // ── Routing decisions ─────────────────────────────────

  it('saves routing decisions', async () => {
    const decision: RoutingDecision = {
      id: 'dec-1',
      modelId: 'gpt-4o',
      providerId: 'openai',
      replicaId: 'openai/gpt-4o',
      tier: 'frontier',
      selectedBecause: ['strategy-selected'],
      rejectedCandidates: [],
      timestamp: new Date().toISOString()
    };

    await adapter.saveRoutingDecision(decision);
    // No explicit load method — decisions are append-only
    // Verify no error thrown
    expect(true).toBe(true);
  });

  // ── Circuit breaker state ─────────────────────────────

  it('saves and loads circuit breaker state', async () => {
    await adapter.saveCircuitBreakerState('openai', 'open');
    const loaded = await adapter.loadCircuitBreakerState('openai');
    expect(loaded).toBe('open');
  });

  it('returns null for unknown circuit breaker state', async () => {
    const loaded = await adapter.loadCircuitBreakerState('nonexistent');
    expect(loaded).toBeNull();
  });

  it('overwrites existing circuit breaker state', async () => {
    await adapter.saveCircuitBreakerState('openai', 'open');
    await adapter.saveCircuitBreakerState('openai', 'closed');
    const loaded = await adapter.loadCircuitBreakerState('openai');
    expect(loaded).toBe('closed');
  });
});
