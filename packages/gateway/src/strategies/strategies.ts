import type { ProviderHealthEntry } from '../health/provider-health-registry.js';
import type { QuotaUsageSnapshot } from '../quota/tracker.js';
import type { ProviderEntry, StrategyName } from '../types.js';

import type { RoutingStrategy, SelectionContext } from './strategy.js';
import { matchesRequest } from './strategy.js';

const EMPTY_HEALTH: ProviderHealthEntry = {
  averageLatencyMs: undefined,
  circuitState: 'closed',
  errorCount: 0,
  healthy: true,
  lastError: undefined,
  requestCount: 0,
  status: 'healthy',
  successCount: 0,
  uptimeRatio: 1
};

const EMPTY_QUOTA: QuotaUsageSnapshot = {
  rpmLimit: 0,
  rpmRemaining: 0,
  tpmLimit: 0,
  tpmRemaining: 0
};

function isSelectable(
  entry: ProviderEntry,
  context: SelectionContext
): { health: ProviderHealthEntry; quota: QuotaUsageSnapshot } {
  const health = context.health.get(entry.id) ?? EMPTY_HEALTH;
  const quota = context.quota.get(entry.id) ?? EMPTY_QUOTA;
  return { health, quota };
}

function computeQuotaHeadroom(quota: QuotaUsageSnapshot): number {
  if (quota.tpmLimit > 0) {
    return quota.tpmRemaining / quota.tpmLimit;
  }
  if (quota.rpmLimit > 0) {
    return quota.rpmRemaining / quota.rpmLimit;
  }
  return 1;
}

function passesConstraints(entry: ProviderEntry, context: SelectionContext): boolean {
  const { health, quota } = isSelectable(entry, context);
  if (health.circuitState === 'open') {
    return false;
  }
  if (health.status === 'unhealthy') {
    return false;
  }
  const requested = context.request.estimatedInputTokens ?? 0;
  if (quota.tpmLimit > 0 && quota.tpmRemaining < requested) {
    return false;
  }
  if (quota.rpmLimit > 0 && quota.rpmRemaining <= 0) {
    return false;
  }
  return matchesRequest(entry, context.request);
}

/**
 * Distributes requests across providers in a rotating order. Skips
 * providers whose circuit is open or whose quota is exhausted.
 */
export class RoundRobinStrategy implements RoutingStrategy {
  readonly name = 'round-robin';
  #index = 0;

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    const eligible = providers.filter(entry => passesConstraints(entry, context));
    if (eligible.length === 0) {
      return;
    }
    const picked = eligible[this.#index % eligible.length];
    this.#index = (this.#index + 1) % eligible.length;
    return picked;
  }
}

/**
 * Weighted random selection. Higher `weights[id]` ⇒ more likely.
 * Defaults to weight 1 for providers with no configured weight.
 */
export class WeightedStrategy implements RoutingStrategy {
  readonly name = 'weighted';
  readonly #weights: ReadonlyMap<string, number>;

  constructor(weights: Readonly<Record<string, number>> = {}) {
    this.#weights = new Map(Object.entries(weights));
  }

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    const eligible = providers.filter(entry => passesConstraints(entry, context));
    if (eligible.length === 0) {
      return;
    }
    const total = eligible.reduce((sum, entry) => sum + (this.#weights.get(entry.id) ?? 1), 0);
    if (total <= 0) {
      return eligible[0];
    }
    // nosemgrep: insecure-randomness -- Math.random() is used for weighted-random load balancing.
    // Prediction of the selected replica confers no advantage: the selection is observable
    // and any eligible replica is authorized to handle the request.
    let target = Math.random() * total;
    for (const entry of eligible) {
      const weight = this.#weights.get(entry.id) ?? 1;
      if (target < weight) {
        return entry;
      }
      target -= weight;
    }
    return eligible.at(-1);
  }
}

/**
 * Picks the provider with the fewest in-flight requests. When
 * `inFlight` is not provided, falls back to `RoundRobinStrategy`.
 */
export class LeastConnectionsStrategy implements RoutingStrategy {
  readonly name = 'least-connections';
  readonly #fallback: RoutingStrategy;

  constructor() {
    this.#fallback = new RoundRobinStrategy();
  }

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    if (context.inFlight === undefined) {
      return this.#fallback.select(providers, context);
    }
    const eligible = providers.filter(entry => passesConstraints(entry, context));
    if (eligible.length === 0) {
      return;
    }
    let best: ProviderEntry | undefined;
    let bestCount = Number.POSITIVE_INFINITY;
    for (const entry of eligible) {
      const count = context.inFlight.get(entry.id) ?? 0;
      if (count < bestCount) {
        best = entry;
        bestCount = count;
      }
    }
    return best;
  }
}

/**
 * Picks the provider with the lowest recorded average latency. Providers
 * with no telemetry fall back to a default latency of 1000ms so they
 * aren't preferred over measured providers.
 */
export class LatencyBasedStrategy implements RoutingStrategy {
  readonly name = 'latency';
  readonly #defaultLatencyMs: number;

  constructor(options: { defaultLatencyMs?: number } = {}) {
    this.#defaultLatencyMs = options.defaultLatencyMs ?? 1000;
  }

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    const eligible = providers.filter(entry => passesConstraints(entry, context));
    if (eligible.length === 0) {
      return;
    }
    let best: ProviderEntry | undefined;
    let bestLatency = Number.POSITIVE_INFINITY;
    for (const entry of eligible) {
      const latency = context.health.get(entry.id)?.averageLatencyMs ?? this.#defaultLatencyMs;
      if (latency < bestLatency) {
        best = entry;
        bestLatency = latency;
      }
    }
    return best;
  }
}

/**
 * Tries providers in declared priority order. The first eligible provider
 * wins. Useful when you have an explicit "primary → fallback" list.
 */
export class PriorityFallbackStrategy implements RoutingStrategy {
  readonly name = 'priority-fallback';

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    for (const entry of providers) {
      if (passesConstraints(entry, context)) {
        return entry;
      }
    }
  }
}

/**
 * Picks the lowest cost per 1K input tokens. When no cost is configured
 * the provider is treated as having zero cost (i.e. preferred). Pass
 * `fallbackWeight` to balance cost against other factors.
 */
export class CostBasedStrategy implements RoutingStrategy {
  readonly name = 'cost-based';
  readonly #costPer1kInputTokens: ReadonlyMap<string, number>;

  constructor(costs: Readonly<Record<string, number>> = {}) {
    this.#costPer1kInputTokens = new Map(Object.entries(costs));
  }

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    const eligible = providers.filter(entry => passesConstraints(entry, context));
    if (eligible.length === 0) {
      return;
    }
    let best: ProviderEntry | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const entry of eligible) {
      const cost = this.#costPer1kInputTokens.get(entry.id) ?? 0;
      if (cost < bestCost) {
        best = entry;
        bestCost = cost;
      }
    }
    return best;
  }
}

/**
 * Composite scorer. Production default. Sums a normalized score from
 *   1. capability match (mandatory; drop if not satisfied — same as the
 *      `passesConstraints` pre-filter),
 *   2. health (closed circuit + high uptimeRatio),
 *   3. latency (lower is better),
 *   4. quota headroom (more remaining is better),
 *   5. cost (lower is better, optional).
 *
 * Each factor is clamped to [0, 1] and weighted via the constructor.
 */
export class AdaptiveStrategy implements RoutingStrategy {
  readonly name = 'adaptive';
  readonly #weights: { cost: number; health: number; latency: number; quota: number };
  readonly #costs: ReadonlyMap<string, number>;
  readonly #maxObservedLatencyMs: number;

  constructor(
    options: {
      costs?: Readonly<Record<string, number>>;
      maxObservedLatencyMs?: number;
      weights?: Partial<{ cost: number; health: number; latency: number; quota: number }>;
    } = {}
  ) {
    this.#weights = {
      cost: options.weights?.cost ?? 0.1,
      health: options.weights?.health ?? 0.4,
      latency: options.weights?.latency ?? 0.25,
      quota: options.weights?.quota ?? 0.25
    };
    this.#costs = new Map(Object.entries(options.costs ?? {}));
    this.#maxObservedLatencyMs = options.maxObservedLatencyMs ?? 5000;
  }

  select(providers: readonly ProviderEntry[], context: SelectionContext): ProviderEntry | undefined {
    const eligible = providers.filter(entry => passesConstraints(entry, context));
    if (eligible.length === 0) {
      return;
    }
    const maxCost = Math.max(0, ...this.#costs.values());
    let best: ProviderEntry | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const entry of eligible) {
      const score = this.#scoreEntry(entry, context, maxCost);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return best;
  }

  #scoreEntry(entry: ProviderEntry, context: SelectionContext, maxCost: number): number {
    const { health, quota } = isSelectable(entry, context);
    const healthScore = health.circuitState === 'closed' ? health.uptimeRatio : 0;
    const latencyMs = health.averageLatencyMs ?? this.#maxObservedLatencyMs;
    const latencyScore = 1 - Math.min(1, latencyMs / this.#maxObservedLatencyMs);
    const quotaHeadroom = computeQuotaHeadroom(quota);
    const cost = this.#costs.get(entry.id) ?? 0;
    const costScore = maxCost > 0 ? 1 - cost / maxCost : 1;
    return (
      healthScore * this.#weights.health +
      latencyScore * this.#weights.latency +
      quotaHeadroom * this.#weights.quota +
      costScore * this.#weights.cost
    );
  }
}

export interface StrategyOptions {
  costs?: Readonly<Record<string, number>>;
  weights?: Readonly<Record<string, number>>;
}

export function createStrategy(name: StrategyName, options: StrategyOptions = {}): RoutingStrategy {
  switch (name) {
    case 'adaptive':
      return options.costs === undefined ? new AdaptiveStrategy() : new AdaptiveStrategy({ costs: options.costs });
    case 'cost-based':
      return new CostBasedStrategy(options.costs ?? options.weights ?? {});
    case 'latency':
      return new LatencyBasedStrategy();
    case 'least-connections':
      return new LeastConnectionsStrategy();
    case 'priority-fallback':
      return new PriorityFallbackStrategy();
    case 'round-robin':
      return new RoundRobinStrategy();
    case 'weighted':
      return options.weights === undefined ? new WeightedStrategy() : new WeightedStrategy(options.weights);
    default:
      return new RoundRobinStrategy();
  }
}
