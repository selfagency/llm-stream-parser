/**
 * Load-balanced provider routing and failover primitives.
 * Re-exports provider knowledge (profiles, header parsing) from
 * @agentsy/providers and quota tracking from @agentsy/tokenomics.
 */

export { createLoadBalancedClient } from './client.js';
export {
  AdaptiveStrategyConfigSchema,
  CircuitBreakerConfigSchema,
  LoadBalancerConfigSchema,
  RetryConfigSchema
} from './config.js';
export { AllProvidersExhaustedError, type ProviderFailureDetail } from './errors.js';
export { CircuitBreaker, type CircuitBreakerState } from './health/circuit-breaker.js';
export { HealthTracker } from './health/health-tracker.js';
export { LatencyTracker } from './health/latency-tracker.js';
export { type ProviderHealthEntry, ProviderHealthRegistry } from './health/provider-health-registry.js';
export {
  type CallByTierResult,
  createModelGatewayClient,
  type ModelGatewayClient,
  type ModelGatewayClientOptions,
  type ReplicaCallFunction
} from './model-gateway-client.js';
export {
  buildRoutingDiagnostic,
  type CircuitState,
  computeReplicaScore,
  DefaultReplicaSelector,
  DefaultTierAwareModelSelector,
  formatRoutingDiagnostic,
  getAllLogicalModels,
  getLogicalModel,
  getLogicalModelsByTier,
  type LogicalModel,
  LogicalModelRegistry,
  type ModelAvailability,
  type ModelCapabilities,
  type ModelCost,
  type ModelEntry,
  ModelRegistry,
  type ModelReplica,
  type ModelSelectionConstraints,
  type ModelSelectionResult,
  type ModelTier,
  modelRegistry,
  type ReplicaHealthSnapshot,
  type ReplicaQuotaSnapshot,
  ReplicaRegistry,
  type ReplicaScoreInput,
  type ReplicaScoreWeights,
  type ReplicaSelectionContext,
  type ReplicaSelector,
  type RoutingDiagnostic,
  type SpilloverResult,
  spillover,
  type TierAwareModelSelector,
  type UseCase
} from './model-tier.js';
export {
  type LatencyPercentiles,
  MetricsCollector,
  type MetricsSnapshot,
  type ProviderAggregate,
  type RequestMetric,
  type TokenCounts
} from './observability/metrics-collector.js';
export {
  type InstrumentedStreamHandle,
  instrumentStream,
  type StreamMetricSummary
} from './observability/stream-tracker.js';
export { probeProvider, probesAreEmpty } from './probes/probe-provider.js';
export { defaultApiParse, type ProbeContext, runProbe } from './probes/run-probe.js';
export { parseRateLimitHeaders, type RateLimitHeaderSnapshot } from './quota/header-parser.js';
export { QuotaTracker, QuotaTrackerRegistry } from './quota/tracker.js';
export { createProviderRegistry, ProviderRegistry } from './registry/index.js';
export {
  LOCAL_BACKEND_PROFILES,
  type LocalAccelerator,
  type LocalBackendProfile,
  type LocalPlatformProfile,
  type RegisterLocalProvidersOptions,
  type RegisterLocalProvidersResult,
  registerLocalProviders
} from './registry/local-providers.js';
export { ModelAliasMap } from './registry/model-alias.js';
export {
  buildStrategy,
  type RetryWithFailoverContext,
  type RetryWithFailoverOptions,
  retryWithFailover
} from './retry.js';
export {
  AdaptiveStrategy,
  CostBasedStrategy,
  createStrategy,
  LatencyBasedStrategy,
  LeastConnectionsStrategy,
  PriorityFallbackStrategy,
  RoundRobinStrategy,
  type StrategyOptions,
  WeightedStrategy
} from './strategies/strategies.js';
export {
  matchesRequest,
  type RoutingStrategy,
  type SelectionContext
} from './strategies/strategy.js';
// ProviderTier removed per plan 34 — tiers belong to models, not providers
export { type ModelInfo, type ModelSwitchConfig, ModelSwitcher, type ModelSwitcherOptions } from './switcher.js';
export {
  type GatewayClient,
  type LoadBalancedClient,
  type LoadBalancerConfig,
  type ProviderEntry,
  ProviderEntrySchema,
  type ProviderStatus,
  ProviderStatusSchema,
  type ProviderUsageSnapshot,
  type RoutingState,
  type StrategyName,
  StrategyNameSchema
} from './types.js';

// ---------------------------------------------------------------------------
// Phase 5 — Gateway as independent reusable package
// ---------------------------------------------------------------------------

export type { EthicsFilterResult, ProviderEthicsPolicyHook, RoutingRequest } from './ethics/types.js';
export { createGateway, Gateway, type GatewayOptions, type HealthReport, type Logger } from './gateway.js';
export { InMemoryPersistenceAdapter } from './persistence/in-memory.js';
export type { HealthRecord, QuotaSnapshot, RejectedCandidate, RoutingDecision } from './persistence/records.js';
export type { PersistenceAdapter } from './persistence/types.js';

// ---------------------------------------------------------------------------
// GatewayClient IPC shim (for daemon-connected consumers)
// ---------------------------------------------------------------------------

export { GatewayClientShim, type GatewayIPCClient } from './gateway-client.js';

export {
  buildTurnStateHeader,
  createStickyRoutingTable,
  parseTurnStateHeader,
  type StickyRoute,
  type StickyRoutingOptions,
  type StickyRoutingTable,
  type TurnState
} from './sticky-routing.js';
