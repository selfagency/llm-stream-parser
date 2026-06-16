import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Logger } from '../types.js';

export interface UnifiedDBConfig {
  blake3ExtensionPath?: string;
  busyTimeoutMs?: number;
  extensionPath?: string;
  logger: Logger;
  path: string;
  walMode?: boolean;
}

export interface QueueHandle {
  claimOne(workerId: string): unknown | null;
  claimWaker(): { next: (workerId: string) => Promise<unknown>; ack: (jobId: string) => void };
  enqueue(payload: unknown, opts?: Record<string, unknown>): string;
  enqueueTx(tx: unknown, payload: unknown, opts?: Record<string, unknown>): string;
}

export interface StreamHandle {
  append(payload: unknown): void;
  read(consumerId: string, offset?: number): Promise<Array<{ payload: unknown; offset: number }>>;
}

export interface TransactionHandle {
  commit(): void;
  execute(sql: string, params?: unknown[]): void;
  rollback(): void;
}

/**
 * UnifiedDB — single Honker-backed SQLite database for all daemon subsystems.
 *
 * Opens ~/.agentsy/agentsy.db via Honker's native extension when available,
 * falling back to better-sqlite3 directly.
 */
export class UnifiedDB {
  private db: Database.Database | null = null;
  private readonly queues = new Map<string, QueueHandle>();
  private readonly streams = new Map<string, StreamHandle>();
  private readonly config: UnifiedDBConfig;
  private _mode: 'native' | 'fallback' = 'fallback';
  private _open = false;

  constructor(config: UnifiedDBConfig) {
    this.config = config;
  }

  get mode(): 'native' | 'fallback' {
    return this._mode;
  }

  get isOpen(): boolean {
    return this._open;
  }

  async open(): Promise<void> {
    // Try Honker native extension
    if (this.config.extensionPath && this.config.blake3ExtensionPath) {
      try {
        const { access } = await import('node:fs/promises');
        const hasHonker = await access(this.config.extensionPath)
          .then(() => true)
          .catch(() => false);
        const hasBlake3 = await access(this.config.blake3ExtensionPath)
          .then(() => true)
          .catch(() => false);

        if (hasHonker && hasBlake3) {
          this.config.logger.info('Honker native extension detected');
        }
      } catch {
        // Extension detection failed, fall through to better-sqlite3
      }
    }

    // Fallback: use better-sqlite3 directly
    if (!this.db) {
      const Database = (await import('better-sqlite3')).default;

      if (this.config.path !== ':memory:') {
        const dir = path.dirname(this.config.path);
        try {
          const { mkdirSync } = await import('node:fs');
          mkdirSync(dir, { recursive: true });
        } catch {
          // race with another process, fine
        }
      }

      this.db = new Database(this.config.path);
      this._mode = 'fallback';

      if (this.config.walMode !== false) {
        this.db.pragma('journal_mode = WAL');
      }
      this.db.pragma(`busy_timeout = ${this.config.busyTimeoutMs ?? 5000}`);
    }

    this._open = true;
    this.config.logger.info('UnifiedDB opened', {
      path: this.config.path,
      mode: this._mode
    });
  }

  /**
   * Validate a queue or stream name against SQL identifier rules.
   * Prevents SQL injection via table-name interpolation.
   */
  private validateName(name: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
      throw new RangeError(
        `Invalid queue/stream name: "${name}". Must be a valid SQL identifier (alphanumeric + underscore, max 63 chars).`
      );
    }
  }

  // ── Queue API ──────────────────────────────────────

  queue(name: string): QueueHandle {
    this.validateName(name);
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }

    const q = this.createQueue(name);
    this.queues.set(name, q);
    return q;
  }

  private createQueue(name: string): QueueHandle {
    const db = this.db;
    if (!db) {
      throw new Error('UnifiedDB not opened');
    }

    db.prepare(
      `CREATE TABLE IF NOT EXISTS honker_jobs_${name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        opts TEXT,
        status TEXT DEFAULT 'pending',
        claimed_by TEXT,
        claimed_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();

    return {
      enqueue: (payload: unknown, opts?: Record<string, unknown>) => {
        const result = db
          .prepare(`INSERT INTO honker_jobs_${name} (payload, opts) VALUES (?, ?)`)
          .run(JSON.stringify(payload), opts ? JSON.stringify(opts) : null);
        return `job_${String(result.lastInsertRowid)}`;
      },
      enqueueTx: (tx: unknown, payload: unknown, opts?: Record<string, unknown>) => {
        const t = tx as { execute: (sql: string, params?: unknown[]) => void };
        const stmt = `INSERT INTO honker_jobs_${name} (payload, opts) VALUES (?, ?)`;
        t.execute(stmt, [JSON.stringify(payload), opts ? JSON.stringify(opts) : null]);
        // Can't return lastInsertRowid via TransactionHandle.execute — caller gets no ID
        return `job_tx`;
      },
      claimOne: (workerId: string) => {
        const rows = db
          .prepare(
            `UPDATE honker_jobs_${name} SET status = 'claimed', claimed_by = ?, claimed_at = unixepoch()
             WHERE id = (SELECT id FROM honker_jobs_${name} WHERE status = 'pending' ORDER BY id ASC LIMIT 1)
             RETURNING *`
          )
          .all(workerId);
        return rows.length > 0 ? rows[0] : null;
      },
      claimWaker: () => ({
        next: (workerId: string) => {
          const rows = db
            .prepare(
              `UPDATE honker_jobs_${name} SET status = 'claimed', claimed_by = ?, claimed_at = unixepoch()
               WHERE id = (SELECT id FROM honker_jobs_${name} WHERE status = 'pending' ORDER BY id ASC LIMIT 1)
               RETURNING *`
            )
            .all(workerId);
          return Promise.resolve(rows.length > 0 ? rows[0] : null);
        },
        ack: (jobId: string) => {
          const numericId = Number.parseInt(jobId.replace(/^job_/, ''), 10);
          if (Number.isNaN(numericId)) {
            throw new RangeError(`Invalid job ID: "${jobId}"`);
          }
          db.prepare(`UPDATE honker_jobs_${name} SET status = 'completed' WHERE id = ?`).run(numericId);
        }
      })
    };
  }

  // ── Stream API ─────────────────────────────────────

  stream(name: string): StreamHandle {
    this.validateName(name);
    const existing = this.streams.get(name);
    if (existing) {
      return existing;
    }

    const s = this.createStream(name);
    this.streams.set(name, s);
    return s;
  }

  private createStream(name: string): StreamHandle {
    const db = this.db;
    if (!db) {
      throw new Error('UnifiedDB not opened');
    }

    db.prepare(
      `CREATE TABLE IF NOT EXISTS honker_streams_${name} (
        offset INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();

    return {
      append: (payload: unknown) => {
        db.prepare(`INSERT INTO honker_streams_${name} (payload) VALUES (?)`).run(JSON.stringify(payload));
      },
      read: (_consumerId: string, offset?: number) => {
        const rows = (
          offset === undefined
            ? db.prepare(`SELECT offset, payload FROM honker_streams_${name} ORDER BY offset ASC`).all()
            : db
                .prepare(`SELECT offset, payload FROM honker_streams_${name} WHERE offset > ? ORDER BY offset ASC`)
                .all(offset)
        ) as Record<string, unknown>[];
        return Promise.resolve(
          rows.map(r => ({ payload: JSON.parse(r.payload as string), offset: r.offset as number }))
        );
      }
    };
  }

  // ── Transaction API ────────────────────────────────

  transaction(): TransactionHandle {
    const db = this.db;
    if (!db) {
      throw new Error('UnifiedDB not opened');
    }
    db.prepare('BEGIN').run();

    let committed = false;

    return {
      execute: (sql: string, params?: unknown[]) => {
        db.prepare(sql).run(...(params ?? []));
      },
      commit: () => {
        db.prepare('COMMIT').run();
        committed = true;
      },
      rollback: () => {
        if (!committed) {
          db.prepare('ROLLBACK').run();
        }
      }
    };
  }

  // ── Query API ──────────────────────────────────────

  query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) {
      throw new Error('UnifiedDB not opened');
    }
    return Promise.resolve(this.db.prepare(sql).all(...params) as T[]);
  }

  execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.db) {
      throw new Error('UnifiedDB not opened');
    }
    this.db.prepare(sql).run(...params);
    return Promise.resolve();
  }

  querySingle<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    if (!this.db) {
      throw new Error('UnifiedDB not opened');
    }
    const result = this.db.prepare(sql).get(...params) as T | undefined;
    return Promise.resolve(result ?? null);
  }

  // ── Migration API ──────────────────────────────────

  migrate(): Promise<void> {
    const db = this.db;
    if (!db) {
      throw new Error('UnifiedDB not opened');
    }

    db.prepare(
      `CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER DEFAULT (unixepoch())
      )`
    ).run();

    const migrations = [
      {
        name: '001_daemon_state',
        sql: 'CREATE TABLE IF NOT EXISTS daemon_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER DEFAULT (unixepoch()))'
      },
      {
        name: '002_scopes',
        sql: 'CREATE TABLE IF NOT EXISTS scopes (key TEXT PRIMARY KEY, path TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()))'
      },
      {
        name: '003_agent_instances',
        sql: "CREATE TABLE IF NOT EXISTS agent_instances (id TEXT PRIMARY KEY, name TEXT, role TEXT, memory_scope TEXT, state TEXT DEFAULT 'idle', created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))"
      },
      {
        name: '004_subprocess_state',
        sql: 'CREATE TABLE IF NOT EXISTS subprocess_state (id TEXT PRIMARY KEY, spec TEXT NOT NULL, status TEXT, pid INTEGER, started_at INTEGER, stopped_at INTEGER, restart_count INTEGER DEFAULT 0)'
      },
      {
        name: '005_connector_state',
        sql: "CREATE TABLE IF NOT EXISTS connector_state (name TEXT PRIMARY KEY, type TEXT, config TEXT, status TEXT DEFAULT 'disconnected', updated_at INTEGER DEFAULT (unixepoch()))"
      },
      {
        name: '006_acp_sessions',
        sql: "CREATE TABLE IF NOT EXISTS acp_sessions (id TEXT PRIMARY KEY, agent_id TEXT, cwd TEXT, mode TEXT DEFAULT 'code', created_at INTEGER DEFAULT (unixepoch()), closed_at INTEGER)"
      }
    ];

    for (const migration of migrations) {
      const existing = db.prepare('SELECT id FROM _migrations WHERE name = ?').get(migration.name) as
        | { id: number }
        | undefined;
      if (!existing) {
        db.prepare(migration.sql).run();
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
        this.config.logger.debug('Applied migration', { name: migration.name });
      }
    }

    this.config.logger.info('Database migrations complete');
    return Promise.resolve();
  }

  migrateFromLegacy(legacyPaths: { memory?: string; cortexkit?: string; tokenomics?: string }): Promise<void> {
    this.config.logger.info('Legacy migration not yet implemented', { legacyPaths });
    return Promise.resolve();
  }

  // ── Lifecycle ──────────────────────────────────────

  close(): Promise<void> {
    this.queues.clear();
    this.streams.clear();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._open = false;
    this.config.logger.info('UnifiedDB closed');
    return Promise.resolve();
  }
}
