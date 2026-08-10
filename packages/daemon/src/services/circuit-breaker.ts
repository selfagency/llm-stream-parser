/**
 * CircuitBreaker — per-provider breaker for ResilienceService.
 *
 * Phase 18: Graceful Degradation & Circuit Breaking
 *
 * State machine:
 *  closed   — normal operation; failures increment counter
 *  open     — threshold exceeded; requests rejected until cooldown expires
 *  half-open — cooldown expired; one trial request allowed
 *
 * Features:
 *  - configurable failureThreshold & resetAfterMs
 *  - execute() wrapper records success/failure automatically
 *  - manual open/close for testing and recovery
 *  - restoreState for persistence replay
 *
 * @module
 */

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  halfOpenMaxAttempts?: number;
  resetAfterMs?: number;
}

export interface CircuitBreakerSnapshot {
  failures: number;
  openedAt: number;
  state: CircuitBreakerState;
}

function nowMs(): number {
  return Date.now();
}

export class CircuitBreaker {
  #failures = 0;
  #openedAt = 0;
  #state: CircuitBreakerState = 'closed';
  readonly #failureThreshold: number;
  readonly #resetAfterMs: number;
  readonly #halfOpenMaxAttempts: number;
  #halfOpenTrials = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    if (options.failureThreshold !== undefined && options.failureThreshold <= 0) {
      throw new Error('failureThreshold must be > 0');
    }
    if (options.resetAfterMs !== undefined && options.resetAfterMs <= 0) {
      throw new Error('resetAfterMs must be > 0');
    }
    this.#failureThreshold = options.failureThreshold ?? 5;
    this.#resetAfterMs = options.resetAfterMs ?? 30_000;
    this.#halfOpenMaxAttempts = options.halfOpenMaxAttempts ?? 1;
  }

  get state(): CircuitBreakerState {
    return this.#state;
  }

  get failures(): number {
    return this.#failures;
  }

  get openedAt(): number {
    return this.#openedAt;
  }

  get failureThreshold(): number {
    return this.#failureThreshold;
  }

  get resetAfterMs(): number {
    return this.#resetAfterMs;
  }

  canRequest(at: number = nowMs()): boolean {
    if (this.#state === 'closed') {
      return true;
    }

    if (this.#state === 'open') {
      if (at - this.#openedAt >= this.#resetAfterMs) {
        this.#state = 'half-open';
        this.#halfOpenTrials = 0;
        return true;
      }
      return false;
    }

    // half-open: allow limited trials
    return this.#halfOpenTrials < this.#halfOpenMaxAttempts;
  }

  recordSuccess(): void {
    this.#failures = 0;
    this.#openedAt = 0;
    this.#halfOpenTrials = 0;
    this.#state = 'closed';
  }

  recordFailure(at: number = nowMs()): void {
    if (this.#state === 'half-open') {
      // Trial failed → back to open
      this.#failures = this.#failureThreshold;
      this.#openedAt = at;
      this.#state = 'open';
      this.#halfOpenTrials = 0;
      return;
    }

    this.#failures += 1;
    if (this.#failures >= this.#failureThreshold) {
      this.#state = 'open';
      this.#openedAt = at;
    }
  }

  /**
   * Execute an async operation guarded by the breaker.
   * Records success/failure automatically.
   */
  async execute<T>(fn: () => Promise<T>, at: number = nowMs()): Promise<T> {
    if (!this.canRequest(at)) {
      throw new CircuitBreakerOpenError('Circuit breaker is open');
    }

    if (this.#state === 'half-open') {
      this.#halfOpenTrials += 1;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(at);
      throw err;
    }
  }

  /**
   * Force transition to open state.
   */
  forceOpen(at: number = nowMs()): void {
    this.#state = 'open';
    this.#openedAt = at;
    this.#failures = this.#failureThreshold;
  }

  /**
   * Force transition to closed state.
   */
  forceClosed(): void {
    this.recordSuccess();
  }

  /**
   * Restore state from persistence (e.g. UnifiedDB on daemon restart).
   */
  restoreState(state: CircuitBreakerState, openedAt?: number): void {
    this.#state = state;
    if (state === 'open') {
      this.#failures = this.#failureThreshold;
      this.#openedAt = openedAt ?? nowMs();
    } else if (state === 'closed') {
      this.#failures = 0;
      this.#openedAt = 0;
    } else {
      this.#halfOpenTrials = 0;
      this.#openedAt = openedAt ?? nowMs();
    }
  }

  toSnapshot(): CircuitBreakerSnapshot {
    return {
      state: this.#state,
      failures: this.#failures,
      openedAt: this.#openedAt
    };
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreaker(options);
}
