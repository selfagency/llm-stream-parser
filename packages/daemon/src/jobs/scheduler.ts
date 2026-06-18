import { randomUUID } from 'node:crypto';
import type { Logger } from '../types.js';

export interface JobSchedulerDeps {
  logger: Logger;
}

export class JobScheduler {
  private readonly jobs = new Map<string, { id: string; type: string; status: string; scheduledAt: number }>();
  readonly logger: Logger;

  constructor(deps: JobSchedulerDeps) {
    this.logger = deps.logger;
  }

  start(): Promise<void> {
    this.logger.info('JobScheduler started');
    return Promise.resolve();
  }

  schedule(spec: Record<string, unknown>): Promise<string> {
    const id = `job_${randomUUID().slice(0, 8)}`;
    this.jobs.set(id, {
      id,
      type: (spec.type as string) ?? 'once',
      status: 'scheduled',
      scheduledAt: Date.now()
    });
    this.logger.info(`Job scheduled: ${id}`);
    return Promise.resolve(id);
  }

  list(): { id: string; type: string; status: string }[] {
    return Array.from(this.jobs.values()).map(j => ({
      id: j.id,
      type: j.type,
      status: j.status
    }));
  }

  cancel(id: string): boolean {
    return this.jobs.delete(id);
  }

  count(): number {
    return this.jobs.size;
  }

  stop(): Promise<void> {
    this.jobs.clear();
    this.logger.info('JobScheduler stopped');
    return Promise.resolve();
  }
}
