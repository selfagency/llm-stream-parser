/**
 * RetrievalService — daemon service that hosts the RAG pipeline.
 *
 * Provides:
 * - Query-time retrieval (embed query → vector search)
 * - Background indexing of semantic memory items
 * - Cross-session index reuse via UnifiedDB persistence
 * - Wiki invariant enforcement (only `kind: 'semantic'` items indexed)
 *
 * @module
 */

import { IndexingPipeline } from '@agentsy/retrieval';
import type { UnifiedDB } from '../db/unified-db.js';
import type { TimerScheduler } from '../jobs/bree-scheduler.js';
import type { CreateEmbeddingProviderOptions, EmbeddingProvider } from '../retrieval/index.js';
import { createEmbeddingProvider } from '../retrieval/index.js';
import type { Logger } from '../types.js';

// ── Types ──────────────────────────────────────────────

export interface RetrievalServiceDeps {
  db: UnifiedDB;
  embedderOptions?: CreateEmbeddingProviderOptions;
  logger: Logger;
  scheduler: TimerScheduler;
}

export interface RetrieveOptions {
  /** Maximum number of results to return (default: 10). */
  limit?: number;
  /** Minimum similarity threshold (0–1, default: 0.7). */
  minSimilarity?: number;
}

export interface RetrievedChunk {
  content: string;
  id: string;
  memoryItemId: string;
  scope: string;
  score: number;
}

// ── Helpers ────────────────────────────────────────────

/**
 * Hash a string to a deterministic 32-bit hex value.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.codePointAt(i) ?? 0;
    hash = Math.floor(hash * 31 + charCode);
  }
  return Math.abs(hash).toString(16);
}

// ── RetrievalService ───────────────────────────────────

export class RetrievalService {
  readonly name = 'retrieval';
  #state: 'stopped' | 'starting' | 'active' | 'sleeping' | 'stopping' = 'stopped';
  readonly #deps: RetrievalServiceDeps;
  readonly #embedder: EmbeddingProvider;
  readonly #chunker: IndexingPipeline;
  #indexJobId: string | null = null;

  constructor(deps: RetrievalServiceDeps) {
    this.#deps = deps;
    this.#embedder = createEmbeddingProvider(deps.embedderOptions);
    this.#chunker = new IndexingPipeline({ chunkSize: 256, chunkOverlap: 32 });
  }

  get state(): string {
    return this.#state;
  }

  async start(): Promise<void> {
    this.#state = 'starting';

    // Schedule background indexing — every 15 minutes
    this.#indexJobId = await this.#deps.scheduler.schedule({
      name: 'rag-index',
      type: 'interval',
      schedule: '900000', // 15 minutes
      handler: './jobs/rag-index.js',
      timeout: 60_000,
      scope: 'maintenance'
    });

    this.#state = 'active';
    this.#deps.logger.info('RetrievalService started');
  }

  async stop(): Promise<void> {
    this.#state = 'stopping';
    if (this.#indexJobId) {
      await this.#deps.scheduler.cancel(this.#indexJobId);
      this.#indexJobId = null;
    }
    this.#state = 'stopped';
    this.#deps.logger.info('RetrievalService stopped');
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async sleep(): Promise<void> {
    this.#state = 'sleeping';
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async wakeup(): Promise<void> {
    this.#state = 'active';
  }

  /**
   * Retrieve relevant chunks for a query.
   *
   * 1. Embeds the query using the configured embedder
   * 2. Vector search in UnifiedDB.rag_vectors (filtered by scope)
   * 3. Returns results sorted by cosine similarity
   */
  async retrieve(query: string, scope: string, options: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
    const limit = options.limit ?? 10;
    const minSimilarity = options.minSimilarity ?? 0.7;

    // 1. Embed the query
    const queryEmbedding = await this.#embedder.embed(query);

    // 2. Vector search — fetch all vectors for the scope and rank
    const rows = await this.#deps.db.query<{
      content: string;
      embedding: string;
      id: string;
      memory_item_id: string;
      scope: string;
    }>('SELECT id, scope, memory_item_id, content, embedding FROM rag_vectors WHERE scope = ?', [scope]);

    if (rows.length === 0) {
      return [];
    }

    // 3. Score and rank locally
    const scored: Array<{ chunk: RetrievedChunk; similarity: number }> = [];

    for (const row of rows) {
      let storedEmbedding: number[];
      try {
        storedEmbedding = JSON.parse(row.embedding) as number[];
      } catch {
        continue;
      }

      const similarity = this.#cosineSimilarity(queryEmbedding, storedEmbedding);
      if (similarity >= minSimilarity) {
        scored.push({
          chunk: {
            content: row.content,
            id: row.id,
            memoryItemId: row.memory_item_id,
            scope: row.scope,
            score: similarity
          },
          similarity
        });
      }
    }

    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, limit).map(s => s.chunk);
  }

  /**
   * Index a single content string as a memory (semantic) item.
   *
   * Splits the content into chunks, generates embeddings, and
   * stores them in UnifiedDB.rag_vectors.
   */
  async indexContent(
    content: string,
    memoryItemId: string,
    scope: string
  ): Promise<{ indexed: number; skipped: number }> {
    // Check if already indexed
    const existing = await this.#deps.db.querySingle<{ id: string }>(
      'SELECT id FROM rag_indexed WHERE memory_item_id = ?',
      [memoryItemId]
    );
    if (existing) {
      return { indexed: 0, skipped: 1 };
    }

    // Chunk the content
    const chunks = this.#chunker.chunk({ content, type: 'file', path: `memory://${scope}/${memoryItemId}` }, 'fixed');

    if (chunks.length === 0) {
      return { indexed: 0, skipped: 0 };
    }

    // Generate embeddings in batch
    const texts = chunks.map(c => c.content);
    const embeddings = await this.#embedder.embedBatch(texts);

    // Store in UnifiedDB
    let indexed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }
      const embedding = embeddings[i];
      if (!embedding) {
        continue;
      }

      const id = `rag-${hashString(`${memoryItemId}-${i}`)}`;
      await this.#deps.db.execute(
        `INSERT INTO rag_vectors (id, scope, memory_item_id, chunk_index, content, embedding)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, scope, memoryItemId, i, chunk.content, JSON.stringify(embedding)]
      );
      indexed++;
    }

    // Mark as indexed
    await this.#deps.db.execute('INSERT INTO rag_indexed (memory_item_id) VALUES (?)', [memoryItemId]);

    return { indexed, skipped: 0 };
  }

  /**
   * Background indexing — indexes all unindexed semantic memory items.
   *
   * Called by the Bree-scheduled rag-index job handler.
   */
  async indexNewContent(scope = 'default'): Promise<{ indexed: number; skipped: number }> {
    // Find memory_items of kind 'semantic' that haven't been indexed yet
    const unindexed = await this.#deps.db.query<{
      content: string;
      id: string;
    }>(
      `SELECT mi.id, mi.content FROM memory_items mi
       WHERE mi.kind = 'semantic' AND mi.scope = ?
       AND mi.id NOT IN (SELECT ri.memory_item_id FROM rag_indexed ri)`,
      [scope]
    );

    let totalIndexed = 0;
    let totalSkipped = 0;

    for (const item of unindexed) {
      const result = await this.indexContent(item.content, item.id, scope);
      totalIndexed += result.indexed;
      totalSkipped += result.skipped;
    }

    if (totalIndexed > 0) {
      this.#deps.logger.info('RAG indexing complete', {
        indexed: totalIndexed,
        skipped: totalSkipped,
        scope
      });
    }

    return { indexed: totalIndexed, skipped: totalSkipped };
  }

  /**
   * Delete all vectors associated with a memory item.
   */
  async deleteItem(memoryItemId: string): Promise<void> {
    await this.#deps.db.execute('DELETE FROM rag_vectors WHERE memory_item_id = ?', [memoryItemId]);
    await this.#deps.db.execute('DELETE FROM rag_indexed WHERE memory_item_id = ?', [memoryItemId]);
  }

  // ── Private ──────────────────────────────────────────

  #cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < Math.min(vecA.length, vecB.length); i++) {
      const a = vecA[i] ?? 0;
      const b = vecB[i] ?? 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }
}
