import { createHash } from 'node:crypto';

// Module-level LRU cache for ANSI output (500 entries)
const tokenCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;
const HASH_THRESHOLD = 1024; // Hash keys larger than 1KB

/**
 * Generate a SHA256 hash key for large content to reduce memory overhead.
 * For content smaller than HASH_THRESHOLD, returns content as-is for better debugging.
 */
function getCacheKey(content: string): string {
  if (content.length > HASH_THRESHOLD) {
    return `hash::${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  }
  return content;
}

export function getCachedAnsi(content: string, render: (s: string) => string): string {
  const key = getCacheKey(content);
  const cached = tokenCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const result = render(content);
  tokenCache.set(key, result);

  // Evict oldest if over limit
  if (tokenCache.size > MAX_CACHE_SIZE) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey !== undefined) {
      tokenCache.delete(firstKey);
    }
  }

  return result;
}

/**
 * Clear the cache (for testing only).
 * @internal
 */
export function _clearCacheForTesting(): void {
  tokenCache.clear();
}
