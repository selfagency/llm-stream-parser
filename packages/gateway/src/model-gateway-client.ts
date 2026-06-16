/**
 * Model-centric gateway client. Provides three model-aware invocation
 * methods while keeping backward compatibility with the existing
 * load-balanced client.
 *
 * Usage:
 * ```ts
 * const client = createModelGatewayClient({
 *   modelRegistry,
 *   replicaRegistry,
 *   replicaSelector: new DefaultReplicaSelector(),
 *   modelSelector: new DefaultTierAwareModelSelector(),
 *   executeProviderCall: async (replica, request) => {
 *     const providerClient = registry.get(replica.providerId)?.client;
 *     return providerClient.complete(request);
 *   }
 * });
 *
 * // Call by tier — let the gateway pick the best model
 * const result = await client.callByTier('mid', 'code', request);
 *
 * // Call by logical model — pick a specific model, let gateway select replica
 * const result = await client.callLogicalModel('gpt-4o-mini', request);
 *
 * // Call by replica — pin a specific replica
 * const result = await client.callReplica('openai-gpt4o-mini-1', request);
 * ```
 */

import type { CompletionRequest, CompletionResponse } from '@agentsy/shared';

import { getLogicalModel } from './logical-models.js';
import type { ReplicaRegistry } from './replica-registry.js';
import type { DefaultReplicaSelector, ReplicaSelectionContext } from './replica-selector.js';
import type { DefaultTierAwareModelSelector } from './selector.js';
import type { ModelRegistry, ModelReplica, ModelSelectionResult, ModelTier, UseCase } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Function that executes a provider call for a given replica.
 * Implementors use this to bridge the gateway selection layer
 * with the actual provider client (e.g. via `ProviderRegistry`).
 *
 * The `request` has its `model` field overridden to the replica's
 * `upstreamModelName` before being passed to this function.
 */
export type ReplicaCallFunction = (replica: ModelReplica, request: CompletionRequest) => Promise<CompletionResponse>;

/** Options for `createModelGatewayClient`. */
export interface ModelGatewayClientOptions {
  /** Function that makes the actual provider call for a selected replica. */
  executeProviderCall: ReplicaCallFunction;
  /** Model registry with known model entries. */
  modelRegistry: ModelRegistry;
  /** Tier-aware selector for picking a model by tier + use case. */
  modelSelector: DefaultTierAwareModelSelector;
  /** Replica registry storing available replicas. */
  replicaRegistry: ReplicaRegistry;
  /** Selector for picking the best replica from candidates. */
  replicaSelector: DefaultReplicaSelector;
}

export interface CallByTierResult {
  response: CompletionResponse;
  selection: ModelSelectionResult;
}

/**
 * Model-centric gateway client.
 *
 * Methods return both the LLM response and a `ModelSelectionResult`
 * describing which model/replica was chosen and why.
 */
export interface ModelGatewayClient {
  /**
   * Select a model by capability tier and use case, then invoke the
   * best available replica.
   */
  callByTier(tier: ModelTier, useCase: UseCase, request: CompletionRequest): Promise<CallByTierResult>;

  /**
   * Invoke a specific logical model by its id, delegating replica
   * selection to the configured `ReplicaSelector`.
   */
  callLogicalModel(logicalModelId: string, request: CompletionRequest): Promise<CallByTierResult>;

  /**
   * Invoke a specific replica by its id — direct pin, no selection.
   */
  callReplica(replicaId: string, request: CompletionRequest): Promise<CallByTierResult>;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Override the `model` field on a request with the replica's
 * provider-specific upstream model name.
 */
function requestForReplica(replica: ModelReplica, request: CompletionRequest): CompletionRequest {
  return { ...request, model: replica.upstreamModelName };
}

/**
 * Derive the logical model id from a `ModelEntry.id`.
 *
 * Convention: `ModelEntry.id = "{providerId}/{logicalModelId}"`.
 * If the id contains a slash, the logical model id is the part
 * after it; otherwise the whole id is returned as-is.
 */
function logicalModelIdFromEntry(entryId: string): string {
  const slashIndex = entryId.indexOf('/');
  if (slashIndex < 0) {
    return entryId;
  }
  return entryId.slice(slashIndex + 1);
}

/**
 * Build a default `ReplicaSelectionContext` when no runtime
 * telemetry is available. Empty error/latency maps and preferred
 * local preference.
 */
function defaultSelectionContext(tier: ModelTier): ReplicaSelectionContext {
  return {
    errorRates: new Map(),
    latencies: new Map(),
    localPreference: 'preferred',
    tier
  };
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a `ModelGatewayClient` bound to the provided registries
 * and selector implementations.
 *
 * The `executeProviderCall` function is responsible for making the
 * actual LLM API call — it receives the selected replica and a
 * request whose `model` field has been set to the replica's
 * `upstreamModelName`.
 */
export function createModelGatewayClient(options: ModelGatewayClientOptions): ModelGatewayClient {
  const { modelRegistry, replicaRegistry, replicaSelector, modelSelector, executeProviderCall } = options;

  /**
   * Shared replica resolution + selection + execution for callByTier
   * and callLogicalModel — eliminates the 23-line clone.
   */
  const resolveAndExecute = async (
    logicalModelId: string,
    tier: ModelTier,
    request: CompletionRequest,
    rejectedCandidates: ModelSelectionResult['rejectedCandidates'],
    selectedBecause: string[]
  ): Promise<CallByTierResult> => {
    const replicas = replicaRegistry.getByLogicalModel(logicalModelId);
    if (replicas.length === 0) {
      throw new Error(`No replicas available for logical model: ${logicalModelId}`);
    }

    const selectedReplica = replicaSelector.selectReplica(replicas, defaultSelectionContext(tier));
    if (selectedReplica === undefined) {
      throw new Error(`No suitable replica for logical model: ${logicalModelId}`);
    }

    const rejectedReplicas: ModelSelectionResult['rejectedCandidates'] = replicas
      .filter(r => r.id !== selectedReplica.id)
      .map(r => ({
        id: r.id,
        reasons: ['Not selected by replica scorer']
      }));

    const response = await executeProviderCall(selectedReplica, requestForReplica(selectedReplica, request));

    return {
      response,
      selection: {
        logicalModelId,
        replicaId: selectedReplica.id,
        providerId: selectedReplica.providerId,
        selectedBecause,
        rejectedCandidates: [...rejectedCandidates, ...rejectedReplicas]
      }
    };
  };

  return {
    // -----------------------------------------------------------------------
    // callByTier
    // -----------------------------------------------------------------------
    async callByTier(tier: ModelTier, useCase: UseCase, request: CompletionRequest): Promise<CallByTierResult> {
      const modelEntry = await modelSelector.selectModelForTier({ tier, useCase });
      const logicalModelId = logicalModelIdFromEntry(modelEntry.id);

      const allInTier = modelRegistry.getModelsByTier(tier);
      const rejectedCandidates: ModelSelectionResult['rejectedCandidates'] = allInTier
        .filter(m => m.id !== modelEntry.id)
        .map(m => ({
          id: m.id,
          reasons: ['Not selected by tier-aware model selector']
        }));

      return resolveAndExecute(logicalModelId, tier, request, rejectedCandidates, [
        `Model selected by tier-aware selector for tier=${tier}, useCase=${useCase}`,
        'Replica selected by replica scorer'
      ]);
    },

    // -----------------------------------------------------------------------
    // callLogicalModel
    // -----------------------------------------------------------------------
    callLogicalModel(logicalModelId: string, request: CompletionRequest): Promise<CallByTierResult> {
      const logicalModel = getLogicalModel(logicalModelId);
      if (logicalModel === undefined) {
        return Promise.reject(new Error(`Unknown logical model: ${logicalModelId}`));
      }
      return resolveAndExecute(
        logicalModelId,
        logicalModel.tier,
        request,
        [],
        [`Explicitly requested logical model: ${logicalModelId}`]
      );
    },

    // -----------------------------------------------------------------------
    // callReplica
    // -----------------------------------------------------------------------
    async callReplica(replicaId: string, request: CompletionRequest): Promise<CallByTierResult> {
      // 1. Look up the replica by id
      const replica = replicaRegistry.getById(replicaId);
      if (replica === undefined) {
        throw new Error(`Unknown replica: ${replicaId}`);
      }

      // 2. Execute provider call with overridden model name
      const response = await executeProviderCall(replica, requestForReplica(replica, request));

      // 3. Build and return the selection result
      const selection: ModelSelectionResult = {
        logicalModelId: replica.logicalModelId,
        replicaId: replica.id,
        providerId: replica.providerId,
        selectedBecause: [`Explicitly requested replica: ${replicaId}`],
        rejectedCandidates: []
      };

      return { response, selection };
    }
  };
}
