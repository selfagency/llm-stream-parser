import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../events/event-bus.js';
import type { RetrievalService } from '../services/retrieval-service.js';
import type { Logger } from '../types.js';
import { LearningJob } from './learning-job.js';

const testLogger: Logger = {
  child: () => testLogger,
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined
};

function createMockDb() {
  return {
    query: vi.fn(),
    execute: vi.fn(),
    querySingle: vi.fn(),
    transaction: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    migrate: vi.fn(),
    isOpen: true,
    mode: 'memory',
    queue: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  } as unknown as import('../db/unified-db.js').UnifiedDB;
}

function createMockRetrieval(): RetrievalService {
  return {
    indexNewContent: vi.fn().mockResolvedValue({ indexed: 3, skipped: 0 }),
    retrieve: vi.fn(),
    indexContent: vi.fn(),
    deleteItem: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    sleep: vi.fn(),
    wakeup: vi.fn(),
    name: 'retrieval',
    state: 'active'
  } as unknown as RetrievalService;
}

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(vi.fn())
  };
}

describe('LearningJob', () => {
  it('skips when no unprocessed events exist', async () => {
    const db = createMockDb();
    vi.mocked(db.query).mockResolvedValue([]);

    const job = new LearningJob({
      db,
      retrieval: createMockRetrieval(),
      eventBus: createMockEventBus(),
      logger: testLogger
    });

    const result = await job.run();
    expect(result.eventsProcessed).toBe(0);
    expect(result.semanticItemsCreated).toBe(0);
  });

  it('consolidates events into semantic items', async () => {
    const db = createMockDb();
    vi.mocked(db.query).mockResolvedValue([
      { id: 'evt-1', scope: 'default', content: 'User prefers dark mode', metadata: '{}', created_at: '2026-01-01' },
      { id: 'evt-2', scope: 'default', content: 'User prefers dark mode', metadata: '{}', created_at: '2026-01-02' },
      { id: 'evt-3', scope: 'default', content: 'User asked about pricing', metadata: '{}', created_at: '2026-01-03' }
    ]);
    vi.mocked(db.execute).mockResolvedValue(undefined);

    const retrieval = createMockRetrieval();
    const job = new LearningJob({
      db,
      retrieval,
      eventBus: createMockEventBus(),
      logger: testLogger
    });

    const result = await job.run();
    expect(result.eventsProcessed).toBe(3);
    expect(result.semanticItemsCreated).toBeGreaterThanOrEqual(2);
    // Should have called indexNewContent
    expect(retrieval.indexNewContent).toHaveBeenCalledWith('default');
  });

  it('skips when already running', async () => {
    const db = createMockDb();
    vi.mocked(db.query).mockResolvedValue([
      { id: 'evt-1', scope: 'default', content: 'test', metadata: '{}', created_at: '2026-01-01' }
    ]);

    const job = new LearningJob({
      db,
      retrieval: createMockRetrieval(),
      eventBus: createMockEventBus(),
      logger: testLogger
    });

    // First call starts
    const runPromise = job.run();
    // Second call should skip
    const result2 = await job.run();
    expect(result2.eventsProcessed).toBe(0);

    await runPromise;
  });

  it('subscribes to canary and observation-threshold events', () => {
    const eventBus = createMockEventBus();
    const job = new LearningJob({
      db: createMockDb(),
      retrieval: createMockRetrieval(),
      eventBus,
      logger: testLogger
    });

    expect(eventBus.subscribe).toHaveBeenCalledWith('memory.canary', expect.any(Function));
    expect(eventBus.subscribe).toHaveBeenCalledWith('memory.observation-threshold', expect.any(Function));
    expect(job.running).toBe(false);
  });

  it('handles retrieval indexing failure gracefully', async () => {
    const db = createMockDb();
    vi.mocked(db.query).mockResolvedValue([
      { id: 'evt-1', scope: 'default', content: 'test event', metadata: '{}', created_at: '2026-01-01' }
    ]);
    vi.mocked(db.execute).mockResolvedValue(undefined);

    const retrieval = createMockRetrieval();
    vi.mocked(retrieval.indexNewContent).mockRejectedValue(new Error('indexing failed'));

    const job = new LearningJob({
      db,
      retrieval,
      eventBus: createMockEventBus(),
      logger: testLogger
    });

    const result = await job.run();
    // Should still report events processed even if indexing fails
    expect(result.eventsProcessed).toBe(1);
    expect(result.indexed).toBe(0);
  });
});
