/**
 * SQLite-backed ledger store for session entries.
 *
 * Provides insert, get, query, aggregate, and survival-rate update
 * operations over a single `session_ledger` table with JSON columns
 * for nested sub-records.
 */

import Database from 'better-sqlite3';
import type { SessionLedgerEntry } from './types.js';

// =============================================================================
// LedgerStore interface
// =============================================================================

export interface LedgerStore {
  /**
   * Run an aggregate query over entries matching the filter.
   * Returns a single aggregate row (or a default zero-valued row when
   * no entries match).
   */
  aggregate(filter?: LedgerQueryFilter): LedgerAggregateRow;

  /** Close the database connection. */
  close(): void;

  /** Retrieve a single entry by its ledger id, or undefined if not found. */
  get(id: string): SessionLedgerEntry | undefined;
  /** Insert a single session ledger entry. */
  insert(entry: SessionLedgerEntry): void;

  /**
   * Query entries matching the given filter.
   * Returns all entries when no filter is provided.
   */
  query(filter?: LedgerQueryFilter): SessionLedgerEntry[];

  /** Update the 30-day survival rate for a specific entry. */
  updateSurvivalRate(id: string, rate: number): void;
}

// =============================================================================
// Query filter
// =============================================================================

export interface LedgerQueryFilter {
  agentId?: string;
  frustrationMax?: number;
  frustrationMin?: number;
  modelId?: string;
  since?: Date;
  tags?: string[];
  until?: Date;
}

// =============================================================================
// Aggregate result row
// =============================================================================

export interface LedgerAggregateRow {
  avgFrustrationScore: number;
  avgQualityScore: number;
  avgSurvivalRate: number | null;
  sessionCount: number;
  totalArtifactsCached: number;
  totalArtifactsGenerated: number;
  totalCostAtFrustration: number;
  totalCostUsd: number;
  totalRequests: number;
  totalTokens: number;
}

// =============================================================================
// Internal helpers
// =============================================================================

const SCHEMA = `
CREATE TABLE IF NOT EXISTS session_ledger (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  provider      TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  ended_at      TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  spend         TEXT NOT NULL,
  artifacts     TEXT NOT NULL,
  quality       TEXT NOT NULL,
  frustration   TEXT NOT NULL,
  survival_rate_30d REAL,
  tags          TEXT NOT NULL,
  logical_model_id   TEXT,
  replica_id         TEXT,
  provider_id        TEXT,
  failover_chain     TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_started_at ON session_ledger(started_at);
CREATE INDEX IF NOT EXISTS idx_ledger_session_id ON session_ledger(session_id);
CREATE INDEX IF NOT EXISTS idx_ledger_agent_id   ON session_ledger(agent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_model_id   ON session_ledger(model_id);
`;

function rowToEntry(row: {
  id: string;
  session_id: string;
  agent_id: string;
  model_id: string;
  provider: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  spend: string;
  artifacts: string;
  quality: string;
  frustration: string;
  survival_rate_30d: number | null;
  tags: string;
  logical_model_id: string | null;
  replica_id: string | null;
  provider_id: string | null;
  failover_chain: string | null;
}): SessionLedgerEntry {
  const entry: SessionLedgerEntry = {
    id: row.id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    modelId: row.model_id,
    provider: row.provider,
    startedAt: new Date(row.started_at),
    endedAt: new Date(row.ended_at),
    durationMs: row.duration_ms,
    spend: JSON.parse(row.spend),
    artifacts: JSON.parse(row.artifacts),
    quality: JSON.parse(row.quality),
    frustration: JSON.parse(row.frustration),
    survivalRate30d: row.survival_rate_30d,
    tags: JSON.parse(row.tags)
  };

  if (row.logical_model_id !== null) {
    entry.logicalModelId = row.logical_model_id;
  }
  if (row.replica_id !== null) {
    entry.replicaId = row.replica_id;
  }
  if (row.provider_id !== null) {
    entry.providerId = row.provider_id;
  }
  if (row.failover_chain !== null) {
    entry.failoverChain = JSON.parse(row.failover_chain);
  }

  return entry;
}

function entryToRow(entry: SessionLedgerEntry) {
  return {
    id: entry.id,
    session_id: entry.sessionId,
    agent_id: entry.agentId,
    model_id: entry.modelId,
    provider: entry.provider,
    started_at: entry.startedAt.toISOString(),
    ended_at: entry.endedAt.toISOString(),
    duration_ms: entry.durationMs,
    spend: JSON.stringify(entry.spend),
    artifacts: JSON.stringify(entry.artifacts),
    quality: JSON.stringify(entry.quality),
    frustration: JSON.stringify(entry.frustration),
    survival_rate_30d: entry.survivalRate30d,
    tags: JSON.stringify(entry.tags),
    logical_model_id: entry.logicalModelId ?? null,
    replica_id: entry.replicaId ?? null,
    provider_id: entry.providerId ?? null,
    failover_chain: entry.failoverChain === undefined ? null : JSON.stringify(entry.failoverChain)
  };
}

// =============================================================================
// SQLite implementation
// =============================================================================

/**
 * Create a SQLite-backed `LedgerStore`.
 *
 * @param dbPath  Path to the SQLite database file.
 *                Use `:memory:` for an in-memory database (useful in tests).
 */
export function createSqliteLedgerStore(dbPath: string): LedgerStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Prepared statements
  const stmtInsert = db.prepare(`
    INSERT INTO session_ledger (
      id, session_id, agent_id, model_id, provider,
      started_at, ended_at, duration_ms,
      spend, artifacts, quality, frustration,
      survival_rate_30d, tags,
      logical_model_id, replica_id, provider_id, failover_chain
    ) VALUES (
      @id, @session_id, @agent_id, @model_id, @provider,
      @started_at, @ended_at, @duration_ms,
      @spend, @artifacts, @quality, @frustration,
      @survival_rate_30d, @tags,
      @logical_model_id, @replica_id, @provider_id, @failover_chain
    )
  `);

  const stmtGet = db.prepare('SELECT * FROM session_ledger WHERE id = ?');

  const stmtUpdateSurvival = db.prepare('UPDATE session_ledger SET survival_rate_30d = ? WHERE id = ?');

  // Build a parameterised WHERE clause from a filter
  function buildWhere(filter?: LedgerQueryFilter): { clause: string; params: unknown[] } {
    if (filter === undefined) {
      return { clause: '', params: [] };
    }

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.since !== undefined) {
      clauses.push('started_at >= ?');
      params.push(filter.since.toISOString());
    }
    if (filter.until !== undefined) {
      clauses.push('started_at <= ?');
      params.push(filter.until.toISOString());
    }
    if (filter.agentId !== undefined) {
      clauses.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.modelId !== undefined) {
      clauses.push('model_id = ?');
      params.push(filter.modelId);
    }
    if (filter.frustrationMin !== undefined) {
      clauses.push("json_extract(frustration, '$.count') >= ?");
      params.push(filter.frustrationMin);
    }
    if (filter.frustrationMax !== undefined) {
      clauses.push("json_extract(frustration, '$.count') <= ?");
      params.push(filter.frustrationMax);
    }
    if (filter.tags !== undefined && filter.tags.length > 0) {
      // Match entries whose tags JSON array contains at least one of the filter tags.
      // SQLite's json_each approach: use IN with json_each.
      // Simpler: build OR conditions for each tag using json_extract + LIKE.
      // Most robust: use a subquery with json_each.
      const tagConditions = filter.tags.map(() => 'EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)');
      clauses.push(`(${tagConditions.join(' OR ')})`);
      params.push(...filter.tags);
    }

    if (clauses.length === 0) {
      return { clause: '', params: [] };
    }

    return { clause: `WHERE ${clauses.join(' AND ')}`, params };
  }

  const store: LedgerStore = {
    insert(entry: SessionLedgerEntry): void {
      stmtInsert.run(entryToRow(entry));
    },

    get(id: string): SessionLedgerEntry | undefined {
      const row = stmtGet.get(id) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return;
      }
      return rowToEntry(row as Parameters<typeof rowToEntry>[0]);
    },

    query(filter?: LedgerQueryFilter): SessionLedgerEntry[] {
      const { clause, params } = buildWhere(filter);
      const sql = `SELECT * FROM session_ledger ${clause} ORDER BY started_at DESC`;
      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      return rows.map(r => rowToEntry(r as Parameters<typeof rowToEntry>[0]));
    },

    updateSurvivalRate(id: string, rate: number): void {
      stmtUpdateSurvival.run(rate, id);
    },

    aggregate(filter?: LedgerQueryFilter): LedgerAggregateRow {
      const { clause, params } = buildWhere(filter);

      const sql = `
        SELECT
          COUNT(*)                                            AS session_count,
          COALESCE(SUM(json_extract(spend, '$.totalCost')), 0)   AS total_cost_usd,
          COALESCE(SUM(json_extract(spend, '$.totalTokens')), 0) AS total_tokens,
          COALESCE(SUM(json_extract(spend, '$.requestCount')), 0) AS total_requests,
          COALESCE(SUM(json_extract(artifacts, '$.generated')), 0) AS total_artifacts_generated,
          COALESCE(SUM(json_extract(artifacts, '$.cached')), 0)   AS total_artifacts_cached,
          COALESCE(AVG(json_extract(frustration, '$.count')), 0)  AS avg_frustration_score,
          COALESCE(
            SUM(
              CASE
                WHEN json_extract(frustration, '$.count') > 0
                THEN json_extract(spend, '$.totalCost')
                ELSE 0
              END
            ),
            0
          ) AS total_cost_at_frustration,
          COALESCE(AVG(json_extract(quality, '$.score')), 0)      AS avg_quality_score,
          AVG(survival_rate_30d)                                  AS avg_survival_rate
        FROM session_ledger
        ${clause}
      `;

      const row = db.prepare(sql).get(...params) as Record<string, unknown>;

      return {
        sessionCount: Number(row.session_count),
        totalCostUsd: Number(row.total_cost_usd),
        totalTokens: Number(row.total_tokens),
        totalRequests: Number(row.total_requests),
        totalArtifactsGenerated: Number(row.total_artifacts_generated),
        totalArtifactsCached: Number(row.total_artifacts_cached),
        avgFrustrationScore: Number(row.avg_frustration_score),
        totalCostAtFrustration: Number(row.total_cost_at_frustration),
        avgQualityScore: Number(row.avg_quality_score),
        avgSurvivalRate: row.avg_survival_rate === null ? null : Number(row.avg_survival_rate)
      };
    },

    close(): void {
      db.close();
    }
  };

  return store;
}
