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

export interface TimerSchedulerConfig {
  logger: Logger;
  queue: HonkerQueueAdapter;
  root: string;
}

/**
 * Timer-based scheduler for one_time and interval jobs.
 *
 * Cron scheduling is not yet implemented — use `type: 'one_time'` or `type: 'interval'`.
 * Cron support will be added when Bree integration is wired in a future phase.
 */
export class TimerScheduler {
  private readonly queue: HonkerQueueAdapter;
  private readonly definitions = new Map<string, ScheduleDefinition>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly config: TimerSchedulerConfig;
  private _started = false;

  constructor(config: TimerSchedulerConfig) {
    this.config = config;
    this.queue = config.queue;
  }

  get started(): boolean {
    return this._started;
  }

  start(): Promise<void> {
    this._started = true;
    this.config.logger.info('TimerScheduler started');
    return Promise.resolve();
  }

  schedule(def: Omit<ScheduleDefinition, 'id' | 'enabled'>): Promise<string> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full: ScheduleDefinition = { ...def, id, enabled: true };
    this.definitions.set(id, full);

    if (full.type === 'one_time') {
      const delay = Number.parseInt(def.schedule, 10);
      if (Number.isNaN(delay) || delay <= 0) {
        throw new RangeError(
          `Invalid one_time schedule: "${def.schedule}". Must be a positive integer (milliseconds).`
        );
      }
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
    } else if (full.type === 'interval') {
      const ms = Number.parseInt(def.schedule, 10);
      if (Number.isNaN(ms) || ms <= 0) {
        throw new RangeError(
          `Invalid interval schedule: "${def.schedule}". Must be a positive integer (milliseconds).`
        );
      }
      const interval = setInterval(() => {
        this.queue
          .enqueue(
            { handler: def.handler, params: def.params },
            { queue: def.scope ?? 'default', ...(def.timeout === undefined ? {} : { timeoutMs: def.timeout }) }
          )
          .catch(() => {
            // Suppress unhandled rejection — errors logged by queue
          });
      }, ms);
      interval.unref();
      this.intervals.set(id, interval);
    } else if (full.type === 'cron') {
      this.config.logger.warn('Cron scheduling not yet implemented — job will not run', {
        id,
        name: def.name,
        schedule: def.schedule
      });
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
    const interval = this.intervals.get(scheduleId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(scheduleId);
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
    this._started = false;
    for (const [, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const [, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
    this.config.logger.info('TimerScheduler stopped');
    return Promise.resolve();
  }
}
