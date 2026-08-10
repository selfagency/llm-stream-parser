/**
 * Routing types for the orchestrator's model-tier routing subsystem.
 *
 * These types define the vocabulary for task-tier assignment, routing
 * intent recording, and failover policy configuration. The orchestrator
 * delegates ALL model selection to the gateway's `TierAwareModelSelector`
 * and never encodes its own cost tables or tier assignments.
 *
 * Architecture decision (2026-06-15):
 *   - `TaskTier` is a direct alias for `ModelTier` from the gateway
 *   - `RoutingIntent` captures the full context of a routing decision
 *   - `FailoverPolicy` controls how the orchestrator handles failures
 */

import type { ModelTier } from '@agentsy/gateway';

// =============================================================================
// TaskTier
// =============================================================================

/**
 * Task tier. Direct alias for `ModelTier` — the orchestrator uses
 * the same tier vocabulary as the gateway. A task's tier is assigned
 * by the planner/decomposer based on complexity and risk.
 */
export type TaskTier = ModelTier;

// =============================================================================
// RoutingIntent
// =============================================================================

/**
 * Full context of a routing decision. Captured at selection time and
 * recorded in execution state for diagnostics, audit, and recovery.
 */
export interface RoutingIntent {
  /** Logical model ids that were attempted and failed, in order. */
  attemptedModels: string[];

  /** Replica ids that were attempted and failed, in order. */
  attemptedReplicas: string[];

  /** Constraints applied during model selection. */
  constraints: {
    excludeProviders?: string[];
    localPreference?: 'preferred' | 'required' | 'disabled';
    maxUsdPer1KInput?: number;
    maxUsdPer1KOutput?: number;
    minContextWindow?: number;
    requireJsonMode?: boolean;
    requireTools?: boolean;
  };

  /** Current escalation level (0 = no escalation, 1+ = escalated). */
  escalationLevel: number;
  /** The tier assigned to this task. */
  tier: TaskTier;

  /** The use case inferred from the workflow node. */
  useCase: 'chat' | 'code' | 'search' | 'embed' | 'vision';
}

// =============================================================================
// FailoverPolicy
// =============================================================================

/**
 * Policy controlling how the orchestrator handles model-call failures.
 *
 * - `allowTierEscalation`: whether to escalate to a higher tier when
 *   all models in the current tier have been exhausted.
 * - `maxAttempts`: total number of failover attempts before giving up.
 * - `excludePriorAttempts`: whether to exclude previously-attempted
 *   replicas and models from subsequent failover steps.
 */
export interface FailoverPolicy {
  /** Whether to allow tier escalation when the current tier has no candidates. */
  allowTierEscalation: boolean;

  /** Whether to exclude previously-attempted replicas and models. Default: true. */
  excludePriorAttempts?: boolean;

  /** Total number of failover attempts before giving up. Default: 5. */
  maxAttempts?: number;
}
