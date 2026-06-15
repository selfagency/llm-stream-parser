/**
 * Multi-replica failover chain for model-call retry.
 *
 * Builds an ordered sequence of failover steps from the original
 * model and available replicas. The chain advances step-by-step:
 *   1. Same replica retry (transient-error recovery)
 *   2. Next replica for the same logical model
 *   3. Next logical model in the same tier
 *   4. Tier escalation (if the escalation policy allows it)
 *
 * The orchestrator controls whether escalation is permitted;
 * the chain is constructed respecting the escalation policy.
 *
 * Architecture decision (2026-06-06, Plan 34):
 *   - Failover is orchestrator-level (not gateway-level)
 *   - Each step points to a specific replica or model
 *   - ExhaustedError is thrown when no steps remain
 *   - The caller invokes `getNextStep` on model-call failure
 *
 * Updated (2026-06-15):
 *   - Added `excludePriorAttempts` filtering support
 *   - Added `tierEscalation` support for replica-aware failover
 *   - Failover is now replica-aware (not just provider-level)
 */

import type { ModelEntry, ModelReplica, ModelTier } from '@agentsy/gateway';
import { getLogicalModel } from '@agentsy/gateway';

import type { EscalationPolicy } from '../intelligence/gateway-backed-router.js';
import type { CircuitBreakerSet } from './circuit-breaker-set.js';
import type { RateLimitStatus } from './rate-limit-escalation.js';

// =============================================================================
// Types
// =============================================================================

export type FailoverStepType = 'same-replica-retry' | 'next-replica' | 'next-model' | 'tier-escalation';

/**
 * One step in the failover chain.
 *
 * - `same-replica-retry`: retry the same replica (no `replicaId` — caller
 *   keeps the original). Useful for transient network blips.
 * - `next-replica`: a different replica for the same logical model.
 * - `next-model`: a different logical model in the same tier.
 * - `tier-escalation`: a replica from a higher tier.
 */
export interface FailoverStep {
  /** Logical model to use for this step. */
  logicalModelId?: string;
  /** Specific replica to target. Omitted for `same-replica-retry`. */
  replicaId?: string;
  /** Model tier for this step. */
  tier?: ModelTier;
  type: FailoverStepType;
}

/**
 * Ordered failover chain with positional cursor.
 * The caller advances `currentStep` on each failure via `getNextStep`.
 */
export interface FailoverChain {
  /** Index of the *next* step to try. Starts at 0. */
  currentStep: number;
  /** Ordered list of failover steps. */
  steps: FailoverStep[];
}

// =============================================================================
// ExhaustedError
// =============================================================================

/** Re-exported so consumers importing from model-failover can catch it. */
export { RateLimitExceededError } from './rate-limit-escalation.js';

/**
 * Thrown when `getNextStep` is called but the chain has no remaining steps.
 * Captures the full chain and the total number of attempts for diagnostics.
 */
export class ExhaustedError extends Error {
  readonly chain: readonly FailoverStep[];
  readonly attempts: number;

  constructor(chain: FailoverStep[], attempts: number) {
    super(`Failover chain exhausted after ${attempts} attempt(s)`);
    this.name = 'ExhaustedError';
    this.chain = chain;
    this.attempts = attempts;
  }
}

// =============================================================================
// Chain construction
// =============================================================================

const DEFAULT_CHAIN: readonly ModelTier[] = ['micro', 'small', 'mid', 'frontier'] as const;

/**
 * Shared context passed to same-tier step-building helpers.
 * Collects frequently reused state to keep function parameter counts low.
 */
interface SameTierBuildContext {
  availableReplicaIds: (modelId: string) => string[];
  circuitBreakerSet: CircuitBreakerSet | undefined;
  isRateLimited: (id: string) => boolean;
  originalModel: ModelEntry;
  rateLimitMap: Map<string, RateLimitStatus> | undefined;
  replicas: ModelReplica[];
  seenReplicaIds: Set<string>;
  steps: FailoverStep[];
}

// ---------------------------------------------------------------------------
// Escalation step builder (extracted to keep createFailoverChain under the
// complexity ceiling enforced by Biome).
// ---------------------------------------------------------------------------

/**
 * Build tier-escalation steps for higher tiers.
 * Each reachable replica in the target tier gets its own step.
 */
// fallow-ignore-next-line complexity
function buildEscalationSteps(
  escalationPolicy: EscalationPolicy,
  originalModel: ModelEntry,
  replicas: ModelReplica[],
  seenReplicaIds: Set<string>,
  isRateLimited: (replicaId: string) => boolean,
  circuitBreakerSet?: CircuitBreakerSet
): FailoverStep[] {
  const chain = escalationPolicy.chain ?? DEFAULT_CHAIN;
  const currentTierIndex = chain.indexOf(originalModel.tier);
  const maxSteps = escalationPolicy.maxSteps ?? chain.length;

  if (currentTierIndex < 0) {
    return [];
  }

  const escalationTiers = chain.slice(currentTierIndex + 1, currentTierIndex + 1 + maxSteps);
  const steps: FailoverStep[] = [];

  for (const nextTier of escalationTiers) {
    for (const replica of replicas) {
      const logicalModel = getLogicalModel(replica.logicalModelId);
      if (
        logicalModel?.tier !== nextTier ||
        seenReplicaIds.has(replica.id) ||
        circuitBreakerSet?.isOpen(replica.id) === true ||
        isRateLimited(replica.id)
      ) {
        continue;
      }

      seenReplicaIds.add(replica.id);
      steps.push({
        type: 'tier-escalation',
        logicalModelId: replica.logicalModelId,
        replicaId: replica.id,
        tier: nextTier
      });
    }
  }

  return steps;
}

/**
 * Options for `createFailoverChain` — extends the original positional
 * parameters with replica-aware failover and prior-attempt exclusion.
 */
export interface CreateFailoverChainOptions {
  circuitBreakerSet?: CircuitBreakerSet;
  /** Exclude these logical model ids from the chain (previously attempted). */
  excludeModelIds?: Set<string>;
  /** Exclude these replica ids from the chain (previously attempted). */
  excludeReplicaIds?: Set<string>;
  rateLimitMap?: Map<string, RateLimitStatus>;
  /**
   * Whether to allow tier escalation. When `false`, no escalation steps
   * are added even if the escalation policy allows it.
   */
  tierEscalation?: boolean;
}

/**
 * Build a `FailoverChain` from the originally-selected model, all available
 * replicas, and the escalation policy.
 *
 * The chain is ordered: same-replica-retry → next-replicas (same model) →
 * next-models (same tier) → tier-escalation (if allowed).
 *
 * Each distinct replica gets its own step so the caller can track individual
 * failures and circuit-break per-replica.
 *
 * Supports replica-aware failover via `excludeReplicaIds` and `excludeModelIds`
 * options, and tier escalation control via `tierEscalation`.
 */
export function createFailoverChain(
  originalModel: ModelEntry,
  replicas: ModelReplica[],
  escalationPolicy: EscalationPolicy,
  circuitBreakerSet?: CircuitBreakerSet,
  rateLimitMap?: Map<string, RateLimitStatus>
): FailoverChain;

export function createFailoverChain(
  originalModel: ModelEntry,
  replicas: ModelReplica[],
  escalationPolicy: EscalationPolicy,
  options?: CreateFailoverChainOptions
): FailoverChain;

// fallow-ignore-next-line complexity
export function createFailoverChain(
  originalModel: ModelEntry,
  replicas: ModelReplica[],
  escalationPolicy: EscalationPolicy,
  circuitBreakerSetOrOptions?: CircuitBreakerSet | CreateFailoverChainOptions,
  rateLimitMap?: Map<string, RateLimitStatus>
): FailoverChain {
  // Normalize overloaded parameters
  const isOptions = circuitBreakerSetOrOptions !== undefined && !('isOpen' in circuitBreakerSetOrOptions);
  const circuitBreakerSet: CircuitBreakerSet | undefined = isOptions
    ? (circuitBreakerSetOrOptions as CreateFailoverChainOptions).circuitBreakerSet
    : (circuitBreakerSetOrOptions as CircuitBreakerSet | undefined);
  const resolvedRateLimitMap: Map<string, RateLimitStatus> | undefined = isOptions
    ? (circuitBreakerSetOrOptions as CreateFailoverChainOptions).rateLimitMap
    : rateLimitMap;
  const excludeReplicaIds: Set<string> | undefined = isOptions
    ? (circuitBreakerSetOrOptions as CreateFailoverChainOptions).excludeReplicaIds
    : undefined;
  const excludeModelIds: Set<string> | undefined = isOptions
    ? (circuitBreakerSetOrOptions as CreateFailoverChainOptions).excludeModelIds
    : undefined;
  const tierEscalation: boolean = isOptions
    ? ((circuitBreakerSetOrOptions as CreateFailoverChainOptions).tierEscalation ?? true)
    : true;

  const steps: FailoverStep[] = [];
  const seenReplicaIds = new Set<string>(excludeReplicaIds ?? []);
  const seenModelIds = new Set<string>([originalModel.id, ...(excludeModelIds ?? [])]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Check whether a replica is rate-limited (when a rateLimitMap is provided). */
  const isRateLimited = (replicaId: string): boolean => resolvedRateLimitMap?.get(replicaId)?.isRateLimited === true;

  /**
   * Return the set of replica ids for a logical model that are *not* already
   * excluded by circuit breaker or rate-limit status.
   */
  const availableReplicaIds = (modelId: string): string[] =>
    replicas
      .filter(
        r =>
          r.logicalModelId === modelId &&
          !seenReplicaIds.has(r.id) &&
          !circuitBreakerSet?.isOpen(r.id) &&
          !isRateLimited(r.id)
      )
      .map(r => r.id);

  const sameTierCtx: SameTierBuildContext = {
    replicas,
    originalModel,
    seenReplicaIds,
    steps,
    availableReplicaIds,
    isRateLimited,
    circuitBreakerSet,
    rateLimitMap: resolvedRateLimitMap
  };

  // ---------------------------------------------------------------------------
  // 1. Same-replica retry — no replicaId, caller keeps the original
  // ---------------------------------------------------------------------------

  steps.push({
    type: 'same-replica-retry',
    logicalModelId: originalModel.id,
    tier: originalModel.tier
  });

  // ---------------------------------------------------------------------------
  // 2. Next replicas for the same logical model
  // ---------------------------------------------------------------------------

  const sameModelReplicaIds = availableReplicaIds(originalModel.id);
  markModelAllSeenIfUnavailable(originalModel.id, sameModelReplicaIds, sameTierCtx);

  for (const replicaId of sameModelReplicaIds) {
    if (seenReplicaIds.has(replicaId)) {
      continue;
    }
    seenReplicaIds.add(replicaId);
    steps.push({
      type: 'next-replica',
      logicalModelId: originalModel.id,
      replicaId,
      tier: originalModel.tier
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Next logical models in the same tier
  // ---------------------------------------------------------------------------

  buildSameTierSteps(seenModelIds, sameTierCtx);

  // ---------------------------------------------------------------------------
  // 4. Tier escalation (only when allowed by both policy and options)
  // ---------------------------------------------------------------------------

  if (escalationPolicy.allowEscalation && tierEscalation) {
    steps.push(
      ...buildEscalationSteps(
        escalationPolicy,
        originalModel,
        replicas,
        seenReplicaIds,
        isRateLimited,
        circuitBreakerSet
      )
    );
  }

  return { currentStep: 0, steps };
}

/**
 * If every replica for a model is rate-limited or circuit-broken, mark them
 * all as seen so subsequent phases skip the model entirely.
 */
// fallow-ignore-next-line complexity
function markModelAllSeenIfUnavailable(modelId: string, availableIds: string[], ctx: SameTierBuildContext): void {
  if (availableIds.length > 0 || ctx.rateLimitMap === undefined) {
    return;
  }
  const allForModel = ctx.replicas.filter(r => r.logicalModelId === modelId);
  const allUnavailable = allForModel.every(
    r => ctx.isRateLimited(r.id) || ctx.circuitBreakerSet?.isOpen(r.id) === true
  );
  if (allUnavailable && allForModel.length > 0) {
    for (const r of allForModel) {
      ctx.seenReplicaIds.add(r.id);
    }
  }
}

/**
 * Build failover steps for other logical models in the same tier.
 * For each model, either adds individual replica steps or a single
 * skip-model step when all replicas are rate-limited / circuit-broken.
 */
// fallow-ignore-next-line complexity
function buildSameTierSteps(seenModelIds: Set<string>, ctx: SameTierBuildContext): void {
  for (const replica of ctx.replicas) {
    const logicalModel = getLogicalModel(replica.logicalModelId);
    if (
      logicalModel?.tier !== ctx.originalModel.tier ||
      replica.logicalModelId === ctx.originalModel.id ||
      ctx.seenReplicaIds.has(replica.id)
    ) {
      continue;
    }

    if (!seenModelIds.has(replica.logicalModelId)) {
      seenModelIds.add(replica.logicalModelId);
      handleFirstModelEncounter(replica, ctx);
      continue;
    }

    if (ctx.seenReplicaIds.has(replica.id)) {
      continue;
    }
    ctx.seenReplicaIds.add(replica.id);
    ctx.steps.push({
      type: 'next-model',
      logicalModelId: replica.logicalModelId,
      replicaId: replica.id,
      tier: ctx.originalModel.tier
    });
  }
}

/**
 * Handle the first encounter of a logical model during same-tier step building.
 * If all replicas for this model are rate-limited or circuit-broken, emits a
 * synthetic `next-model` skip step instead of individual replicas.
 */
// fallow-ignore-next-line complexity
function handleFirstModelEncounter(replica: ModelReplica, ctx: SameTierBuildContext): void {
  const modelReplicaIds = ctx.availableReplicaIds(replica.logicalModelId);
  const allReplicasForModel = ctx.replicas.filter(
    r =>
      r.logicalModelId === replica.logicalModelId && getLogicalModel(r.logicalModelId)?.tier === ctx.originalModel.tier
  );

  if (modelReplicaIds.length === 0 && allReplicasForModel.length > 0 && ctx.rateLimitMap !== undefined) {
    for (const r of allReplicasForModel) {
      ctx.seenReplicaIds.add(r.id);
    }
    ctx.steps.push({
      type: 'next-model',
      logicalModelId: replica.logicalModelId,
      tier: ctx.originalModel.tier
    });
    return;
  }

  if (modelReplicaIds.length > 0) {
    // Add first available replica for this model
    const firstId = modelReplicaIds[0];
    if (firstId !== undefined && !ctx.seenReplicaIds.has(firstId)) {
      ctx.seenReplicaIds.add(firstId);
      ctx.steps.push({
        type: 'next-model',
        logicalModelId: replica.logicalModelId,
        replicaId: firstId,
        tier: ctx.originalModel.tier
      });
    }
  }
}

/**
 * Advance the chain to the next step. Throws `ExhaustedError` when the
 * chain is fully consumed.
 *
 * @param chain - The failover chain to advance (mutates `currentStep`).
 * @param _lastError - The error that caused the previous step to fail
 *   (reserved for future use — e.g. routing decisions based on error type).
 * @returns The next `FailoverStep`, or `undefined` if the chain is empty
 *   (defensive — the empty case throws `ExhaustedError`).
 */
export function getNextStep(chain: FailoverChain, _lastError: Error): FailoverStep | undefined {
  chain.currentStep++;

  if (chain.currentStep >= chain.steps.length) {
    throw new ExhaustedError([...chain.steps], chain.currentStep);
  }

  return chain.steps.at(chain.currentStep);
}
