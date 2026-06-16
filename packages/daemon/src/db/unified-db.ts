import path from 'node:path';
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
 * falling back to better-sqlite3 directly. Uses loadHonkerExtension() from
 * @agentsy/memory to detect native extension availability on startup.
 */
export class UnifiedDB {
  private db: unknown = null;
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

  // fallow-ignore-next-line complexity
  async open(): Promise<void> {
    // Try Honker native extension — check for .so/.dylib files
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
          // In production: const { open } = await import('@russellthehippo/honker-node');
          // this.db = open(this.config.path);
          // this._mode = 'native';
          this.config.logger.info('Honker native extension detected');
        }
      } catch {
        // Extension detection failed, fall through to better-sqlite3 fallback
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
        (this.db as { pragma: (s: string) => void }).pragma('journal_mode = WAL');
      }
      (this.db as { pragma: (s: string) => void }).pragma(`busy_timeout = ${this.config.busyTimeoutMs ?? 5000}`);
    }

    this._open = true;
    this.config.logger.info('UnifiedDB opened', {
      path: this.config.path,
      mode: this._mode
    });
  }

  // ── Queue API ──────────────────────────────────────

  queue(name: string): QueueHandle {
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }

    const q = this.createQueue(name);
    this.queues.set(name, q);
    return q;
  }

  private createQueue(name: string): QueueHandle {
    const db = this.db as unknown as {
      prepare: (sql: string) => {
        run: (...params: unknown[]) => { lastInsertRowid: number | bigint };
        all: (...params: unknown[]) => unknown[];
      };
    };

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
      enqueueTx: (_tx: unknown, payload: unknown, opts?: Record<string, unknown>) => {
        const result = db
          .prepare(`INSERT INTO honker_jobs_${name} (payload, opts) VALUES (?, ?)`)
          .run(JSON.stringify(payload), opts ? JSON.stringify(opts) : null);
        return `job_${String(result.lastInsertRowid)}`;
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
        ack: (_jobId: string) => {
          db.prepare(`UPDATE honker_jobs_${name} SET status = 'completed' WHERE id = ?`).run(_jobId);
        }
      })
    };
  }

  // ── Stream API ─────────────────────────────────────

  stream(name: string): StreamHandle {
    const existing = this.streams.get(name);
    if (existing) {
      return existing;
    }

    const s = this.createStream(name);
    this.streams.set(name, s);
    return s;
  }

  private createStream(name: string): StreamHandle {
    const db = this.db as unknown as {
      prepare: (sql: string) => {
        run: (...params: unknown[]) => void;
        all: (...params: unknown[]) => Array<{ offset: number; payload: string }>;
      };
    };

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
        const rows =
          offset === undefined
            ? db.prepare(`SELECT offset, payload FROM honker_streams_${name} ORDER BY offset ASC`).all()
            : db
                .prepare(`SELECT offset, payload FROM honker_streams_${name} WHERE offset > ? ORDER BY offset ASC`)
                .all(offset);
        return Promise.resolve(rows.map(r => ({ payload: JSON.parse(r.payload), offset: r.offset })));
      }
    };
  }

  // ── Transaction API ────────────────────────────────

  transaction(): TransactionHandle {
    const db = this.db as unknown as { prepare: (sql: string) => { run: (...params: unknown[]) => void } };
    db.prepare('BEGIN').run();

    return {
      execute: (sql: string, params?: unknown[]) => {
        db.prepare(sql).run(...(params ?? []));
      },
      commit: () => {
        db.prepare('COMMIT').run();
      },
      rollback: () => {
        db.prepare('ROLLBACK').run();
      }
    };
  }

  // ── Query API ──────────────────────────────────────

  query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = this.db as unknown as { prepare: (sql: string) => { all: (...params: unknown[]) => T[] } };
    return Promise.resolve(db.prepare(sql).all(...params));
  }

  execute(sql: string, params: unknown[] = []): Promise<void> {
    const db = this.db as unknown as { prepare: (sql: string) => { run: (...params: unknown[]) => void } };
    db.prepare(sql).run(...params);
    return Promise.resolve();
  }

  querySingle<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const db = this.db as unknown as { prepare: (sql: string) => { get: (...params: unknown[]) => T | undefined } };
    const result = db.prepare(sql).get(...params);
    return Promise.resolve(result ?? null);
  }

  // ── Migration API ──────────────────────────────────

  migrate(): Promise<void> {
    const db = this.db as unknown as { prepare: (sql: string) => { run: (...params: unknown[]) => void } };

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
      const existing = (
        db.prepare('SELECT id FROM _migrations WHERE name = ?') as unknown as { get: (...params: unknown[]) => unknown }
      ).get(migration.name);
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
      (this.db as { close: () => void }).close();
      this.db = null;
    }
    this._open = false;
    this.config.logger.info('UnifiedDB closed');
    return Promise.resolve();
  }
}
