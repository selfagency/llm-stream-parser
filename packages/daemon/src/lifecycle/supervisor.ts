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
  readonly logger: Logger;
  private readonly policy: SupervisorPolicy;

  constructor(deps: SupervisorDeps) {
    this.logger = deps.logger;
    this.policy = deps.policy;
  }

  watch(_daemon: Daemon): void {
    if (!this.policy.enabled) {
      this.logger.info('Supervisor disabled');
      return;
    }
    this.logger.info('Supervisor watching daemon');
  }

  stop(): Promise<void> {
    this.logger.info('Supervisor stopped');
    return Promise.resolve();
  }
}
