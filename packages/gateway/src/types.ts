import type { NormalizerProvider, UniversalClient } from '@agentsy/providers';
import type { CompletionRequest, CompletionResponse, ProviderRetryPolicy } from '@agentsy/shared';
import { z } from 'zod';

export const StrategyNameSchema = z.enum([
  'adaptive',
  'round-robin',
  'weighted',
  'least-connections',
  'latency',
  'priority-fallback',
  'cost-based'
]);
export const ProviderStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']);

const ProviderCapabilitiesSchema = z.object({
  maxCompletionTokens: z.number().int().positive().optional(),
  maxPromptTokens: z.number().int().positive().optional(),
  supportsCodeExecution: z.boolean().optional(),
  supportsImages: z.boolean().optional(),
  supportsJsonMode: z.boolean().optional(),
  supportsStreaming: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional()
});

export const ProviderEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.custom<NormalizerProvider>(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).optional(),
  capabilities: ProviderCapabilitiesSchema.optional(),
  retryPolicy: z.custom<ProviderRetryPolicy>().optional()
});

export type StrategyName = z.infer<typeof StrategyNameSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;

export interface ProviderUsageSnapshot {
  averageLatencyMs?: number;
  concurrencyRemaining?: number;
  errorRate?: number;
  lastUsedAt?: string;
  providerId: string;
  rpmRemaining?: number;
  tpmRemaining?: number;
}

export interface ReplicaQuotaSnapshot {
  remainingRequestsHour?: number;
  remainingRequestsMinute?: number;
  remainingTokensHour?: number;
  remainingTokensMinute?: number;
  replicaId: string;
}

export interface RoutingState {
  providerCount: number;
  providerId: string;
  providerStatus: ProviderStatus;
  strategy: StrategyName;
}

// =============================================================================
// Model-tier types — tiers are defined on MODELS, not providers
// =============================================================================

/**
 * Model capability tiers. Each model has exactly one tier.
 *
 * - `micro` — <3B params, <$0.50/1M input, <100ms (local/classification)
 * - `small` — 3-30B params, $0.50-3/1M input, 100-500ms (summarization)
 * - `mid` — 30-300B params, $3-15/1M input, 500ms-2s (reasoning/coding)
 * - `frontier` — 300B+ / o1-style extended-thinking, $15+/1M, 2s+ (synthesis)
 */
export type ModelTier = 'micro' | 'small' | 'mid' | 'frontier';

export type UseCase = 'chat' | 'code' | 'reasoning' | 'search' | 'embed' | 'vision';

/**
 * Cost structure for a model in USD per 1M tokens.
 */
export interface ModelCost {
  cachedInputPer1MTokens?: number;
  cacheWritePer1MTokens?: number;
  inputPer1MTokens: number;
  outputPer1MTokens: number;
}

/**
 * Capabilities supported by a model.
 */
export interface ModelCapabilities {
  audio: boolean;
  embeddings: boolean;
  jsonMode: boolean;
  reasoning: boolean;
  tools: boolean;
  vision: boolean;
}

/**
 * Canonical logical model identity. Independent of any provider or account.
 * A single LogicalModel may be served by multiple ModelReplicas.
 */
export interface LogicalModel {
  capabilities: ModelCapabilities;
  contextWindow: number;
  id: string;
  maxOutputTokens: number;
  paramCount?: number;
  tier: ModelTier;
  useCases: UseCase[];
}

/**
 * One way to reach a logical model — through a specific provider/account.
 */
export interface ModelReplica {
  cost: ModelCost;
  /** Runtime health snapshot (optional — populated by availability tracker). */
  health?: ReplicaHealthSnapshot;
  id: string;
  isLocal: boolean;
  logicalModelId: string;
  providerId: string;
  /** Runtime quota snapshot (optional — populated by tokenomics headroom provider). */
  quota?: ReplicaQuotaSnapshot;
  upstreamModelName: string;
}

/**
 * Health state of a replica at a point in time.
 * Populated by ModelAvailabilityTracker for every replica.
 */
export interface ReplicaHealthSnapshot {
  available: boolean;
  circuitState?: 'closed' | 'open' | 'half-open';
  errorRate?: number;
  lastCheckedAt: string;
  latencyMs?: number;
}

/**
 * Remaining quota headroom for a replica.
 * Populated by @agentsy/tokenomics or derived from provider response headers.
 */
export interface ReplicaQuotaSnapshot {
  confidence: 'header-derived' | 'tokenomics-derived' | 'estimated';
  lastUpdatedAt: string;
  remainingCostHour?: number;
  remainingCostMonth?: number;
  remainingCostWeek?: number;
  remainingRequestsMinute?: number;
  remainingTokensHour?: number;
  remainingTokensMinute?: number;
  remainingTokensMonth?: number;
  remainingTokensWeek?: number;
}

/**
 * Result of a model selection decision. Captures which model and
 * replica were chosen, why, and which candidates were rejected.
 */
export interface ModelSelectionResult {
  logicalModelId: string;
  providerId: string;
  rejectedCandidates: Array<{
    id: string;
    reasons: string[];
  }>;
  replicaId: string;
  /** Guardrails constraint denials recorded during selection, if any. */
  routingConstraintDenials?: Array<{ code: string; details: string }>;
  selectedBecause: string[];
}

/**
 * A concrete model that the gateway can invoke. Tiers are defined
 * on `ModelEntry`, not `ProviderEntry`. A single provider may host
 * models across all tiers.
 */
export interface ModelEntry {
  capabilities: ModelCapabilities;
  contextWindow: number;
  cost: ModelCost;
  id: string;
  isLocal?: boolean;
  knowledgeCutoff?: string;
  maxOutputTokens: number;
  modelName: string;
  paramCount?: number;
  providerId: string;
  releaseDate?: string;
  tier: ModelTier;
  useCases: UseCase[];
}

export interface ModelSelectionConstraints {
  excludeProviders?: string[];
  localPreference?: 'preferred' | 'required' | 'disabled';
  maxUsdPer1KInput?: number;
  maxUsdPer1KOutput?: number;
  minContextWindow?: number;
  requireJsonMode?: boolean;
  requireTools?: boolean;
  /**
   * Guardrails routing constraint to enforce before model selection.
   * When set, the constraint engine evaluates each candidate against
   * these rules (local-only, provider exclusion, capability requirements).
   * Violations are recorded in `ModelSelectionResult.routingConstraintDenials`.
   */
  routingConstraints?: import('@agentsy/guardrails').RoutingConstraint;
  /**
   * Note: `@agentsy/guardrails` defines `RoutingConstraint` with
   * additional fields (requireReasoning, requireVision, localOnly).
   * When both systems are used together, capability requirements
   * should be kept in sync between the two interfaces.
   */
}

export interface TierAwareModelSelector {
  selectModelForTier(input: {
    constraints?: ModelSelectionConstraints;
    tier: ModelTier;
    useCase?: 'chat' | 'code' | 'reasoning' | 'search' | 'embed' | 'vision';
  }): Promise<ModelEntry>;
}

export interface ModelRegistry {
  getAllModels(): ModelEntry[];
  getModelById(id: string): ModelEntry | undefined;
  getModelsByTier(tier: ModelTier): ModelEntry[];
}

export interface LoadBalancerConfig {
  circuitBreaker?: {
    failureThreshold?: number;
    resetAfterMs?: number;
  };
  model?: string;
  providers: ProviderEntry[];
  retry?: ProviderRetryPolicy;
  strategy?: StrategyName;
}

export interface LoadBalancedClient extends UniversalClient {
  createModelSwitcher(): import('./switcher.js').ModelSwitcher;
  getMetricsProviderAggregate(
    providerId: string
  ): import('./observability/metrics-collector.js').ProviderAggregate | undefined;
  getMetricsSnapshot(): import('./observability/metrics-collector.js').MetricsSnapshot;
  getModelSelector(): TierAwareModelSelector;
  getRoutingState(): RoutingState;
  getUsageSnapshot(): ProviderUsageSnapshot[];
  markProviderHealthy(providerId: string): void;
  markProviderUnhealthy(providerId: string): void;
  /**
   * Swap the active routing strategy at runtime. Subsequent
   * `complete()` / `stream()` calls use the new strategy; the
   * in-flight retry/failover loop is unaffected (it has already
   * picked a provider for the current call).
   */
  setStrategy(name: StrategyName, options?: import('./strategies/strategies.js').StrategyOptions): void;
  shutdown(): Promise<void>;
}

export interface LoadBalancedClientFactory {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): Promise<Awaited<UniversalClient['stream']>>;
}

/**
 * Gateway client interface for orchestrator consumption.
 * Provides model selection and invocation primitives.
 */
export interface GatewayClient {
  getModelSelector(): TierAwareModelSelector;
}
