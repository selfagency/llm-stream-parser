/**
 * Tests for UnifiedDBPersistenceAdapter.
 */

import { describe, expect, it, vi } from 'vitest';
import type { UnifiedDB } from '../db/unified-db.js';
import { UnifiedDBPersistenceAdapter } from './unified-db-persistence-adapter.js';

// =============================================================================
// Mocks
// =============================================================================

function createMockDB(): UnifiedDB {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    querySingle: vi.fn().mockResolvedValue(null),
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    migrate: vi.fn().mockResolvedValue(undefined),
    migrateFromLegacy: vi.fn().mockResolvedValue(undefined),
    queue: vi.fn(),
    stream: vi.fn(),
    createQueue: vi.fn(),
    createStream: vi.fn(),
    transaction: vi.fn(),
    isOpen: false,
    mode: 'fallback' as const
  } as unknown as UnifiedDB;
}

// =============================================================================
// Quota state
// =============================================================================

describe('quota state', () => {
  it('saves quota state with INSERT', async () => {
    const db = createMockDB();
    const adapter = new UnifiedDBPersistenceAdapter(db);

    await adapter.saveQuotaState('openai', {
      rpmLimit: 100,
      rpmRemaining: 50,
      tpmLimit: 10_000,
      tpmRemaining: 5000,
      updatedAt: '2024-01-01T00:00:00Z'
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO daemon_quota_state'),
      expect.arrayContaining(['openai'])
    );
  });

  it('loads quota state from query result', async () => {
    const db = createMockDB();
    vi.mocked(db.querySingle).mockResolvedValue({
      state_json: JSON.stringify({
        rpmLimit: 100,
        rpmRemaining: 50,
        tpmLimit: 10_000,
        tpmRemaining: 5000,
        updatedAt: '2024-01-01T00:00:00Z'
      })
    });

    const adapter = new UnifiedDBPersistenceAdapter(db);
    const result = await adapter.loadQuotaState('openai');

    expect(result).not.toBeNull();
    expect(result?.rpmLimit).toBe(100);
  });

  it('returns null when no quota state exists', async () => {
    const db = createMockDB();
    vi.mocked(db.querySingle).mockResolvedValue(null);

    const adapter = new UnifiedDBPersistenceAdapter(db);
    const result = await adapter.loadQuotaState('nonexistent');

    expect(result).toBeNull();
  });
});

// =============================================================================
// Health history
// =============================================================================

describe('health history', () => {
  it('saves health records', async () => {
    const db = createMockDB();
    const adapter = new UnifiedDBPersistenceAdapter(db);

    await adapter.saveHealthRecord('openai', {
      success: true,
      latencyMs: 150,
      timestamp: '2024-01-01T00:00:00Z'
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO daemon_health_history'),
      expect.arrayContaining(['openai'])
    );
  });

  it('loads health history', async () => {
    const db = createMockDB();
    vi.mocked(db.query).mockResolvedValue([
      { record_json: JSON.stringify({ success: true, timestamp: '2024-01-01T00:00:00Z' }) }
    ]);

    const adapter = new UnifiedDBPersistenceAdapter(db);
    const result = await adapter.loadHealthHistory('openai', new Date('2023-01-01'));

    expect(result).toHaveLength(1);
    expect(result[0]?.success).toBe(true);
  });

  it('returns empty array when no health records', async () => {
    const db = createMockDB();
    vi.mocked(db.query).mockResolvedValue([]);

    const adapter = new UnifiedDBPersistenceAdapter(db);
    const result = await adapter.loadHealthHistory('openai', new Date('2023-01-01'));

    expect(result).toEqual([]);
  });
});

// =============================================================================
// Routing decisions
// =============================================================================

describe('routing decisions', () => {
  it('saves routing decisions', async () => {
    const db = createMockDB();
    const adapter = new UnifiedDBPersistenceAdapter(db);

    await adapter.saveRoutingDecision({
      id: 'dec-1',
      modelId: 'gpt-4o',
      providerId: 'openai',
      replicaId: 'openai/gpt-4o',
      tier: 'frontier',
      selectedBecause: ['strategy-selected'],
      rejectedCandidates: [],
      timestamp: '2024-01-01T00:00:00Z'
    });

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO daemon_routing_decisions'),
      expect.arrayContaining(['dec-1'])
    );
  });
});

// =============================================================================
// Circuit breaker state
// =============================================================================

describe('circuit breaker state', () => {
  it('saves circuit breaker state', async () => {
    const db = createMockDB();
    const adapter = new UnifiedDBPersistenceAdapter(db);

    await adapter.saveCircuitBreakerState('openai', 'open');

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO daemon_circuit_breaker_state'),
      expect.arrayContaining(['openai', 'open'])
    );
  });

  it('loads circuit breaker state', async () => {
    const db = createMockDB();
    vi.mocked(db.querySingle).mockResolvedValue({ state: 'open' });

    const adapter = new UnifiedDBPersistenceAdapter(db);
    const result = await adapter.loadCircuitBreakerState('openai');

    expect(result).toBe('open');
  });

  it('returns null when no circuit breaker state exists', async () => {
    const db = createMockDB();
    vi.mocked(db.querySingle).mockResolvedValue(null);

    const adapter = new UnifiedDBPersistenceAdapter(db);
    const result = await adapter.loadCircuitBreakerState('nonexistent');

    expect(result).toBeNull();
  });
});
