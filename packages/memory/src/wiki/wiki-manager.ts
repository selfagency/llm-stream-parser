import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { createWikiFsAdapter } from '../agentfs/wiki-adapter.js';
import type { MemoryDatabase } from '../database/connection.js';
import { wikiBacklinks, wikiConcepts, wikiPageHistory, wikiPages, wikiVectors } from '../database/schema.js';
import { cosineSimilarity } from '../math-utils.js';
import type { ContentProcessor } from './content-processor.js';
import { createContentProcessor } from './content-processor.js';
import type { EntityExtractor } from './entity-extractor.js';
import { createEntityExtractor } from './entity-extractor.js';
import type { LocalEmbeddingEngine } from './local-embedding-engine.js';
import { createLocalEmbeddingEngine } from './local-embedding-engine.js';
import type { NavigationSystem } from './navigation-system.js';
import { createNavigationSystem } from './navigation-system.js';
import type { VersionTracker } from './version-tracker.js';
import { createVersionTracker } from './version-tracker.js';

export type RawSourceType = 'document' | 'conversation' | 'capture';

/** Input payload for capturing raw unstructured content into the wiki. */
export interface RawCaptureInput {
  content: string;
  sourceId: string;
  sourceType: RawSourceType;
}

/** Stored record of a raw content capture, including normalized text. */
export interface RawCapture {
  content: string;
  createdAt: Date;
  id: string;
  normalizedContent: string;
  sourceId: string;
  sourceType: RawSourceType;
}

/** Input payload for creating or updating a wiki page. */
export interface WikiPageInput {
  actorId?: string;
  body: string;
  format?: 'markdown' | 'text' | 'code' | 'json';
  pageId: string;
  tags?: string[];
  title: string;
  writerIds?: string[];
}

/** A wiki page stored in the knowledge base. */
export interface WikiPage {
  body: string;
  format: 'markdown' | 'text' | 'code' | 'json';
  pageId: string;
  tags: string[];
  title: string;
  updatedAt: Date;
  version: number;
  writerIds: string[];
}

/** A single historical revision entry for a wiki page. */
export interface WikiPageHistoryEntry {
  actorId: string;
  body: string;
  editedAt: Date;
  version: number;
}

/** Added and removed lines between two page versions. */
export interface PageDiff {
  addedLines: string[];
  removedLines: string[];
}

/** A semantic relation linking one wiki page to another. */
export interface ConceptRelation {
  relation: string;
  toPageId: string;
}

/** A vector embedding entry for semantic search. */
export interface VectorEntry {
  embedding: number[];
  pageId: string;
}

/** Result from a vector or hybrid search query. */
export interface VectorSearchResult {
  pageId: string;
  score: number;
}

/** Facade over the wiki knowledge base — pages, vector search, entity linking, version history. */
export interface WikiManager {
  captureRaw(input: RawCaptureInput): Promise<RawCapture>;
  diffPageVersions(pageId: string, fromVersion: number, toVersion: number): Promise<PageDiff>;
  extractEntities(pageId: string): Promise<string[]>;
  getBacklinks(pageId: string): Promise<string[]>;
  getConceptRelations(pageId: string): Promise<ConceptRelation[]>;
  getPage(pageId: string): Promise<WikiPage | null>;
  getPageHistory(pageId: string): Promise<WikiPageHistoryEntry[]>;
  linkConcepts(fromPageId: string, toPageId: string, relation: string): Promise<void>;
  linkPages(fromPageId: string, toPageId: string): Promise<void>;
  searchFullText(query: string, limit: number): Promise<VectorSearchResult[]>;
  searchHybrid(query: string, queryEmbedding: number[], limit: number): Promise<VectorSearchResult[]>;
  searchVector(queryEmbedding: number[], limit: number): Promise<VectorSearchResult[]>;
  updatePage(
    pageId: string,
    patch: Partial<Pick<WikiPageInput, 'title' | 'body' | 'tags' | 'format'>>,
    actorId: string
  ): Promise<WikiPage>;
  upsertPage(input: WikiPageInput): Promise<WikiPage>;
  upsertVector(pageId: string, embedding: number[]): Promise<void>;
}

/** Dependencies required to construct a WikiManager instance. */
export interface WikiManagerDependencies {
  contentProcessor?: ContentProcessor;
  db?: MemoryDatabase | undefined;
  embeddingEngine?: LocalEmbeddingEngine;
  entityExtractor?: EntityExtractor;
  navigation?: NavigationSystem;
  /** Use AgentFS kv_store instead of legacy wiki tables when db is present. */
  useAgentFs?: boolean | undefined;
  versionTracker?: VersionTracker;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function toSearchResult(pageId: string, score: number): VectorSearchResult {
  return { pageId, score };
}

function scoreByFullText(query: string, page: WikiPage, contentProcessor: ContentProcessor): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) {
    return 0;
  }

  const searchable = `${page.title}\n${contentProcessor.toSearchableText(page.body)}`.toLowerCase();
  let hits = 0;

  for (const term of queryTerms) {
    if (searchable.includes(term)) {
      hits += 1;
    }
  }

  return hits / queryTerms.length;
}

function ensureCanWrite(page: WikiPage, actorId: string): void {
  if (page.writerIds.length === 0 || page.writerIds.includes(actorId)) {
    return;
  }

  throw new Error(`Actor ${actorId} does not have write access to ${page.pageId}`);
}

export function getDiff(fromBody: string, toBody: string): PageDiff {
  const fromLines = fromBody.split('\n');
  const toLines = toBody.split('\n');

  const fromSet = new Set(fromLines);
  const toSet = new Set(toLines);

  const addedLines = toLines.filter(line => !fromSet.has(line));
  const removedLines = fromLines.filter(line => !toSet.has(line));

  return { addedLines, removedLines };
}

function resolveWikiDependencies(dependencies: WikiManagerDependencies) {
  return {
    contentProcessor: dependencies.contentProcessor ?? createContentProcessor(),
    embeddingEngine: dependencies.embeddingEngine ?? createLocalEmbeddingEngine(),
    entityExtractor: dependencies.entityExtractor ?? createEntityExtractor(),
    navigation: dependencies.navigation ?? createNavigationSystem(),
    versionTracker: dependencies.versionTracker ?? createVersionTracker()
  };
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

function createInMemoryWikiManager(dependencies: WikiManagerDependencies): WikiManager {
  const { contentProcessor, entityExtractor, embeddingEngine, versionTracker, navigation } =
    resolveWikiDependencies(dependencies);

  const pages = new Map<string, WikiPage>();
  const vectors = new Map<string, VectorEntry>();
  const history = new Map<string, WikiPageHistoryEntry[]>();
  const concepts = new Map<string, ConceptRelation[]>();

  return {
    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async captureRaw(input: RawCaptureInput) {
      const capture: RawCapture = {
        content: input.content,
        createdAt: new Date(),
        id: randomUUID(),
        normalizedContent: contentProcessor.normalize(input.content),
        sourceId: input.sourceId,
        sourceType: input.sourceType
      };

      return capture;
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async diffPageVersions(pageId, fromVersion, toVersion) {
      const pageHistory = history.get(pageId) ?? [];
      const fromItem = pageHistory.find(entry => entry.version === fromVersion);
      const toItem = pageHistory.find(entry => entry.version === toVersion);

      if (!(fromItem && toItem)) {
        throw new Error(`Unknown version for page ${pageId}`);
      }

      return getDiff(fromItem.body, toItem.body);
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async extractEntities(pageId) {
      const page = pages.get(pageId);
      if (!page) {
        return [];
      }

      const extracted = entityExtractor.extract(`${page.title}\n${page.body}`);
      return extracted.entities.map(entity => entity.name);
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async getBacklinks(pageId: string) {
      return navigation.getBacklinks(pageId);
    },

    getConceptRelations(pageId) {
      return Promise.resolve([...(concepts.get(pageId) ?? [])]);
    },

    getPage(pageId: string) {
      const page = pages.get(pageId);
      return Promise.resolve(
        page
          ? {
              ...page,
              tags: [...page.tags],
              writerIds: [...page.writerIds]
            }
          : null
      );
    },

    getPageHistory(pageId) {
      return Promise.resolve([...(history.get(pageId) ?? [])].map(entry => ({ ...entry })));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async linkConcepts(fromPageId, toPageId, relation) {
      const existing = concepts.get(fromPageId) ?? [];
      existing.push({ relation, toPageId });
      concepts.set(fromPageId, existing);
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async linkPages(fromPageId: string, toPageId: string) {
      navigation.linkPages(fromPageId, toPageId);
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async searchFullText(query, limit) {
      const scored = [...pages.values()]
        .map(page => toSearchResult(page.pageId, scoreByFullText(query, page, contentProcessor)))
        .filter(item => item.score > 0)
        .toSorted((left, right) => right.score - left.score);

      return scored.slice(0, Math.max(0, limit));
    },

    async searchHybrid(query, queryEmbedding, limit) {
      const vectorScores = await this.searchVector(queryEmbedding, vectors.size);
      const vectorScoreMap = new Map<string, number>(vectorScores.map(item => [item.pageId, item.score]));

      const hybridScores = [...pages.values()]
        .map(page => {
          const textScore = scoreByFullText(query, page, contentProcessor);
          const vectorScore = vectorScoreMap.get(page.pageId) ?? 0;
          const score = textScore * 0.5 + vectorScore * 0.5;
          return toSearchResult(page.pageId, score);
        })
        .filter(item => item.score > 0)
        .toSorted((left, right) => right.score - left.score);

      return hybridScores.slice(0, Math.max(0, limit));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async searchVector(queryEmbedding: number[], limit: number) {
      const scored: VectorSearchResult[] = [...vectors.values()]
        .map(entry => ({
          pageId: entry.pageId,
          score: cosineSimilarity(queryEmbedding, entry.embedding)
        }))
        .toSorted((left, right) => right.score - left.score);

      return scored.slice(0, Math.max(0, limit));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async updatePage(pageId, patch, actorId) {
      const current = pages.get(pageId);
      if (!current) {
        throw new Error(`Unknown page ${pageId}`);
      }

      ensureCanWrite(current, actorId);

      const nextVersion = versionTracker.bump(pageId);
      const nextBody = patch.body ?? current.body;
      const nextPage: WikiPage = {
        ...current,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
        body: nextBody,
        format: patch.format ?? current.format,
        updatedAt: new Date(),
        version: nextVersion
      };

      pages.set(pageId, nextPage);
      vectors.set(pageId, {
        embedding: embeddingEngine.embed(`${nextPage.title}\n${contentProcessor.toSearchableText(nextPage.body)}`),
        pageId
      });

      const pageHistory = history.get(pageId) ?? [];
      pageHistory.push({
        actorId,
        body: nextPage.body,
        editedAt: nextPage.updatedAt,
        version: nextVersion
      });
      history.set(pageId, pageHistory);

      return {
        ...nextPage,
        tags: [...nextPage.tags],
        writerIds: [...nextPage.writerIds]
      };
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async upsertPage(input: WikiPageInput) {
      const version = versionTracker.bump(input.pageId);
      const actorId = input.actorId ?? 'system';
      const format = input.format ?? contentProcessor.detectFormat(input.body);
      const writerIds = [...(input.writerIds ?? [])];
      const page: WikiPage = {
        body: input.body,
        format,
        pageId: input.pageId,
        tags: [...(input.tags ?? [])],
        title: input.title,
        updatedAt: new Date(),
        version,
        writerIds
      };

      pages.set(page.pageId, page);
      vectors.set(page.pageId, {
        embedding: embeddingEngine.embed(`${page.title}\n${contentProcessor.toSearchableText(page.body)}`),
        pageId: page.pageId
      });

      const pageHistory = history.get(page.pageId) ?? [];
      pageHistory.push({
        actorId,
        body: page.body,
        editedAt: page.updatedAt,
        version
      });
      history.set(page.pageId, pageHistory);

      return page;
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async upsertVector(pageId: string, embedding: number[]) {
      vectors.set(pageId, {
        embedding: [...embedding],
        pageId
      });
    }
  };
}

// ---------------------------------------------------------------------------
// SQLite-backed implementation
// ---------------------------------------------------------------------------

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

function parseJsonNumberArray(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as number[];
    }
    return [];
  } catch {
    return [];
  }
}

function rowToWikiPage(row: { [key: string]: unknown }): WikiPage {
  return {
    pageId: String(row.pageId),
    title: String(row.title),
    body: String(row.body),
    tags: parseJsonArray(String(row.tags)),
    format: String(row.format) as WikiPage['format'],
    writerIds: parseJsonArray(String(row.writerIds)),
    version: Number(row.version),
    updatedAt: new Date(Number(row.updatedAt))
  };
}

function rowToHistoryEntry(row: { [key: string]: unknown }): WikiPageHistoryEntry {
  return {
    version: Number(row.version),
    body: String(row.body),
    actorId: String(row.actorId),
    editedAt: new Date(Number(row.editedAt))
  };
}

function getNextVersion(db: MemoryDatabase, pageId: string): number {
  const result = db.select({ version: wikiPages.version }).from(wikiPages).where(eq(wikiPages.pageId, pageId)).get();
  return (result?.version ?? 0) + 1;
}

function createSQLiteWikiManager(db: MemoryDatabase, dependencies: WikiManagerDependencies): WikiManager {
  const { contentProcessor, entityExtractor, embeddingEngine } = resolveWikiDependencies(dependencies);

  function insertHistory(pageId: string, version: number, body: string, actorId: string, editedAt: Date): void {
    db.insert(wikiPageHistory)
      .values({
        pageId,
        version,
        body,
        actorId,
        editedAt: editedAt.getTime()
      })
      .run();
  }

  function insertPage(page: WikiPage): void {
    db.insert(wikiPages)
      .values({
        pageId: page.pageId,
        title: page.title,
        body: page.body,
        tags: JSON.stringify(page.tags),
        format: page.format,
        writerIds: JSON.stringify(page.writerIds),
        version: page.version,
        updatedAt: page.updatedAt.getTime()
      })
      .onConflictDoUpdate({
        target: wikiPages.pageId,
        set: {
          title: page.title,
          body: page.body,
          tags: JSON.stringify(page.tags),
          format: page.format,
          writerIds: JSON.stringify(page.writerIds),
          version: page.version,
          updatedAt: page.updatedAt.getTime()
        }
      })
      .run();
  }

  function insertVector(pageId: string, embedding: number[]): void {
    db.insert(wikiVectors)
      .values({ pageId, embedding: JSON.stringify(embedding) })
      .onConflictDoUpdate({
        target: wikiVectors.pageId,
        set: { embedding: JSON.stringify(embedding) }
      })
      .run();
  }

  return {
    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async captureRaw(input: RawCaptureInput) {
      const capture: RawCapture = {
        content: input.content,
        createdAt: new Date(),
        id: randomUUID(),
        normalizedContent: contentProcessor.normalize(input.content),
        sourceId: input.sourceId,
        sourceType: input.sourceType
      };

      return capture;
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async diffPageVersions(pageId, fromVersion, toVersion) {
      const fromItem = db
        .select()
        .from(wikiPageHistory)
        .where(eq(wikiPageHistory.pageId, pageId))
        .all()
        .find(row => Number(row.version) === fromVersion);

      const toItem = db
        .select()
        .from(wikiPageHistory)
        .where(eq(wikiPageHistory.pageId, pageId))
        .all()
        .find(row => Number(row.version) === toVersion);

      if (!(fromItem && toItem)) {
        throw new Error(`Unknown version for page ${pageId}`);
      }

      return getDiff(String(fromItem.body), String(toItem.body));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async extractEntities(pageId) {
      const row = db.select().from(wikiPages).where(eq(wikiPages.pageId, pageId)).get();
      if (!row) {
        return [];
      }

      const page = rowToWikiPage(row);
      const extracted = entityExtractor.extract(`${page.title}\n${page.body}`);
      return extracted.entities.map(entity => entity.name);
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async getBacklinks(pageId: string) {
      const rows = db.select().from(wikiBacklinks).where(eq(wikiBacklinks.toPageId, pageId)).all();
      return rows.map(row => String(row.fromPageId));
    },

    getConceptRelations(pageId) {
      const rows = db.select().from(wikiConcepts).where(eq(wikiConcepts.fromPageId, pageId)).all();
      return Promise.resolve(
        rows.map(row => ({
          toPageId: String(row.toPageId),
          relation: String(row.relation)
        }))
      );
    },

    getPage(pageId: string) {
      const row = db.select().from(wikiPages).where(eq(wikiPages.pageId, pageId)).get();
      if (!row) {
        return Promise.resolve(null);
      }
      return Promise.resolve(rowToWikiPage(row));
    },

    getPageHistory(pageId) {
      const rows = db
        .select()
        .from(wikiPageHistory)
        .where(eq(wikiPageHistory.pageId, pageId))
        .orderBy(wikiPageHistory.version)
        .all();
      return Promise.resolve(rows.map(rowToHistoryEntry));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async linkConcepts(fromPageId, toPageId, relation) {
      db.insert(wikiConcepts).values({ fromPageId, toPageId, relation }).onConflictDoNothing().run();
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async linkPages(fromPageId: string, toPageId: string) {
      db.insert(wikiBacklinks).values({ fromPageId, toPageId }).onConflictDoNothing().run();
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async searchFullText(query, limit) {
      const rows = db.select().from(wikiPages).all();
      const scored = rows
        .map(row => toSearchResult(String(row.pageId), scoreByFullText(query, rowToWikiPage(row), contentProcessor)))
        .filter(item => item.score > 0)
        .toSorted((left, right) => right.score - left.score);

      return scored.slice(0, Math.max(0, limit));
    },

    async searchHybrid(query, queryEmbedding, limit) {
      const vectorScores = await this.searchVector(queryEmbedding, Number.MAX_SAFE_INTEGER);
      const vectorScoreMap = new Map<string, number>(vectorScores.map(item => [item.pageId, item.score]));

      const rows = db.select().from(wikiPages).all();
      const hybridScores = rows
        .map(row => {
          const page = rowToWikiPage(row);
          const textScore = scoreByFullText(query, page, contentProcessor);
          const vectorScore = vectorScoreMap.get(page.pageId) ?? 0;
          const score = textScore * 0.5 + vectorScore * 0.5;
          return toSearchResult(page.pageId, score);
        })
        .filter(item => item.score > 0)
        .toSorted((left, right) => right.score - left.score);

      return hybridScores.slice(0, Math.max(0, limit));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async searchVector(queryEmbedding: number[], limit: number) {
      const rows = db.select().from(wikiVectors).all();
      const scored: VectorSearchResult[] = rows
        .map(row => {
          const embedding = parseJsonNumberArray(String(row.embedding));
          return {
            pageId: String(row.pageId),
            score: cosineSimilarity(queryEmbedding, embedding)
          };
        })
        .toSorted((left, right) => right.score - left.score);

      return scored.slice(0, Math.max(0, limit));
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async updatePage(pageId, patch, actorId) {
      const row = db.select().from(wikiPages).where(eq(wikiPages.pageId, pageId)).get();
      if (!row) {
        throw new Error(`Unknown page ${pageId}`);
      }

      const current = rowToWikiPage(row);
      ensureCanWrite(current, actorId);

      const nextVersion = getNextVersion(db, pageId);
      const nextBody = patch.body ?? current.body;
      const nextPage: WikiPage = {
        ...current,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
        body: nextBody,
        format: patch.format ?? current.format,
        updatedAt: new Date(),
        version: nextVersion
      };

      insertPage(nextPage);
      insertVector(
        pageId,
        embeddingEngine.embed(`${nextPage.title}\n${contentProcessor.toSearchableText(nextPage.body)}`)
      );
      insertHistory(pageId, nextVersion, nextPage.body, actorId, nextPage.updatedAt);

      return nextPage;
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async upsertPage(input: WikiPageInput) {
      const version = getNextVersion(db, input.pageId);
      const actorId = input.actorId ?? 'system';
      const format = input.format ?? contentProcessor.detectFormat(input.body);
      const writerIds = [...(input.writerIds ?? [])];
      const page: WikiPage = {
        body: input.body,
        format,
        pageId: input.pageId,
        tags: [...(input.tags ?? [])],
        title: input.title,
        updatedAt: new Date(),
        version,
        writerIds
      };

      insertPage(page);
      insertVector(
        page.pageId,
        embeddingEngine.embed(`${page.title}\n${contentProcessor.toSearchableText(page.body)}`)
      );
      insertHistory(page.pageId, version, page.body, actorId, page.updatedAt);

      return page;
    },

    // biome-ignore lint/suspicious/useAwait: Implements WikiManager interface requiring Promise return
    async upsertVector(pageId: string, embedding: number[]) {
      insertVector(pageId, embedding);
    }
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWikiManager(dependencies: WikiManagerDependencies = {}): WikiManager {
  if (dependencies.db && dependencies.useAgentFs) {
    return createWikiFsAdapter({ db: dependencies.db });
  }
  if (dependencies.db) {
    return createSQLiteWikiManager(dependencies.db, dependencies);
  }
  return createInMemoryWikiManager(dependencies);
}
