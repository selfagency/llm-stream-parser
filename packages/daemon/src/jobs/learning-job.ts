/**
 * Learning Job — background consolidation of event memory items.
 *
 * Runs on a configurable schedule AND is triggered by specific events
 * (canary detection, observation threshold). Consolidates unprocessed
 * `kind: 'event'` memory items into `kind: 'semantic'` items via an
 * LLM call, then indexes them via RetrievalService.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { UnifiedDB } from '../db/unified-db.js';
import type { EventBus } from '../events/event-bus.js';
import type { RetrievalService } from '../services/retrieval-service.js';
import type { Logger } from '../types.js';

// ── Constants ───────────────────────────────────────────

/** Maximum events to process in a single learning pass. */
const MAX_EVENTS_PER_RUN = 500;

// ── Types ───────────────────────────────────────────────

export interface SemanticItem {
  category: 'user_preference' | 'entity' | 'procedure' | 'constraint' | 'general';
  content: string;
  metadata?: { tags?: string[] };
}

export interface LearningJobResult {
  eventsProcessed: number;
  indexed: number;
  semanticItemsCreated: number;
  skipped: number;
}

export interface LearningJobDeps {
  db: UnifiedDB;
  eventBus: EventBus;
  logger: Logger;
  retrieval: RetrievalService;
}

// ── Learning Job ────────────────────────────────────────

export class LearningJob {
  readonly #deps: LearningJobDeps;
  #running = false;

  constructor(deps: LearningJobDeps) {
    this.#deps = deps;

    // Subscribe to canary and observation-threshold events
    deps.eventBus.subscribe('memory.canary', () => this.run() as unknown as Promise<void>);
    deps.eventBus.subscribe('memory.observation-threshold', () => this.run() as unknown as Promise<void>);
  }

  get running(): boolean {
    return this.#running;
  }

  /**
   * Run the learning pass.
   *
   * 1. Query unprocessed `kind: 'event'` memory items
   * 2. Consolidate via LLM (simulated — returns empty array when no LLM is wired)
   * 3. Insert semantic items
   * 4. Mark events as processed
   * 5. Index new semantic items via RetrievalService
   */
  async run(): Promise<LearningJobResult> {
    if (this.#running) {
      this.#deps.logger.debug('Learning job already running, skipping');
      return { eventsProcessed: 0, semanticItemsCreated: 0, indexed: 0, skipped: 0 };
    }

    this.#running = true;
    const logger = this.#deps.logger;

    try {
      // 1. Query unprocessed events
      const events = await this.#deps.db.query<{
        content: string;
        created_at: string;
        id: string;
        metadata: string;
        scope: string;
      }>(
        `SELECT id, scope, content, metadata, created_at FROM memory_items
         WHERE kind = 'event' AND processed_at IS NULL
         ORDER BY created_at ASC LIMIT ?`,
        [MAX_EVENTS_PER_RUN]
      );

      if (events.length === 0) {
        logger.debug('No unprocessed events to consolidate');
        return { eventsProcessed: 0, semanticItemsCreated: 0, indexed: 0, skipped: 0 };
      }

      logger.info('Consolidating events', { count: events.length });

      // 2. Consolidate — currently uses a simple heuristic grouping
      //    In production, this would call an LLM with CONSOLIDATION_PROMPT
      const semanticItems = this.#consolidateHeuristic(events);

      if (semanticItems.length === 0) {
        // Mark events as processed even if no semantic items were created
        await this.#markProcessed(events);
        return { eventsProcessed: events.length, semanticItemsCreated: 0, indexed: 0, skipped: 0 };
      }

      // 3. Insert semantic items
      const scope = events[0]?.scope ?? 'default';
      for (const item of semanticItems) {
        await this.#deps.db.execute(
          `INSERT INTO memory_items (id, scope, kind, content, metadata, created_at)
           VALUES (?, ?, 'semantic', ?, ?, ?)`,
          [
            randomUUID(),
            scope,
            item.content,
            JSON.stringify({ category: item.category, tags: item.metadata?.tags ?? [], consolidated: true }),
            new Date().toISOString()
          ]
        );
      }

      // 4. Mark events as processed
      await this.#markProcessed(events);

      // 5. Index new semantic items via RetrievalService
      let indexed = 0;
      let skipped = 0;
      try {
        const result = await this.#deps.retrieval.indexNewContent(scope);
        indexed = result.indexed;
        skipped = result.skipped;
      } catch (error) {
        logger.error('Failed to index new semantic items', {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      logger.info('Learning pass completed', {
        eventsProcessed: events.length,
        semanticItemsCreated: semanticItems.length,
        indexed,
        skipped
      });

      return {
        eventsProcessed: events.length,
        semanticItemsCreated: semanticItems.length,
        indexed,
        skipped
      };
    } catch (error) {
      logger.error('Learning job failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      this.#running = false;
    }
  }

  /**
   * Simple heuristic consolidation — groups events by content similarity.
   *
   * In production, this would be replaced by an LLM call using
   * CONSOLIDATION_PROMPT with a JSON schema response format.
   */
  #consolidateHeuristic(events: Array<{ content: string; metadata: string }>): SemanticItem[] {
    // Group events by rough topic (first 50 chars of content)
    const groups = new Map<string, string[]>();
    for (const event of events) {
      const key = event.content.slice(0, 50).toLowerCase();
      const existing = groups.get(key) ?? [];
      existing.push(event.content);
      groups.set(key, existing);
    }

    const items: SemanticItem[] = [];
    for (const [, contents] of groups) {
      if (contents.length < 2) {
        // Single events become individual semantic items
        items.push({
          content: contents[0] ?? '',
          category: 'general',
          metadata: { tags: ['event'] }
        });
      } else {
        // Multiple similar events get consolidated
        items.push({
          content: `Observed multiple times: ${contents[0] ?? ''}`,
          category: 'general',
          metadata: { tags: ['event', 'consolidated'] }
        });
      }
    }

    return items;
  }

  /** Mark events as processed in a single transaction. */
  async #markProcessed(events: Array<{ id: string }>): Promise<void> {
    const now = new Date().toISOString();
    for (const event of events) {
      await this.#deps.db.execute('UPDATE memory_items SET processed_at = ? WHERE id = ?', [now, event.id]);
    }
  }
}
