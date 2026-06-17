import { eq, like } from 'drizzle-orm';
import type { MemoryDatabase } from '../database/connection.js';
import { kvStore } from '../database/schema.js';
import { cosineSimilarity } from '../math-utils.js';
import { getDiff } from '../wiki/wiki-utils.js';
import type { PageDiff } from '../wiki/wiki-utils.js';
import type {
  ConceptRelation,
  RawCapture,
  RawCaptureInput,
  VectorSearchResult,
  WikiManager,
  WikiPage,
  WikiPageHistoryEntry,
  WikiPageInput
} from '../wiki/wiki-manager.js';

export interface WikiFsAdapterOptions {
  db: MemoryDatabase;
  namespace?: string | undefined;
}

function makePageMetaKey(namespace: string, pageId: string): string {
  return `wiki:${namespace}:page:${pageId}:meta`;
}

function makePageVectorKey(namespace: string, pageId: string): string {
  return `wiki:${namespace}:page:${pageId}:vector`;
}

function makeHistoryKey(namespace: string, pageId: string, version: number): string {
  return `wiki:${namespace}:page:${pageId}:history:${version}`;
}

function makeConceptKey(namespace: string, fromPageId: string, toPageId: string, relation: string): string {
  return `wiki:${namespace}:concept:${fromPageId}:${toPageId}:${relation}`;
}

function makeBacklinkKey(namespace: string, fromPageId: string, toPageId: string): string {
  return `wiki:${namespace}:backlink:${fromPageId}:${toPageId}`;
}

function parseMeta(value: string): WikiPage {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return {
    pageId: String(parsed.pageId),
    title: String(parsed.title),
    body: String(parsed.body),
    tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
    format: String(parsed.format) as WikiPage['format'],
    writerIds: Array.isArray(parsed.writerIds) ? (parsed.writerIds as string[]) : [],
    version: Number(parsed.version),
    updatedAt: new Date(Number(parsed.updatedAt))
  };
}

function serializeMeta(page: WikiPage): string {
  return JSON.stringify({
    ...page,
    updatedAt: page.updatedAt.getTime()
  });
}

function parseVector(value: string): number[] {
  return JSON.parse(value) as number[];
}

function parseHistory(value: string): WikiPageHistoryEntry {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return {
    version: Number(parsed.version),
    body: String(parsed.body),
    actorId: String(parsed.actorId),
    editedAt: new Date(Number(parsed.editedAt))
  };
}

function serializeHistory(entry: WikiPageHistoryEntry): string {
  return JSON.stringify({
    ...entry,
    editedAt: entry.editedAt.getTime()
  });
}

/** Build a WikiPage from input, merging with existing data and defaults. */
// NOSONAR — multi-field conditional merge with defaults; structural complexity inherent to domain
function buildPage(input: WikiPageInput, existing: WikiPage | null): WikiPage {
  const now = Date.now();
  const version = existing ? existing.version + 1 : 1;
  return {
    pageId: input.pageId,
    title: input.title ?? existing?.title ?? input.pageId,
    body: input.body ?? existing?.body ?? '',
    tags: input.tags ?? existing?.tags ?? [],
    format: input.format ?? existing?.format ?? 'markdown',
    writerIds: input.writerIds ?? existing?.writerIds ?? [],
    version,
    updatedAt: new Date(now)
  };
}

// biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
async function captureRaw(input: RawCaptureInput): Promise<RawCapture> {
  return {
    id: `capture-${Date.now()}`,
    content: input.content,
    sourceType: input.sourceType ?? 'text',
    sourceId: input.sourceId ?? 'unknown',
    normalizedContent: input.content.trim(),
    createdAt: new Date()
  };
}

/**
 * Create a WikiManager adapter backed by AgentFS tables.
 * Page metadata and embeddings live in `kv_store`; page body content
 * is also stored in `kv_store` for the initial implementation, with
 * `fs_data` reserved for chunked large-content storage in a future pass.
 */
export function createWikiFsAdapter(options: WikiFsAdapterOptions): WikiManager {
  const { db, namespace = 'default' } = options;
  const metaPrefix = `wiki:${namespace}:page:`;
  const conceptPrefix = `wiki:${namespace}:concept:`;
  const backlinkPrefix = `wiki:${namespace}:backlink:`;

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function getPage(pageId: string): Promise<WikiPage | null> {
    const row = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(eq(kvStore.key, makePageMetaKey(namespace, pageId)))
      .get();

    if (!row) {
      return null;
    }
    try {
      return parseMeta(row.value);
    } catch {
      return null;
    }
  }

  /** Write page meta to kv_store (upsert). */
  function writePageMeta(page: WikiPage): void {
    const now = Math.floor(Date.now() / 1000);
    db.insert(kvStore)
      .values({ key: makePageMetaKey(namespace, page.pageId), value: serializeMeta(page), updatedAt: now })
      .onConflictDoUpdate({ target: kvStore.key, set: { value: serializeMeta(page), updatedAt: now } })
      .run();
  }

  /** Append a history entry to kv_store. */
  function appendPageHistory(page: WikiPage, actorId: string): void {
    const now = Math.floor(Date.now() / 1000);
    const entry: WikiPageHistoryEntry = {
      version: page.version,
      body: page.body,
      actorId,
      editedAt: new Date(now * 1000)
    };
    db.insert(kvStore)
      .values({
        key: makeHistoryKey(namespace, page.pageId, page.version),
        value: serializeHistory(entry),
        updatedAt: now
      })
      .run();
  }

  async function upsertPage(input: WikiPageInput): Promise<WikiPage> {
    const existing = await getPage(input.pageId);
    const page = buildPage(input, existing);
    writePageMeta(page);
    appendPageHistory(page, input.actorId ?? 'system');
    return page;
  }

  async function updatePage(
    pageId: string,
    patch: Partial<Pick<WikiPageInput, 'title' | 'body' | 'tags' | 'format'>>,
    actorId: string
  ): Promise<WikiPage> {
    const existing = await getPage(pageId);
    if (!existing) {
      throw new Error(`Page not found: ${pageId}`);
    }

    const version = existing.version + 1;
    const page: WikiPage = {
      ...existing,
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.body === undefined ? {} : { body: patch.body }),
      ...(patch.tags === undefined ? {} : { tags: patch.tags }),
      ...(patch.format === undefined ? {} : { format: patch.format }),
      version,
      updatedAt: new Date()
    };

    writePageMeta(page);
    appendPageHistory(page, actorId);
    return page;
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function getPageHistory(pageId: string): Promise<WikiPageHistoryEntry[]> {
    const rows = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(like(kvStore.key, `${makeHistoryKey(namespace, pageId, 0).replace(/:0$/, '')}%`))
      .all();

    const entries: WikiPageHistoryEntry[] = [];
    for (const row of rows) {
      try {
        entries.push(parseHistory(row.value));
      } catch {
        // skip malformed
      }
    }
    entries.sort((a, b) => a.version - b.version);
    return entries;
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function diffPageVersions(pageId: string, fromVersion: number, toVersion: number): Promise<PageDiff> {
    const fromRow = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(eq(kvStore.key, makeHistoryKey(namespace, pageId, fromVersion)))
      .get();

    const toRow = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(eq(kvStore.key, makeHistoryKey(namespace, pageId, toVersion)))
      .get();

    if (!(fromRow && toRow)) {
      throw new Error('One or both versions not found');
    }

    const fromBody = parseHistory(fromRow.value).body;
    const toBody = parseHistory(toRow.value).body;
    return getDiff(fromBody, toBody);
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function upsertVector(pageId: string, embedding: number[]): Promise<void> {
    const now = Date.now();
    db.insert(kvStore)
      .values({
        key: makePageVectorKey(namespace, pageId),
        value: JSON.stringify(embedding),
        updatedAt: Math.floor(now / 1000)
      })
      .onConflictDoUpdate({
        target: kvStore.key,
        set: { value: JSON.stringify(embedding), updatedAt: Math.floor(now / 1000) }
      })
      .run();
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function searchVector(queryEmbedding: number[], limit: number): Promise<VectorSearchResult[]> {
    const rows = db
      .select({ key: kvStore.key, value: kvStore.value })
      .from(kvStore)
      .where(like(kvStore.key, `${metaPrefix}%:vector`))
      .all();

    const scored: VectorSearchResult[] = [];
    for (const row of rows) {
      try {
        const embedding = parseVector(row.value);
        const pageId = row.key.split(':')[3];
        if (!pageId) {
          continue;
        }
        const score = cosineSimilarity(queryEmbedding, embedding);
        scored.push({ pageId, score });
      } catch {
        // skip malformed
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function searchFullText(query: string, limit: number): Promise<VectorSearchResult[]> {
    const q = query.toLowerCase();
    const rows = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(like(kvStore.key, `${metaPrefix}%:meta`))
      .all();

    const scored: VectorSearchResult[] = [];
    for (const row of rows) {
      try {
        const page = parseMeta(row.value);
        const searchable = `${page.title} ${page.body}`.toLowerCase();
        const terms = q.split(/\s+/u).filter(Boolean);
        const hits = terms.filter(term => searchable.includes(term)).length;
        if (hits > 0) {
          scored.push({ pageId: page.pageId, score: hits / terms.length });
        }
      } catch {
        // skip malformed
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async function searchHybrid(query: string, queryEmbedding: number[], limit: number): Promise<VectorSearchResult[]> {
    const [textResults, vectorResults] = await Promise.all([
      searchFullText(query, limit * 2),
      searchVector(queryEmbedding, limit * 2)
    ]);

    const vectorMap = new Map<string, number>();
    for (const r of vectorResults) {
      vectorMap.set(r.pageId, r.score);
    }

    const hybrid: VectorSearchResult[] = [];
    const seen = new Set<string>();

    for (const r of textResults) {
      seen.add(r.pageId);
      const vScore = vectorMap.get(r.pageId) ?? 0;
      hybrid.push({ pageId: r.pageId, score: r.score * 0.5 + vScore * 0.5 });
    }

    for (const r of vectorResults) {
      if (seen.has(r.pageId) === false) {
        hybrid.push({ pageId: r.pageId, score: r.score * 0.5 });
      }
    }

    hybrid.sort((a, b) => b.score - a.score);
    return hybrid.slice(0, limit);
  }

  async function extractEntities(pageId: string): Promise<string[]> {
    const page = await getPage(pageId);
    if (!page) {
      return [];
    }
    // Basic entity extraction: capitalize words that look like proper nouns
    const matches = page.body.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/gu);
    return [...new Set(matches ?? [])];
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function linkConcepts(fromPageId: string, toPageId: string, relation: string): Promise<void> {
    const now = Date.now();
    db.insert(kvStore)
      .values({
        key: makeConceptKey(namespace, fromPageId, toPageId, relation),
        value: JSON.stringify({ fromPageId, toPageId, relation }),
        updatedAt: Math.floor(now / 1000)
      })
      .run();
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function getConceptRelations(pageId: string): Promise<ConceptRelation[]> {
    const rows = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(like(kvStore.key, `${conceptPrefix}${pageId}:%`))
      .all();

    const relations: ConceptRelation[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value) as Record<string, unknown>;
        relations.push({
          toPageId: String(parsed.toPageId),
          relation: String(parsed.relation)
        });
      } catch {
        // skip malformed
      }
    }
    return relations;
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function linkPages(fromPageId: string, toPageId: string): Promise<void> {
    const now = Date.now();
    db.insert(kvStore)
      .values({
        key: makeBacklinkKey(namespace, fromPageId, toPageId),
        value: JSON.stringify({ fromPageId, toPageId }),
        updatedAt: Math.floor(now / 1000)
      })
      .run();
  }

  // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
  async function getBacklinks(pageId: string): Promise<string[]> {
    const rows = db
      .select({ value: kvStore.value })
      .from(kvStore)
      .where(like(kvStore.key, `${backlinkPrefix}%:${pageId}`))
      .all();

    const backlinks: string[] = [];
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value) as Record<string, unknown>;
        backlinks.push(String(parsed.fromPageId));
      } catch {
        // skip malformed
      }
    }
    return backlinks;
  }

  return {
    captureRaw,
    upsertPage,
    getPage,
    upsertVector,
    searchVector,
    updatePage,
    getPageHistory,
    diffPageVersions,
    searchFullText,
    searchHybrid,
    extractEntities,
    linkConcepts,
    getConceptRelations,
    linkPages,
    getBacklinks
  };
}
