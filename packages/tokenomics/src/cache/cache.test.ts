import { describe, expect, it, vi } from 'vitest';
import { computeCacheEfficiency, parseProviderCacheHeaders } from './efficiency.js';
import type { CacheAnnotatedMessage } from './prompt-cache.js';
import { annotateCacheableSegments, stripCacheAnnotations } from './prompt-cache.js';
import { cosineSimilarity, SemanticCacheMiddleware } from './semantic-cache.js';

// =============================================================================
// prompt-cache.ts
// =============================================================================

describe('annotateCacheableSegments', () => {
  it('annotates system messages with cache_control', () => {
    const messages: CacheAnnotatedMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' }
    ];

    const result = annotateCacheableSegments(messages);

    expect(result[0]?.cache_control).toStrictEqual({ type: 'ephemeral' });
    expect(result[1]?.cache_control).toBeUndefined();
  });

  it('annotates content blocks within system messages', () => {
    const messages: CacheAnnotatedMessage[] = [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'You are a helpful assistant.' },
          { type: 'text', text: 'Follow these instructions.' }
        ]
      },
      { role: 'user', content: 'Hi' }
    ];

    const result = annotateCacheableSegments(messages);

    const content = result[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    for (const block of content as Array<{ type: string; cache_control?: { type: string } }>) {
      expect(block.cache_control).toStrictEqual({ type: 'ephemeral' });
    }
  });

  it('leaves user messages untouched', () => {
    const messages: CacheAnnotatedMessage[] = [
      { role: 'system', content: 'System prompt.' },
      { role: 'user', content: 'User message.' },
      { role: 'assistant', content: 'Assistant response.' }
    ];

    const result = annotateCacheableSegments(messages);

    expect(result[0]?.cache_control).toStrictEqual({ type: 'ephemeral' });
    expect(result[1]?.cache_control).toBeUndefined();
    expect(result[2]?.cache_control).toBeUndefined();
  });

  it('respects a custom staticBoundary', () => {
    const messages: CacheAnnotatedMessage[] = [
      { role: 'system', content: 'System.' },
      { role: 'user', content: 'First user.' },
      { role: 'assistant', content: 'Response.' },
      { role: 'user', content: 'Second user.' }
    ];

    const result = annotateCacheableSegments(messages, 2);

    expect(result[0]?.cache_control).toStrictEqual({ type: 'ephemeral' });
    expect(result[1]?.cache_control).toBeUndefined();
    expect(result[2]?.cache_control).toBeUndefined();
    expect(result[3]?.cache_control).toBeUndefined();
  });

  it('does not mutate the original messages array', () => {
    const messages: CacheAnnotatedMessage[] = [
      { role: 'system', content: 'System.' },
      { role: 'user', content: 'User.' }
    ];

    const result = annotateCacheableSegments(messages);

    expect(result).not.toBe(messages);
    expect(messages[0]?.cache_control).toBeUndefined();
  });

  it('handles empty message arrays', () => {
    const result = annotateCacheableSegments([]);
    expect(result).toStrictEqual([]);
  });

  it('handles messages with no system role', () => {
    const messages: CacheAnnotatedMessage[] = [
      { role: 'user', content: 'Hello.' },
      { role: 'assistant', content: 'Hi.' }
    ];

    const result = annotateCacheableSegments(messages);

    expect(result[0]?.cache_control).toBeUndefined();
    expect(result[1]?.cache_control).toBeUndefined();
  });
});

describe('stripCacheAnnotations', () => {
  it('removes cache_control from messages and content blocks', () => {
    const messages: CacheAnnotatedMessage[] = [
      {
        role: 'system',
        content: [{ type: 'text', text: 'Hello.', cache_control: { type: 'ephemeral' } }],
        cache_control: { type: 'ephemeral' }
      },
      { role: 'user', content: 'Hi.' }
    ];

    const result = stripCacheAnnotations(messages);

    expect((result[0] as Record<string, unknown>).cache_control).toBeUndefined();
    const content = result[0]?.content as Array<Record<string, unknown>>;
    expect(content[0]?.cache_control).toBeUndefined();
  });

  it('handles string content messages', () => {
    const messages: CacheAnnotatedMessage[] = [
      { role: 'system', content: 'Hello.', cache_control: { type: 'ephemeral' } }
    ];

    const result = stripCacheAnnotations(messages);

    expect((result[0] as Record<string, unknown>).cache_control).toBeUndefined();
    expect(result[0]?.content).toBe('Hello.');
  });
});

// =============================================================================
// semantic-cache.ts
// =============================================================================

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it('returns a value between 0 and 1 for similar vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 2.9];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.99);
    expect(sim).toBeLessThan(1);
  });

  it('returns 0 for vectors of different lengths', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it('returns 0 for zero-magnitude vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('SemanticCacheMiddleware', () => {
  it('returns cached response on similar query', async () => {
    const cache = new SemanticCacheMiddleware({ threshold: 0.9 });

    const embed = vi.fn(async (input: string) => {
      if (input === 'What is AI?') {
        return [1, 0, 0];
      }
      if (input === 'Tell me about AI') {
        return [0.99, 0.1, 0];
      }
      return [0, 0, 1];
    });

    const next = vi.fn(async () => ({ response: 'AI response', tokensUsed: 50 }));

    // First call — cache miss
    const first = await cache.intercept('What is AI?', embed, next);
    expect(first.fromCache).toBe(false);
    expect(first.response).toBe('AI response');
    expect(next).toHaveBeenCalledTimes(1);

    // Second call — similar query, should hit cache
    const second = await cache.intercept('Tell me about AI', embed, next);
    expect(second.fromCache).toBe(true);
    expect(second.response).toBe('AI response');
    expect(second.tokensUsed).toBe(0);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() on cache miss', async () => {
    const cache = new SemanticCacheMiddleware({ threshold: 0.95 });
    const embed = vi.fn(async () => [1, 0, 0]);
    const next = vi.fn(async () => ({ response: 'fresh', tokensUsed: 100 }));

    const result = await cache.intercept('test', embed, next);

    expect(result.fromCache).toBe(false);
    expect(result.response).toBe('fresh');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('stores entries via store() and retrieves via lookup()', async () => {
    const cache = new SemanticCacheMiddleware();
    const embedding = [1, 0, 0];

    await cache.store({
      embedding,
      response: 'cached response',
      modelId: 'claude-3-5-sonnet',
      originalTokensUsed: 100
    });

    const embed = vi.fn(async () => [1, 0, 0]);
    const result = await cache.lookup('test', embed);

    expect(result.hit).toBe(true);
    expect(result.entry?.response).toBe('cached response');
    expect(result.similarity).toBeCloseTo(1, 10);
  });

  it('clear() removes all entries', async () => {
    const cache = new SemanticCacheMiddleware({ threshold: 0.5 });
    const embed = vi.fn(async () => [1, 0, 0]);

    await cache.store({ embedding: [1, 0, 0], response: 'x', modelId: 'm' });
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);

    const result = await cache.lookup('test', embed);
    expect(result.hit).toBe(false);
  });

  it('entries() returns all stored entries', async () => {
    const cache = new SemanticCacheMiddleware();
    await cache.store({ embedding: [1, 0], response: 'a', modelId: 'm1' });
    await cache.store({ embedding: [0, 1], response: 'b', modelId: 'm2' });

    const entries = cache.entries();
    expect(entries).toHaveLength(2);
  });

  it('increments hitCount on cache hits', async () => {
    const cache = new SemanticCacheMiddleware({ threshold: 0.5 });
    const embed = vi.fn(async () => [1, 0, 0]);

    await cache.store({ embedding: [1, 0, 0], response: 'x', modelId: 'm' });

    await cache.intercept(
      'q1',
      embed,
      vi.fn(async () => ({ response: 'x', tokensUsed: 10 }))
    );
    await cache.intercept(
      'q2',
      embed,
      vi.fn(async () => ({ response: 'x', tokensUsed: 10 }))
    );

    const entries = cache.entries();
    expect(entries[0]?.hitCount).toBe(2);
  });
});

// =============================================================================
// efficiency.ts
// =============================================================================

describe('computeCacheEfficiency', () => {
  it('computes efficiency ratio correctly', () => {
    const result = computeCacheEfficiency(1000, 800, 200);

    expect(result.inputTokens).toBe(1000);
    expect(result.cacheHitTokens).toBe(800);
    expect(result.cacheWriteTokens).toBe(200);
    expect(result.cacheEfficiency).toBeCloseTo(0.6667, 3);
  });

  it('returns 0 efficiency when no input tokens', () => {
    const result = computeCacheEfficiency(0, 0, 0);
    expect(result.cacheEfficiency).toBe(0);
  });

  it('clamps efficiency to 1', () => {
    const result = computeCacheEfficiency(100, 200, 0);
    expect(result.cacheEfficiency).toBe(1);
  });

  it('computes estimated savings with custom price', () => {
    const result = computeCacheEfficiency(1000, 500, 200, 0.000_002);
    expect(result.estimatedSavingsUsd).toBe(500 * 0.000_002);
  });

  it('uses default price when not provided', () => {
    const result = computeCacheEfficiency(1000, 500, 200);
    expect(result.estimatedSavingsUsd).toBe(500 * 0.000_003);
  });
});

describe('parseProviderCacheHeaders', () => {
  it('parses Anthropic-style cache headers', () => {
    const result = parseProviderCacheHeaders({
      'x-cache': 'hit',
      'anthropic-cache-read-input-tokens': '500',
      'anthropic-cache-create-input-tokens': '200'
    });

    expect(result.cacheResult).toBe('hit');
    expect(result.cacheReadInputTokens).toBe(500);
    expect(result.cacheCreateInputTokens).toBe(200);
  });

  it('parses OpenAI-style cache headers', () => {
    const result = parseProviderCacheHeaders({
      'x-cache': 'miss',
      'x-cache-read-input-tokens': '300',
      'x-cache-write-input-tokens': '100'
    });

    expect(result.cacheResult).toBe('miss');
    expect(result.cacheReadInputTokens).toBe(300);
    expect(result.cacheCreateInputTokens).toBe(100);
  });

  it('handles missing headers gracefully', () => {
    const result = parseProviderCacheHeaders({});

    expect(result.cacheResult).toBeUndefined();
    expect(result.cacheReadInputTokens).toBeUndefined();
    expect(result.cacheCreateInputTokens).toBeUndefined();
  });

  it('preserves raw headers', () => {
    const result = parseProviderCacheHeaders({
      'X-Custom': 'value'
    });

    expect(result.raw['X-Custom']).toBe('value');
  });

  it('handles x-cache with extra text (e.g. "hit from disk")', () => {
    const result = parseProviderCacheHeaders({
      'x-cache': 'Hit from disk'
    });

    expect(result.cacheResult).toBe('hit');
  });

  it('returns undefined for non-numeric token headers', () => {
    const result = parseProviderCacheHeaders({
      'anthropic-cache-read-input-tokens': 'not-a-number'
    });

    expect(result.cacheReadInputTokens).toBeUndefined();
  });
});
