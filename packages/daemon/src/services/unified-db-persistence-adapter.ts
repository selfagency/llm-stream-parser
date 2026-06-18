/**
 * UnifiedDB-backed persistence adapter for the gateway.
 *
 * Implements the `PersistenceAdapter` interface using the daemon's
 * `UnifiedDB` (SQLite via Honker). Quota state, health history,
 * routing decisions, and circuit-breaker state survive daemon restarts.
 *
 * @module
 */

import type {
  CircuitBreakerState,
  HealthRecord,
  PersistenceAdapter,
  QuotaSnapshot,
  RoutingDecision
} from '@agentsy/gateway';

import type { UnifiedDB } from '../db/unified-db.js';

/**
 * UnifiedDB-backed persistence adapter for gateway state.
 *
 * All state is persisted to the daemon's single SQLite database
 * (`~/.agentsy/agentsy.db`), surviving process restarts.
 */
export class UnifiedDBPersistenceAdapter implements PersistenceAdapter {
  readonly #db: UnifiedDB;

  constructor(db: UnifiedDB) {
    this.#db = db;
  }

  async saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void> {
    await this.#db.execute(
      `INSERT INTO daemon_quota_state (provider_id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET state_json = ?, updated_at = ?`,
      [providerId, JSON.stringify(state), state.updatedAt, JSON.stringify(state), state.updatedAt]
    );
  }

  async loadQuotaState(providerId: string): Promise<QuotaSnapshot | null> {
    const row = await this.#db.querySingle<{ state_json: string }>(
      'SELECT state_json FROM daemon_quota_state WHERE provider_id = ?',
      [providerId]
    );
    return row ? (JSON.parse(row.state_json) as QuotaSnapshot) : null;
  }

  async saveHealthRecord(providerId: string, record: HealthRecord): Promise<void> {
    await this.#db.execute('INSERT INTO daemon_health_history (provider_id, record_json, timestamp) VALUES (?, ?, ?)', [
      providerId,
      JSON.stringify(record),
      record.timestamp
    ]);
  }

  async loadHealthHistory(providerId: string, since: Date): Promise<HealthRecord[]> {
    const rows = await this.#db.query<{ record_json: string }>(
      'SELECT record_json FROM daemon_health_history WHERE provider_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
      [providerId, since.toISOString()]
    );
    return rows.map(r => JSON.parse(r.record_json) as HealthRecord);
  }

  async saveRoutingDecision(decision: RoutingDecision): Promise<void> {
    await this.#db.execute('INSERT INTO daemon_routing_decisions (id, decision_json, timestamp) VALUES (?, ?, ?)', [
      decision.id,
      JSON.stringify(decision),
      decision.timestamp
    ]);
  }

  async saveCircuitBreakerState(providerId: string, state: CircuitBreakerState): Promise<void> {
    await this.#db.execute(
      `INSERT INTO daemon_circuit_breaker_state (provider_id, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET state = ?, updated_at = ?`,
      [providerId, state, new Date().toISOString(), state, new Date().toISOString()]
    );
  }

  async loadCircuitBreakerState(providerId: string): Promise<CircuitBreakerState | null> {
    const row = await this.#db.querySingle<{ state: string }>(
      'SELECT state FROM daemon_circuit_breaker_state WHERE provider_id = ?',
      [providerId]
    );
    return row ? (row.state as CircuitBreakerState) : null;
  }
}
