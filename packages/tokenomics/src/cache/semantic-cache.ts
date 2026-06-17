/**
 * Semantic cache middleware for LLM responses.
 *
 * Intercepts requests by comparing query embeddings against a store of
 * previously cached responses using cosine similarity. When a sufficiently
 * similar query is found (threshold >= 0.95), the cached response is returned
 * instead of forwarding to the LLM, saving tokens and cost.
 *
 * Storage is an in-memory Map. A SQLite-backed persistence layer can be
 * swapped in later by implementing the same interface.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single entry in the semantic cache.
 */
export interface SemanticCacheEntry {
  /** Estimated cost saved in USD (cumulative). */
  costSavedUsd: number;
  /** When this entry was created. */
  createdAt: Date;
  /** The full embedding vector for cosine-similarity comparison. */
  embedding: number[];
  /** How many times this entry has been hit. */
  hitCount: number;
  /** Model ID that produced this response. */
  modelId: string;
  /** Tokens that were used to generate this response originally. */
  originalTokensUsed: number;
  /** Numeric hash of the query embedding (for quick equality checks). */
  queryEmbeddingHash: string;
  /** The cached response payload. */
  response: unknown;
  /** Total tokens served from cache (cumulative). */
  tokensServed: number;
}

/**
 * Options for creating a semantic cache entry.
 */
export interface CreateSemanticCacheEntryOptions {
  costSavedUsd?: number;
  embedding: number[];
  modelId: string;
  originalTokensUsed?: number;
  response: unknown;
  tokensServed?: number;
}

/**
 * Result of a cache lookup.
 */
export interface SemanticCacheResult {
  entry?: SemanticCacheEntry | undefined;
  hit: boolean;
  similarity: number;
}

/**
 * Embedding function signature — must return a normalized vector.
 */
export type EmbeddingFunction = (input: string) => Promise<number[]>;

/**
 * Next handler in the middleware chain.
 */
export type NextFunction = () => Promise<{ response: unknown; tokensUsed: number }>;

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

import { cosineSimilarity } from '../math-utils.js';

export { cosineSimilarity };

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Default similarity threshold for cache hits.
 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.95;

/**
 * Default cost per token (USD) used for savings estimation.
 */
const DEFAULT_COST_PER_TOKEN_USD = 0.000_003;

/**
 * Middleware that intercepts LLM requests and serves cached responses
 * when a semantically similar query has been seen before.
 */
export class SemanticCacheMiddleware {
  readonly #store: Map<string, SemanticCacheEntry>;
  readonly #threshold: number;
  readonly #costPerTokenUsd: number;

  constructor(options?: {
    threshold?: number;
    costPerTokenUsd?: number;
  }) {
    this.#store = new Map();
    this.#threshold = options?.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
    this.#costPerTokenUsd = options?.costPerTokenUsd ?? DEFAULT_COST_PER_TOKEN_USD;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Intercept an LLM request. If a semantically similar query is cached,
   * returns the cached response. Otherwise, calls `next()` and caches
   * the result.
   *
   * @param request  The query text to look up.
   * @param embed    Function that produces an embedding for the query.
   * @param next     Fallback handler that calls the LLM.
   * @returns The response (from cache or fresh).
   */
  async intercept(
    request: string,
    embed: EmbeddingFunction,
    next: NextFunction,
    modelId?: string
  ): Promise<{ response: unknown; fromCache: boolean; tokensUsed: number; costSavedUsd: number }> {
    const embedding = await embed(request);
    const lookup = this.#findBestMatch(embedding);

    if (lookup.hit && lookup.entry) {
      // Cache hit — increment counters and return cached response
      const entry = lookup.entry;
      entry.hitCount += 1;
      entry.tokensServed += entry.originalTokensUsed;
      entry.costSavedUsd += entry.originalTokensUsed * this.#costPerTokenUsd;

      return {
        response: entry.response,
        fromCache: true,
        tokensUsed: 0,
        costSavedUsd: entry.originalTokensUsed * this.#costPerTokenUsd
      };
    }

    // Cache miss — call the LLM
    const result = await next();
    const tokensUsed = result.tokensUsed;

    // Store in cache
    const hash = this.#computeHash(embedding);
    const entry: SemanticCacheEntry = {
      queryEmbeddingHash: hash,
      embedding,
      response: result.response,
      modelId: modelId ?? 'unknown',
      createdAt: new Date(),
      hitCount: 0,
      tokensServed: 0,
      costSavedUsd: 0,
      originalTokensUsed: tokensUsed
    };
    this.#store.set(hash, entry);

    return {
      response: result.response,
      fromCache: false,
      tokensUsed,
      costSavedUsd: 0
    };
  }

  /**
   * Store a response in the cache directly (bypassing the intercept flow).
   */
  store(options: CreateSemanticCacheEntryOptions): SemanticCacheEntry {
    const hash = this.#computeHash(options.embedding);
    const entry: SemanticCacheEntry = {
      queryEmbeddingHash: hash,
      embedding: options.embedding,
      response: options.response,
      modelId: options.modelId,
      createdAt: new Date(),
      hitCount: 0,
      tokensServed: options.tokensServed ?? 0,
      costSavedUsd: options.costSavedUsd ?? 0,
      originalTokensUsed: options.originalTokensUsed ?? 0
    };
    this.#store.set(hash, entry);
    return entry;
  }

  /**
   * Look up a query in the cache without executing the fallback.
   */
  async lookup(request: string, embed: EmbeddingFunction): Promise<SemanticCacheResult> {
    const embedding = await embed(request);
    return this.#findBestMatch(embedding);
  }

  /**
   * Remove all entries from the cache.
   */
  clear(): void {
    this.#store.clear();
  }

  /**
   * Number of entries in the cache.
   */
  get size(): number {
    return this.#store.size;
  }

  /**
   * Get all entries (for inspection / persistence).
   */
  entries(): SemanticCacheEntry[] {
    return [...this.#store.values()];
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Find the best matching entry for a given embedding.
   */
  #findBestMatch(embedding: number[]): SemanticCacheResult {
    let bestEntry: SemanticCacheEntry | undefined;
    let bestSimilarity = 0;

    for (const entry of this.#store.values()) {
      const similarity = cosineSimilarity(embedding, entry.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestEntry = entry;
      }
    }

    return {
      hit: bestSimilarity >= this.#threshold,
      entry: bestEntry,
      similarity: bestSimilarity
    };
  }

  /**
   * Compute a simple hash from an embedding vector for quick keying.
   */
  #computeHash(embedding: number[]): string {
    // Use the first few dimensions as a rough hash — collisions are resolved
    // by cosine similarity during lookup, so this is just for Map keying.
    return embedding
      .slice(0, 8)
      .map(n => n.toFixed(6))
      .join(':');
  }
}
