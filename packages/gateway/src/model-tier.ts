/**
 * Model-tier routing barrel. Re-exports all types, registries,
 * and the default selector for tier-aware model selection.
 *
 * Tiers are defined on `ModelEntry`, not `ProviderEntry`.
 * A single provider may host models across all tiers.
 * A single logical model may be served by multiple replicas.
 */

export { type CircuitState, type ModelAvailability, ModelAvailabilityTracker } from './availability-tracker.js';
export { LocalModelDetector } from './local-detector.js';
export {
  getAllLogicalModels,
  getLogicalModel,
  getLogicalModelsByTier,
  LogicalModelRegistry
} from './logical-models.js';
export {
  type CallByTierResult,
  createModelGatewayClient,
  type ModelGatewayClient,
  type ModelGatewayClientOptions,
  type ReplicaCallFunction
} from './model-gateway-client.js';
export { ModelRegistry, modelRegistry } from './model-registry.js';
export { type ReplicaPhase, ReplicaRegistry } from './replica-registry.js';
export { DefaultReplicaSelector, type ReplicaSelectionContext, type ReplicaSelector } from './replica-selector.js';
export { computeReplicaScore, type ReplicaScoreInput, type ReplicaScoreWeights } from './score/replica-score.js';
export { type RoutingDiagnostic, buildRoutingDiagnostic, formatRoutingDiagnostic } from './routing-diagnostics.js';
export { DefaultTierAwareModelSelector } from './selector.js';
export { type SpilloverResult, spillover } from './spillover.js';
export type {
  LogicalModel,
  ModelCapabilities,
  ModelCost,
  ModelEntry,
  ModelReplica,
  ModelSelectionConstraints,
  ModelSelectionResult,
  ModelTier,
  ReplicaHealthSnapshot,
  ReplicaQuotaSnapshot,
  TierAwareModelSelector,
  UseCase
} from './types.js';
