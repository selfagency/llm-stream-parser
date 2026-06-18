/**
 * Record types for gateway persistence.
 *
 * These are the data shapes that flow through the `PersistenceAdapter`
 * interface. They are distinct from the runtime types in `types.ts`
 * to decouple persistence from the in-memory representation.
 *
 * @module
 */

/** Snapshot of a provider's quota state at a point in time. */
export interface QuotaSnapshot {
  readonly rpmLimit: number;
  readonly rpmRemaining: number;
  readonly tpmLimit: number;
  readonly tpmRemaining: number;
  readonly updatedAt: string; // ISO 8601
}

/** A single health observation for a provider. */
export interface HealthRecord {
  readonly error?: string;
  readonly latencyMs?: number;
  readonly success: boolean;
  readonly timestamp: string; // ISO 8601
}

/** A routing decision record for audit. */
export interface RoutingDecision {
  readonly id: string;
  readonly modelId: string;
  readonly providerId: string;
  readonly rejectedCandidates: readonly RejectedCandidate[];
  readonly replicaId: string;
  readonly selectedBecause: readonly string[];
  readonly tier: string;
  readonly timestamp: string; // ISO 8601
}

/** A candidate that was rejected during model selection. */
export interface RejectedCandidate {
  readonly id: string;
  readonly reasons: readonly string[];
}
