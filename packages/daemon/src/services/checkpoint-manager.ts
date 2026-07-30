/**
 * CheckpointManager — snapshot/restore agent state via UnifiedDB.
 *
 * Phase 18: Missing Capabilities — Conversation Checkpointing & Recovery
 *
 * Persists to `agent_checkpoints` table and restores memory snapshot
 * alongside spawning a new agent id.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { AgentCheckpointRow } from '../db/schema.js';
import { createNoopLogger, type Logger } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface CheckpointMessage {
  content: string;
  role: string;
  timestamp?: number;
  toolCalls?: Array<{ args: unknown; id: string; name: string }>;
}

export interface CheckpointTokenBudget {
  max_tokens_per_session?: number;
  max_tokens_per_turn?: number;
  remaining_tokens?: number;
}

export interface CheckpointMetadata {
  tokensUsed: number;
  turnsCompleted: number;
  [key: string]: unknown;
}

export interface AgentCheckpoint {
  agentId: string;
  id: string;
  memorySnapshot: unknown;
  messageHistory: CheckpointMessage[];
  metadata: CheckpointMetadata;
  name: string;
  timestamp: string;
  tokenBudget: CheckpointTokenBudget | null;
}

export interface CreateCheckpointInput {
  agentId: string;
  memorySnapshot?: unknown;
  messageHistory?: CheckpointMessage[];
  metadata?: Partial<CheckpointMetadata> & Record<string, unknown>;
  name: string;
  timestamp?: string;
  tokenBudget?: CheckpointTokenBudget | null;
}

export interface RestoreCheckpointResult {
  checkpoint: AgentCheckpoint;
  newAgentId: string;
}

// ── DB abstraction ───────────────────────────────────────────────────────

export interface CheckpointDB {
  execute(sql: string, params?: unknown[]): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
  querySingle<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
}

// ── Memory abstraction ───────────────────────────────────────────────────

export interface CheckpointMemory {
  restoreSnapshot?(snapshot: unknown): void | Promise<void>;
  snapshot?(scope?: string): unknown | Promise<unknown>;
}

// ── AgentHost abstraction ────────────────────────────────────────────────

export interface CheckpointAgentHost {
  getAgent?(agentId: string):
    | {
        budget?: CheckpointTokenBudget;
        messages?: CheckpointMessage[];
        tokensUsed?: number;
        turnsCompleted?: number;
      }
    | null
    | undefined;
  spawn?(spec: Record<string, unknown>): Promise<{ id: string } | { spec: { id: string } }>;
}

export interface CheckpointManagerDeps {
  agentHost?: CheckpointAgentHost;
  db: CheckpointDB;
  idGenerator?: () => string;
  logger?: Logger;
  memory?: CheckpointMemory;
  timestampGenerator?: () => string;
}

export interface CheckpointManagerOptions {
  ensureTable?: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────

const TABLE = 'agent_checkpoints';

// ── Helpers ──────────────────────────────────────────────────────────────

function validateAgentId(agentId: string): void {
  if (typeof agentId !== 'string') {
    throw new Error('Invalid agentId: must be a non-empty string');
  }
  if (agentId.trim().length === 0) {
    throw new Error('Invalid agentId: must be a non-empty string');
  }
}

function validateName(name: string): void {
  if (typeof name !== 'string') {
    throw new Error('Invalid checkpoint name: must be a non-empty string');
  }
  if (name.trim().length === 0) {
    throw new Error('Invalid checkpoint name: must be a non-empty string');
  }
}

function validateCheckpointId(checkpointId: string): void {
  if (typeof checkpointId !== 'string') {
    throw new Error('Invalid checkpointId: must be a non-empty string');
  }
  if (checkpointId.trim().length === 0) {
    throw new Error('Invalid checkpointId: must be a non-empty string');
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseCheckpointRow(row: AgentCheckpointRow): AgentCheckpoint {
  try {
    const parsed = JSON.parse(row.data) as AgentCheckpoint;
    const hasId = typeof parsed.id === 'string' && parsed.id.length > 0;
    if (!hasId) {
      throw new Error('Invalid checkpoint data: missing required fields');
    }
    const hasAgentId = typeof parsed.agentId === 'string' && parsed.agentId.length > 0;
    if (!hasAgentId) {
      throw new Error('Invalid checkpoint data: missing required fields');
    }
    const hasName = typeof parsed.name === 'string' && parsed.name.length > 0;
    if (!hasName) {
      throw new Error('Invalid checkpoint data: missing required fields');
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse checkpoint data for id "${row.id}": ${message}`);
  }
}

function buildMetadata(base: Partial<CheckpointMetadata> & Record<string, unknown>): CheckpointMetadata {
  const turns = typeof base.turnsCompleted === 'number' ? base.turnsCompleted : 0;
  const tokens = typeof base.tokensUsed === 'number' ? base.tokensUsed : 0;
  const baseRecord = base as Record<string, unknown>;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(baseRecord)) {
    if (key === 'turnsCompleted' || key === 'tokensUsed') {
      continue;
    }
    rest[key] = value;
  }
  return {
    turnsCompleted: turns,
    tokensUsed: tokens,
    ...rest
  };
}

function enrichFromAgentHost(
  input: CreateCheckpointInput,
  deps: CheckpointManagerDeps,
  currentHistory: CheckpointMessage[],
  currentBudget: CheckpointTokenBudget | null,
  currentMetadata: CheckpointMetadata
): { history: CheckpointMessage[]; budget: CheckpointTokenBudget | null; metadata: CheckpointMetadata } {
  let history = currentHistory;
  let budget = currentBudget;
  let metadata = currentMetadata;

  if (!deps.agentHost?.getAgent) {
    return { history, budget, metadata };
  }

  try {
    const agent = deps.agentHost.getAgent(input.agentId);
    if (!agent) {
      return { history, budget, metadata };
    }
    if (history.length === 0 && agent.messages) {
      history = agent.messages;
    }
    if (budget === null && agent.budget) {
      budget = agent.budget;
    }
    if (agent.turnsCompleted !== undefined) {
      metadata = { ...metadata, turnsCompleted: agent.turnsCompleted };
    }
    if (agent.tokensUsed !== undefined) {
      metadata = { ...metadata, tokensUsed: agent.tokensUsed };
    }
  } catch {
    // non-fatal
  }

  return { history, budget, metadata };
}

async function collectMemorySnapshot(
  input: CreateCheckpointInput,
  deps: CheckpointManagerDeps,
  currentSnapshot: unknown
): Promise<unknown> {
  if (currentSnapshot !== undefined) {
    return currentSnapshot;
  }
  if (!deps.memory?.snapshot) {
    return null;
  }
  try {
    const snap = deps.memory.snapshot(input.agentId);
    if (snap instanceof Promise) {
      return await snap;
    }
    return snap;
  } catch {
    return null;
  }
}

// ── Factory ──────────────────────────────────────────────────────────────

export interface CheckpointManager {
  createCheckpoint(input: CreateCheckpointInput): Promise<AgentCheckpoint>;
  deleteCheckpoint(checkpointId: string): Promise<void>;
  getCheckpoint(checkpointId: string): Promise<AgentCheckpoint | null>;
  listCheckpoints(agentId?: string): Promise<AgentCheckpoint[]>;
  readonly name: string;
  restoreCheckpoint(checkpointId: string): Promise<RestoreCheckpointResult>;
  start(): Promise<void>;
  readonly state: 'stopped' | 'running';
  stop(): Promise<void>;
}

export function createCheckpointManager(
  deps: CheckpointManagerDeps,
  options: CheckpointManagerOptions = {}
): CheckpointManager {
  if (!deps.db) {
    throw new Error('CheckpointManager requires db');
  }

  const logger = deps.logger ?? createNoopLogger();
  const idGenerator = deps.idGenerator ?? (() => randomUUID());
  const timestampGenerator = deps.timestampGenerator ?? nowIso;
  const ensureTable = options.ensureTable ?? true;

  let _state: 'stopped' | 'running' = 'stopped';

  async function ensureTableExists(): Promise<void> {
    if (!ensureTable) {
      return;
    }
    await deps.db.execute(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )`
    );
    await deps.db.execute(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_agent_id ON ${TABLE}(agent_id)`);
    await deps.db.execute(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_timestamp ON ${TABLE}(timestamp)`);
  }

  async function doCreateCheckpoint(input: CreateCheckpointInput): Promise<AgentCheckpoint> {
    validateAgentId(input.agentId);
    validateName(input.name);

    const id = idGenerator();
    const timestamp = input.timestamp ?? timestampGenerator();

    let messageHistory = input.messageHistory ?? [];
    let tokenBudget = input.tokenBudget ?? null;
    let metadata = buildMetadata(input.metadata ?? {});
    const rawSnapshot = input.memorySnapshot;

    const enriched = enrichFromAgentHost(input, deps, messageHistory, tokenBudget, metadata);
    messageHistory = enriched.history;
    tokenBudget = enriched.budget;
    metadata = enriched.metadata;

    const memorySnapshot = await collectMemorySnapshot(input, deps, rawSnapshot);

    const checkpoint: AgentCheckpoint = {
      id,
      agentId: input.agentId,
      name: input.name,
      timestamp,
      messageHistory,
      memorySnapshot: memorySnapshot ?? null,
      tokenBudget,
      metadata
    };

    await ensureTableExists();

    await deps.db.execute(`INSERT INTO ${TABLE} (id, agent_id, name, timestamp, data) VALUES (?, ?, ?, ?, ?)`, [
      checkpoint.id,
      checkpoint.agentId,
      checkpoint.name,
      checkpoint.timestamp,
      JSON.stringify(checkpoint)
    ]);

    logger.info('Checkpoint created', {
      checkpointId: checkpoint.id,
      agentId: checkpoint.agentId,
      name: checkpoint.name
    });

    return checkpoint;
  }

  async function doGetCheckpoint(checkpointId: string): Promise<AgentCheckpoint | null> {
    validateCheckpointId(checkpointId);
    await ensureTableExists();
    const row = await deps.db.querySingle<AgentCheckpointRow>(
      `SELECT id, agent_id, name, timestamp, data, created_at FROM ${TABLE} WHERE id = ?`,
      [checkpointId]
    );
    if (!row) {
      return null;
    }
    return parseCheckpointRow(row);
  }

  async function doListCheckpoints(agentId?: string): Promise<AgentCheckpoint[]> {
    await ensureTableExists();
    let rows: AgentCheckpointRow[];
    if (agentId) {
      validateAgentId(agentId);
      rows = (await deps.db.query(
        `SELECT id, agent_id, name, timestamp, data, created_at FROM ${TABLE} WHERE agent_id = ? ORDER BY timestamp DESC`,
        [agentId]
      )) as AgentCheckpointRow[];
    } else {
      rows = (await deps.db.query(
        `SELECT id, agent_id, name, timestamp, data, created_at FROM ${TABLE} ORDER BY timestamp DESC`
      )) as AgentCheckpointRow[];
    }

    const result: AgentCheckpoint[] = [];
    for (const row of rows) {
      try {
        result.push(parseCheckpointRow(row));
      } catch {
        // skip corrupted rows
      }
    }
    return result;
  }

  async function tryRestoreMemory(snapshot: unknown, checkpointId: string, newAgentId: string): Promise<void> {
    if (!deps.memory?.restoreSnapshot) {
      return;
    }
    if (snapshot === null || snapshot === undefined) {
      return;
    }
    try {
      const result = deps.memory.restoreSnapshot(snapshot);
      if (result instanceof Promise) {
        await result;
      }
      logger.info('Memory snapshot restored', { checkpointId, newAgentId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to restore memory snapshot', { checkpointId, error: message });
    }
  }

  async function trySpawnAgent(checkpoint: AgentCheckpoint, newAgentId: string): Promise<void> {
    if (!deps.agentHost?.spawn) {
      return;
    }
    try {
      await deps.agentHost.spawn({
        id: newAgentId,
        name: checkpoint.name,
        originalAgentId: checkpoint.agentId,
        checkpointId: checkpoint.id,
        messages: checkpoint.messageHistory,
        tokenBudget: checkpoint.tokenBudget,
        metadata: checkpoint.metadata,
        memoryScope: `restored_${checkpoint.id}`,
        role: 'restored'
      });
      logger.info('Restored agent spawned', { newAgentId, checkpointId: checkpoint.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to spawn restored agent for checkpoint "${checkpoint.id}": ${message}`);
    }
  }

  async function doRestoreCheckpoint(checkpointId: string): Promise<RestoreCheckpointResult> {
    validateCheckpointId(checkpointId);
    await ensureTableExists();

    const row = await deps.db.querySingle<AgentCheckpointRow>(
      `SELECT id, agent_id, name, timestamp, data, created_at FROM ${TABLE} WHERE id = ?`,
      [checkpointId]
    );

    if (!row) {
      throw new Error(`Checkpoint "${checkpointId}" not found`);
    }

    const checkpoint = parseCheckpointRow(row);
    const newAgentId = `${checkpoint.agentId}_restored_${Date.now()}`;

    await tryRestoreMemory(checkpoint.memorySnapshot, checkpointId, newAgentId);
    await trySpawnAgent(checkpoint, newAgentId);

    return {
      newAgentId,
      checkpoint
    };
  }

  const manager: CheckpointManager = {
    name: 'checkpoint-manager',

    get state() {
      return _state;
    },

    async start(): Promise<void> {
      await ensureTableExists();
      _state = 'running';
      logger.info('CheckpointManager started');
    },

    stop(): Promise<void> {
      _state = 'stopped';
      logger.info('CheckpointManager stopped');
      return Promise.resolve();
    },

    createCheckpoint(input: CreateCheckpointInput): Promise<AgentCheckpoint> {
      return doCreateCheckpoint(input);
    },

    getCheckpoint(checkpointId: string): Promise<AgentCheckpoint | null> {
      return doGetCheckpoint(checkpointId);
    },

    listCheckpoints(agentId?: string): Promise<AgentCheckpoint[]> {
      return doListCheckpoints(agentId);
    },

    async deleteCheckpoint(checkpointId: string): Promise<void> {
      validateCheckpointId(checkpointId);
      await ensureTableExists();
      await deps.db.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [checkpointId]);
      logger.info('Checkpoint deleted', { checkpointId });
    },

    restoreCheckpoint(checkpointId: string): Promise<RestoreCheckpointResult> {
      return doRestoreCheckpoint(checkpointId);
    }
  };

  return manager;
}

// ── Class wrapper for compatibility ─────────────────────────────────────

export class CheckpointManagerService implements CheckpointManager {
  readonly #inner: CheckpointManager;
  readonly name = 'checkpoint-manager';

  constructor(deps: CheckpointManagerDeps, options: CheckpointManagerOptions = {}) {
    this.#inner = createCheckpointManager(deps, options);
  }

  get state(): 'stopped' | 'running' {
    return this.#inner.state;
  }

  async start(): Promise<void> {
    await this.#inner.start();
  }

  async stop(): Promise<void> {
    await this.#inner.stop();
  }

  async createCheckpoint(input: CreateCheckpointInput): Promise<AgentCheckpoint> {
    return await this.#inner.createCheckpoint(input);
  }

  async getCheckpoint(checkpointId: string): Promise<AgentCheckpoint | null> {
    return await this.#inner.getCheckpoint(checkpointId);
  }

  async listCheckpoints(agentId?: string): Promise<AgentCheckpoint[]> {
    return await this.#inner.listCheckpoints(agentId);
  }

  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await this.#inner.deleteCheckpoint(checkpointId);
  }

  async restoreCheckpoint(checkpointId: string): Promise<RestoreCheckpointResult> {
    return await this.#inner.restoreCheckpoint(checkpointId);
  }
}
