/**
 * ACP Session Persistence — sessions survive daemon restarts via SQLite.
 * @module
 */

import Database from 'better-sqlite3';
import type { ACPEvent, ACPEventLedger, MaterializedViews } from '../services/acp-event-ledger.js';
import type { Logger } from '../types.js';
import type { MCPServerDefinition } from './mcp-manager.js';

export interface ACPSessionRecord {
  readonly additionalDirectories?: readonly string[] | undefined;
  readonly createdAt: string;
  readonly cwd: string;
  readonly lastActiveAt: string;
  readonly mcpServers?: Record<string, MCPServerDefinition> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly mode?: string | undefined;
  readonly sessionId: string;
}

export interface PersistedSessionState {
  readonly events: readonly ACPEvent[];
  readonly materializedViews: MaterializedViews;
  readonly record: ACPSessionRecord;
}

export interface ACPSessionPersistenceDeps {
  readonly dbPath: string;
  readonly ledger?: ACPEventLedger | undefined;
  readonly logger: Logger;
}

export interface ACPSessionPersistenceOptions {
  readonly maxSessions?: number | undefined;
}

const DEFAULT_MAX_SESSIONS = 200;

interface SessionRow {
  additional_directories: string;
  created_at: string;
  cwd: string;
  last_active_at: string;
  mcp_servers: string;
  metadata: string;
  mode: string;
  session_id: string;
}

export class ACPSessionPersistence {
  readonly #db: Database.Database;
  readonly #ledger: ACPEventLedger | undefined;
  readonly #logger: Logger;
  readonly #maxSessions: number;

  constructor(dbPath: string, logger: Logger, ledger?: ACPEventLedger, options?: ACPSessionPersistenceOptions) {
    this.#logger = logger;
    this.#ledger = ledger;
    this.#maxSessions = options?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.#db = new Database(dbPath);
    this.#init();
  }

  #init(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS acp_sessions (
        session_id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        additional_directories TEXT NOT NULL DEFAULT '[]',
        mcp_servers TEXT NOT NULL DEFAULT '{}',
        mode TEXT NOT NULL DEFAULT 'code',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_acp_sessions_last_active
        ON acp_sessions(last_active_at);
    `);
    this.#logger.info('ACP session persistence initialized');
  }

  saveSession(
    record: Omit<ACPSessionRecord, 'createdAt' | 'lastActiveAt'> &
      Partial<Pick<ACPSessionRecord, 'createdAt' | 'lastActiveAt'>>
  ): ACPSessionRecord {
    if (!record.sessionId) {
      throw new Error('sessionId is required');
    }
    if (!record.cwd) {
      throw new Error('cwd is required');
    }

    const now = new Date().toISOString();
    const createdAt = record.createdAt ?? now;
    const lastActiveAt = record.lastActiveAt ?? now;

    this.#enforceLimit();

    this.#db
      .prepare(
        `INSERT INTO acp_sessions
          (session_id, cwd, additional_directories, mcp_servers, mode, metadata, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           cwd = excluded.cwd,
           additional_directories = excluded.additional_directories,
           mcp_servers = excluded.mcp_servers,
           mode = excluded.mode,
           metadata = excluded.metadata,
           last_active_at = excluded.last_active_at`
      )
      .run(
        record.sessionId,
        record.cwd,
        JSON.stringify(record.additionalDirectories ?? []),
        JSON.stringify(record.mcpServers ?? {}),
        record.mode ?? 'code',
        JSON.stringify(record.metadata ?? {}),
        createdAt,
        lastActiveAt
      );

    if (this.#ledger) {
      try {
        this.#ledger.record(record.sessionId, 'session.create', {
          cwd: record.cwd,
          additionalDirectories: record.additionalDirectories,
          mcpServers: record.mcpServers,
          mode: record.mode
        });
      } catch {
        // ledger write failure shouldn't block persistence
      }
    }

    return {
      sessionId: record.sessionId,
      cwd: record.cwd,
      additionalDirectories: record.additionalDirectories,
      mcpServers: record.mcpServers,
      mode: record.mode ?? 'code',
      metadata: record.metadata,
      createdAt,
      lastActiveAt
    };
  }

  loadSession(sessionId: string): ACPSessionRecord | null {
    const row = this.#db.prepare('SELECT * FROM acp_sessions WHERE session_id = ?').get(sessionId) as
      | SessionRow
      | undefined;
    if (!row) {
      return null;
    }
    return this.#rowToRecord(row);
  }

  loadPersistedState(sessionId: string): PersistedSessionState | null {
    const record = this.loadSession(sessionId);
    if (!record) {
      return null;
    }

    if (!this.#ledger) {
      return {
        record,
        events: [],
        materializedViews: {
          conversation: [],
          toolCalls: [],
          inference: [],
          compaction: []
        }
      };
    }

    const events = this.#ledger.getSessionEvents(sessionId);
    const views = this.#ledger.getMaterializedViews(sessionId);

    return {
      record,
      events,
      materializedViews: views
    };
  }

  resumeSession(sessionId: string): PersistedSessionState | null {
    const state = this.loadPersistedState(sessionId);
    if (!state) {
      return null;
    }
    this.#db
      .prepare('UPDATE acp_sessions SET last_active_at = ? WHERE session_id = ?')
      .run(new Date().toISOString(), sessionId);
    return state;
  }

  listSessions(): readonly ACPSessionRecord[] {
    const rows = this.#db.prepare('SELECT * FROM acp_sessions ORDER BY last_active_at DESC').all() as SessionRow[];
    return rows.map(r => this.#rowToRecord(r));
  }

  deleteSession(sessionId: string): boolean {
    const info = this.#db.prepare('DELETE FROM acp_sessions WHERE session_id = ?').run(sessionId);
    if (this.#ledger) {
      try {
        this.#ledger.record(sessionId, 'session.close', { deleted: true });
      } catch {
        // ignore
      }
    }
    return info.changes > 0;
  }

  updateSession(
    sessionId: string,
    updates: Partial<Pick<ACPSessionRecord, 'mcpServers' | 'metadata' | 'mode'>>
  ): ACPSessionRecord | null {
    const existing = this.loadSession(sessionId);
    if (!existing) {
      return null;
    }

    const merged: ACPSessionRecord = {
      ...existing,
      mode: updates.mode ?? existing.mode,
      mcpServers: updates.mcpServers ?? existing.mcpServers,
      metadata: updates.metadata ?? existing.metadata,
      lastActiveAt: new Date().toISOString()
    };

    this.#db
      .prepare(
        'UPDATE acp_sessions SET mode = ?, mcp_servers = ?, metadata = ?, last_active_at = ? WHERE session_id = ?'
      )
      .run(
        merged.mode ?? 'code',
        JSON.stringify(merged.mcpServers ?? {}),
        JSON.stringify(merged.metadata ?? {}),
        merged.lastActiveAt,
        sessionId
      );

    return merged;
  }

  restoreOnStartup(): readonly ACPSessionRecord[] {
    const sessions = this.listSessions();
    this.#logger.info(`Restoring ${sessions.length} ACP sessions from persistence`);
    return sessions;
  }

  exportSessionJsonl(sessionId: string): string | null {
    if (!this.#ledger) {
      return null;
    }
    const record = this.loadSession(sessionId);
    if (!record) {
      return null;
    }
    const metaLine = JSON.stringify({
      sessionId,
      eventType: 'session.create',
      sequence: 0,
      timestamp: record.createdAt,
      provenance: 'acp-client',
      eventData: { cwd: record.cwd, mode: record.mode }
    });
    const eventsJsonl = this.#ledger.exportJsonl(sessionId);
    if (!eventsJsonl) {
      return metaLine;
    }
    return `${metaLine}\n${eventsJsonl}`;
  }

  close(): void {
    this.#db.close();
  }

  #rowToRecord(row: SessionRow): ACPSessionRecord {
    let additionalDirectories: string[] = [];
    let mcpServers: Record<string, MCPServerDefinition> = {};
    let metadata: Record<string, unknown> = {};

    try {
      const parsed = JSON.parse(row.additional_directories) as unknown;
      if (Array.isArray(parsed)) {
        additionalDirectories = parsed as string[];
      }
    } catch {
      // ignore
    }
    try {
      const parsed = JSON.parse(row.mcp_servers) as Record<string, MCPServerDefinition>;
      if (typeof parsed === 'object' && parsed !== null) {
        mcpServers = parsed;
      }
    } catch {
      // ignore
    }
    try {
      const parsed = JSON.parse(row.metadata) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null) {
        metadata = parsed;
      }
    } catch {
      // ignore
    }

    return {
      sessionId: row.session_id,
      cwd: row.cwd,
      additionalDirectories,
      mcpServers,
      mode: row.mode,
      metadata,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at
    };
  }

  #enforceLimit(): void {
    const countRow = this.#db.prepare('SELECT COUNT(*) as count FROM acp_sessions').get() as { count: number };
    if (countRow.count >= this.#maxSessions) {
      this.#db
        .prepare(
          'DELETE FROM acp_sessions WHERE session_id IN (SELECT session_id FROM acp_sessions ORDER BY last_active_at ASC LIMIT 1)'
        )
        .run();
      this.#logger.warn('ACP max persisted sessions reached, removed oldest');
    }
  }
}

export interface CreatePersistenceOptions {
  readonly dbPath: string;
  readonly ledger?: ACPEventLedger | undefined;
  readonly logger: Logger;
  readonly maxSessions?: number | undefined;
}

export function createSessionPersistence(options: CreatePersistenceOptions): ACPSessionPersistence {
  if (!options.dbPath) {
    throw new Error('dbPath is required for ACPSessionPersistence');
  }
  if (!options.logger) {
    throw new Error('logger is required');
  }
  return new ACPSessionPersistence(options.dbPath, options.logger, options.ledger, {
    maxSessions: options.maxSessions
  });
}
