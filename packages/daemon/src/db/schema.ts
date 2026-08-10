/**
 * @module
 * Database schema definitions for UnifiedDB.
 *
 * Provides DDL statements and row types for all tables.
 * The `agent_checkpoints` table is used by CheckpointManager.
 */

// ── agent_checkpoints ────────────────────────────────────────────────

export const AGENT_CHECKPOINTS_TABLE = 'agent_checkpoints';

export const AGENT_CHECKPOINTS_DDL = `
CREATE TABLE IF NOT EXISTS ${AGENT_CHECKPOINTS_TABLE} (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
)`;

export const AGENT_CHECKPOINTS_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_${AGENT_CHECKPOINTS_TABLE}_agent_id ON ${AGENT_CHECKPOINTS_TABLE}(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_${AGENT_CHECKPOINTS_TABLE}_timestamp ON ${AGENT_CHECKPOINTS_TABLE}(timestamp)`
];

/**
 * Row shape as stored in SQLite.
 */
export interface AgentCheckpointRow {
  agent_id: string;
  created_at: number | null;
  data: string;
  id: string;
  name: string;
  timestamp: string;
}

/**
 * Full list of DDL statements for fresh DB bootstrap.
 */
export const ALL_SCHEMA_DDL: string[] = [AGENT_CHECKPOINTS_DDL, ...AGENT_CHECKPOINTS_INDEXES];
