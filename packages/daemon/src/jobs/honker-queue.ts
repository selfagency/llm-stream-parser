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
  dbPath: string;
  logger: Logger;
}

export class HonkerQueueAdapter {
  private readonly config: HonkerQueueConfig;
  private readonly queues = new Map<
    string,
    {
      enqueue: (payload: unknown, opts?: Record<string, unknown>) => string;
      claimOne: (workerId: string) => unknown | null;
      claimWaker: () => { next: (workerId: string) => Promise<unknown | null>; ack: (jobId: string) => void };
    }
  >();

  constructor(config: HonkerQueueConfig) {
    this.config = config;
  }

  start(): Promise<void> {
    this.ensureQueue('default');
    this.ensureQueue('agents');
    this.ensureQueue('maintenance');
    this.ensureQueue('indexing');

    this.started = true;
    this.config.logger.info('Honker queue started', {
      dbPath: this.config.dbPath,
      queues: Array.from(this.queues.keys())
    });
    return Promise.resolve();
  }

  private ensureQueue(_name: string): void {
    const name = _name;
    const queueMap = new Map<string, { id: string; payload: unknown; opts?: Record<string, unknown> }[]>();
    queueMap.set(name, []);

    this.queues.set(name, {
      enqueue: (payload: unknown, opts?: Record<string, unknown>) => {
        const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const q = queueMap.get(name);
        if (q) {
          q.push({ id, payload, ...(opts === undefined ? {} : { opts }) });
        }
        return id;
      },
      claimOne: (_workerId: string) => {
        const q = queueMap.get(name);
        if (!q || q.length === 0) {
          return null;
        }
        return q.shift() ?? null;
      },
      claimWaker: () => ({
        next: (_workerId: string) => {
          const q = queueMap.get(name);
          if (!q || q.length === 0) {
            return Promise.resolve(null);
          }
          return Promise.resolve(q.shift() ?? null);
        },
        ack: (_jobId: string) => {
          // no-op in stub
        }
      })
    });
  }

  enqueue(payload: unknown, options: EnqueueOptions = {}): Promise<string> {
    const queueName = options.queue ?? 'default';
    const q = this.queues.get(queueName);
    if (!q) {
      throw new Error(`Queue not found: ${queueName}`);
    }

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

    return Promise.resolve(q.enqueue(payload, opts));
  }

  claim(workerId: string, queueName = 'default'): Promise<Job | null> {
    const q = this.queues.get(queueName);
    if (!q) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const job = q.claimOne(workerId);
    if (!job) {
      return Promise.resolve(null);
    }

    return Promise.resolve(this.mapJob(job, queueName));
  }

  ack(_jobId: string): Promise<void> {
    return Promise.resolve();
  }

  cancel(_jobId: string): Promise<void> {
    return Promise.resolve();
  }

  list(_queueName = 'default'): Promise<Job[]> {
    return Promise.resolve([]);
  }

  count(): number {
    return 0;
  }

  stop(): Promise<void> {
    this.started = false;
    this.config.logger.info('Honker queue stopping');
    return Promise.resolve();
  }

  private mapJob(raw: unknown, queue: string): Job {
    const r = raw as {
      id: string;
      payload: unknown;
      priority?: number;
      retries?: number;
      retryCount?: number;
      runAt?: number;
      expiresAt?: number;
      claimedBy?: string;
      createdAt?: number;
    };
    return {
      id: r.id,
      queue,
      payload: r.payload,
      priority: r.priority ?? 0,
      retries: r.retries ?? 3,
      retryCount: r.retryCount ?? 0,
      runAt: r.runAt ? new Date(r.runAt) : null,
      expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
      claimedBy: r.claimedBy ?? null,
      createdAt: new Date(r.createdAt ?? Date.now())
    };
  }
}
