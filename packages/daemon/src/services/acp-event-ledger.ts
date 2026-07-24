/**
 * ACP Event Ledger — SQLite-backed persistence for ACP events.
 *
 * Every ACP event (session create, prompt, tool call, stream chunk,
 * session close) is persisted for replay, audit, and crash recovery.
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
  | 'session.create'
  | 'session.prompt'
  | 'session.close'
  | 'session.cancel'
  | 'tool.call'
  | 'tool.result'
  | 'stream.chunk'
  | 'stream.end'
  | 'error';

export type SessionProvenance = 'acp-client' | 'cli' | 'a2a-delegation' | 'subagent-fork';

export interface ACPEvent {
  readonly eventData: string; // JSON
  readonly eventType: ACPEventType;
  readonly id: number;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export interface LedgerConfig {
  readonly maxEventsPerSession: number;
  readonly maxSerializedBytes: number;
  readonly maxSessions: number;
}

const DEFAULT_CONFIG: LedgerConfig = {
  maxSessions: 200,
  maxEventsPerSession: 5000,
  maxSerializedBytes: 16 * 1024 * 1024
};

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

  // ── Internal ───────────────────────────────────────────

  #nextSequence(sessionId: string): number {
    const row = this.#db
      .prepare('SELECT COALESCE(MAX(sequence), 0) + 1 as next FROM acp_events WHERE session_id = ?')
      .get(sessionId) as { next: number };
    return row.next;
  }

  #enforceLimits(sessionId: string): void {
    // Enforce max events per session
    const count = this.countSessionEvents(sessionId);
    if (count >= this.#config.maxEventsPerSession) {
      // Remove oldest events for this session to make room
      this.#db
        .prepare(
          'DELETE FROM acp_events WHERE id IN (SELECT id FROM acp_events WHERE session_id = ? ORDER BY sequence ASC LIMIT ?)'
        )
        .run(sessionId, Math.ceil(this.#config.maxEventsPerSession * 0.25));
      this.#logger.warn('ACP session event limit reached, trimmed oldest 25%', { sessionId });
    }

    // Enforce max total sessions
    const sessionRow = this.#db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM acp_events').get() as {
      count: number;
    };
    if (sessionRow.count > this.#config.maxSessions) {
      // Remove the oldest session's events
      this.#db
        .prepare(
          'DELETE FROM acp_events WHERE session_id = (SELECT session_id FROM acp_events GROUP BY session_id ORDER BY MIN(sequence) ASC LIMIT 1)'
        )
        .run();
      this.#logger.warn('ACP max sessions reached, removed oldest session');
    }
  }
}
