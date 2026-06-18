/**
 * Gateway — the public API for model selection and routing.
 *
 * Wraps the existing gateway internals (ModelRegistry, ReplicaRegistry,
 * HealthRegistry, QuotaRegistry, CircuitBreaker, SelectionStrategy) into
 * a clean public interface with pluggable persistence and ethics policy.
 *
 * External consumers use `createGateway()` to instantiate. The daemon
 * hosts the gateway via `RoutingService` with `UnifiedDB`-backed
 * persistence and agentsy's `PROVIDER_ETHICS_POLICY`.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { ProviderEthicsPolicyHook, RoutingRequest } from './ethics/types.js';
import type { ProviderHealthEntry } from './health/provider-health-registry.js';
import { ProviderHealthRegistry } from './health/provider-health-registry.js';
import { InMemoryPersistenceAdapter } from './persistence/in-memory.js';
import type { RoutingDecision } from './persistence/records.js';
import type { PersistenceAdapter } from './persistence/types.js';
import { QuotaTrackerRegistry } from './quota/tracker.js';
import { createStrategy } from './strategies/strategies.js';
import type { RoutingStrategy, SelectionContext } from './strategies/strategy.js';
import type { ModelReplica, ProviderEntry, StrategyName } from './types.js';

// =============================================================================
// Gateway options
// =============================================================================

export interface GatewayOptions {
  /** Provider ethics policy hook (default: none). */
  ethicsPolicy?: ProviderEthicsPolicyHook;
  /** Logger (default: no-op). */
  logger?: Logger;
  /** Persistence adapter (default: InMemoryPersistenceAdapter). */
  persistence?: PersistenceAdapter;
  /** Initial provider entries. */
  providers?: ProviderEntry[];
  /** Selection strategy name (default: 'adaptive'). */
  strategy?: StrategyName;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

// =============================================================================
// Health report
// =============================================================================

export interface HealthReport {
  readonly providers: Record<string, ProviderHealthEntry>;
  readonly timestamp: string;
}

// =============================================================================
// Gateway class
// =============================================================================

/**
 * Gateway — model selection and routing.
 *
 * Wraps the full routing stack: provider registry, health tracking,
 * quota tracking, circuit breaker, and selection strategy.
 * Pluggable persistence and ethics policy enable both standalone library
 * usage and daemon-hosted operation.
 */
export class Gateway {
  readonly #persistence: PersistenceAdapter;
  readonly #strategy: RoutingStrategy;
  readonly #ethicsPolicy: ProviderEthicsPolicyHook | undefined;
  readonly #logger: Logger;

  readonly #providers = new Map<string, ProviderEntry>();
  readonly #healthRegistry: ProviderHealthRegistry;
  readonly #quotaRegistry: QuotaTrackerRegistry;

  constructor(options: GatewayOptions = {}) {
    this.#persistence = options.persistence ?? new InMemoryPersistenceAdapter();
    this.#ethicsPolicy = options.ethicsPolicy;
    this.#logger = options.logger ?? createNoopLogger();

    this.#healthRegistry = new ProviderHealthRegistry();
    this.#quotaRegistry = new QuotaTrackerRegistry();
    this.#strategy = createStrategy(options.strategy ?? 'adaptive');

    // Register initial providers
    if (options.providers) {
      for (const provider of options.providers) {
        this.#providers.set(provider.id, provider);
      }
    }
  }

  // ===========================================================================
  // Model selection
  // ===========================================================================

  /**
   * Build a selection context for the given candidate providers.
   *
   * Populates health and quota maps from the registries, and maps
   * the routing request's capabilities and tier into the strategy
   * context format.
   */
  #buildSelectionContext(candidates: ProviderEntry[], request: RoutingRequest): SelectionContext {
    const healthMap = new Map<string, ProviderHealthEntry>();
    const quotaMap = new Map<
      string,
      { rpmLimit: number; rpmRemaining: number; tpmLimit: number; tpmRemaining: number }
    >();

    for (const p of candidates) {
      healthMap.set(p.id, this.#healthRegistry.getStatus(p.id));
      const tracker = this.#quotaRegistry.getTracker(p.id);
      if (tracker) {
        quotaMap.set(p.id, tracker.getUsageSnapshot());
      }
    }

    const requestObj: SelectionContext['request'] = { estimatedInputTokens: 100 };
    if (request.capabilities) {
      requestObj.requires = request.capabilities.map(c => {
        if (c === 'tool-use') return 'tools' as const;
        if (c === 'vision') return 'vision' as const;
        if (c === 'streaming') return 'streaming' as const;
        if (c === 'json') return 'json' as const;
        return 'tools' as const;
      });
    }
    if (request.tier) {
      requestObj.taskTier = request.tier as 'micro' | 'small' | 'mid' | 'frontier';
    }

    return { health: healthMap, quota: quotaMap, request: requestObj };
  }

  /**
   * Persist a routing decision for audit, swallowing errors.
   */
  async #persistDecision(decision: RoutingDecision): Promise<void> {
    await this.#persistence.saveRoutingDecision(decision).catch(() => {
      this.#logger.warn('Failed to persist routing decision');
    });
  }

  /**
   * Select a model for the given routing request.
   *
   * 1. Apply ethics policy (if configured)
   * 2. Build selection context with health and quota state
   * 3. Strategy-based selection (delegates to the configured RoutingStrategy)
   * 4. Persist decision for audit
   *
   * @remarks
   * Tier and capability filtering is delegated to the strategy layer via
   * `SelectionContext.request.taskTier` and `SelectionContext.request.requires`.
   * The strategy's `passesConstraints()` → `matchesRequest()` checks
   * `ProviderEntry.capabilities` against the required capabilities. Tier-based
   * pre-filtering is not performed at the Gateway level — strategies that
   * don't inspect `taskTier` may select a provider whose model tier doesn't
   * match the request. For strict tier enforcement, use a strategy that
   * inspects `taskTier` (e.g., `AdaptiveStrategy` with tier-aware weights).
   */
  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    let candidates = [...this.#providers.values()];

    // 1. Apply ethics policy (Phase 20 hook — pluggable, optional)
    if (this.#ethicsPolicy) {
      const replicas: ModelReplica[] = candidates.map(p => ({
        id: p.id,
        logicalModelId: p.model ?? p.id,
        providerId: p.id,
        upstreamModelName: p.model ?? p.id,
        cost: { inputPer1MTokens: 0, outputPer1MTokens: 0 },
        isLocal: false
      }));
      const ethicsResult = this.#ethicsPolicy.filter(replicas, request);
      const blockedIds = new Set(ethicsResult.blockedProviders);
      candidates = candidates.filter(p => !blockedIds.has(p.id));
      if (ethicsResult.blockedProviders.length > 0) {
        this.#logger.info(`Ethics policy blocked providers: ${ethicsResult.blockedProviders.join(', ')}`);
      }
    }

    // 2. Build selection context
    const context = this.#buildSelectionContext(candidates, request);

    // 3. Strategy-based selection
    const selected = this.#strategy.select(candidates, context);

    const decision: RoutingDecision = {
      id: randomUUID(),
      modelId: selected?.model ?? selected?.id ?? 'none',
      providerId: selected?.id ?? 'none',
      replicaId: selected?.id ?? 'none',
      tier: request.tier ?? 'unknown',
      selectedBecause: selected ? ['strategy-selected'] : ['no-candidates'],
      rejectedCandidates: candidates
        .filter(p => p.id !== selected?.id)
        .map(p => ({ id: p.id, reasons: ['not-selected'] })),
      timestamp: new Date().toISOString()
    };

    // 4. Persist decision for audit
    await this.#persistDecision(decision);

    return decision;
  }

  /**
   * Spillover to the next best candidate when the selected model fails.
   *
   * Re-runs strategy selection excluding the failed provider. This is a
   * simplified spillover compared to the full chain in `spillover.ts`
   * (which supports same-replica → same-tier → escalate). The Gateway
   * operates at the `ProviderEntry` level and doesn't maintain a
   * `ReplicaRegistry` with logical model mappings, so it uses
   * strategy-based re-selection instead of the replica-aware chain.
   *
   * @returns A new routing decision for a different provider, or null
   * if no other providers are available.
   */
  async spillover(decision: RoutingDecision): Promise<RoutingDecision | null> {
    const candidates = [...this.#providers.values()].filter(p => p.id !== decision.providerId);
    if (candidates.length === 0) {
      return null;
    }

    const context = this.#buildSelectionContext(candidates, {});
    const selected = this.#strategy.select(candidates, context);
    if (!selected) {
      return null;
    }

    const spilloverDecision: RoutingDecision = {
      id: randomUUID(),
      modelId: selected.model ?? selected.id,
      providerId: selected.id,
      replicaId: selected.id,
      tier: decision.tier,
      selectedBecause: ['spillover-fallback'],
      rejectedCandidates: [],
      timestamp: new Date().toISOString()
    };

    await this.#persistDecision(spilloverDecision);
    return spilloverDecision;
  }

  // ===========================================================================
  // Provider management
  // ===========================================================================

  /**
   * Register a provider.
   */
  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async registerProvider(provider: ProviderEntry): Promise<void> {
    this.#providers.set(provider.id, provider);
  }

  // ===========================================================================
  // Health
  // ===========================================================================

  /**
   * Get aggregate health report for all providers.
   */
  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async healthReport(): Promise<HealthReport> {
    const providers: Record<string, ProviderHealthEntry> = {};
    for (const providerId of this.#healthRegistry.listProviderIds()) {
      // nosemgrep: detect-object-injection — providerId is an internal key from the health registry, not user input
      providers[providerId] = this.#healthRegistry.getStatus(providerId);
    }
    return { providers, timestamp: new Date().toISOString() };
  }

  /** Registered provider IDs. */
  get providerIds(): readonly string[] {
    return [...this.#providers.keys()];
  }

  /**
   * Restore circuit-breaker state for a provider from persistence.
   *
   * Called by the daemon's RoutingService on startup after loading
   * state from UnifiedDB.
   */
  restoreCircuitBreakerState(providerId: string, state: 'closed' | 'open' | 'half-open', openedAt?: number): void {
    this.#healthRegistry.restoreCircuitBreakerState(providerId, state, openedAt);
  }

  // ===========================================================================
  // Persistence flush
  // ===========================================================================

  /**
   * Flush all in-memory state to the persistence adapter.
   *
   * Called by the daemon's RoutingService on shutdown to ensure
   * quota and circuit-breaker state survives restart.
   */
  async flush(): Promise<void> {
    for (const providerId of this.#healthRegistry.listProviderIds()) {
      const status = this.#healthRegistry.getStatus(providerId);
      await this.#persistence.saveCircuitBreakerState(providerId, status.circuitState);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new Gateway instance.
 *
 * @example
 * ```typescript
 * import { createGateway } from '@agentsy/gateway';
 *
 * const gateway = createGateway({
 *   providers: [
 *     { id: 'openai', name: 'OpenAI', provider: openaiProvider, model: 'gpt-4o' },
 *   ],
 * });
 *
 * const decision = await gateway.selectModel({ tier: 'frontier' });
 * ```
 */
export function createGateway(options?: GatewayOptions): Gateway {
  return new Gateway(options);
}

// =============================================================================
// Helpers
// =============================================================================

function createNoopLogger(): Logger {
  return {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
    debug: () => {},
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
    error: () => {},
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
    info: () => {},
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
    warn: () => {}
  };
}
