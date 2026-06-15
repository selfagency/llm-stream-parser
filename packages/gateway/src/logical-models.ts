/**
 * Canonical logical model definitions. A `LogicalModel` is a model
 * identity independent of any provider or account. Multiple
 * `ModelReplica` entries may serve the same logical model.
 */

import type { LogicalModel, ModelTier } from './types.js';

const LOGICAL_MODELS: LogicalModel[] = [
  // Local / micro
  {
    id: 'llama3.2:1b',
    tier: 'micro',
    useCases: ['chat'],
    capabilities: { tools: false, jsonMode: false, vision: false, audio: false, reasoning: false, embeddings: false },
    contextWindow: 128_000,
    maxOutputTokens: 4096
  },

  // Small
  {
    id: 'gpt-4o-mini',
    tier: 'small',
    useCases: ['chat', 'code'],
    capabilities: { tools: true, jsonMode: true, vision: false, audio: false, reasoning: false, embeddings: false },
    contextWindow: 128_000,
    maxOutputTokens: 16_384
  },
  {
    id: 'claude-3-5-haiku',
    tier: 'small',
    useCases: ['chat'],
    capabilities: { tools: true, jsonMode: true, vision: true, audio: false, reasoning: false, embeddings: false },
    contextWindow: 200_000,
    maxOutputTokens: 8192
  },

  // Mid
  {
    id: 'gpt-4o',
    tier: 'mid',
    useCases: ['chat', 'code', 'vision'],
    capabilities: { tools: true, jsonMode: true, vision: true, audio: false, reasoning: false, embeddings: false },
    contextWindow: 128_000,
    maxOutputTokens: 16_384
  },
  {
    id: 'claude-3-5-sonnet',
    tier: 'mid',
    useCases: ['chat', 'code', 'vision'],
    capabilities: { tools: true, jsonMode: true, vision: true, audio: false, reasoning: false, embeddings: false },
    contextWindow: 200_000,
    maxOutputTokens: 8192
  },
  {
    id: 'llama3.3:70b',
    tier: 'mid',
    useCases: ['chat', 'code'],
    capabilities: { tools: true, jsonMode: true, vision: false, audio: false, reasoning: false, embeddings: false },
    contextWindow: 128_000,
    maxOutputTokens: 8192
  },
  {
    id: 'qwen3-coder',
    tier: 'mid',
    useCases: ['code'],
    capabilities: { tools: true, jsonMode: true, vision: false, audio: false, reasoning: false, embeddings: false },
    contextWindow: 32_000,
    maxOutputTokens: 8192
  },

  // Frontier
  {
    id: 'o1-mini',
    tier: 'frontier',
    useCases: ['code', 'reasoning'],
    capabilities: { tools: true, jsonMode: false, vision: false, audio: false, reasoning: true, embeddings: false },
    contextWindow: 128_000,
    maxOutputTokens: 65_536
  },
  {
    id: 'claude-3-5-opus',
    tier: 'frontier',
    useCases: ['chat', 'code', 'vision', 'reasoning'],
    capabilities: { tools: true, jsonMode: true, vision: true, audio: false, reasoning: true, embeddings: false },
    contextWindow: 200_000,
    maxOutputTokens: 8192
  }
];

const BY_ID: ReadonlyMap<string, LogicalModel> = new Map(LOGICAL_MODELS.map(m => [m.id, m]));
const BY_TIER: ReadonlyMap<ModelTier, readonly LogicalModel[]> = (() => {
  const map = new Map<ModelTier, LogicalModel[]>();
  for (const model of LOGICAL_MODELS) {
    const list = map.get(model.tier);
    if (list === undefined) {
      map.set(model.tier, [model]);
    } else {
      list.push(model);
    }
  }
  return map;
})();

export function getLogicalModel(id: string): LogicalModel | undefined {
  return BY_ID.get(id);
}

export function getLogicalModelsByTier(tier: ModelTier): readonly LogicalModel[] {
  return BY_TIER.get(tier) ?? [];
}

export function getAllLogicalModels(): readonly LogicalModel[] {
  return LOGICAL_MODELS;
}

/**
 * Registry for logical models, indexed by tier, use case, and alias.
 *
 * Wraps the standalone lookup functions in a class interface for
 * dependency injection and testability.
 */
export class LogicalModelRegistry {
  /**
   * Look up a logical model by its canonical ID.
   */
  getById(id: string): LogicalModel | undefined {
    return getLogicalModel(id);
  }

  /**
   * Get all logical models for a given tier.
   */
  getByTier(tier: ModelTier): readonly LogicalModel[] {
    return getLogicalModelsByTier(tier);
  }

  /**
   * Get all logical models that support a given use case.
   */
  getByUseCase(useCase: string): LogicalModel[] {
    return LOGICAL_MODELS.filter(m => m.useCases.includes(useCase as never));
  }

  /**
   * Get all registered logical models.
   */
  getAll(): readonly LogicalModel[] {
    return getAllLogicalModels();
  }
}
