import { describe, expect, it } from 'vitest';
import type { MemoryItem } from '../cognitive/tier-types.js';
import { createDatabaseConnection } from '../database/connection.js';
import { initAgentFs } from './index.js';
import { createTierFsAdapter, type TierFsAdapterOptions } from './tier-adapter.js';

const BASE_CONFIG = {
  name: 'working_memory',
  level: 1,
  maxItems: Number.POSITIVE_INFINITY,
  maxTokens: Number.POSITIVE_INFINITY,
  ttlMs: Number.POSITIVE_INFINITY,
  consolidationThreshold: 0.8,
  compressionTarget: 0.5
} as const;

let makeItemCounter = 0;

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  const now = performance.now();
  return {
    id: `test-${(makeItemCounter++).toString(36)}`,
    kind: 'semantic',
    content: 'test content',
    tokenCount: 10,
    importance: 0.5,
    writeHeap: 'event',
    reuseClass: 'hot',
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    fingerprint: `fp-${now}`,
    metadata: {},
    ...overrides
  };
}

function createAdapter(
  overrides: { config?: Partial<typeof BASE_CONFIG> } & Partial<Omit<TierFsAdapterOptions, 'config'>> = {}
) {
  const { db, sqlite } = createDatabaseConnection({ path: ':memory:', walMode: false });
  initAgentFs({ sqlite });
  const { config: configOverride, ...rest } = overrides;
  return {
    db,
    adapter: createTierFsAdapter({
      config: { ...BASE_CONFIG, ...configOverride },
      db,
      tierName: 'working_memory',
      ...rest
    })
  };
}

describe('createTierFsAdapter', () => {
  it('writes and reads an item', () => {
    const { adapter } = createAdapter();
    const item = makeItem();
    const written = adapter.write(item);
    expect(written).toEqual(item);

    const result = adapter.read();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(item.id);
  });

  it('returns null when writing duplicate item', () => {
    const { adapter } = createAdapter();
    const item = makeItem();
    adapter.write(item);
    const duplicate = adapter.write(item);
    expect(duplicate).toBeNull();
  });

  it('respects maxItems capacity', () => {
    const { adapter } = createAdapter({
      config: {
        level: 1,
        maxItems: 2,
        maxTokens: Number.POSITIVE_INFINITY,
        ttlMs: Number.POSITIVE_INFINITY,
        consolidationThreshold: 0.8,
        compressionTarget: 0.5
      }
    });

    adapter.write(makeItem({ id: 'a' }));
    adapter.write(makeItem({ id: 'b' }));
    const rejected = adapter.write(makeItem({ id: 'c' }));
    expect(rejected).toBeNull();
  });

  it('reads filtered by minImportance', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'low', importance: 0.2 }));
    adapter.write(makeItem({ id: 'high', importance: 0.9 }));

    const result = adapter.read({ minImportance: 0.5, limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('high');
  });

  it('reads filtered by kind', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'a', kind: 'semantic' }));
    adapter.write(makeItem({ id: 'b', kind: 'episodic' }));

    const result = adapter.read({ kind: 'episodic', limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('b');
  });

  it('reads filtered by writeHeap', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'a', writeHeap: 'event' }));
    adapter.write(makeItem({ id: 'b', writeHeap: 'doc' }));

    const result = adapter.read({ writeHeap: 'doc', limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('b');
  });

  it('returns capacity stats', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'a', tokenCount: 10 }));

    const cap = adapter.capacity();
    expect(cap.usedItems).toBe(1);
    expect(cap.usedTokens).toBe(10);
  });

  it('evicts least important items', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'keep', importance: 0.9 }));
    adapter.write(makeItem({ id: 'evict', importance: 0.1 }));

    const evicted = adapter.evict(1);
    expect(evicted).toHaveLength(1);
    expect(evicted[0]?.id).toBe('evict');

    const result = adapter.read();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('keep');
  });

  it('clears all items', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'a' }));
    adapter.write(makeItem({ id: 'b' }));

    adapter.clear();
    expect(adapter.read().items).toHaveLength(0);
  });

  it('gets config', () => {
    const { adapter } = createAdapter();
    expect(adapter.config.level).toBe(1);
  });

  it('gets level', () => {
    const { adapter } = createAdapter();
    expect(adapter.level).toBe(1);
  });

  it('gets name', () => {
    const { adapter } = createAdapter();
    expect(adapter.name).toBe('working_memory');
  });

  it('lists all items', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'a' }));
    adapter.write(makeItem({ id: 'b' }));

    expect(adapter.items()).toHaveLength(2);
  });

  it('handles empty read', () => {
    const { adapter } = createAdapter();
    const result = adapter.read();
    expect(result.items).toHaveLength(0);
    expect(result.overflowed).toBe(false);
  });

  it('detects overflow', () => {
    const { adapter } = createAdapter();
    adapter.write(makeItem({ id: 'a' }));
    adapter.write(makeItem({ id: 'b' }));

    const result = adapter.read({ limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.overflowed).toBe(true);
  });

  it('promotes items to another tier', () => {
    const { adapter: source } = createAdapter({ tierName: 'sensory_buffer' });
    const { adapter: target } = createAdapter({ tierName: 'short_term_memory' });

    source.write(makeItem({ id: 'promote-me', importance: 0.9, tokenCount: 5 }));
    const promotedCount = source.promote(1, target);
    expect(promotedCount).toBe(1);

    const targetResult = target.read();
    expect(targetResult.items).toHaveLength(1);
    expect(targetResult.items[0]?.id).toBe('promote-me');

    const sourceResult = source.read();
    expect(sourceResult.items).toHaveLength(0);
  });

  it('demotes items from another tier', () => {
    const { adapter: source } = createAdapter({ tierName: 'short_term_memory' });
    const { adapter: target } = createAdapter({ tierName: 'sensory_buffer' });

    source.write(makeItem({ id: 'demote-me', importance: 0.1, tokenCount: 5 }));
    const demotedCount = target.demote(1, source);
    expect(demotedCount).toBe(1);

    expect(target.read().items).toHaveLength(1);
    expect(target.read().items[0]?.id).toBe('demote-me');
  });

  it('respects ttlMs expiration', () => {
    const clock = { now: 1000 };
    const { adapter } = createAdapter({
      config: {
        level: 1,
        maxItems: Number.POSITIVE_INFINITY,
        maxTokens: Number.POSITIVE_INFINITY,
        ttlMs: 500,
        consolidationThreshold: 0.8,
        compressionTarget: 0.5
      },
      now: () => clock.now
    });

    adapter.write(makeItem({ id: 'fresh', createdAt: clock.now }));
    clock.now = 2000;

    const result = adapter.read();
    expect(result.items).toHaveLength(0);
  });

  it('handles infinite ttl', () => {
    const clock = { now: 1000 };
    const { adapter } = createAdapter({
      config: {
        level: 1,
        maxItems: Number.POSITIVE_INFINITY,
        maxTokens: Number.POSITIVE_INFINITY,
        ttlMs: Number.POSITIVE_INFINITY,
        consolidationThreshold: 0.8,
        compressionTarget: 0.5
      },
      now: () => clock.now
    });

    adapter.write(makeItem({ id: 'forever', createdAt: clock.now }));
    clock.now = 1_000_000;

    expect(adapter.read().items).toHaveLength(1);
  });
});
