import type { CircuitBreakerConfig, CircuitBreakerState } from './circuit-breaker.js';
import { HealthTracker } from './health-tracker.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ProviderHealthEntry {
  averageLatencyMs: number | undefined;
  circuitState: CircuitBreakerState;
  errorCount: number;
  healthy: boolean;
  lastError: string | undefined;
  requestCount: number;
  status: HealthStatus;
  successCount: number;
  uptimeRatio: number;
}

export interface ProviderHealthRegistryConfig {
  breaker?: CircuitBreakerConfig;
  /**
   * Optional callback fired the first time a provider's circuit
   * transitions from closed to open during this session. Useful for
   * surfacing circuit-trip events to `MetricsCollector` or to
   * external alerting. Not called on subsequent state changes
   * (half-open, closed-via-success) since the circuit must be
   * re-armed via `resetCircuit()` or a successful call to fire it
   * again.
   */
  onCircuitTripped?: (providerId: string) => void;
}

/**
 * Tracks health per provider. Maintains uptime, error counts, and a circuit
 * breaker per provider so the gateway can route around persistent failures.
 */
export class ProviderHealthRegistry {
  readonly #config: ProviderHealthRegistryConfig;
  readonly #entries = new Map<string, HealthTrackerEntry>();
  readonly #lastError = new Map<string, string>();
  readonly #startedAt = new Map<string, number>();

  constructor(config: ProviderHealthRegistryConfig = {}) {
    this.#config = config;
  }

  /**
   * Record a successful request for a provider. Updates the circuit
   * breaker (resets failure count) and the health tracker (records
   * latency sample).
   *
   * @param providerId - Provider entry id.
   * @param latencyMs - Optional request latency in milliseconds.
   */
  recordSuccess(providerId: string, latencyMs?: number): void {
    const entry = this.#entryFor(providerId);
    entry.tracker.recordSuccess(latencyMs);
    entry.successes += 1;
    this.#startedAt.set(providerId, Date.now());
  }

  /**
   * Record a failure for a provider. Increments the failure counter
   * and may open the circuit breaker if the threshold is reached.
   * Fires the `onCircuitTripped` callback on closed→open transition.
   *
   * @param providerId - Provider entry id.
   * @param error - Optional error description for diagnostics.
   */
  recordFailure(providerId: string, error?: string): void {
    const entry = this.#entryFor(providerId);
    const wasClosed = entry.tracker.snapshot().circuitState === 'closed';
    entry.tracker.recordFailure();
    entry.failures += 1;
    if (error !== undefined) {
      this.#lastError.set(providerId, error);
    }
    if (wasClosed && entry.tracker.snapshot().circuitState === 'open' && this.#config.onCircuitTripped) {
      try {
        this.#config.onCircuitTripped(providerId);
      } catch {
        /* listener errors must not break the failure-recording path */
      }
    }
  }

  /**
   * Check whether a request can be sent to the given provider.
   * Returns `false` when the circuit is open and the reset window
   * has not elapsed.
   *
   * @param providerId - Provider entry id.
   * @param now - Optional timestamp override (defaults to Date.now()).
   */
  canRequest(providerId: string, now = Date.now()): boolean {
    return this.#entryFor(providerId).tracker.canRequest(now);
  }

  /**
   * Reset the circuit breaker for a provider. Clears the failure
   * count and transitions the circuit back to closed. No-op when
   * the provider has no tracked state.
   *
   * @param providerId - Provider entry id.
   */
  resetCircuit(providerId: string): void {
    const entry = this.#entries.get(providerId);
    if (entry === undefined) {
      return;
    }
    entry.tracker.recordSuccess();
    entry.failures = 0;
  }

  getStatus(providerId: string): ProviderHealthEntry {
    const entry = this.#entryFor(providerId);
    const snapshot = entry.tracker.snapshot();
    const total = entry.successes + entry.failures;
    const uptimeRatio = total === 0 ? 1 : entry.successes / total;
    return {
      averageLatencyMs: snapshot.averageLatencyMs,
      circuitState: snapshot.circuitState,
      errorCount: snapshot.errorCount,
      healthy: snapshot.circuitState !== 'open',
      lastError: this.#lastError.get(providerId),
      requestCount: total,
      status: deriveStatus(snapshot.circuitState, uptimeRatio),
      successCount: entry.successes,
      uptimeRatio
    };
  }

  listProviderIds(): string[] {
    return [...this.#entries.keys()];
  }

  /**
   * Restore circuit breaker state for a provider from persistence.
   *
   * Used by the daemon's RoutingService on restart to preserve
   * circuit-breaker state across restarts.
   *
   * @param providerId - Provider entry id.
   * @param state - Circuit breaker state to restore.
   * @param openedAt - Optional timestamp when the circuit was opened.
   */
  restoreCircuitBreakerState(providerId: string, state: CircuitBreakerState, openedAt?: number): void {
    const entry = this.#entryFor(providerId);
    entry.tracker.restoreCircuitBreakerState(state, openedAt);
    if (state === 'open') {
      entry.failures = this.#config.breaker?.failureThreshold ?? 5;
    }
  }

  #entryFor(providerId: string): HealthTrackerEntry {
    let entry = this.#entries.get(providerId);
    if (entry === undefined) {
      entry = {
        failures: 0,
        successes: 0,
        tracker: new HealthTracker(this.#config.breaker)
      };
      this.#entries.set(providerId, entry);
    }
    return entry;
  }
}

interface HealthTrackerEntry {
  failures: number;
  successes: number;
  tracker: HealthTracker;
}

function deriveStatus(state: CircuitBreakerState, uptimeRatio: number): HealthStatus {
  if (state === 'open') {
    return 'unhealthy';
  }
  if (state === 'half-open' || uptimeRatio < 0.9) {
    return 'degraded';
  }
  return 'healthy';
}

export {
  CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerState
} from './circuit-breaker.js';
export type { HealthSnapshot } from './health-tracker.js';
