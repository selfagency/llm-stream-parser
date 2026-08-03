/**
 * ACP Event Ledger — SQLite-backed persistence for ACP events with
 * event-sourced rollout, JSONL append-only log, materialized views,
 * and fork predicate (keep_forked_rollout_item).
 *
 * Every ACP event (session create, prompt, tool call, stream chunk,
 * session close) is persisted for replay, audit, and crash recovery.
 *
 * Event-sourcing additions (Sprint 10):
 * - JSONL append-only log persisted to SQLite with sequence per session
 * - exportJsonl / importJsonl / replayFromJsonl
 * - Materialized views: conversation, tool_calls, inference, compaction
 * - Reducer fork predicate: system+user+final-assistant only
 * - Fork preserves conversation continuity
 *
 * Configurable limits:
 * - maxSessions: 200
 * - maxEventsPerSession: 5000
 * - maxSerializedBytes: 16MB
 *
 * @module
 */

import Database from 'better-sqlite3';
import type { Logger } from '../types.js';

// ── Types ───────────────────────────────────────────────

export type ACPEventType =
  | 'compaction'
  | 'error'
  | 'inference'
  | 'reasoning'
  | 'session.cancel'
  | 'session.close'
  | 'session.create'
  | 'session.prompt'
  | 'stream.chunk'
  | 'stream.end'
  | 'tool.call'
  | 'tool.result';

export type SessionProvenance = 'a2a-delegation' | 'acp-client' | 'cli' | 'subagent-fork';

export interface ACPEvent {
  readonly eventData: string; // JSON
  readonly eventType: ACPEventType;
  readonly id: number;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export interface JsonlRecord {
  readonly eventData: Record<string, unknown>;
  readonly eventType: ACPEventType;
  readonly id?: number | undefined;
  readonly provenance: SessionProvenance;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export interface LedgerConfig {
  readonly maxEventsPerSession: number;
  readonly maxSerializedBytes: number;
  readonly maxSessions: number;
}

export interface ConversationEntry {
  readonly content: string;
  readonly eventType: ACPEventType;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export interface ToolCallEntry {
  readonly arguments: Record<string, unknown>;
  readonly name: string;
  readonly result?: unknown | undefined;
  readonly sequence: number;
  readonly sessionId: string;
  readonly status: 'completed' | 'failed' | 'running';
  readonly timestamp: string;
  readonly toolCallId: string;
}

export interface InferenceEntry {
  readonly costUsd?: number | undefined;
  readonly eventType: ACPEventType;
  readonly inputTokens?: number | undefined;
  readonly model?: string | undefined;
  readonly outputTokens?: number | undefined;
  readonly raw: Record<string, unknown>;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export interface CompactionEntry {
  readonly compactedTokens?: number | undefined;
  readonly originalTokens?: number | undefined;
  readonly raw: Record<string, unknown>;
  readonly sequence: number;
  readonly sessionId: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface MaterializedViews {
  readonly compaction: readonly CompactionEntry[];
  readonly conversation: readonly ConversationEntry[];
  readonly inference: readonly InferenceEntry[];
  readonly toolCalls: readonly ToolCallEntry[];
}

export type ForkPredicate = (event: ACPEvent) => boolean;

const DEFAULT_CONFIG: LedgerConfig = {
  maxEventsPerSession: 5000,
  maxSerializedBytes: 16 * 1024 * 1024,
  maxSessions: 200
};

// ── Helpers ──────────────────────────────────────────────

interface LooseEventData {
  args?: unknown;
  arguments?: unknown;
  compactedTokenCount?: unknown;
  compactedTokens?: unknown;
  content?: unknown;
  costUsd?: unknown;
  cwd?: unknown;
  durationMs?: unknown;
  id?: unknown;
  inputTokens?: unknown;
  model?: unknown;
  name?: unknown;
  originalTokenCount?: unknown;
  originalTokens?: unknown;
  output?: unknown;
  outputTokens?: unknown;
  prompt?: unknown;
  result?: unknown;
  status?: unknown;
  summary?: unknown;
  systemPrompt?: unknown;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  usage?: unknown;
}

function asLoose(data: Record<string, unknown>): LooseEventData {
  return data as LooseEventData;
}

function parseEventDataSafe(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function extractContent(data: Record<string, unknown>): string {
  const loose = asLoose(data);
  if (typeof loose.content === 'string') {
    return loose.content;
  }
  if (typeof loose.text === 'string') {
    return loose.text;
  }
  if (typeof loose.prompt === 'string') {
    return loose.prompt;
  }
  if (typeof loose.summary === 'string') {
    return loose.summary;
  }
  if (typeof loose.systemPrompt === 'string') {
    return loose.systemPrompt;
  }
  if (typeof loose.cwd === 'string') {
    return `cwd: ${loose.cwd}`;
  }
  return JSON.stringify(data);
}

function extractString(data: Record<string, unknown>, key: keyof LooseEventData): string | undefined {
  const v = asLoose(data)[key];
  return typeof v === 'string' ? v : undefined;
}

function extractNumber(data: Record<string, unknown>, key: keyof LooseEventData): number | undefined {
  const v = asLoose(data)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function extractRecord(data: Record<string, unknown>, key: keyof LooseEventData): Record<string, unknown> | undefined {
  const v = asLoose(data)[key];
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function buildCallEntry(ev: ACPEvent, data: Record<string, unknown>): { id: string; entry: ToolCallEntry } {
  const id = extractString(data, 'toolCallId') ?? extractString(data, 'id') ?? `${ev.sessionId}-${ev.sequence}`;
  const name = extractString(data, 'name') ?? extractString(data, 'toolName') ?? 'unknown';
  const args = extractRecord(data, 'arguments') ?? extractRecord(data, 'args') ?? {};
  const entry: ToolCallEntry = {
    arguments: args,
    name,
    sequence: ev.sequence,
    sessionId: ev.sessionId,
    status: 'running',
    timestamp: ev.timestamp,
    toolCallId: id
  };
  return { id, entry };
}

function buildUpdatedEntry(existing: ToolCallEntry, ev: ACPEvent, data: Record<string, unknown>): ToolCallEntry {
  const loose = asLoose(data);
  return {
    arguments: existing.arguments,
    name: existing.name,
    result: loose.result ?? loose.output ?? data,
    sequence: existing.sequence,
    sessionId: ev.sessionId,
    status: (extractString(data, 'status') as ToolCallEntry['status']) ?? 'completed',
    timestamp: ev.timestamp,
    toolCallId: existing.toolCallId
  };
}

function buildOrphanEntry(
  ev: ACPEvent,
  data: Record<string, unknown>,
  rawId: string
): { id: string; entry: ToolCallEntry } {
  const loose = asLoose(data);
  const orphanId = rawId || `${ev.sessionId}-${ev.sequence}`;
  const entry: ToolCallEntry = {
    arguments: {},
    name: extractString(data, 'name') ?? 'unknown',
    result: loose.result ?? loose.output,
    sequence: ev.sequence,
    sessionId: ev.sessionId,
    status: 'completed',
    timestamp: ev.timestamp,
    toolCallId: orphanId
  };
  return { id: orphanId, entry };
}

// ── Fork Predicate (keep_forked_rollout_item) ────────────

/**
 * Default fork predicate: system + user + final-assistant only.
 * Drops reasoning, tool_call, tool_result, inference, compaction, chunks.
 *
 * Mapping to ACPEventType:
 * - system  => session.create
 * - user    => session.prompt
 * - final-assistant => stream.end
 *
 * This preserves conversation continuity across session branches.
 */
export function keepForkedEventPredicate(event: ACPEvent): boolean {
  return (
    event.eventType === 'session.create' || event.eventType === 'session.prompt' || event.eventType === 'stream.end'
  );
}

// ── JSONL Handling ───────────────────────────────────────

function acpEventToJsonlRecord(event: ACPEvent, provenance: SessionProvenance): JsonlRecord {
  return {
    eventData: parseEventDataSafe(event.eventData),
    eventType: event.eventType,
    id: event.id,
    provenance,
    sequence: event.sequence,
    sessionId: event.sessionId,
    timestamp: event.timestamp
  };
}

function jsonlRecordToLine(record: JsonlRecord): string {
  return JSON.stringify(record);
}

export function parseJsonlLine(line: string): JsonlRecord | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<JsonlRecord>;
    if (!parsed.sessionId || typeof parsed.sequence !== 'number' || !parsed.eventType) {
      return null;
    }
    const eventData = parsed.eventData;
    if (typeof eventData !== 'object' || eventData === null || Array.isArray(eventData)) {
      return null;
    }
    return {
      eventData: eventData as Record<string, unknown>,
      eventType: parsed.eventType as ACPEventType,
      id: typeof parsed.id === 'number' ? parsed.id : undefined,
      provenance: (parsed.provenance as SessionProvenance) ?? 'acp-client',
      sequence: parsed.sequence,
      sessionId: parsed.sessionId,
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function replayFromJsonl(jsonl: string): JsonlRecord[] {
  if (!jsonl.trim()) {
    return [];
  }
  const lines = jsonl.split('\n');
  const records: JsonlRecord[] = [];
  for (const line of lines) {
    const rec = parseJsonlLine(line);
    if (rec) {
      records.push(rec);
    }
  }
  return records.sort((a, b) => a.sequence - b.sequence);
}

// ── Ledger ──────────────────────────────────────────────

export class ACPEventLedger {
  readonly #db: Database.Database;
  readonly #config: LedgerConfig;
  readonly #logger: Logger;

  constructor(dbPath: string, logger: Logger, config?: Partial<LedgerConfig>) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#logger = logger;
    this.#db = new Database(dbPath);
    this.#init();
  }

  #init(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS acp_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL DEFAULT '{}',
        sequence INTEGER NOT NULL DEFAULT 0,
        provenance TEXT NOT NULL DEFAULT 'acp-client'
      );
      CREATE INDEX IF NOT EXISTS idx_acp_events_session
        ON acp_events(session_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_acp_events_timestamp
        ON acp_events(timestamp);
    `);
    this.#logger.info('ACP event ledger initialized');
  }

  /** Record an ACP event to the ledger. */
  record(
    sessionId: string,
    eventType: ACPEventType,
    eventData?: Record<string, unknown>,
    provenance?: SessionProvenance
  ): void {
    this.#enforceLimits(sessionId);

    const eventJson = JSON.stringify(eventData ?? {});
    const eventBytes = Buffer.byteLength(eventJson, 'utf-8');

    if (eventBytes > this.#config.maxSerializedBytes) {
      this.#logger.warn('ACP event too large, truncating', { sessionId, eventType, bytes: eventBytes });
    }

    const sequence = this.#nextSequence(sessionId);

    this.#db
      .prepare(
        "INSERT INTO acp_events (session_id, timestamp, event_type, event_data, sequence, provenance) VALUES (?, datetime('now'), ?, ?, ?, ?)"
      )
      .run(sessionId, eventType, eventJson, sequence, provenance ?? 'acp-client');
  }

  /** Get all events for a session, ordered by sequence. */
  getSessionEvents(sessionId: string): ACPEvent[] {
    const rows = this.#db
      .prepare(
        'SELECT id, session_id, timestamp, event_type, event_data, sequence FROM acp_events WHERE session_id = ? ORDER BY sequence ASC'
      )
      .all(sessionId) as Array<{
      id: number;
      session_id: string;
      timestamp: string;
      event_type: string;
      event_data: string;
      sequence: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      timestamp: r.timestamp,
      eventType: r.event_type as ACPEventType,
      eventData: r.event_data,
      sequence: r.sequence
    }));
  }

  /** Replay all events for a session in order. */
  replaySession(sessionId: string): ACPEvent[] {
    return this.getSessionEvents(sessionId);
  }

  /** Get session provenance metadata. */
  getSessionProvenance(sessionId: string): SessionProvenance | null {
    const row = this.#db
      .prepare('SELECT provenance FROM acp_events WHERE session_id = ? ORDER BY sequence ASC LIMIT 1')
      .get(sessionId) as { provenance: string } | undefined;

    if (!row) {
      return null;
    }
    return row.provenance as SessionProvenance;
  }

  /** Count events in a session. */
  countSessionEvents(sessionId: string): number {
    const row = this.#db.prepare('SELECT COUNT(*) as count FROM acp_events WHERE session_id = ?').get(sessionId) as {
      count: number;
    };
    return row.count;
  }

  /** Close the database connection. */
  close(): void {
    this.#db.close();
  }

  // ── JSONL Append-Only Log ─────────────────────────────

  /** Export session events as JSONL string (one JSON object per line). */
  exportJsonl(sessionId: string): string {
    return this.exportJsonlLines(sessionId).join('\n');
  }

  /** Export session events as JSONL lines array. */
  exportJsonlLines(sessionId: string): string[] {
    const events = this.getSessionEvents(sessionId);
    // Need provenance per row
    const rows = this.#db
      .prepare('SELECT sequence, provenance FROM acp_events WHERE session_id = ? ORDER BY sequence ASC')
      .all(sessionId) as Array<{ sequence: number; provenance: string }>;
    const provMap = new Map<number, SessionProvenance>();
    for (const r of rows) {
      provMap.set(r.sequence, r.provenance as SessionProvenance);
    }

    const lines: string[] = [];
    for (const ev of events) {
      const prov = provMap.get(ev.sequence) ?? 'acp-client';
      const rec = acpEventToJsonlRecord(ev, prov);
      lines.push(jsonlRecordToLine(rec));
    }
    return lines;
  }

  /**
   * Import JSONL into a session, reconstructing identical state.
   * Existing events for the session are preserved; new events are
   * appended with sequence respecting original ordering.
   */
  importJsonl(targetSessionId: string, jsonl: string): void {
    const records = replayFromJsonl(jsonl);
    if (records.length === 0) {
      return;
    }

    // Transaction for atomic import
    const insert = this.#db.prepare(
      'INSERT INTO acp_events (session_id, timestamp, event_type, event_data, sequence, provenance) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const tx = this.#db.transaction((recs: JsonlRecord[]) => {
      // Determine starting sequence for target
      const currentMaxRow = this.#db
        .prepare('SELECT COALESCE(MAX(sequence), 0) as maxSeq FROM acp_events WHERE session_id = ?')
        .get(targetSessionId) as { maxSeq: number };
      let nextSeq = currentMaxRow.maxSeq + 1;

      // If importing into empty session, try to preserve original sequences
      const isEmpty = currentMaxRow.maxSeq === 0;
      if (isEmpty) {
        for (const rec of recs) {
          insert.run(
            targetSessionId,
            rec.timestamp,
            rec.eventType,
            JSON.stringify(rec.eventData),
            rec.sequence,
            rec.provenance
          );
        }
      } else {
        for (const rec of recs) {
          insert.run(
            targetSessionId,
            rec.timestamp,
            rec.eventType,
            JSON.stringify(rec.eventData),
            nextSeq++,
            rec.provenance
          );
        }
      }
    });

    tx(records);
  }

  /** Static helper: parse and sort JSONL into ordered records. */
  static replayFromJsonl(jsonl: string): JsonlRecord[] {
    return replayFromJsonl(jsonl);
  }

  /** Static helper: parse a single JSONL line. */
  static parseJsonlLine(line: string): JsonlRecord | null {
    return parseJsonlLine(line);
  }

  // ── Forking ──────────────────────────────────────────

  /**
   * Fork a session using keep_forked_rollout_item predicate.
   * Preserves conversation continuity: system+user+final-assistant only.
   * Returns forked events.
   */
  forkSession(
    sourceSessionId: string,
    targetSessionId: string,
    predicate: ForkPredicate = keepForkedEventPredicate
  ): ACPEvent[] {
    const sourceEvents = this.getSessionEvents(sourceSessionId);
    if (sourceEvents.length === 0) {
      return [];
    }

    const filtered = sourceEvents.filter(predicate);

    // Build provenance map for source
    const provRows = this.#db
      .prepare('SELECT sequence, provenance FROM acp_events WHERE session_id = ? ORDER BY sequence ASC')
      .all(sourceSessionId) as Array<{ sequence: number; provenance: string }>;
    const provMap = new Map<number, SessionProvenance>();
    for (const r of provRows) {
      provMap.set(r.sequence, r.provenance as SessionProvenance);
    }

    const insert = this.#db.prepare(
      'INSERT INTO acp_events (session_id, timestamp, event_type, event_data, sequence, provenance) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const tx = this.#db.transaction(() => {
      let seq = 1;
      for (const ev of filtered) {
        const prov = provMap.get(ev.sequence) ?? 'subagent-fork';
        // Reuse original timestamp for continuity
        insert.run(targetSessionId, ev.timestamp, ev.eventType, ev.eventData, seq++, prov);
      }
    });

    tx();

    return this.getSessionEvents(targetSessionId);
  }

  // ── Materialized Views ───────────────────────────────

  getConversationView(sessionId: string): readonly ConversationEntry[] {
    const events = this.getSessionEvents(sessionId);
    const result: ConversationEntry[] = [];
    const CONVERSATION_TYPES = new Set(['session.create', 'session.prompt', 'stream.end']);
    for (const ev of events) {
      if (CONVERSATION_TYPES.has(ev.eventType)) {
        const data = parseEventDataSafe(ev.eventData);
        result.push({
          content: extractContent(data),
          eventType: ev.eventType,
          sequence: ev.sequence,
          sessionId: ev.sessionId,
          timestamp: ev.timestamp
        });
      }
    }
    return result.sort((a, b) => a.sequence - b.sequence);
  }

  getToolCallsView(sessionId: string): readonly ToolCallEntry[] {
    const events = this.getSessionEvents(sessionId);
    const callMap = new Map<string, ToolCallEntry>();
    const order: ToolCallEntry[] = [];

    for (const ev of events) {
      if (ev.eventType !== 'tool.call' && ev.eventType !== 'tool.result') {
        continue;
      }
      const data = parseEventDataSafe(ev.eventData);
      if (ev.eventType === 'tool.call') {
        const { id, entry } = buildCallEntry(ev, data);
        callMap.set(id, entry);
        order.push(entry);
      } else {
        const rawId = extractString(data, 'toolCallId') ?? extractString(data, 'id') ?? '';
        const existing = rawId ? callMap.get(rawId) : undefined;
        if (existing) {
          const updated = buildUpdatedEntry(existing, ev, data);
          callMap.set(rawId, updated);
          const idx = order.findIndex(e => e.toolCallId === rawId);
          if (idx !== -1) {
            order[idx] = updated;
          }
        } else {
          const { id, entry } = buildOrphanEntry(ev, data, rawId);
          callMap.set(id, entry);
          order.push(entry);
        }
      }
    }

    return order.sort((a, b) => a.sequence - b.sequence);
  }

  getInferenceView(sessionId: string): readonly InferenceEntry[] {
    const events = this.getSessionEvents(sessionId);
    const result: InferenceEntry[] = [];

    for (const ev of events) {
      if (ev.eventType !== 'inference' && ev.eventType !== 'stream.chunk' && ev.eventType !== 'stream.end') {
        continue;
      }
      const data = parseEventDataSafe(ev.eventData);
      const loose = asLoose(data);
      const usageData = (loose.usage as Record<string, unknown>) ?? data;
      const hasUsage =
        loose.model !== undefined ||
        loose.inputTokens !== undefined ||
        loose.outputTokens !== undefined ||
        loose.costUsd !== undefined ||
        (usageData !== data && typeof usageData === 'object');

      if (ev.eventType === 'inference' || hasUsage) {
        result.push({
          costUsd: extractNumber(data, 'costUsd') ?? extractNumber(usageData, 'costUsd'),
          eventType: ev.eventType,
          inputTokens: extractNumber(data, 'inputTokens') ?? extractNumber(usageData, 'inputTokens'),
          model: extractString(data, 'model') ?? extractString(usageData, 'model'),
          outputTokens: extractNumber(data, 'outputTokens') ?? extractNumber(usageData, 'outputTokens'),
          raw: data,
          sequence: ev.sequence,
          sessionId: ev.sessionId,
          timestamp: ev.timestamp
        });
      }
    }

    return result.sort((a, b) => a.sequence - b.sequence);
  }

  getCompactionView(sessionId: string): readonly CompactionEntry[] {
    const events = this.getSessionEvents(sessionId);
    const result: CompactionEntry[] = [];

    for (const ev of events) {
      if (ev.eventType !== 'compaction') {
        continue;
      }
      const data = parseEventDataSafe(ev.eventData);
      result.push({
        compactedTokens: extractNumber(data, 'compactedTokens') ?? extractNumber(data, 'compactedTokenCount'),
        originalTokens: extractNumber(data, 'originalTokens') ?? extractNumber(data, 'originalTokenCount'),
        raw: data,
        sequence: ev.sequence,
        sessionId: ev.sessionId,
        summary: extractString(data, 'summary') ?? extractContent(data),
        timestamp: ev.timestamp
      });
    }

    return result.sort((a, b) => a.sequence - b.sequence);
  }

  getMaterializedViews(sessionId: string): MaterializedViews {
    return {
      compaction: this.getCompactionView(sessionId),
      conversation: this.getConversationView(sessionId),
      inference: this.getInferenceView(sessionId),
      toolCalls: this.getToolCallsView(sessionId)
    };
  }

  // ── Internal ───────────────────────────────────────────

  #nextSequence(sessionId: string): number {
    const row = this.#db
      .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 as next FROM acp_events WHERE session_id = ?')
      .get(sessionId) as { next: number };
    return row.next;
  }

  #enforceLimits(sessionId: string): void {
    const count = this.countSessionEvents(sessionId);
    if (count >= this.#config.maxEventsPerSession) {
      this.#db
        .prepare(
          'DELETE FROM acp_events WHERE id IN (SELECT id FROM acp_events WHERE session_id = ? ORDER BY sequence ASC LIMIT ?)'
        )
        .run(sessionId, Math.ceil(this.#config.maxEventsPerSession * 0.25));
      this.#logger.warn('ACP session event limit reached, trimmed oldest 25%', { sessionId });
    }

    const sessionRow = this.#db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM acp_events').get() as {
      count: number;
    };
    if (sessionRow.count > this.#config.maxSessions) {
      this.#db
        .prepare(
          'DELETE FROM acp_events WHERE session_id = (SELECT session_id FROM acp_events GROUP BY session_id ORDER BY MIN(sequence) ASC LIMIT 1)'
        )
        .run();
      this.#logger.warn('ACP max sessions reached, removed oldest session');
    }
  }
}

// ── Factory ──────────────────────────────────────────────

export interface CreateLedgerOptions {
  readonly config?: Partial<LedgerConfig>;
  readonly dbPath: string;
  readonly logger: Logger;
}

export function createACPEventLedger(options: CreateLedgerOptions): ACPEventLedger {
  if (!options.dbPath) {
    throw new Error('dbPath is required for ACPEventLedger');
  }
  if (!options.logger) {
    throw new Error('logger is required for ACPEventLedger');
  }
  return new ACPEventLedger(options.dbPath, options.logger, options.config);
}

export function createLedger(options: CreateLedgerOptions): ACPEventLedger {
  return createACPEventLedger(options);
}
