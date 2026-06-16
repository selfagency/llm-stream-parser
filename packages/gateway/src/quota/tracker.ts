import { createInMemoryTokenManager, PacingController, type TokenManager } from '@agentsy/tokenomics';

import { parseRateLimitHeaders, type RateLimitHeaderSnapshot } from './header-parser.js';

const DEFAULT_RPM_WINDOW_MS = 60_000;
const DEFAULT_TPM_WINDOW_MS = 60_000;

export interface QuotaUsageSnapshot {
  rpmLimit: number;
  rpmRemaining: number;
  tpmLimit: number;
  tpmRemaining: number;
}

/**
 * Tracks per-provider rate-limit state from response headers.
 *
 * Uses @agentsy/tokenomics' PacingController for client-side request pacing
 * (so future client-side throttling slots in cleanly), while the server-reported
 * remaining RPM/TPM counts are kept locally because PacingController measures
 * from outbound request timestamps, not from upstream-reported quotas.
 */
export class QuotaTracker {
  readonly #providerId: string;
  readonly #manager: TokenManager;
  readonly #pacing: PacingController;
  #rpm: { limit: number; remaining: number; resetMs: number } = {
    limit: 0,
    remaining: 0,
    resetMs: 0
  };
  #tpm: { limit: number; remaining: number; resetMs: number } = {
    limit: 0,
    remaining: 0,
    resetMs: 0
  };

  constructor(providerId: string, manager?: TokenManager) {
    this.#providerId = providerId;
    this.#manager = manager ?? createInMemoryTokenManager();
    this.#pacing = new PacingController(this.#manager);
  }

  /**
   * Ingest rate-limit headers from a provider response. Updates the
   * tracked RPM/TPM limits and remaining counts for this provider
   * so subsequent pre-flight checks see fresh numbers. Also updates
   * the `PacingController` for client-side request pacing.
   *
   * @param headers - Response headers (either a `Headers` object or
   *   a plain `Record<string, string>`). Parsed via `parseRateLimitHeaders`.
   */
  parseFromResponse(headers: Headers | Record<string, string>): void {
    const snapshot = parseRateLimitHeaders(headers);
    this.#applySnapshot(snapshot);
  }

  /**
   * Pre-flight check: can we send `inputTokens` tokens right now?
   * Conservative: returns false if the tracked TPM limit is exhausted.
   * Permissive when no limits are tracked yet (limit === 0).
   */
  canMakeRequest(inputTokens: number): boolean {
    if (this.#tpm.limit > 0 && this.#tpm.remaining < inputTokens) {
      return false;
    }
    if (this.#rpm.limit > 0 && this.#rpm.remaining <= 0) {
      return false;
    }
    return true;
  }

  getUsageSnapshot(): QuotaUsageSnapshot {
    return {
      rpmLimit: this.#rpm.limit,
      rpmRemaining: this.#rpm.remaining,
      tpmLimit: this.#tpm.limit,
      tpmRemaining: this.#tpm.remaining
    };
  }

  get providerId(): string {
    return this.#providerId;
  }

  #applySnapshot(snapshot: RateLimitHeaderSnapshot): void {
    if (snapshot.rpmLimit > 0) {
      this.#rpm = {
        limit: snapshot.rpmLimit,
        remaining: snapshot.rpmRemaining,
        resetMs: snapshot.rpmResetSeconds * 1000 || DEFAULT_RPM_WINDOW_MS
      };
    }
    if (snapshot.tpmLimit > 0) {
      this.#tpm = {
        limit: snapshot.tpmLimit,
        remaining: snapshot.tpmRemaining,
        resetMs: snapshot.tpmResetSeconds * 1000 || DEFAULT_TPM_WINDOW_MS
      };
    }
    // Keep PacingController aware of the active provider so future client-side
    // throttling (e.g. sustained RPM) has a wired target.
    this.#pacing.updateRateLimits(this.#providerId, [
      {
        maxRequests: this.#rpm.limit,
        windowMs: this.#rpm.resetMs || DEFAULT_RPM_WINDOW_MS
      }
    ]);
  }
}

/**
 * Registry of per-provider QuotaTrackers, indexed by providerId.
 */
export class QuotaTrackerRegistry {
  readonly #trackers = new Map<string, QuotaTracker>();
  #sharedManager: TokenManager | undefined;

  for(providerId: string): QuotaTracker {
    let tracker = this.#trackers.get(providerId);
    if (tracker === undefined) {
      this.#sharedManager ??= createInMemoryTokenManager();
      tracker = new QuotaTracker(providerId, this.#sharedManager);
      this.#trackers.set(providerId, tracker);
    }
    return tracker;
  }

  /**
   * Get an existing tracker for a provider, or undefined if none registered.
   * Unlike `for()`, this does not auto-create a tracker.
   */
  getTracker(providerId: string): QuotaTracker | undefined {
    return this.#trackers.get(providerId);
  }

  list(): QuotaTracker[] {
    return [...this.#trackers.values()];
  }
}
