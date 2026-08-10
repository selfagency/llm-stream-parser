/**
 * Database subsystem — UnifiedDB, schema, and migrations.
 *
 * @module
 */

export {
  AGENT_CHECKPOINTS_DDL,
  AGENT_CHECKPOINTS_INDEXES,
  AGENT_CHECKPOINTS_TABLE,
  type AgentCheckpointRow,
  ALL_SCHEMA_DDL
} from './schema.js';
export {
  type QueueHandle,
  type StreamHandle,
  type TransactionHandle,
  UnifiedDB,
  type UnifiedDBConfig
} from './unified-db.js';
