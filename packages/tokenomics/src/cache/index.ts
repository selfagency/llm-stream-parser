/**
 * Cache module — prompt cache annotation, semantic cache middleware,
 * and cache efficiency tracking.
 */

export type {
  CacheEfficiencySnapshot,
  ProviderCacheHeaders
} from './efficiency.js';
export {
  computeCacheEfficiency,
  parseProviderCacheHeaders
} from './efficiency.js';
export type {
  CacheAnnotatedContent,
  CacheAnnotatedMessage
} from './prompt-cache.js';
export {
  annotateCacheableSegments,
  stripCacheAnnotations
} from './prompt-cache.js';
export type {
  CreateSemanticCacheEntryOptions,
  EmbeddingFunction,
  NextFunction,
  SemanticCacheEntry,
  SemanticCacheResult
} from './semantic-cache.js';
export {
  cosineSimilarity,
  SemanticCacheMiddleware
} from './semantic-cache.js';
