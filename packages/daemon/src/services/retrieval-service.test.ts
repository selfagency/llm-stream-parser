/**
 * Tests for RetrievalService.
 *
 * @module
 */

import { describe, expect, it, vi } from 'vitest';
import type { UnifiedDB } from '../db/unified-db.js';
import type { TimerScheduler } from '../jobs/bree-scheduler.js';
import type { Logger } from '../types.js';
import { RetrievalService } from './retrieval-service.js';

// ── Helpers ────────────────────────────────────────────

function createMockLogger(): Logger {
  return {
    child: () => createMockLogger(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  };
}

function createMockDb(): UnifiedDB {
  const store = new Map<string, unknown[]>();

  return {
    isOpen: true,
    mode: 'fallback',
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    migrate: vi.fn().mockResolvedValue(undefined),
    migrateFromLegacy: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn((sql: string, params?: unknown[]) => {
      // Store INSERTs for query to find
      if (sql.startsWith('INSERT INTO rag_vectors')) {
        const existing = store.get('rag_vectors') ?? [];
        existing.push({ sql, params });
        store.set('rag_vectors', existing);
      }
      if (sql.startsWith('INSERT INTO rag_indexed')) {
        const existing = store.get('rag_indexed') ?? [];
        existing.push({ sql, params });
        store.set('rag_indexed', existing);
      }
    }),
    query: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('rag_vectors') && sql.includes('WHERE scope = ?')) {
        const scope = params?.[0] as string;
        const vectors = (store.get('rag_vectors') ?? []) as Array<{
          params?: unknown[];
        }>;
        return vectors
          .filter(v => v.params?.[1] === scope)
          .map((_v, i) => ({
            content: `chunk content ${i}`,
            embedding: JSON.stringify(Array.from({ length: 32 }, () => 0.1)),
            id: `vec-${i}`,
            memory_item_id: `mem-${i}`,
            scope
          }));
      }
      if (sql.includes('rag_indexed') && sql.includes('memory_item_id = ?')) {
        const memId = params?.[0] as string;
        const indexed = (store.get('rag_indexed') ?? []) as Array<{
          params?: unknown[];
        }>;
        const found = indexed.find(v => v.params?.[0] === memId);
        return found ? [{ id: memId }] : [];
      }
      if (sql.includes('memory_items') && sql.includes("kind = 'semantic'")) {
        const scope = params?.[0] as string;
        if (scope === 'test-scope') {
          return [
            { id: 'mem-1', content: 'This is a test memory item about AI agents.' },
            { id: 'mem-2', content: 'Another memory item about vector search.' }
          ];
        }
        return [];
      }
      return [];
    }),
    querySingle: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('rag_indexed') && sql.includes('memory_item_id = ?')) {
        const memId = params?.[0] as string;
        const indexed = (store.get('rag_indexed') ?? []) as Array<{
          params?: unknown[];
        }>;
        const found = indexed.find(v => v.params?.[0] === memId);
        return found ? { id: memId } : null;
      }
      return null;
    }),
    queue: vi.fn(),
    stream: vi.fn(),
    transaction: vi.fn()
  } as unknown as UnifiedDB;
}

function createMockScheduler(): TimerScheduler {
  return {
    schedule: vi.fn().mockResolvedValue('sched_rag_index'),
    cancel: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    enqueue: vi.fn().mockResolvedValue('job_1'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    started: true
  } as unknown as TimerScheduler;
}

// ── Tests ──────────────────────────────────────────────

describe('RetrievalService', () => {
  describe('lifecycle', () => {
    it('starts and registers the background index job', async () => {
      const db = createMockDb();
      const scheduler = createMockScheduler();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler
      });

      expect(service.state).toBe('stopped');
      expect(service.name).toBe('retrieval');

      await service.start();
      expect(service.state).toBe('active');
      expect(scheduler.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'rag-index',
          type: 'interval',
          schedule: '900000'
        })
      );

      await service.stop();
      expect(service.state).toBe('stopped');
      expect(scheduler.cancel).toHaveBeenCalled();
    });

    it('sleep and wakeup transition state', async () => {
      const service = new RetrievalService({
        db: createMockDb(),
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      await service.sleep();
      expect(service.state).toBe('sleeping');

      await service.wakeup();
      expect(service.state).toBe('active');
    });
  });

  describe('indexContent', () => {
    it('indexes content and stores vectors', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      const result = await service.indexContent(
        'This is a test memory item about AI agents and their capabilities.',
        'mem-1',
        'test-scope'
      );

      expect(result.indexed).toBeGreaterThan(0);
      expect(result.skipped).toBe(0);
      expect(db.execute).toHaveBeenCalled();
    });

    it('skips already indexed items', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      // Index once
      await service.indexContent('Test content', 'mem-1', 'test-scope');

      // Index again — should skip
      const result = await service.indexContent('Test content', 'mem-1', 'test-scope');
      expect(result.indexed).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe('retrieve', () => {
    it('returns empty results when no vectors exist', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      const results = await service.retrieve('test query', 'empty-scope');
      expect(results).toEqual([]);
    });

    it('returns ranked results when vectors exist', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      // Index some content first
      await service.indexContent(
        'AI agents use vector search for retrieval augmented generation.',
        'mem-1',
        'test-scope'
      );

      const results = await service.retrieve('vector search', 'test-scope', { minSimilarity: 0 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.content).toBeTruthy();
      expect(results[0]?.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('indexNewContent', () => {
    it('indexes unindexed semantic memory items', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      const result = await service.indexNewContent('test-scope');
      expect(result.indexed).toBeGreaterThan(0);
    });

    it('returns zero for scope with no unindexed items', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      const result = await service.indexNewContent('empty-scope');
      expect(result.indexed).toBe(0);
    });
  });

  describe('deleteItem', () => {
    it('deletes vectors and index record', async () => {
      const db = createMockDb();
      const service = new RetrievalService({
        db,
        logger: createMockLogger(),
        scheduler: createMockScheduler()
      });

      await service.indexContent('Test content', 'mem-1', 'test-scope');
      await service.deleteItem('mem-1');

      expect(db.execute).toHaveBeenCalledWith('DELETE FROM rag_vectors WHERE memory_item_id = ?', ['mem-1']);
      expect(db.execute).toHaveBeenCalledWith('DELETE FROM rag_indexed WHERE memory_item_id = ?', ['mem-1']);
    });
  });
});
