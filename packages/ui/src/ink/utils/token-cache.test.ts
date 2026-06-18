import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _clearCacheForTesting, getCachedAnsi } from './token-cache.ts';

describe('Token Cache with Hashing', () => {
  beforeEach(() => {
    // Clear cache between tests
    _clearCacheForTesting();
  });

  it('caches small strings without hashing', () => {
    const renderFn = vi.fn<(s: string) => string>((s: string) => `[rendered:${s}]`);
    const content = 'small text';

    const result1 = getCachedAnsi(content, renderFn);
    const result2 = getCachedAnsi(content, renderFn);

    expect(result1).toBe('[rendered:small text]');
    expect(result2).toBe('[rendered:small text]');
    // Should only render once due to cache hit
    expect(renderFn).toHaveBeenCalledOnce();
  });

  it('hashes large strings (>1KB) to reduce memory overhead', () => {
    const renderFn = vi.fn<(s: string) => string>((s: string) => `[rendered:${s.length}]`);
    // Create content larger than 1KB
    const largeContent = 'x'.repeat(2000);

    const result1 = getCachedAnsi(largeContent, renderFn);
    const result2 = getCachedAnsi(largeContent, renderFn);

    expect(result1).toBe('[rendered:2000]');
    expect(result2).toBe('[rendered:2000]');
    // Should only render once due to cache hit with hashed key
    expect(renderFn).toHaveBeenCalledOnce();
  });

  it('uses consistent hashes for large strings', () => {
    const renderFn = vi.fn<(_s: string) => string>((_s: string) => '[cached]');
    const largeContent = 'a'.repeat(2000);

    const result1 = getCachedAnsi(largeContent, renderFn);
    const result2 = getCachedAnsi(largeContent, renderFn);

    expect(result1).toBe('[cached]');
    expect(result2).toBe('[cached]');
    expect(renderFn).toHaveBeenCalledOnce();
  });

  it('differentiates between different large strings', () => {
    const renderFn = vi.fn<(_: string) => string>((_: string) => '[rendered]');
    const content1 = 'a'.repeat(2000);
    const content2 = 'b'.repeat(2000);

    getCachedAnsi(content1, renderFn);
    getCachedAnsi(content2, renderFn);

    // Should render both separately since they have different content
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  it('handles boundary case at exactly 1KB', () => {
    const renderFn = vi.fn<(_: string) => string>((_: string) => '[rendered]');
    const content1024 = 'x'.repeat(1024);
    const content1025 = 'x'.repeat(1025);

    getCachedAnsi(content1024, renderFn);
    getCachedAnsi(content1025, renderFn);

    // 1024 bytes should not be hashed (still uses content as key)
    // 1025 bytes should be hashed
    expect(renderFn).toHaveBeenCalledTimes(2);
  });

  it('caches mixed small and large content independently', () => {
    const renderFn = vi.fn<(s: string) => string>((s: string) => `[rendered:${s.length}]`); // s is intentionally used for length calculation
    const smallContent = 'small';
    const largeContent = 'x'.repeat(2000);

    getCachedAnsi(smallContent, renderFn);
    getCachedAnsi(largeContent, renderFn);
    getCachedAnsi(smallContent, renderFn); // Should hit cache
    getCachedAnsi(largeContent, renderFn); // Should hit cache

    expect(renderFn).toHaveBeenCalledTimes(2);
  });
});
