export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  resetAfterMs?: number;
}

export class CircuitBreaker {
  #failures = 0;
  #openedAt = 0;
  #state: CircuitBreakerState = 'closed';
  readonly #config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = {}) {
    this.#config = config;
  }

  get state(): CircuitBreakerState {
    return this.#state;
  }

  recordSuccess(): void {
    this.#failures = 0;
    this.#openedAt = 0;
    this.#state = 'closed';
  }

  recordFailure(now = Date.now()): void {
    this.#failures += 1;
    if (this.#failures >= (this.#config.failureThreshold ?? 5)) {
      this.#state = 'open';
      this.#openedAt = now;
    }
  }

  canRequest(now = Date.now()): boolean {
    if (this.#state === 'closed') {
      return true;
    }

    if (this.#state === 'open') {
      const resetAfterMs = this.#config.resetAfterMs ?? 30_000;
      if (now - this.#openedAt >= resetAfterMs) {
        this.#state = 'half-open';
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Restore circuit breaker state from persistence.
   *
   * Used by the daemon to restore circuit-breaker state on restart.
   * For 'open' state, records enough failures to keep the circuit open
   * and sets the timestamp so the auto-reset window is preserved.
   */
  restoreState(state: CircuitBreakerState, openedAt?: number): void {
    this.#state = state;
    if (state === 'open') {
      const threshold = this.#config.failureThreshold ?? 5;
      this.#failures = threshold;
      this.#openedAt = openedAt ?? Date.now();
    }
  }
}
