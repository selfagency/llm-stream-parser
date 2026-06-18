/**
 * Persistence adapter interface for the gateway.
 *
 * Enables quota state, health history, routing decisions, and circuit-breaker
 * state to survive daemon restarts. The default implementation is in-memory;
 * the daemon plugs in a `UnifiedDB`-backed adapter.
 *
 * @module
 */

import type { CircuitBreakerState } from '../health/circuit-breaker.js';
import type { HealthRecord, QuotaSnapshot, RoutingDecision } from './records.js';

/**
 * Pluggable persistence for gateway state.
 *
 * External consumers can supply their own adapter (e.g. Postgres, Redis).
 * The daemon uses `UnifiedDBPersistenceAdapter` for restart-safe state.
 */
export interface PersistenceAdapter {
  /** Load circuit-breaker state for a provider, or null if none stored. */
  loadCircuitBreakerState(providerId: string): Promise<CircuitBreakerState | null>;
  /** Load health history for a provider since a given time. */
  loadHealthHistory(providerId: string, since: Date): Promise<HealthRecord[]>;
  /** Load quota state for a provider, or null if none stored. */
  loadQuotaState(providerId: string): Promise<QuotaSnapshot | null>;

  /** Persist circuit-breaker state for a provider. */
  saveCircuitBreakerState(providerId: string, state: CircuitBreakerState): Promise<void>;
  /** Persist a health record for a provider. */
  saveHealthRecord(providerId: string, record: HealthRecord): Promise<void>;
  /** Persist quota state for a provider. */
  saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void>;

  /** Persist a routing decision for audit. */
  saveRoutingDecision(decision: RoutingDecision): Promise<void>;
}
