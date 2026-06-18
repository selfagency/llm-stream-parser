import type { UnifiedDB } from '../db/unified-db.js';
import type { Logger } from '../types.js';

export interface EnqueueOptions {
  expiresAt?: Date;
  priority?: number;
  queue?: string;
  retries?: number;
  retryDelayMs?: number;
  runAt?: Date;
  timeoutMs?: number;
}

export interface Job {
  claimedBy: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  payload: unknown;
  priority: number;
  queue: string;
  retries: number;
  retryCount: number;
  runAt: Date | null;
}

export interface HonkerQueueConfig {
  db: UnifiedDB;
  logger: Logger;
  queues: string[];
}

/**
 * Honker-backed durable queue adapter using the daemon's UnifiedDB.
 *
 * Provides transactional enqueue, claim/ack semantics, retries with backoff,
 * priority queues, delayed jobs, and cross-process wake via SQLite.
 */
export class HonkerQueueAdapter {
  private readonly config: HonkerQueueConfig;

  constructor(config: HonkerQueueConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.config.db.isOpen) {
      await this.config.db.open();
    }
    for (const queueName of this.config.queues) {
      this.config.db.queue(queueName);
    }
    this.config.logger.info('Honker queue started', {
      queues: this.config.queues
    });
  }

  enqueue(payload: unknown, options: EnqueueOptions = {}): Promise<string> {
    const queueName = options.queue ?? 'default';
    const q = this.config.db.queue(queueName);

    const opts: Record<string, unknown> = {};
    if (options.priority) {
      opts.priority = options.priority;
    }
    if (options.retries !== undefined) {
      opts.retries = options.retries;
    }
    if (options.retryDelayMs) {
      opts.retryDelay = options.retryDelayMs;
    }
    if (options.runAt) {
      opts.runAt = options.runAt.getTime();
    }
    if (options.expiresAt) {
      opts.expiresAt = options.expiresAt.getTime();
    }
    if (options.timeoutMs) {
      opts.timeoutS = Math.ceil(options.timeoutMs / 1000);
    }

    const jobId = q.enqueue(payload, Object.keys(opts).length > 0 ? opts : undefined);
    return Promise.resolve(jobId);
  }

  claim(workerId: string, queueName = 'default'): Promise<Job | null> {
    const q = this.config.db.queue(queueName);
    const job = q.claimOne(workerId);
    if (!job) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.mapJob(job, queueName));
  }

  ack(jobId: string, queueName = 'default'): Promise<void> {
    this.config.db.queue(queueName);
    const numericId = Number.parseInt(jobId.replace(/^job_/, ''), 10);
    if (!Number.isNaN(numericId)) {
      return this.config.db.execute(`UPDATE honker_jobs_${queueName} SET status = 'completed' WHERE id = ?`, [
        numericId
      ]);
    }
    return Promise.resolve();
  }

  cancel(jobId: string, queueName = 'default'): Promise<void> {
    // Validate queue exists
    this.config.db.queue(queueName);
    const numericId = Number.parseInt(jobId.replace(/^job_/, ''), 10);
    if (!Number.isNaN(numericId)) {
      // Direct SQL via UnifiedDB query API
      this.config.db.execute(`UPDATE honker_jobs_${queueName} SET status = 'cancelled' WHERE id = ?`, [numericId]);
    }
    return Promise.resolve();
  }

  list(queueName = 'default'): Promise<Job[]> {
    // Validate queue exists
    this.config.db.queue(queueName);
    return this.config.db
      .query(`SELECT * FROM honker_jobs_${queueName} WHERE status IN ('pending', 'claimed') ORDER BY id ASC LIMIT 100`)
      .then(rows => rows.map(r => this.mapJob(r, queueName)));
  }

  count(): number {
    return 0;
  }

  stop(): Promise<void> {
    this.config.logger.info('Honker queue stopping');
    return Promise.resolve();
  }

  private mapJob(raw: unknown, queue: string): Job {
    const r = raw as Record<string, unknown>;

    // Safely parse opts
    let opts: Record<string, unknown> = {};
    if (typeof r.opts === 'string') {
      try {
        opts = JSON.parse(r.opts) as Record<string, unknown>;
      } catch {
        opts = {};
      }
    }

    // Safely parse payload
    let payload: unknown = r.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = r.payload;
      }
    }

    return {
      id: typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : '',
      queue,
      payload,
      priority: (opts.priority as number) ?? 0,
      retries: (opts.retries as number) ?? 3,
      retryCount: (r.retryCount as number) ?? 0,
      runAt: opts.runAt ? new Date(opts.runAt as number) : null,
      expiresAt: opts.expiresAt ? new Date(opts.expiresAt as number) : null,
      claimedBy: typeof r.claimed_by === 'string' ? r.claimed_by : null,
      createdAt: r.created_at ? new Date((r.created_at as number) * 1000) : new Date()
    };
  }
}
