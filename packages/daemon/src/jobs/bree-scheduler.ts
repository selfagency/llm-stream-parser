import type { Logger } from '../types.js';
import type { EnqueueOptions, HonkerQueueAdapter } from './honker-queue.js';

export interface ScheduleDefinition {
  enabled: boolean;
  handler: string;
  hasLagTime?: boolean;
  id: string;
  interval?: number;
  name: string;
  params?: Record<string, unknown>;
  schedule: string;
  scope?: string;
  timeout?: number;
  type: 'cron' | 'interval' | 'one_time';
}

export interface BreeSchedulerConfig {
  logger: Logger;
  queue: HonkerQueueAdapter;
  root: string;
}

export class BreeScheduler {
  private readonly queue: HonkerQueueAdapter;
  private readonly definitions = new Map<string, ScheduleDefinition>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly config: BreeSchedulerConfig;
  private started = false;

  constructor(config: BreeSchedulerConfig) {
    this.config = config;
    this.queue = config.queue;
  }

  start(): Promise<void> {
    this.started = true;
    this.config.logger.info('Bree scheduler started');
    return Promise.resolve();
  }

  schedule(def: Omit<ScheduleDefinition, 'id' | 'enabled'>): Promise<string> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: ScheduleDefinition = { ...def, id, enabled: true };
    this.definitions.set(id, full);

    if (full.type === 'one_time') {
      const delay = Number.parseInt(def.schedule, 10);
      if (!Number.isNaN(delay) && delay > 0) {
        const timer = setTimeout(() => {
          this.queue
            .enqueue(
              { handler: def.handler, params: def.params },
              { queue: def.scope ?? 'default', ...(def.timeout === undefined ? {} : { timeoutMs: def.timeout }) }
            )
            .catch(() => {
              // Suppress unhandled rejection — errors logged by queue
            });
        }, delay);
        timer.unref();
        this.timers.set(id, timer);
      }
    }

    this.config.logger.info('Job scheduled', {
      id,
      name: def.name,
      type: def.type,
      schedule: def.schedule
    });

    return Promise.resolve(id);
  }

  cancel(scheduleId: string): Promise<void> {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }
    this.definitions.delete(scheduleId);
    return Promise.resolve();
  }

  list(): Promise<ScheduleDefinition[]> {
    return Promise.resolve(Array.from(this.definitions.values()));
  }

  enqueue(payload: unknown, options?: EnqueueOptions): Promise<string> {
    return this.queue.enqueue(payload, options);
  }

  stop(): Promise<void> {
    this.started = false;
    for (const [, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.config.logger.info('Bree scheduler stopped');
    return Promise.resolve();
  }
}
