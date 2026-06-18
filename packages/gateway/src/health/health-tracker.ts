import { CircuitBreaker, type CircuitBreakerConfig, type CircuitBreakerState } from './circuit-breaker.js';
import { LatencyTracker } from './latency-tracker.js';

export interface HealthSnapshot {
  averageLatencyMs: number | undefined;
  circuitState: CircuitBreakerState;
  errorCount: number;
}

export class HealthTracker {
  readonly #breaker: CircuitBreaker;
  #errors = 0;
  readonly #latency = new LatencyTracker();

  constructor(config: CircuitBreakerConfig = {}) {
    this.#breaker = new CircuitBreaker(config);
  }

  recordSuccess(latencyMs?: number): void {
    this.#breaker.recordSuccess();
    if (latencyMs !== undefined) {
      this.#latency.record(latencyMs);
    }
  }

  recordFailure(now?: number): void {
    this.#errors += 1;
    this.#breaker.recordFailure(now);
  }

  snapshot(): HealthSnapshot {
    return {
      averageLatencyMs: this.#latency.average(),
      circuitState: this.#breaker.state,
      errorCount: this.#errors
    };
  }

  canRequest(now?: number): boolean {
    return this.#breaker.canRequest(now);
  }

  /**
   * Restore circuit breaker state from persistence.
   */
  restoreCircuitBreakerState(state: CircuitBreakerState, openedAt?: number): void {
    this.#breaker.restoreState(state, openedAt);
  }
}
