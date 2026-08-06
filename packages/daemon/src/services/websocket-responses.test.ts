/**
 * WebSocket Responses API — unit + integration tests.
 *
 * Covers:
 * - Prewarm creates connection (generate=false)
 * - x-codex-turn-state header sticky routing
 * - Fallback when replica unavailable
 * - TTFT improvement via prewarm
 * - Pool management
 * - Session affinity across turns
 * - Integration: codex-style prewarm + prompt flow
 *
 * @module
 */

import { createStickyRoutingTable } from '@agentsy/gateway';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WebSocketResponsesService } from './websocket-responses.js';
import { createWebSocketResponsesService, TURN_STATE_HEADER, WebSocketConnectionPool } from './websocket-responses.js';

// ── Helpers ──────────────────────────────────────────────────

function createMockFactory(connectDelayMs = 10): (replicaId: string, turnState: string) => Promise<{ id?: string }> {
  return async () => {
    if (connectDelayMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, connectDelayMs));
    }
    return {};
  };
}

function createService(overrides: Record<string, unknown> = {}): WebSocketResponsesService {
  const base = {
    availableReplicaIds: ['replica-default', 'replica-a', 'replica-b'],
    defaultConnectDelayMs: 5,
    defaultReplicaId: 'replica-default',
    connectionFactory: createMockFactory(5),
    now: () => Date.now(),
    idGenerator: (() => {
      let count = 0;
      return () => `test-${++count}`;
    })()
  };
  const merged = { ...base, ...overrides };
  return createWebSocketResponsesService(merged as never);
}

// ── Unit: Sticky routing table (gateway) ─────────────────────

describe('StickyRoutingTable', () => {
  it('parses plain opaque turn state', () => {
    const table = createStickyRoutingTable();
    const parsed = table.parseTurnStateHeader('my-turn-state-123');
    expect(parsed).not.toBeNull();
    expect(parsed?.raw).toBe('my-turn-state-123');
  });

  it('parses colon-separated session:turn:replica', () => {
    const table = createStickyRoutingTable();
    const parsed = table.parseTurnStateHeader('sess-abc:turn-1:replica-a');
    expect(parsed?.sessionId).toBe('sess-abc');
    expect(parsed?.turnId).toBe('turn-1');
    expect(parsed?.replicaId).toBe('replica-a');
  });

  it('parses JSON turn state', () => {
    const table = createStickyRoutingTable();
    const json = JSON.stringify({ sessionId: 'sess-123', turnId: 't-1', replicaId: 'replica-b' });
    const parsed = table.parseTurnStateHeader(json);
    expect(parsed?.sessionId).toBe('sess-123');
    expect(parsed?.turnId).toBe('t-1');
    expect(parsed?.replicaId).toBe('replica-b');
  });

  it('parses base64 JSON', () => {
    const table = createStickyRoutingTable();
    const obj = { sessionId: 'sess-b64', turnId: 't-2' };
    const b64 = Buffer.from(JSON.stringify(obj)).toString('base64');
    const parsed = table.parseTurnStateHeader(b64);
    expect(parsed?.sessionId).toBe('sess-b64');
  });

  it('setRoute and getReplicaId work', () => {
    const table = createStickyRoutingTable();
    table.setRoute('turn-1', 'replica-a');
    expect(table.getReplicaId('turn-1')).toBe('replica-a');
    expect(table.hasRoute('turn-1')).toBe(true);
  });

  it('resolves sticky replica from available list', () => {
    const table = createStickyRoutingTable();
    table.setRoute('turn-1', 'replica-a');
    const resolved = table.resolveStickyReplica('turn-1', ['replica-a', 'replica-b']);
    expect(resolved).toBe('replica-a');
  });

  it('falls back when replica not in available list', () => {
    const table = createStickyRoutingTable();
    table.setRoute('turn-1', 'replica-a');
    const result = table.resolveWithFallback('turn-1', ['replica-b', 'replica-c']);
    expect(result.replicaId).toBeUndefined();
    expect(result.isFallback).toBe(true);
    expect(result.isSticky).toBe(false);
  });

  it('session affinity persists across turns', () => {
    const table = createStickyRoutingTable();
    table.setRoute('sess-1:turn-1', 'replica-a', { sessionId: 'sess-1' });
    // New turn with same session id but different turn id
    const result = table.resolveWithFallback('sess-1:turn-2', ['replica-a', 'replica-b']);
    expect(result.replicaId).toBe('replica-a');
    expect(result.sessionAffinity).toBe(true);
    expect(result.isSticky).toBe(true);
  });

  it('evicts expired entries', () => {
    let now = Date.now();
    const table = createStickyRoutingTable({ now: () => now, ttlMs: 100 });
    table.setRoute('turn-1', 'replica-a');
    expect(table.size).toBe(1);
    now += 200;
    expect(table.evictExpired()).toBe(1);
    expect(table.size).toBe(0);
  });

  it('builds header from TurnState', () => {
    const table = createStickyRoutingTable();
    const header = table.buildTurnStateHeader({
      raw: 'ignored-when-structured',
      sessionId: 'sess-1',
      turnId: 't-1',
      replicaId: 'replica-a'
    });
    const parsed = JSON.parse(header) as { sessionId: string };
    expect(parsed.sessionId).toBe('sess-1');
  });
});

// ── Unit: Connection Pool ────────────────────────────────────

describe('WebSocketConnectionPool', () => {
  it('creates connection and tracks stats', async () => {
    const sticky = createStickyRoutingTable();
    const pool = new WebSocketConnectionPool({
      stickyTable: sticky,
      maxPoolSize: 5,
      connectionFactory: createMockFactory(1)
    });

    const conn = await pool.createConnection('replica-a', 'turn-1', 'sess-1');
    expect(conn.state).toBe('ready');
    expect(conn.replicaId).toBe('replica-a');
    expect(pool.size).toBe(1);
    expect(pool.stats().ready).toBe(1);
  });

  it('acquires prewarmed connection', async () => {
    const sticky = createStickyRoutingTable();
    const pool = new WebSocketConnectionPool({
      stickyTable: sticky,
      connectionFactory: createMockFactory(1)
    });

    await pool.createConnection('replica-a', 'turn-1');
    const acquired = pool.acquire('turn-1');
    expect(acquired).toBeDefined();
    expect(acquired?.state).toBe('in-use');
    expect(pool.stats().inUse).toBe(1);
  });

  it('evicts expired connections', async () => {
    let now = Date.now();
    const sticky = createStickyRoutingTable({ now: () => now });
    const pool = new WebSocketConnectionPool({
      stickyTable: sticky,
      prewarmTtlMs: 50,
      connectionFactory: createMockFactory(0),
      now: () => now
    });

    await pool.createConnection('replica-a', 'turn-1');
    expect(pool.size).toBe(1);
    now += 100;
    expect(pool.evictExpired()).toBe(1);
    expect(pool.size).toBe(0);
  });

  it('enforces max pool size with LRU eviction', async () => {
    const sticky = createStickyRoutingTable();
    const pool = new WebSocketConnectionPool({
      stickyTable: sticky,
      maxPoolSize: 2,
      connectionFactory: createMockFactory(0)
    });

    await pool.createConnection('replica-a', 'turn-1');
    await pool.createConnection('replica-b', 'turn-2');
    expect(pool.size).toBe(2);
    await pool.createConnection('replica-c', 'turn-3');
    expect(pool.size).toBe(2);
    // One of the old ones should be evicted
    expect(pool.getByTurnState('turn-1') ?? pool.getByTurnState('turn-2')).toBeDefined();
  });
});

// ── Unit: WebSocketResponsesService ──────────────────────────

describe('WebSocketResponsesService', () => {
  let service: WebSocketResponsesService;

  beforeEach(async () => {
    service = createService();
    await service.start();
  });

  it('prewarm creates connection (generate=false)', async () => {
    const result = await service.createResponse({
      generate: false,
      turnState: 'turn-prewarm-1',
      model: 'gpt-4o'
    });

    expect(result.status).toBe('prewarmed');
    expect(result.prewarmed).toBe(true);
    expect(result.turnState).toBe('turn-prewarm-1');
    expect(service.pool.size).toBe(1);
    expect(service.getPoolStats().ready).toBe(1);
  });

  it('prewarm via explicit prewarm method', async () => {
    const result = await service.prewarm({
      turnState: 'turn-prewarm-2',
      sessionId: 'sess-1'
    });

    expect(result.replicaId).toBeDefined();
    expect(result.turnState).toBe('turn-prewarm-2');
    expect(result.sessionId).toBe('sess-1');
    expect(service.pool.getByTurnState('turn-prewarm-2')).toBeDefined();
  });

  it('x-codex-turn-state header enables sticky routing', async () => {
    const first = await service.createResponse({
      turnState: 'sess-1:turn-1',
      replicaId: 'replica-a',
      headers: { [TURN_STATE_HEADER]: 'sess-1:turn-1' }
    });

    expect(first.replicaId).toBe('replica-a');

    // Second request with same session should stick to replica-a
    const second = await service.createResponse({
      headers: { [TURN_STATE_HEADER]: 'sess-1:turn-2' }
    });

    // Since we set sticky route for sess-1:turn-1 with sessionId sess-1,
    // the second turn with same session should resolve to same replica
    // (via session affinity)
    expect(second.sticky).toBe(true);
    expect(second.replicaId).toBe('replica-a');
  });

  it('parses turn state header in various formats', async () => {
    const jsonHeader = JSON.stringify({ sessionId: 'sess-json', turnId: 't1' });
    const result = await service.createResponse({
      headers: { [TURN_STATE_HEADER]: jsonHeader }
    });

    expect(result.sessionId).toBe('sess-json');
    expect(service.stickyTable.getReplicaBySession('sess-json')).toBeDefined();
  });

  it('fallback when replica unavailable', async () => {
    // Prewarm with replica-a
    await service.prewarm({
      turnState: 'turn-fallback-1',
      replicaId: 'replica-a'
    });

    // Simulate replica-a becoming unavailable by creating service with only replica-b
    const limitedService = createService({
      availableReplicaIds: ['replica-b', 'replica-c']
    });
    await limitedService.start();
    // Set sticky route to replica-a which is not available
    limitedService.stickyTable.setRoute('turn-fallback-1', 'replica-a');

    const result = await limitedService.createResponse({
      turnState: 'turn-fallback-1'
    });

    expect(result.fallback).toBe(true);
    expect(result.replicaId).not.toBe('replica-a');
    expect(['replica-b', 'replica-c']).toContain(result.replicaId);

    await limitedService.stop();
  });

  it('fallback when no sticky route', async () => {
    const result = await service.createResponse({
      turnState: 'completely-new-turn',
      model: 'test-model'
    });

    expect(result.fallback).toBe(false);
    expect(result.sticky).toBe(false);
    expect(result.replicaId).toBe('replica-default');
  });

  it('sticky routing persists across turns in same session', async () => {
    await service.createResponse({
      sessionId: 'sess-persist',
      turnState: 'sess-persist:turn-1',
      replicaId: 'replica-b'
    });

    const second = await service.createResponse({
      sessionId: 'sess-persist',
      turnState: 'sess-persist:turn-2'
    });

    expect(second.sticky).toBe(true);
    expect(second.replicaId).toBe('replica-b');
  });

  it('pool management: release and reuse', async () => {
    await service.prewarm({ turnState: 'turn-pool-1' });
    expect(service.getPoolStats().ready).toBe(1);

    const conn = service.pool.getByTurnState('turn-pool-1');
    expect(conn).toBeDefined();

    // Acquire makes it in-use
    const acquired = service.pool.acquire('turn-pool-1');
    expect(acquired?.state).toBe('in-use');
    expect(service.getPoolStats().inUse).toBe(1);

    // Release back to ready
    if (acquired) {
      service.pool.release(acquired.id);
    }
    expect(service.getPoolStats().ready).toBe(1);
  });
});

// ── TTFT measurement ─────────────────────────────────────────

describe('TTFT improvement via prewarm', () => {
  it('prewarmed TTFT is lower than cold TTFT', async () => {
    // Simulate slow connection establishment
    const slowFactory = async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 30));
      return {};
    };

    const service = createWebSocketResponsesService({
      availableReplicaIds: ['replica-default'],
      defaultReplicaId: 'replica-default',
      connectionFactory: slowFactory,
      defaultConnectDelayMs: 30
    });
    await service.start();

    // Cold path: no prewarm, should incur connection delay
    const coldStart = Date.now();
    const coldResult = await service.createResponse({
      turnState: `cold-${Date.now()}`
    });
    const coldTtft = Date.now() - coldStart;

    // Warm path: prewarm first, then reuse
    await service.prewarm({ turnState: 'warm-turn' });
    const warmStart = Date.now();
    const warmResult = await service.createResponse({
      turnState: 'warm-turn'
    });
    const warmTtft = Date.now() - warmStart;

    // Warm should be faster (allow some tolerance for timer granularity)
    expect(warmResult.prewarmHit).toBe(true);
    expect(coldResult.prewarmHit).toBe(false);
    expect(warmTtft).toBeLessThan(coldTtft);

    const improvement = service.measureTtftImprovement(coldTtft, warmTtft);
    expect(improvement.improvementMs).toBeGreaterThan(0);
    expect(improvement.improvementPercent).toBeGreaterThan(0);

    await service.stop();
  });

  it('measureTtftImprovement calculates correctly', () => {
    const service = createService();
    const result = service.measureTtftImprovement(100, 20);
    expect(result.improvementMs).toBe(80);
    expect(result.improvementPercent).toBe(80);
  });
});

// ── Integration: codex-style flow ────────────────────────────

describe('Integration: prewarm + actual request', () => {
  it('codexFlow uses warmed connection', async () => {
    const service = createService({
      connectionFactory: createMockFactory(10)
    });
    await service.start();

    const { prewarm, response } = await service.codexFlow({
      sessionId: 'integration-sess-1',
      input: 'Hello, world!',
      model: 'gpt-4o'
    });

    expect(prewarm.turnState).toBe('integration-sess-1:turn-1');
    expect(response.turnState).toBe(prewarm.turnState);
    expect(response.prewarmHit).toBe(true);
    expect(response.replicaId).toBe(prewarm.replicaId);
    expect(response.sessionId).toBe('integration-sess-1');
    expect(service.getPoolStats().total).toBe(1);

    await service.stop();
  });

  it('prewarm + actual request integration with header', async () => {
    const service = createService();
    await service.start();

    // Step 1: Prewarm with generate=false and turn state header
    const prewarmResult = await service.createResponse({
      generate: false,
      headers: { [TURN_STATE_HEADER]: 'sess-int:turn-1' },
      sessionId: 'sess-int',
      model: 'test-model'
    });

    expect(prewarmResult.status).toBe('prewarmed');
    expect(prewarmResult.prewarmed).toBe(true);

    // Step 2: Actual request with same header should hit prewarmed connection
    const actualResult = await service.createResponse({
      input: 'What is the weather?',
      headers: { [TURN_STATE_HEADER]: 'sess-int:turn-1' },
      sessionId: 'sess-int'
    });

    expect(actualResult.prewarmHit).toBe(true);
    expect(actualResult.replicaId).toBe(prewarmResult.replicaId);
    expect(actualResult.ttftMs).toBeLessThan(50); // Should be fast due to prewarm
    expect(actualResult.prewarmed).toBe(false);

    await service.stop();
  });

  it('handles multiple sessions independently', async () => {
    const service = createService();
    await service.start();

    await service.prewarm({ turnState: 'sess-a:turn-1', replicaId: 'replica-a', sessionId: 'sess-a' });
    await service.prewarm({ turnState: 'sess-b:turn-1', replicaId: 'replica-b', sessionId: 'sess-b' });

    const resultA = await service.createResponse({
      turnState: 'sess-a:turn-1',
      sessionId: 'sess-a'
    });
    const resultB = await service.createResponse({
      turnState: 'sess-b:turn-1',
      sessionId: 'sess-b'
    });

    expect(resultA.replicaId).toBe('replica-a');
    expect(resultB.replicaId).toBe('replica-b');
    expect(resultA.prewarmHit).toBe(true);
    expect(resultB.prewarmHit).toBe(true);

    await service.stop();
  });

  it('service lifecycle: start, sleep, wakeup, stop', async () => {
    const service = createService();
    expect(service.state).toBe('stopped');

    await service.start();
    expect(service.state).toBe('active');

    await service.sleep();
    expect(service.state).toBe('sleeping');

    await service.wakeup();
    expect(service.state).toBe('active');

    await service.stop();
    expect(service.state).toBe('stopped');
    expect(service.pool.size).toBe(0);
  });
});

// ── Edge cases ───────────────────────────────────────────────

describe('Edge cases', () => {
  it('throws when service not started', async () => {
    const service = createService();
    await expect(service.createResponse({ turnState: 't1' })).rejects.toThrow('not active');
    await expect(service.prewarm({ turnState: 't1' })).rejects.toThrow('not active');
  });

  it('handles empty turn state by generating one', async () => {
    const service = createService();
    await service.start();

    const result = await service.createResponse({
      model: 'test-model'
    });

    expect(result.turnState).toBeDefined();
    expect(result.turnState.length).toBeGreaterThan(0);

    await service.stop();
  });

  it('pool exhausted throws', async () => {
    const sticky = createStickyRoutingTable();
    const pool = new WebSocketConnectionPool({
      stickyTable: sticky,
      maxPoolSize: 1,
      connectionFactory: () => Promise.resolve({})
    });

    await pool.createConnection('replica-a', 'turn-1');
    // Second connection should evict LRU ready
    await pool.createConnection('replica-b', 'turn-2');
    expect(pool.size).toBe(1);

    // Now make both in-use so no ready to evict
    const c1 = pool.acquire('turn-2');
    expect(c1).toBeDefined();
    // Pool has 1 in-use, size 1, max 1, no ready to evict -> should throw on next create?
    // Actually our implementation allows eviction only of ready, so if all in-use, it throws
    await expect(pool.createConnection('replica-c', 'turn-3')).rejects.toThrow('exhausted');
  });
});
