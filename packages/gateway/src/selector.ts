/**
 * Tier-aware model selector. Given a requested `ModelTier`, optional
 * use case, and constraints, selects the best matching `ModelEntry`
 * from the `ModelRegistry`.
 *
 * Selection algorithm:
 *   1. Check availability (local models are probed; cloud assumed available)
 *   2. Filter by tier
 *   3. Filter by use case (when provided)
 *   4. Filter by constraints (capabilities, context window, cost)
 *   5. Score candidates with tier-aware local bonus
 *   6. Return the best candidate
 *
 * Local bonus varies by tier — micro/small tasks strongly prefer local
 * models (free, fast, private). Frontier tasks ignore local preference
 * and use the most capable model regardless of where it runs.
 *
 * Integration with `MetricsCollector` (future): candidates can be
 * de-ranked by latency percentile or error rate when live telemetry
 * is available.
 */

import { evaluateConstraints } from '@agentsy/guardrails';
import { modelRegistry } from './model-registry.js';
import type { ModelEntry, ModelSelectionConstraints, ModelTier, TierAwareModelSelector } from './types.js';

/**
 * Local bonus by tier. Lighter tasks get a stronger local preference.
 * Frontier tasks get no local bonus — use the best model regardless.
 */
const LOCAL_BONUS_BY_TIER: Record<ModelTier, number> = {
  micro: 100,
  small: 80,
  mid: 20,
  frontier: 0
};

export class DefaultTierAwareModelSelector implements TierAwareModelSelector {
  selectModelForTier(input: {
    constraints?: ModelSelectionConstraints;
    tier: ModelTier;
    useCase?: 'chat' | 'code' | 'reasoning' | 'search' | 'embed' | 'vision';
  }): Promise<ModelEntry> {
    const { tier, useCase, constraints } = input;

    let candidates = modelRegistry.getModelsByTier(tier);
    if (candidates.length === 0) {
      throw new Error(`No models registered for tier: ${tier}`);
    }

    candidates = this.#filterByUseCase(candidates, useCase);
    candidates = this.#filterByConstraints(candidates, constraints);

    if (candidates.length === 0) {
      throw new Error(`No models match the requested criteria (tier=${tier}, useCase=${useCase ?? 'any'})`);
    }

    // Handle localPreference constraints
    if (constraints?.localPreference === 'required') {
      const local = candidates.filter(m => m.isLocal);
      if (local.length === 0) {
        throw new Error(`No local models available for tier: ${tier}`);
      }
      candidates = local;
    } else if (constraints?.localPreference === 'disabled') {
      candidates = candidates.filter(m => !m.isLocal);
      if (candidates.length === 0) {
        throw new Error(`No cloud models available for tier: ${tier}`);
      }
    }

    // Score candidates with tier-aware local bonus
    const scored = candidates.map(model => {
      let score = 0;

      // Cost score: cheaper is better (inverted, per 1M input tokens)
      score -= model.cost.inputPer1MTokens * 0.1;

      // Local bonus: varies by tier
      // micro/small → strong local preference (free, fast, private)
      // mid → slight local preference if capable
      // frontier → no local preference (use best model)
      if (model.isLocal) {
        score += LOCAL_BONUS_BY_TIER[tier];
      }

      return { model, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best === undefined) {
      throw new Error(`No models available for tier: ${tier}`);
    }
    return Promise.resolve(best.model);
  }

  #filterByUseCase(candidates: ModelEntry[], useCase: string | undefined): ModelEntry[] {
    if (useCase === undefined) {
      return candidates;
    }
    return candidates.filter(m => m.useCases.includes(useCase as ModelEntry['useCases'][number]));
  }

  #filterByConstraints(candidates: ModelEntry[], constraints: ModelSelectionConstraints | undefined): ModelEntry[] {
    if (constraints === undefined) {
      return candidates;
    }
    let filtered = candidates;

    if (constraints.requireTools) {
      filtered = filtered.filter(m => m.capabilities.tools);
    }
    if (constraints.requireJsonMode) {
      filtered = filtered.filter(m => m.capabilities.jsonMode);
    }
    if (constraints.minContextWindow !== undefined) {
      filtered = filtered.filter(m => m.contextWindow >= (constraints.minContextWindow as number));
    }
    if (constraints.excludeProviders !== undefined && constraints.excludeProviders.length > 0) {
      const excluded = new Set(constraints.excludeProviders);
      filtered = filtered.filter(m => !excluded.has(m.providerId));
    }
    if (constraints.maxUsdPer1KInput !== undefined) {
      // Convert user-facing per-1K to internal per-1M (model registry stores per-1M)
      const max = constraints.maxUsdPer1KInput * 1000;
      filtered = filtered.filter(m => m.cost.inputPer1MTokens <= max);
    }
    if (constraints.maxUsdPer1KOutput !== undefined) {
      // Convert user-facing per-1K to internal per-1M (model registry stores per-1M)
      const max = constraints.maxUsdPer1KOutput * 1000;
      filtered = filtered.filter(m => m.cost.outputPer1MTokens <= max);
    }

    const routingConstraint = constraints.routingConstraints;
    if (routingConstraint !== undefined) {
      filtered = filtered.filter(m => {
        const info: import('@agentsy/guardrails').GatewayModelInfo = {
          capabilities: {
            jsonMode: m.capabilities.jsonMode,
            reasoning: m.capabilities.reasoning,
            tools: m.capabilities.tools,
            vision: m.capabilities.vision
          },
          isLocal: m.isLocal ?? false,
          providerId: m.providerId
        };
        return evaluateConstraints(routingConstraint, info).pass;
      });
    }

    return filtered;
  }
}
