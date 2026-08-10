/**
 * Job poller — polls long-running external jobs with exponential backoff.
 *
 * Inspired by Claude Code Tip 15 (manual exponential backoff for long jobs).
 * Distinct from recovery's BackoffStrategy which retries *failed* tasks;
 * this polls *running* jobs until they complete.
 *
 * Uses the existing BackoffStrategy types for delay calculation but applies
 * them to polling intervals, not retry delays.
 */

import type { BackoffStrategy } from '../recovery/policy.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface JobPollerConfig {
  /** Backoff strategy for interval growth (default 'exponential') */
  backoffStrategy: BackoffStrategy;
  /** Function to get current job state */
  getJobState: () => Promise<unknown>;
  /** Initial poll interval in ms (default 60_000 = 1 min) */
  initialIntervalMs: number;
  /** Function to check if job is done */
  isDone: (state: unknown) => boolean;
  /** Max poll interval in ms (default 1_800_000 = 30 min) */
  maxIntervalMs: number;
  /** Max polls before giving up (default 30) */
  maxPolls: number;
  /** Multiplier for exponential backoff (default 2) */
  multiplier: number;
  /** Optional sleep function (for testing) */
  sleep?: (ms: number) => Promise<void>;
}

export interface JobResult {
  done: boolean;
  finalState: unknown;
  /** All poll states for audit */
  history: Array<{ poll: number; intervalMs: number; state: unknown }>;
  polls: number;
  /** Total time spent sleeping in ms */
  totalWaitMs: number;
}

// ── Poller ───────────────────────────────────────────────────────────────

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll a job until done or max polls reached.
 *
 * Uses exponential backoff between polls: 1min → 2min → 4min → ...
 * Capped at maxIntervalMs.
 */
export async function pollUntilDone(config: JobPollerConfig): Promise<JobResult> {
  const sleep = config.sleep ?? defaultSleep;
  const history: Array<{ poll: number; intervalMs: number; state: unknown }> = [];
  let interval = config.initialIntervalMs;
  let totalWaitMs = 0;

  for (let poll = 0; poll < config.maxPolls; poll++) {
    const state = await config.getJobState();
    history.push({ poll, intervalMs: interval, state });

    if (config.isDone(state)) {
      return { done: true, polls: poll + 1, finalState: state, totalWaitMs, history };
    }

    if (poll < config.maxPolls - 1) {
      await sleep(interval);
      totalWaitMs += interval;
      interval = nextInterval(interval, config);
    }
  }

  const lastState = await config.getJobState();
  return {
    done: false,
    polls: config.maxPolls,
    finalState: lastState,
    totalWaitMs,
    history
  };
}

function nextInterval(current: number, config: JobPollerConfig): number {
  let next: number;
  switch (config.backoffStrategy) {
    case 'fixed':
      next = current;
      break;
    case 'linear':
      next = current + config.initialIntervalMs;
      break;
    default:
      next = current * config.multiplier;
      break;
  }
  return Math.min(next, config.maxIntervalMs);
}
