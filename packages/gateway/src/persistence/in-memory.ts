/**
 * In-memory persistence adapter for the gateway.
 *
 * Default adapter used when no external persistence is configured.
 * State is lost on process restart — suitable for standalone library
 * usage and testing.
 *
 * @module
 */

import type { CircuitBreakerState } from '../health/circuit-breaker.js';
import type { HealthRecord, QuotaSnapshot, RoutingDecision } from './records.js';
import type { PersistenceAdapter } from './types.js';

/**
 * In-memory persistence adapter.
 *
 * All state is held in Maps. No data survives process exit.
 */
export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  readonly #quotaState = new Map<string, QuotaSnapshot>();
  readonly #healthHistory = new Map<string, HealthRecord[]>();
  readonly #routingDecisions: RoutingDecision[] = [];
  readonly #circuitBreakerState = new Map<string, CircuitBreakerState>();

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void> {
    this.#quotaState.set(providerId, state);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async loadQuotaState(providerId: string): Promise<QuotaSnapshot | null> {
    return this.#quotaState.get(providerId) ?? null;
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async saveHealthRecord(providerId: string, record: HealthRecord): Promise<void> {
    const history = this.#healthHistory.get(providerId) ?? [];
    history.push(record);
    this.#healthHistory.set(providerId, history);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async loadHealthHistory(providerId: string, since: Date): Promise<HealthRecord[]> {
    const history = this.#healthHistory.get(providerId) ?? [];
    return history.filter(r => new Date(r.timestamp) >= since);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async saveRoutingDecision(decision: RoutingDecision): Promise<void> {
    this.#routingDecisions.push(decision);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async saveCircuitBreakerState(providerId: string, state: CircuitBreakerState): Promise<void> {
    this.#circuitBreakerState.set(providerId, state);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async loadCircuitBreakerState(providerId: string): Promise<CircuitBreakerState | null> {
    return this.#circuitBreakerState.get(providerId) ?? null;
  }
}
