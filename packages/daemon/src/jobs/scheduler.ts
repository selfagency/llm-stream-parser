import type { Logger } from '../types.js';

export interface JobSchedulerDeps {
  logger: Logger;
}

export class JobScheduler {
  private readonly jobs = new Map<string, { id: string; type: string; status: string; scheduledAt: number }>();
  private readonly deps: JobSchedulerDeps;

  constructor(deps: JobSchedulerDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    this.running = true;
    this.deps.logger.info('JobScheduler started');
  }

  async schedule(spec: Record<string, unknown>): Promise<string> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.jobs.set(id, {
      id,
      type: (spec.type as string) ?? 'once',
      status: 'scheduled',
      scheduledAt: Date.now()
    });
    this.deps.logger.info(`Job scheduled: ${id}`);
    return id;
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

  async stop(): Promise<void> {
    this.running = false;
    this.jobs.clear();
    this.deps.logger.info('JobScheduler stopped');
  }
}
