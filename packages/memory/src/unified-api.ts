/**
 * Unified memory API — remember(), recall(), forget(), improve().
 *
 * Wraps the cognitive engine, wiki, dreamer consumer, fact extractor, and
 * session cache behind cognee's 4-op surface. All external memory access
 * goes through this single entry point.
 */

import type { MemoryEngine } from './cognitive/memory-engine.js';
import type { WikiUpserter } from './cortexkit/dreamer-consumer.js';
import type { EntrySource, MemoryEntry } from './entries/index.js';
import { entryImportance } from './entries/index.js';
import type { FactExtractor } from './extraction/index.js';
import { routeQuery, type SearchStrategy } from './recall-router.js';
import { RememberResult, type RememberResultOptions, type RememberStatus } from './result-handle.js';

/** Scope for recall — constrains which backends are searched. */
export type RecallScope = 'auto' | 'session' | 'graph' | 'trace' | 'all';

export interface UnifiedMemoryOptions {
  /** Actor ID for wiki writes. */
  actorId?: string;
  /** Cognitive memory engine (tiers). */
  engine: MemoryEngine;
  /** Fact extractor (LLM-based). */
  extractor?: FactExtractor;
  /** Session store interface for fast cache reads. */
  sessionStore?: {
    getRecent(
      query: string,
      sessionId: string,
      limit: number
    ): Promise<Array<{ content: string; id: string; score: number }>>;
  };
  /** Wiki / knowledge graph upserter. */
  wiki: WikiUpserter;
}

export interface RecallOptions {
  limit?: number;
  minScore?: number;
  scope?: RecallScope;
  sessionId?: string;
}

export type ResolvedScope = RecallScope | 'session' | 'graph';

export interface RecallOutput {
  _source: EntrySource;
  entry: MemoryEntry;
  score: number;
}

/**
 * Create the unified memory API.
 *
 * ```ts
 * const memory = createUnifiedMemory({ engine, wiki, extractor, sessionStore });
 * const result = await memory.remember({ type: 'qa', question: '...', answer: '...' }, 'session-1');
 * const results = await memory.recall('how does auth work');
 * ```
 */
export function createUnifiedMemory(options: UnifiedMemoryOptions): {
  remember: (entry: MemoryEntry, sessionId?: string) => Promise<RememberResult>;
  recall: (query: string, opts?: RecallOptions) => Promise<RecallOutput[]>;
  forget: () => void;
  improve: (opts?: { sessionIds?: string[]; runInBackground?: boolean }) => { synced: number };
} {
  const { engine, wiki, sessionStore, extractor, actorId } = options;

  async function storeToSession(entry: MemoryEntry, sessionId: string | undefined): Promise<void> {
    if (sessionId && sessionStore) {
      await sessionStore.getRecent(serialiseEntry(entry), sessionId, 1);
    }
  }

  async function persistToWiki(entry: MemoryEntry, sessionId: string | undefined): Promise<void> {
    if (sessionId || !wiki) {
      return;
    }
    try {
      const pageId = `entry-${entry.type}-${Date.now()}`;
      await wiki.upsertPage({
        actorId: actorId ?? 'memory-system',
        body: serialiseEntry(entry),
        format: 'text',
        pageId,
        tags: ['memory-entry', entry.type],
        title: `${entry.type}: ${summariseEntry(entry)}`
      });
    } catch {
      // Wiki write failure — non-fatal
    }
  }

  async function runExtraction(entry: MemoryEntry): Promise<void> {
    if (!extractor || entry.type !== 'qa') {
      return;
    }
    try {
      const facts = await extractor.extract(`Q: ${entry.question}\nA: ${entry.answer}`);
      for (const fact of facts) {
        engine.ingest(fact.content, { kind: 'fact' as never, importance: fact.confidence });
      }
    } catch {
      // Extraction failure — non-fatal
    }
  }

  async function remember(entry: MemoryEntry, sessionId?: string): Promise<RememberResult> {
    engine.ingest(serialiseEntry(entry), { kind: entry.type as never, importance: entryImportance(entry) });
    await storeToSession(entry, sessionId);
    await persistToWiki(entry, sessionId);
    await runExtraction(entry);

    const resultOpts: RememberResultOptions & { status: RememberStatus } = {
      status: 'session_stored',
      entryType: entry.type
    };
    if (sessionId !== undefined) {
      resultOpts.sessionId = sessionId;
    }
    return new RememberResult(resultOpts);
  }

  async function recall(query: string, opts: RecallOptions = {}): Promise<RecallOutput[]> {
    const { sessionId, scope = 'auto', limit = 10, minScore = 0.3 } = opts;
    const results: RecallOutput[] = [];
    const resolvedScope = resolveScope(scope, sessionId);
    const route = routeQuery(query);

    const sessionHits = await querySessionImpl(sessionStore, resolvedScope, sessionId, query, limit);
    results.push(...sessionHits);
    if (resolvedScope === 'auto' && sessionHits.length > 0) {
      return sessionHits.slice(0, limit);
    }

    queryGraphImpl(engine, resolvedScope, minScore, query, route.strategy, limit, results);
    return deduplicateAndSort(results, limit);
  }

  function forget(): void {
    engine.reset();
  }

  return { remember, recall, forget, improve: createImprove(engine, wiki, actorId ?? 'memory-system') };
}

function createImprove(
  engine: MemoryEngine,
  wiki: WikiUpserter,
  actorId: string
): (opts?: { sessionIds?: string[]; runInBackground?: boolean }) => { synced: number } {
  return function improve(_opts?: { sessionIds?: string[]; runInBackground?: boolean }): { synced: number } {
    const tierResults = engine.recall({ crossTier: true });
    let synced = 0;

    for (const tierResult of tierResults) {
      for (const item of tierResult.items) {
        try {
          const pageId = `improve-${Date.now()}-${synced}`;
          wiki.upsertPage({
            actorId,
            body: item.content,
            format: 'text',
            pageId,
            tags: ['improve-synced', item.kind],
            title: `improve: ${item.content.slice(0, 60)}`
          });
          synced++;
        } catch {
          // Skip failed upserts
        }
      }
    }

    return { synced };
  };
}

// ---- Top-Level Helpers ----

async function querySessionImpl(
  store: UnifiedMemoryOptions['sessionStore'],
  resolvedScope: ResolvedScope,
  sessionId: string | undefined,
  query: string,
  limit: number
): Promise<RecallOutput[]> {
  if (store && sessionId && (resolvedScope === 'session' || resolvedScope === 'auto' || resolvedScope === 'all')) {
    try {
      const results = await store.getRecent(query, sessionId, limit);
      return results.map(
        (sr): RecallOutput => ({
          entry: { type: 'fact', content: sr.content, confidence: sr.score, kind: 'entity' },
          _source: 'session',
          score: sr.score
        })
      );
    } catch {
      return [];
    }
  }
  return [];
}

function queryGraphImpl(
  engine: MemoryEngine,
  resolvedScope: ResolvedScope,
  minScore: number,
  query: string,
  strategy: SearchStrategy,
  limit: number,
  results: RecallOutput[]
): void {
  if (!(resolvedScope === 'graph' || resolvedScope === 'auto' || resolvedScope === 'all')) {
    return;
  }
  const tierResults = engine.recall({ limit });
  for (const tr of tierResults) {
    for (const item of tr.items) {
      if (item.importance >= minScore && matchesStrategy(item.content, query, strategy)) {
        results.push({
          entry: { type: 'fact', content: item.content, confidence: item.importance, kind: 'entity' },
          _source: 'graph',
          score: item.importance
        });
      }
    }
  }
}

function deduplicateAndSort(results: RecallOutput[], limit: number): RecallOutput[] {
  results.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  return results
    .filter(r => {
      const key = `${r._source}:${serialiseEntry(r.entry)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function serialiseEntry(entry: MemoryEntry): string {
  const prefix = entry.type;
  switch (entry.type) {
    case 'fact':
      return `[${entry.kind}] ${entry.content}`;
    case 'qa':
      return `Q: ${entry.question}\nA: ${entry.answer}`;
    case 'trace':
      return `Tool: ${entry.toolName} (${entry.status})\nArgs: ${JSON.stringify(entry.args)}\nResult: ${JSON.stringify(entry.result)}`;
    case 'feedback':
      return `Feedback on ${entry.qaId}: ${entry.feedbackText} (${entry.feedbackScore})`;
    case 'skill_run':
      return `Skill: ${entry.skillId}\nTask: ${entry.task}\nResult: ${entry.resultSummary}`;
    default:
      return `[${prefix}] ${JSON.stringify(entry)}`;
  }
}

function summariseEntry(entry: MemoryEntry): string {
  switch (entry.type) {
    case 'fact':
      return entry.content.slice(0, 60);
    case 'qa':
      return entry.question.slice(0, 60);
    case 'trace':
      return `${entry.toolName} (${entry.status})`;
    case 'feedback':
      return entry.feedbackText.slice(0, 60);
    case 'skill_run':
      return entry.skillId;
    default:
      return (entry as unknown as { type: string }).type;
  }
}

function resolveScope(scope: RecallScope, sessionId?: string): ResolvedScope {
  if (scope === 'auto') {
    return sessionId ? 'auto' : 'graph';
  }
  return scope;
}

function matchesStrategy(content: string, query: string, strategy: SearchStrategy): boolean {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  switch (strategy) {
    case 'chunks':
      return lowerContent.includes(lowerQuery);
    case 'code_rules':
      return /\b(const|function|class|import|export|interface)\b/.test(content) || lowerContent.includes(lowerQuery);
    case 'session':
      return lowerContent.includes(lowerQuery);
    case 'temporal': {
      const datePattern = /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/;
      return datePattern.test(content) || lowerContent.includes(lowerQuery);
    }
    case 'graph_summary':
      return true;
    default:
      return lowerContent.includes(lowerQuery);
  }
}
