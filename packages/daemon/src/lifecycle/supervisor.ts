import type { Daemon } from '../daemon.js';
import type { Logger } from '../types.js';

export interface SupervisorPolicy {
  backoffBaseMs: number;
  backoffJitter: boolean;
  backoffMaxMs: number;
  maxRestarts: number;
  restartPolicy: 'always' | 'on-failure' | 'never';
  restartWindowMs: number;
}

export interface SupervisorDeps {
  logger: Logger;
  policy: SupervisorPolicy;
}

/**
 * Crash recovery with Pup-style restart policies and exponential backoff.
 */
export class Supervisor {
  private readonly deps: SupervisorDeps;
  private restartTimestamps: number[] = [];
  private watching = false;

  constructor(deps: SupervisorDeps) {
    this.deps = deps;
  }

  watch(daemon: Daemon): void {
    if (!this.deps.policy.restartPolicy || this.deps.policy.restartPolicy === 'never') {
      this.deps.logger.info('Supervisor disabled');
      return;
    }

    this.watching = true;
    daemon.onStateChange(async state => {
      if (state === 'crashed' && this.watching) {
        await this.handleCrash(daemon);
      }
    });

    this.deps.logger.info('Supervisor watching daemon');
  }

  private async handleCrash(daemon: Daemon): Promise<void> {
    const now = Date.now();
    this.restartTimestamps.push(now);
    this.cleanOldTimestamps(now);

    if (this.restartTimestamps.length > this.deps.policy.maxRestarts) {
      this.deps.logger.error(`Daemon exceeded ${this.deps.policy.maxRestarts} crashes. Giving up.`);
      await daemon.stop(false);
      process.exit(1);
    }

    const attempt = this.restartTimestamps.length;
    let delay = Math.min(this.deps.policy.backoffBaseMs * 2 ** (attempt - 1), this.deps.policy.backoffMaxMs);

    if (this.deps.policy.backoffJitter) {
      // nosemgrep: insecure-randomness -- Math.random() is used for retry-backoff jitter.
      // Predictability of jitter confers no advantage; jitter exists to prevent thundering-herd
      // retries, not to provide cryptographic randomness.
      delay += Math.random() * delay * 0.25;
    }

    this.deps.logger.warn(`Daemon crashed. Restarting in ${Math.round(delay)}ms (attempt ${attempt})`);

    await sleep(Math.round(delay));

    try {
      await daemon.stop(false);
      await daemon.start();
      this.deps.logger.info('Daemon restarted successfully');
    } catch (error) {
      this.deps.logger.error('Daemon restart failed', error);
    }
  }

  private cleanOldTimestamps(now: number): void {
    const windowStart = now - this.deps.policy.restartWindowMs;
    this.restartTimestamps = this.restartTimestamps.filter(t => t >= windowStart);
  }

  stop(): void {
    this.watching = false;
    this.deps.logger.info('Supervisor stopped');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
