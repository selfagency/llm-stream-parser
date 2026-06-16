import type { ServiceHost } from '../services/service-host.js';
import type { Logger } from '../types.js';

export interface SleepPolicy {
  enabled: boolean;
  idleTimeoutMs: number;
  pollIntervalMs: number;
}

export interface SleeperDeps {
  logger: Logger;
  policy: SleepPolicy;
}

export class Sleeper {
  private readonly deps: SleeperDeps;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: SleeperDeps) {
    this.deps = deps;
  }

  watch(_services: ServiceHost): void {
    if (!this.deps.policy.enabled) {
      this.deps.logger.info('Sleeper disabled');
      return;
    }
    this.deps.logger.info('Sleeper watching services');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.deps.logger.info('Sleeper stopped');
  }
}
