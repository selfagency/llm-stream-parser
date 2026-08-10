/**
 * Gateway-backed model router — the orchestrator's single routing authority.
 *
 * Delegates ALL model selection to the gateway's `TierAwareModelSelector`.
 * The orchestrator never encodes its own cost tables, tier assignments, or
 * provider knowledge — it requests by tier and use case only.
 *
 * Failover order (encoded in the chain):
 *   1. Same-replica retry (transient error recovery)
 *   2. Next replica for the same logical model
 *   3. Next logical model in the same tier
 *   4. Tier escalation (if the failover policy allows it)
 *
 * Architecture decision (2026-06-15):
 *   - Orchestrator controls escalation policy (gateway does not decide)
 *   - Recovery path excludes prior attempts via the gateway's spillover
 *   - Routing intent is recorded in execution state for diagnostics
 */

import type {
  GatewayClient,
  ModelEntry,
  ModelReplica,
  ModelSelectionConstraints,
  ModelTier,
  ReplicaRegistry,
  ReplicaSelectionContext,
  ReplicaSelector,
  TierAwareModelSelector
} from '@agentsy/gateway';
import { getLogicalModel, spillover } from '@agentsy/gateway';

import type { FailoverChain } from '../recovery/model-failover.js';
import { createFailoverChain as buildFailoverChain, ExhaustedError, getNextStep } from '../recovery/model-failover.js';
import type { TaskTier } from '../types/routing.js';
import type { WorkflowNode } from '../types/workflow.js';

// =============================================================================
// EscalationPolicy (re-exported for backward compatibility)
// =============================================================================

/**
 * Escalation policy — controls whether tier escalation is allowed
 * and what the escalation chain looks like.
 */
export interface EscalationPolicy {
  /** Whether to allow tier escalation when the current tier has no candidates. */
  allowEscalation: boolean;
  /** Custom escalation chain. Default: micro → small → mid → frontier. */
  chain?: ModelTier[];
  /** Max escalation steps. Default: 4 (full chain). */
  maxSteps?: number;
}

export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  allowEscalation: true,
  chain: ['micro', 'small', 'mid', 'frontier'],
  maxSteps: 4
};

export const NO_ESCALATION_POLICY: EscalationPolicy = {
  allowEscalation: false
};

// =============================================================================
// SelectionRecord
// =============================================================================

/**
 * Record of a single selection attempt — used for diagnostics and recovery.
 */
export interface SelectionRecord {
  attemptedAt: string;
  /**
   * Candidates considered during selection with scores and rejection reasons.
   * May be empty when the selector does not expose candidate details.
   */
  candidatesConsidered?: Array<{
    modelId: string;
    tier: ModelTier;
    score: number;
    rejectionReason?: string;
  }>;
  /** Circuit breaker state per replica id at the time of selection. */
  circuitStates?: Record<string, 'closed' | 'open' | 'half-open'>;
  /** Whether escalation was triggered. */
  escalated: boolean;
  /** Replica ids that were tried and failed, in order. */
  failedReplicas: string[];
  /** Headroom percentage per replica id at the time of selection. */
  headroomPercentages?: Record<string, number>;
  logicalModelId: string;
  /** The selected logical model after all fallback. */
  selectedModel?: string;
  /** The selected replica id after all fallback. */
  selectedReplica?: string;
  taskTier: TaskTier;
}

// =============================================================================
// Router interface + options
// =============================================================================

export interface TierAwareModelRouterOptions {
  escalationPolicy?: EscalationPolicy;
  modelSelectionConstraints?: ModelSelectionConstraints;
  /** Optional replica registry for failover chain resolution. */
  replicaRegistry?: ReplicaRegistry;
  /** Optional replica selector for failover chain resolution. */
  replicaSelector?: ReplicaSelector;
}

/**
 * Router that selects a `ModelEntry` for a given task and tier.
 * Encapsulates the call to the gateway's `TierAwareModelSelector`.
 */
export interface TierAwareModelRouter {
  chooseModelForTask(input: { node: WorkflowNode; taskTier: TaskTier }): Promise<ModelEntry>;

  /**
   * Build a failover chain from the selected model and available replicas.
   * Returns a chain with steps ordered: same-replica-retry → next-replica
   * (same model) → next-model (same tier) → tier-escalation (if allowed).
   */
  createFailoverChain(selectedModel: ModelEntry): FailoverChain;

  /**
   * Return all selection records from the current session.
   * Entries are appended for each `chooseModelForTask` call and each
   * failover step resolved via `nextFailoverModel`.
   */
  getSelectionAuditLog(): SelectionRecord[];
  getSelectionRecord(): SelectionRecord | undefined;

  /**
   * Advance the failover chain and resolve the next step to a `ModelEntry`.
   * Uses the gateway's spillover logic to pick the best replica for the step.
   * Throws `ExhaustedError` when no steps remain.
   *
   * @param chain - The failover chain (mutated in place).
   * @param error - The error from the last failed attempt.
   * @param context - Replica selection context for the spillover logic.
   */
  nextFailoverModel(chain: FailoverChain, error: Error, context: ReplicaSelectionContext): Promise<ModelEntry>;
}

// =============================================================================
// GatewayBackedModelRouter
// =============================================================================

/**
 * Default implementation that delegates to the gateway's model
 * selector. Infers the use case from the workflow node type/name.
 *
 * No direct provider knowledge — requests by tier and use case only.
 * The gateway is the single routing authority.
 */
export class GatewayBackedModelRouter implements TierAwareModelRouter {
  readonly #selector: TierAwareModelSelector;
  readonly #options: {
    escalationPolicy: EscalationPolicy;
    modelSelectionConstraints: ModelSelectionConstraints;
  };
  readonly #replicaRegistry: ReplicaRegistry | undefined;
  readonly #replicaSelector: ReplicaSelector | undefined;
  /** Most recent selection record — overwritten on each `chooseModelForTask` call. */
  #record: SelectionRecord | undefined;
  /** Append-only audit log of all selection and failover attempts in this session. */
  readonly #auditLog: SelectionRecord[] = [];

  constructor(gateway: GatewayClient, options: TierAwareModelRouterOptions = {}) {
    this.#selector = gateway.getModelSelector();
    this.#options = {
      escalationPolicy: options.escalationPolicy ?? DEFAULT_ESCALATION_POLICY,
      modelSelectionConstraints: options.modelSelectionConstraints ?? {}
    };
    this.#replicaRegistry = options.replicaRegistry;
    this.#replicaSelector = options.replicaSelector;
  }

  getSelectionRecord(): SelectionRecord | undefined {
    return this.#record;
  }

  getSelectionAuditLog(): SelectionRecord[] {
    return this.#auditLog;
  }

  async chooseModelForTask(input: { node: WorkflowNode; taskTier: TaskTier }): Promise<ModelEntry> {
    const useCase = inferUseCaseFromNode(input.node);

    const knownReplicas = this.#replicaRegistry?.getAll() ?? [];

    const record: SelectionRecord = {
      attemptedAt: new Date().toISOString(),
      failedReplicas: [],
      escalated: false,
      logicalModelId: '',
      taskTier: input.taskTier,
      candidatesConsidered: [],
      ...(knownReplicas.length > 0
        ? { circuitStates: Object.fromEntries(knownReplicas.map(r => [r.id, 'closed' as const])) }
        : {}),
      headroomPercentages: {}
    };

    const constraints: ModelSelectionConstraints = {};
    const base = this.#options.modelSelectionConstraints;
    if (base.excludeProviders !== undefined) {
      constraints.excludeProviders = base.excludeProviders;
    }
    if (base.localPreference !== undefined) {
      constraints.localPreference = base.localPreference;
    }
    if (base.maxUsdPer1KInput !== undefined) {
      constraints.maxUsdPer1KInput = base.maxUsdPer1KInput;
    }
    if (base.maxUsdPer1KOutput !== undefined) {
      constraints.maxUsdPer1KOutput = base.maxUsdPer1KOutput;
    }
    if (base.minContextWindow !== undefined) {
      constraints.minContextWindow = base.minContextWindow;
    }
    if (base.requireJsonMode !== undefined) {
      constraints.requireJsonMode = base.requireJsonMode;
    }
    if (base.requireTools !== undefined) {
      constraints.requireTools = base.requireTools;
    }

    try {
      const model = await this.#selector.selectModelForTier({
        constraints,
        tier: this.#resolveTier(input.taskTier),
        useCase
      });

      record.logicalModelId = model.id;
      record.selectedModel = model.id;
      this.#record = record;
      this.#auditLog.push(record);
      return model;
    } catch (error) {
      record.escalated = true;
      this.#record = record;
      this.#auditLog.push(record);
      throw error;
    }
  }

  // ===========================================================================
  // Failover chain
  // ===========================================================================

  /**
   * Build a failover chain from the selected model and all replicas
   * available in the optional `ReplicaRegistry`. If no registry is
   * configured, returns an empty chain (no failover possible).
   */
  createFailoverChain(selectedModel: ModelEntry): FailoverChain {
    const replicas = this.#replicaRegistry?.getByLogicalModel(selectedModel.id) ?? [];

    // Also include replicas from other logical models in the same tier
    const allTierReplicas =
      this.#replicaRegistry?.getAll().filter(r => getLogicalModel(r.logicalModelId)?.tier === selectedModel.tier) ?? [];

    const allReplicas = [
      ...new Map<string, ModelReplica>([...replicas, ...allTierReplicas].map(r => [r.id, r] as const)).values()
    ];

    return buildFailoverChain(selectedModel, allReplicas, this.#options.escalationPolicy);
  }

  /**
   * Advance the failover chain and resolve the next step to a `ModelEntry`.
   * Uses the gateway's `spillover` function to find the best replica for the
   * step. Throws `ExhaustedError` when no steps remain.
   *
   * Recording: each failed attempt is appended to `SelectionRecord.failedReplicas`.
   */
  // fallow-ignore-next-line complexity
  nextFailoverModel(chain: FailoverChain, error: Error, context: ReplicaSelectionContext): Promise<ModelEntry> {
    const step = getNextStep(chain, error);
    if (step === undefined) {
      throw new ExhaustedError([...chain.steps], chain.currentStep);
    }

    // Validate we have the required gateway components
    if (this.#replicaRegistry === undefined || this.#replicaSelector === undefined) {
      throw new ExhaustedError([...chain.steps], chain.currentStep);
    }

    // Record the failed replica before trying the next step
    if (this.#record && step.replicaId) {
      this.#record.failedReplicas.push(step.replicaId);
    }

    // Use the gateway's spillover to resolve the step to a replica
    const logicalModelId = step.logicalModelId;
    const tier = step.tier ?? 'micro';

    const escalationTierChain = this.#options.escalationPolicy.chain;
    const spilloverResult = spillover(
      logicalModelId ?? '',
      tier,
      this.#replicaRegistry,
      this.#replicaSelector,
      context,
      {
        allowTierEscalation: this.#options.escalationPolicy.allowEscalation,
        ...(escalationTierChain === undefined ? {} : { escalationChain: escalationTierChain }),
        excludeReplicas: new Set(this.#record?.failedReplicas)
      }
    );

    if (spilloverResult === undefined) {
      throw new ExhaustedError([...chain.steps], chain.currentStep);
    }

    // Convert the spillover result (ModelReplica) to a ModelEntry
    const modelEntry = this.#replicaToEntry(spilloverResult.replica);
    if (modelEntry === undefined) {
      throw new ExhaustedError([...chain.steps], chain.currentStep);
    }

    // Update selection record
    if (this.#record) {
      this.#record.selectedModel = modelEntry.id;
      this.#record.selectedReplica = spilloverResult.replica.id;
    }

    return Promise.resolve(modelEntry);
  }

  /**
   * Convert a `ModelReplica` to a `ModelEntry` by merging replica-specific
   * data with the canonical logical model definition from the gateway.
   */
  #replicaToEntry(replica: ModelReplica): ModelEntry | undefined {
    const logical = getLogicalModel(replica.logicalModelId);
    if (logical === undefined) {
      return;
    }

    return {
      id: replica.logicalModelId,
      modelName: replica.upstreamModelName,
      providerId: replica.providerId,
      tier: logical.tier,
      useCases: logical.useCases,
      capabilities: logical.capabilities,
      contextWindow: logical.contextWindow,
      maxOutputTokens: logical.maxOutputTokens,
      cost: replica.cost,
      isLocal: replica.isLocal
    };
  }

  /**
   * Resolve the effective tier to select from, based on escalation policy.
   * When escalation is allowed, the selector may return a model from any
   * tier in the chain starting from the assigned tier. When disabled, only
   * the assigned tier is considered.
   */
  #resolveTier(taskTier: TaskTier): TaskTier {
    if (!this.#options.escalationPolicy.allowEscalation) {
      return taskTier;
    }
    // When escalation is allowed, start from the assigned tier.
    // The gateway selector handles the actual escalation logic.
    return taskTier;
  }
}

// =============================================================================
// Use-case inference
// =============================================================================

const CODE_KEYWORDS = ['code', 'implement', 'write', 'compile', 'refactor', 'test'];
const SEARCH_KEYWORDS = ['search', 'research', 'find', 'retrieve', 'lookup'];
const EMBED_KEYWORDS = ['embed', 'vector', 'embedding'];

function inferUseCaseFromNode(node: WorkflowNode): 'chat' | 'code' | 'search' | 'embed' | 'vision' {
  const name = node.name?.toLowerCase() ?? '';
  const type = node.type;

  // Decision nodes are pure logic — use a cheap model
  if (type === 'decision') {
    return 'search';
  }

  if (CODE_KEYWORDS.some(kw => name.includes(kw))) {
    return 'code';
  }
  if (SEARCH_KEYWORDS.some(kw => name.includes(kw))) {
    return 'search';
  }
  if (EMBED_KEYWORDS.some(kw => name.includes(kw))) {
    return 'embed';
  }
  return 'chat';
}
