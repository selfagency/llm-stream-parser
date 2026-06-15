/**
 * ReplicaSelector — selects the best `ModelReplica` for a logical
 * model by scoring candidates and filtering by health/capability.
 *
 * The selector integrates with:
 *   - `ReplicaRegistry`   — look up replicas for a logical model
 *   - `computeReplicaScore` — rank candidates
 *   - `ModelAvailabilityTracker` — filter by health
 *   - `ReplicaHeadroomProvider` — (optional) filter by quota headroom
 */

import { evaluateConstraints, type GatewayModelInfo } from '@agentsy/guardrails';
import type { ReplicaScoreInput, ReplicaScoreWeights } from './score/replica-score.js';
import { computeReplicaScore } from './score/replica-score.js';
import type { ModelReplica } from './types.js';

export interface ReplicaSelectionContext {
  /** Error rate per replica id, 0 if unknown. */
  errorRates: ReadonlyMap<string, number>;
  /** Headroom percentage per replica id for quota-aware scoring. */
  headroomPercentages?: ReadonlyMap<string, number>;
  /** Measured latency per replica id, 0 if unknown. */
  latencies: ReadonlyMap<string, number>;
  /** True when local models should be preferred. */
  localPreference: 'preferred' | 'required' | 'disabled';
  /**
   * Capabilities for the logical model (shared by all replicas).
   * Required when `routingConstraints` is set so the constraint
   * engine can evaluate capability requirements (json, reasoning, tools, vision).
   */
  modelCapabilities?: GatewayModelInfo['capabilities'];
  /**
   * Mutable output array — populated with denials when replicas
   * are filtered by `routingConstraints`. Allowed to be empty (no pre-filter)
   * or undefined when pre-filter was not applied.
   */
  routingConstraintDenials?: Array<{ code: string; details: string }>;
  /**
   * Guardrails routing constraint to pre-filter replicas.
   * Replicas that violate the constraint are excluded from scoring
   * and recorded in `routingConstraintDenials`.
   */
  routingConstraints?: import('@agentsy/guardrails').RoutingConstraint;
  /** Tier of the logical model. */
  tier: 'micro' | 'small' | 'mid' | 'frontier';
  /** Optional score weights override. */
  weights?: ReplicaScoreWeights;
}

export interface ReplicaSelector {
  /**
   * Score all replicas for a logical model and return the
   * best candidate, or `undefined` if none meet the constraints.
   */
  selectReplica(replicas: ModelReplica[], context: ReplicaSelectionContext): ModelReplica | undefined;

  /**
   * Alias for `selectReplica` — selects the best replica for a
   * given logical model from the provided candidate list.
   */
  selectReplicaForLogicalModel(replicas: ModelReplica[], context: ReplicaSelectionContext): ModelReplica | undefined;
}

export class DefaultReplicaSelector implements ReplicaSelector {
  selectReplica(replicas: ModelReplica[], context: ReplicaSelectionContext): ModelReplica | undefined {
    return this.#scoreAndSelect(replicas, context);
  }

  selectReplicaForLogicalModel(replicas: ModelReplica[], context: ReplicaSelectionContext): ModelReplica | undefined {
    return this.#scoreAndSelect(replicas, context);
  }

  #scoreAndSelect(replicas: ModelReplica[], context: ReplicaSelectionContext): ModelReplica | undefined {
    let candidates = replicas;

    // Apply local preference
    if (context.localPreference === 'required') {
      const local = candidates.filter(r => r.isLocal);
      if (local.length === 0) {
        return;
      }
      candidates = local;
    } else if (context.localPreference === 'disabled') {
      candidates = candidates.filter(r => !r.isLocal);
      if (candidates.length === 0) {
        return;
      }
    }

    // Pre-filter by guardrails routing constraints
    candidates = this.#filterByRoutingConstraints(candidates, context);
    if (candidates.length === 0) {
      return;
    }

    // Score remaining candidates
    const scored = candidates.map(replica => {
      const input: ReplicaScoreInput = {
        costInputPer1MTokens: replica.cost.inputPer1MTokens,
        latencyMs: context.latencies.get(replica.id) ?? 0,
        errorRate: context.errorRates.get(replica.id) ?? 0,
        isLocal: replica.isLocal,
        tier: context.tier,
        applyLocalBonus: context.localPreference === 'preferred'
      };
      const headroomPct = context.headroomPercentages?.get(replica.id);
      if (headroomPct !== undefined) {
        input.headroomPercentage = headroomPct;
      }
      return { replica, score: computeReplicaScore(input, context.weights) };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.replica;
  }

  #filterByRoutingConstraints(candidates: ModelReplica[], context: ReplicaSelectionContext): ModelReplica[] {
    const constraint = context.routingConstraints;
    if (constraint === undefined || context.modelCapabilities === undefined) {
      return candidates;
    }
    const passed: ModelReplica[] = [];
    for (const replica of candidates) {
      const modelInfo: GatewayModelInfo = {
        capabilities: context.modelCapabilities,
        isLocal: replica.isLocal,
        providerId: replica.providerId
      };
      const result = evaluateConstraints(constraint, modelInfo);
      if (result.pass) {
        passed.push(replica);
      } else {
        const denials = context.routingConstraintDenials;
        if (denials !== undefined) {
          for (const violation of result.violations) {
            denials.push({ code: violation.code, details: violation.details });
          }
        }
      }
    }
    return passed;
  }
}
