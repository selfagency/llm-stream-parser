
## 12. Phase 7 — RAG as Daemon Service

**Priority**: P2 — Sprint 3 (parallel with Phase 6)
**Story points**: 4
**Branch**: `feat/rag-daemon-service`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`)
**Unblocks**: Phase 8 (learning loop consumes retrieval results), Phase 10 (RetrievalFirewallScanner needs RAG hooks)
**Supports findings**: E-20 (retrieval surface), E-35 (indirect prompt injection from retrieved context)

### 12.1 Current State

The `@agentsy/retrieval` package exists with chunking, embedding, and vector store abstractions, but the wiring is incomplete. There's no background indexing, no cross-session index reuse, and the wiki invariant (index synthesized pages, not raw events) is not enforced.

### 12.2 Plan: Correct Basics First

Two sub-phases:

**7.1 Fix existing retrieval**:

- Verify chunking strategy (recursive character splitter with overlap).
- Verify embedding generation (default to OpenAI `text-embedding-3-small`).
- Verify vector store (`UnifiedDB.rag_vectors` table, using sqlite-vec extension or Honker's vector ops).
- Wire `RetrievalFirewallScanner` (Phase 10) to re-scan retrieved content for prompt injection.

**7.2 RAG as daemon service**:

- `RetrievalService` runs as a `Service` in the daemon.
- Background indexing job (Bree-scheduled) runs every N minutes to index new content.
- Cross-session index reuse — the same `~/.agentsy/agentsy.db` serves all sessions in a folder scope.
- Wiki invariant — index synthesized `memory_items` of `kind: 'semantic'`, not raw `memory_items` of `kind: 'event'`.

### 12.3 RetrievalService

```typescript
// packages/daemon/src/services/retrieval-service.ts

export class RetrievalService implements Service {
  readonly name = 'retrieval';

  async start(): Promise<void> {
    // Schedule background indexing
    this.scheduler.schedule('rag-index', {
      cron: '*/15 * * * *',   // Every 15 minutes
      handler: () => this.indexNewContent(),
    });
  }

  async retrieve(query: string, scope: string, options: RetrieveOptions): Promise<RetrievedChunk[]> {
    // 1. Embed the query
    const queryEmbedding = await this.embedder.embed(query);

    // 2. Vector search in UnifiedDB.rag_vectors (filtered by scope)
    const candidates = await this.db.query<VectorRow>(
      'SELECT * FROM rag_vectors WHERE scope = ? ORDER BY vec_distance(embedding, ?) LIMIT ?',
      [scope, queryEmbedding, options.limit ?? 10]
    );

    // 3. Re-rank (optional, future: RRF, Lost-in-Middle)
    // 4. RetrievalFirewallScanner (Phase 10) re-scans for prompt injection
    const safe = await this.firewallScanner.scan(candidates.map(c => c.content));

    return safe;
  }

  private async indexNewContent(): Promise<void> {
    // Find memory_items of kind: 'semantic' that haven't been indexed yet
    const unindexed = await this.db.query(
      `SELECT * FROM memory_items
       WHERE kind = 'semantic' AND scope = ?
       AND id NOT IN (SELECT memory_item_id FROM rag_indexed)`,
      [this.scope]
    );

    for (const item of unindexed) {
      const chunks = this.chunker.split(item.content);
      for (const chunk of chunks) {
        const embedding = await this.embedder.embed(chunk);
        await this.db.execute(
          'INSERT INTO rag_vectors (id, scope, memory_item_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), item.scope, item.id, chunk.index, chunk.text, embedding]
        );
        await this.db.execute('INSERT INTO rag_indexed (memory_item_id) VALUES (?)', [item.id]);
      }
    }
  }
}
```

### 12.4 Future Enhancements (not in this phase)

- **HyDE** (Hypothetical Document Embeddings) — generate a hypothetical answer to the query, embed it, and use it for retrieval.
- **RRF** (Reciprocal Rank Fusion) — combine results from multiple retrieval strategies.
- **Lost-in-Middle** mitigation — re-order retrieved chunks so the most relevant are at the beginning and end of the context, not the middle.

### 12.5 Tests

- Unit: `RetrievalService.retrieve` returns relevant chunks ranked by vector distance.
- Unit: `indexNewContent` only indexes `kind: 'semantic'` items not already in `rag_indexed`.
- Integration: daemon restart preserves vector index; retrieval works immediately after restart.
- Integration: RetrievalFirewallScanner (Phase 10) blocks retrieved content with prompt injection.

### 12.6 Verification

- [x] `RetrievalService` runs as a `Service` in the daemon
- [x] Background indexing job scheduled and runs
- [x] Vector index persists in `UnifiedDB.rag_vectors`
- [x] Wiki invariant enforced (only `kind: 'semantic'` items indexed)
- [x] `pnpm check-types && pnpm lint && pnpm test` green

---
