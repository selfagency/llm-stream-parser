import type { SyncManagerLike, SyncRunResult, SyncScheduler, SyncSchedulerOptions, SyncSnapshot } from './types.js';

function withJitter(delayMs: number, jitterRatio: number, random: () => number): number {
  if (jitterRatio <= 0) {
    return delayMs;
  }

  const jitter = delayMs * jitterRatio * random();
  return delayMs + jitter;
}

export function createSyncScheduler(manager: SyncManagerLike, options: SyncSchedulerOptions): SyncScheduler {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let nextRunAt: Date | null = null;
  let consecutiveErrors = 0;
  const now = options.now ?? (() => new Date());
  // nosemgrep: insecure-randomness -- Math.random is the default for scheduling jitter;
  // callers can override with a seeded PRNG via options.random for test reproducibility.
  const random = options.random ?? Math.random;

  function clearScheduled(): void {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    nextRunAt = null;
  }

  function schedule(delayMs: number): void {
    clearScheduled();
    const clampedDelay = Math.max(0, delayMs);
    nextRunAt = new Date(now().getTime() + clampedDelay);
    timeout = setTimeout(() => {
      executeRun().catch(() => {
        // Sync execution errors are handled internally
      });
    }, clampedDelay);
  }

  async function executeRun(localState?: SyncSnapshot): Promise<SyncRunResult> {
    const state = localState ?? (await options.getLocalState());
    const result = await manager.sync(state);
    const shouldRetry = result.status === 'error' && consecutiveErrors < options.maxRetries;

    if (shouldRetry) {
      consecutiveErrors += 1;
      const retryDelay = Math.min(options.maxDelayMs, options.initialDelayMs * 2 ** consecutiveErrors);
      schedule(options.intervalMs + withJitter(retryDelay, options.jitterRatio ?? 0, random));
    } else {
      consecutiveErrors = 0;
      schedule(withJitter(options.intervalMs, options.jitterRatio ?? 0, random));
    }

    return result;
  }

  return {
    getNextRunAt() {
      return nextRunAt;
    },

    start() {
      schedule(options.initialDelayMs);
    },

    stop() {
      clearScheduled();
      consecutiveErrors = 0;
    },

    async triggerNow() {
      return await executeRun();
    }
  };
}
