import type { Daemon } from '../daemon.js';
import type { Logger } from '../types.js';

export interface SupervisorPolicy {
  enabled: boolean;
  maxRestarts: number;
  restartDelayMs: number;
  restartWindowMs: number;
}

export interface SupervisorDeps {
  logger: Logger;
  policy: SupervisorPolicy;
}

export class Supervisor {
  private readonly deps: SupervisorDeps;

  constructor(deps: SupervisorDeps) {
    this.deps = deps;
  }

  watch(_daemon: Daemon): void {
    if (!this.deps.policy.enabled) {
      this.deps.logger.info('Supervisor disabled');
      return;
    }
    this.watching = true;
    this.deps.logger.info('Supervisor watching daemon');
  }

  async stop(): Promise<void> {
    this.watching = false;
    this.deps.logger.info('Supervisor stopped');
  }
}
