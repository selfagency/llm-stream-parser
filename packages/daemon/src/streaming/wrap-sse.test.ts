/**
 * Tests for wrapSSE idle timeout wrapper.
 */

import { describe, expect, it, vi } from 'vitest';
import { wrapSSE } from './wrap-sse.js';

// =============================================================================
// Helpers
// =============================================================================

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

async function* createSource<T>(items: T[], delayMs = 0): AsyncGenerator<T> {
  for (const item of items) {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    yield item;
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('wrapSSE', () => {
  it('yields all chunks from the source', async () => {
    const source = createSource(['a', 'b', 'c']);
    const wrapped = wrapSSE(source, { idleTimeout: 5000 });
    const result = await collect(wrapped);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('yields nothing from an empty source', async () => {
    const source = createSource([]);
    const wrapped = wrapSSE(source, { idleTimeout: 5000 });
    const result = await collect(wrapped);
    expect(result).toEqual([]);
  });

  it('aborts on idle timeout', async () => {
    const source = createSource(['a'], 50);
    const wrapped = wrapSSE(source, { idleTimeout: 20 });

    await expect(collect(wrapped)).rejects.toThrow('Idle timeout');
  });

  it('resets idle timer on each chunk', async () => {
    // Chunks arrive every 10ms, idle timeout is 50ms — should complete
    const source = createSource(['a', 'b', 'c', 'd', 'e'], 10);
    const wrapped = wrapSSE(source, { idleTimeout: 50 });
    const result = await collect(wrapped);
    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('aborts on external signal', async () => {
    const controller = new AbortController();
    const source = createSource(['a', 'b', 'c'], 10);
    const wrapped = wrapSSE(source, { idleTimeout: 5000, signal: controller.signal });

    // Schedule abort after first chunk
    setTimeout(() => controller.abort('Cancelled'), 15);

    await expect(collect(wrapped)).rejects.toThrow('Cancelled');
  });

  it('cleans up timer on completion', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const source = createSource(['x']);
    const wrapped = wrapSSE(source, { idleTimeout: 5000 });
    await collect(wrapped);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
