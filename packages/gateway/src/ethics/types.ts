/**
 * Provider ethics policy hook.
 *
 * Pluggable filter that runs during model selection. The agentsy daemon
 * plugs in its `PROVIDER_ETHICS_POLICY` (Phase 20) to block xAI/Grok,
 * warn on Meta/OpenAI/Microsoft/Google/Amazon, and enforce per-session
 * acknowledgement requirements.
 *
 * External consumers can supply their own hook or omit it entirely.
 *
 * @module
 */

import type { ModelReplica } from '../types.js';

/** A routing request for model selection. */
export interface RoutingRequest {
  readonly capabilities?: readonly string[];
  readonly maxCostPer1KInput?: number;
  readonly maxCostPer1KOutput?: number;
  readonly tier?: string;
  readonly useCase?: string;
}

/**
 * Result of the ethics policy filter.
 *
 * - `candidates`: the filtered list of allowed replicas
 * - `blockedProviders`: providers that were removed (for audit/logging)
 * - `requiresAcknowledgement`: providers that need per-session user acknowledgement
 */
export interface EthicsFilterResult {
  readonly blockedProviders: readonly string[];
  readonly candidates: readonly ModelReplica[];
  readonly requiresAcknowledgement: readonly string[];
}

/**
 * Pluggable ethics policy hook for model selection.
 *
 * Implementations should filter the candidate list based on ethical
 * provider policies, returning blocked and acknowledgement-required
 * providers for audit and UI surfacing.
 */
export interface ProviderEthicsPolicyHook {
  /**
   * Filter candidates during model selection.
   *
   * Called after capability/cost filtering but before scoring.
   * Returns filtered candidates plus metadata about what was blocked
   * and what requires acknowledgement.
   */
  filter(candidates: readonly ModelReplica[], request: RoutingRequest): EthicsFilterResult;
}
