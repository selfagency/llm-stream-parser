import os from 'node:os';
import path from 'node:path';

import type {
  LLMStatsLocalModel,
  LocalModelRecommendation,
  LocalRecommendationCriteria,
  ModelSelectionResult,
  ModelsDevAPI,
  ModelsDevModel,
  ModelsDevProvider,
  SystemCapabilities,
  TaskRequirements
} from './types.js';

export { LLMStatsClient } from './llm-stats-client.js';
export type {
  LocalModelInfo,
  LocalProviderDiscoveryResult,
  LocalProviderProbeResult,
  LocalProviderProfile,
  OllamaProbeOptions,
  ProviderProtocol,
  VllmProbeOptions
} from './local-providers/index.js';
export {
  clearLocalProviderDiscoveryCache,
  discoverLocalProviders,
  probeOllama,
  probeVllm
} from './local-providers/index.js';

export type {
  ModelRefinementRequest,
  ModelSearchQuery,
  ModelSearchResult,
  RecommendationCriteria
} from './search-contracts.js';

export {
  mergeModelRefinementRequest,
  normalizeModelSearchQuery,
  searchModels
} from './search-contracts.js';
export type {
  LLMStatsLocalModel,
  LocalModelRecommendation,
  LocalRecommendationCriteria,
  ModelSelectionResult,
  ModelsDevAPI,
  ModelsDevModel,
  ModelsDevProvider,
  SystemCapabilities,
  TaskRequirements
} from './types.js';

// Cache structure
interface CacheData {
  data: ModelsDevAPI;
  timestamp: number;
}

function isCacheData(value: unknown): value is CacheData {
  return typeof value === 'object' && value !== null && 'timestamp' in value && 'data' in value;
}

function isModelsDevAPI(value: unknown): value is ModelsDevAPI {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Object.values(record).every(
    provider =>
      typeof provider === 'object' &&
      provider !== null &&
      typeof (provider as Record<string, unknown>).id === 'string' &&
      typeof (provider as Record<string, unknown>).models === 'object'
  );
}

// nosemgrep: regex-dos-model-params
// Pattern only matches short model-ID strings with bounded length (e.g. "70b", "13.5b").
// No alternation or nested quantifiers; input is always a known model identifier.
const PARAMS_B_PATTERN = /(\d+(?:\.\d+)?)\s*b\b/iu;

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isSafeLookupKey(key: string): boolean {
  return key.length > 0 && !FORBIDDEN_OBJECT_KEYS.has(key);
}

function normalizeModelId(id: string): string {
  return id.trim().toLowerCase().replace('/', ':');
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function parseParamsBillionsFromId(modelId: string): number | undefined {
  const match = PARAMS_B_PATTERN.exec(modelId);
  if (!match?.[1]) {
    return;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function quantizationFactor(quantization?: string): number {
  if (!quantization) {
    return 0.5;
  }

  const q = quantization.toLowerCase();

  if (q.includes('q2')) {
    return 0.2;
  }
  if (q.includes('q3')) {
    return 0.28;
  }
  if (q.includes('q4')) {
    return 0.36;
  }
  if (q.includes('q5')) {
    return 0.45;
  }
  if (q.includes('q6')) {
    return 0.56;
  }
  if (q.includes('q8')) {
    return 0.7;
  }
  if (q.includes('f16')) {
    return 1;
  }

  return 0.5;
}

function estimateMemoryRequirementsFromModelId(
  modelId: string,
  quantization?: string
): {
  requiredRamGb: number;
  requiredVramGb: number;
} {
  const paramsB = parseParamsBillionsFromId(modelId) ?? 7;
  const fp16Gb = paramsB * 2;
  const quantizedGb = fp16Gb * quantizationFactor(quantization);
  const requiredVramGb = Math.max(1, quantizedGb);
  const requiredRamGb = Math.max(2, requiredVramGb * 1.3);

  return { requiredRamGb, requiredVramGb };
}

function resolveModelsDevModel(
  modelsDevData: ModelsDevAPI,
  modelId: string
): { provider: string; model: ModelsDevModel } | undefined {
  const normalizedTarget = normalizeModelId(modelId);

  for (const [providerId, provider] of Object.entries(modelsDevData)) {
    for (const [modelKey, model] of Object.entries(provider.models)) {
      const normalizedModelKey = normalizeModelId(modelKey);
      const normalizedModelId = normalizeModelId(model.id);
      const normalizedProviderModel = normalizeModelId(`${providerId}:${modelKey}`);

      const candidateIds = [normalizedModelId, normalizedModelKey, normalizedProviderModel];
      if (candidateIds.includes(normalizedTarget)) {
        return { model, provider: providerId };
      }
    }
  }
}

function getCategoryBenchmarkScore(
  entry: LLMStatsLocalModel,
  category: NonNullable<LocalRecommendationCriteria['taskCategory']>
): number {
  const categoryValue = entry.categoryScores?.[category];
  if (typeof categoryValue === 'number') {
    return clamp01(categoryValue / 100);
  }

  if (typeof entry.rankingScore === 'number') {
    return clamp01(entry.rankingScore / 100);
  }

  return 0.5;
}

function getAvailableVram(systemCapabilities: SystemCapabilities): number {
  if (systemCapabilities.unifiedMemory) {
    return systemCapabilities.ramGb;
  }

  return systemCapabilities.vramGb ?? 0;
}

interface RecommendationInputs {
  availableVram: number;
  category: NonNullable<LocalRecommendationCriteria['taskCategory']>;
  criteria: LocalRecommendationCriteria;
  entry: LLMStatsLocalModel;
  modelsDevData: ModelsDevAPI;
  systemCapabilities: SystemCapabilities;
}

function isEligibleForCriteria(model: ModelsDevModel, criteria: LocalRecommendationCriteria): boolean {
  if (criteria.requireToolCalling && !model.tool_call) {
    return false;
  }
  if (criteria.minContext !== undefined && model.limit.context < criteria.minContext) {
    return false;
  }
  return true;
}

function getMemoryRequirements(entry: LLMStatsLocalModel): {
  requiredRamGb: number;
  requiredVramGb: number;
} {
  if (entry.minRamGb !== undefined || entry.minVramGb !== undefined) {
    return {
      requiredRamGb: entry.minRamGb ?? entry.recommendedRamGb ?? 0,
      requiredVramGb: entry.minVramGb ?? entry.recommendedVramGb ?? 0
    };
  }

  return estimateMemoryRequirementsFromModelId(entry.modelId, entry.quantization);
}

// fallow-ignore-next-line complexity — recommendation engine with multi-criteria decision branching
function buildRecommendation(inputs: RecommendationInputs): LocalModelRecommendation | null {
  const { entry, criteria, category, modelsDevData, systemCapabilities, availableVram } = inputs;

  if (!entry.isLocalCompatible) {
    return null;
  }

  const resolved = resolveModelsDevModel(modelsDevData, entry.modelId);
  const model = resolved?.model;
  const provider = resolved?.provider ?? 'unknown';

  if (!model) {
    return null;
  }

  if (!isEligibleForCriteria(model, criteria)) {
    return null;
  }

  const { requiredRamGb, requiredVramGb } = getMemoryRequirements(entry);
  const ramFits = requiredRamGb <= systemCapabilities.ramGb;
  const vramFits = requiredVramGb <= availableVram || availableVram === 0;

  if (!(ramFits && vramFits)) {
    return null;
  }

  const ramUtilization = requiredRamGb / Math.max(systemCapabilities.ramGb, 0.1);
  const vramUtilization = requiredVramGb / Math.max(availableVram || requiredVramGb || 1, 0.1);
  const utilization = Math.max(ramUtilization, vramUtilization);

  const fitScore = clamp01(1 - Math.abs(utilization - 0.65));
  const benchmarkScore = getCategoryBenchmarkScore(entry, category);
  const speedScore = clamp01((entry.estimatedTokensPerSecond ?? 20) / 100);

  const rawCost = (model.cost.input ?? 0) + (model.cost.output ?? 0);
  const costScore = clamp01(1 / (1 + rawCost * 50));

  const contextScore = clamp01(model.limit.context / 256_000);
  const capabilityScore = criteria.requireToolCalling ? Number(model.tool_call) : 0.8;

  const fitWeight = 0.4;
  const benchmarkWeight = 0.3;
  const capabilityWeight = 0.1;
  const contextWeight = 0.1;
  const speedWeight = 0.05;
  const costWeight = criteria.preferLowCost ? 0.15 : 0.05;

  const compositeScore =
    fitWeight * fitScore +
    benchmarkWeight * benchmarkScore +
    capabilityWeight * capabilityScore +
    contextWeight * contextScore +
    speedWeight * speedScore +
    costWeight * costScore;

  const recommendation: LocalModelRecommendation = {
    benchmarkScore,
    capabilities: {
      reasoning: model.reasoning,
      tool_calling: model.tool_call
    },
    compositeScore,
    confidence: clamp01(compositeScore),
    costScore,
    estimatedCost: rawCost,
    fitScore,
    model: model.id,
    provider,
    reasoning: `Fit ${fitScore.toFixed(2)}, benchmark ${benchmarkScore.toFixed(2)}, cost ${costScore.toFixed(2)} for ${category}`,
    requiredRamGb,
    requiredVramGb,
    speedScore
  };

  if (entry.runtime !== undefined) {
    recommendation.runtime = entry.runtime;
  }

  if (entry.quantization !== undefined) {
    recommendation.quantization = entry.quantization;
  }

  return recommendation;
}

/**
 * Recommend local models by combining models.dev metadata, llm-stats/local benchmark data,
 * and system capability constraints.
 */
export function recommendLocalModelsBySystemCapabilities(
  modelsDevData: ModelsDevAPI,
  llmStatsLocalModels: LLMStatsLocalModel[],
  systemCapabilities: SystemCapabilities,
  criteria: LocalRecommendationCriteria = {}
): LocalModelRecommendation[] {
  const category = criteria.taskCategory ?? 'general';
  const availableVram = getAvailableVram(systemCapabilities);

  const recommendations: LocalModelRecommendation[] = [];

  for (const entry of llmStatsLocalModels) {
    const recommendation = buildRecommendation({
      availableVram,
      category,
      criteria,
      entry,
      modelsDevData,
      systemCapabilities
    });

    if (recommendation) {
      recommendations.push(recommendation);
    }
  }

  recommendations.sort((a, b) => b.compositeScore - a.compositeScore);

  if (criteria.topN !== undefined) {
    return recommendations.slice(0, Math.max(0, criteria.topN));
  }

  return recommendations;
}

// Simple models.dev client with caching
export class ModelsDevClient {
  private cache?: ModelsDevAPI;
  private lastFetched?: Date;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CACHE_FILE = path.join(os.tmpdir(), 'models.dev-cache.json');

  async fetchModelsDevData(force = false): Promise<ModelsDevAPI> {
    // Check cache first
    if (!force && this.cache && this.lastFetched && Date.now() - this.lastFetched.getTime() < this.CACHE_TTL) {
      return this.cache;
    }

    // Try to load from file cache
    try {
      const fs = await import('node:fs/promises');
      const cacheData = await fs.readFile(this.CACHE_FILE, 'utf-8');
      const parsed: unknown = JSON.parse(cacheData);
      if (!isCacheData(parsed)) {
        throw new Error('Invalid cache data');
      }
      const cached = parsed;
      if (cached.timestamp && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.cache = cached.data;
        this.lastFetched = new Date(cached.timestamp);
        return this.cache;
      }
    } catch {
      // No cache file or expired
    }

    // Fetch from API
    const response = await fetch('https://models.dev/api.json');
    const json = await response.json();
    if (!isModelsDevAPI(json)) {
      throw new Error('Invalid API response');
    }
    const data = json;

    // Save to cache
    try {
      const fs = await import('node:fs/promises');
      const cacheDir = os.tmpdir();
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(this.CACHE_FILE, JSON.stringify({ data, timestamp: Date.now() }), 'utf-8');
    } catch {
      // Failed to save cache, ignore
    }

    this.cache = data;
    this.lastFetched = new Date();
    return data;
  }

  getCachedData(): ModelsDevAPI | undefined {
    return this.cache;
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): ModelsDevProvider | undefined {
    if (!isSafeLookupKey(providerId)) {
      return;
    }

    const { cache } = this;
    if (!(cache && Object.hasOwn(cache, providerId))) {
      return;
    }

    return cache[providerId];
  }

  /**
   * Get a specific model by ID (supports provider:model or just model format)
   */
  getModel(modelId: string): ModelsDevModel | undefined {
    // Try parsing as provider:model format
    if (modelId.includes(':')) {
      const [providerId, modelName] = modelId.split(':');
      if (providerId && modelName) {
        return this.getModelFromProvider(providerId, modelName);
      }
    }

    if (modelId.includes('/')) {
      const [providerId, modelName] = modelId.split('/');
      if (providerId && modelName) {
        return this.getModelFromProvider(providerId, modelName);
      }
    }

    // Search for model ID across all providers
    if (!isSafeLookupKey(modelId)) {
      return;
    }

    for (const provider of Object.values(this.cache ?? {})) {
      if (Object.hasOwn(provider.models, modelId)) {
        return provider.models[modelId];
      }
    }
  }

  private getModelFromProvider(providerId: string, modelName: string): ModelsDevModel | undefined {
    if (!(isSafeLookupKey(providerId) && isSafeLookupKey(modelName))) {
      return;
    }

    const provider = this.getProvider(providerId);
    if (!(provider && Object.hasOwn(provider.models, modelName))) {
      return;
    }

    return provider.models[modelName];
  }

  /**
   * List all providers
   */
  listProviders(): ModelsDevProvider[] {
    return Object.values(this.cache ?? {});
  }

  /**
   * List all models across all providers
   */
  listModels(providerId?: string): ModelsDevModel[] {
    if (providerId) {
      const provider = this.getProvider(providerId);
      return Object.values(provider?.models ?? {});
    }
    return Object.values(this.cache ?? {}).flatMap(provider => Object.values(provider.models));
  }
}

/**
 * Model selector for intelligent model selection based on task requirements
 */
export class ModelSelector {
  private client?: ModelsDevClient;

  constructor(client?: ModelsDevClient) {
    if (client) {
      this.client = client;
    }
  }

  private getClient(): ModelsDevClient {
    this.client ??= new ModelsDevClient();
    return this.client;
  }

  /**
   * Select the best model for a given set of task requirements
   */
  async selectModel(requirements: TaskRequirements): Promise<ModelSelectionResult> {
    await this.getClient().fetchModelsDevData();

    const suitableModels = this.getModelsMatchingRequirements(requirements);
    const scoredModels = this.scoreModels(suitableModels, requirements);
    return this.pickBestModel(scoredModels);
  }

  /**
   * Local recommendation entrypoint using cached models.dev + provided llm-stats/local signals.
   */
  async recommendLocalModels(
    llmStatsLocalModels: LLMStatsLocalModel[],
    systemCapabilities: SystemCapabilities,
    criteria: LocalRecommendationCriteria = {}
  ): Promise<LocalModelRecommendation[]> {
    const data = await this.getClient().fetchModelsDevData();
    return recommendLocalModelsBySystemCapabilities(data, llmStatsLocalModels, systemCapabilities, criteria);
  }

  private getModelsMatchingRequirements(requirements: TaskRequirements): ModelsDevModel[] {
    const allModels = this.getClient().listModels();
    const providerModels = this.filterUniqueProviderModels(allModels);
    return providerModels.filter(model => this.meetsRequirements(model, requirements));
  }

  private filterUniqueProviderModels(allModels: ModelsDevModel[]): ModelsDevModel[] {
    const uniqueModelProviders = this.getUniqueProviderSet();
    return allModels.filter(model => {
      const provider = this.findProviderForModel(model.id);
      return provider && uniqueModelProviders.has(provider);
    });
  }

  private getUniqueProviderSet(): Set<string> {
    return new Set([
      'anthropic',
      'google',
      'google-vertex',
      'google-vertex-anthropic',
      'openai',
      'moonshotai',
      'meta',
      'mistral',
      'cohere',
      'deepseek',
      'groq',
      'xai',
      'microsoft',
      'nvidia',
      'aws',
      'azure',
      'openai-compatible',
      'meta_llama',
      'deepseek-r1',
      'qwen',
      'modelscope',
      'vllm',
      'lm-studio',
      'together-ai',
      'scaleway',
      'abacus',
      'perplexity-ai',
      'nebula',
      'novita-ai'
    ]);
  }

  private scoreModels(models: ModelsDevModel[], requirements: TaskRequirements): ModelSelectionResult[] {
    return models.map(model => ({
      capabilities: requirements.capabilities ?? {},
      confidence: this.calculateConfidence(model, requirements),
      estimatedCost: this.estimateModelCost(model),
      model: model.id,
      provider: this.findProviderForModel(model.id),
      reasoning: this.generateReasoning(model, requirements)
    }));
  }

  private pickBestModel(scoredModels: ModelSelectionResult[]): ModelSelectionResult {
    if (scoredModels.length === 0) {
      throw new Error('No models found that meet the requirements');
    }

    scoredModels.sort((a: ModelSelectionResult, b: ModelSelectionResult) => b.confidence - a.confidence);
    const [bestModel] = scoredModels;

    if (!bestModel) {
      throw new Error('No model could be ranked after filtering');
    }

    return bestModel;
  }

  /**
   * Estimate task cost for a given model
   */
  async estimateTask(
    prompt: string,
    modelId: string,
    options?: { estimatedInputTokens?: number; estimatedOutputTokens?: number }
  ): Promise<ModelSelectionResult> {
    await this.getClient().fetchModelsDevData();

    const model = this.getClient().getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Simple estimation: assume 2 tokens per word for input, 1 per word for output
    const inputTokens = options?.estimatedInputTokens ?? prompt.split(/\s+/u).length * 2;
    const outputTokens = options?.estimatedOutputTokens ?? Math.floor(prompt.split(/\s+/u).length * 0.5);

    const { cost } = model;
    const inputCost = (inputTokens / 1000) * cost.input;
    const outputCost = (outputTokens / 1000) * cost.output;

    return {
      capabilities: {},
      confidence: 0.8,
      estimatedCost: inputCost + outputCost,
      model: modelId,
      provider: this.findProviderForModel(model.id),
      reasoning: `Estimated cost based on ${inputTokens} input tokens and ${outputTokens} output tokens`
    };
  }

  /**
   * Find the provider for a given model
   */
  private findProviderForModel(modelId: string): string {
    // Search all providers for this model
    for (const [providerId, provider] of Object.entries(this.getClient().getCachedData() ?? {})) {
      if (Object.hasOwn(provider.models, modelId)) {
        return providerId;
      }
    }
    return 'unknown';
  }

  /**
   * Check if a model meets the given requirements
   */
  private meetsRequirements(model: ModelsDevModel, requirements: TaskRequirements): boolean {
    if (this.isInterfaceModel(model)) {
      return false;
    }

    if (!this.matchesModalityRequirements(model, requirements.modality)) {
      return false;
    }

    if (!this.matchesCapabilityRequirements(model, requirements)) {
      return false;
    }

    if (!this.matchesConstraints(model, requirements.constraints)) {
      return false;
    }

    return true;
  }

  private isInterfaceModel(model: ModelsDevModel): boolean {
    if (model.family === 'auto') {
      return true;
    }

    if (model.id.includes('auto') && !model.id.includes('autoglm')) {
      return true;
    }

    const modelIdLower = model.id.toLowerCase();
    return modelIdLower.startsWith('kilo-auto') || modelIdLower.includes('kilo-auto/');
  }

  private matchesModalityRequirements(model: ModelsDevModel, modality?: TaskRequirements['modality']): boolean {
    if (!modality) {
      return true;
    }

    const inputModalities = model.modalities?.input ?? [];
    const outputModalities = model.modalities?.output ?? [];

    if (modality === 'multimodal') {
      return (
        inputModalities.includes('image') || inputModalities.includes('audio') || inputModalities.includes('video')
      );
    }

    if (modality === 'code') {
      return inputModalities.includes('text') && outputModalities.includes('text');
    }

    return true;
  }

  private matchesCapabilityRequirements(model: ModelsDevModel, requirements: TaskRequirements): boolean {
    if (requirements.capabilities?.tool_calling && !model.tool_call) {
      return false;
    }

    return true;
  }

  private matchesConstraints(model: ModelsDevModel, constraints?: TaskRequirements['constraints']): boolean {
    if (!constraints) {
      return true;
    }

    if (constraints.max_cost !== undefined) {
      const estimatedCost = this.estimateModelCost(model);
      if (estimatedCost > constraints.max_cost) {
        return false;
      }
    }

    if (constraints.max_context !== undefined) {
      const maxContext = model.limit?.context ?? 0;
      if (maxContext < constraints.max_context) {
        return false;
      }
    }

    if (constraints.exclude_family?.includes(model.family)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate confidence score for a model
   */
  private calculateConfidence(model: ModelsDevModel, requirements: TaskRequirements): number {
    let confidence = 0.5;

    // Boost confidence for models with requested features
    if (requirements.capabilities?.tool_calling && model.tool_call) {
      confidence += 0.2;
    }

    if (requirements.capabilities?.streaming) {
      // Most modern models support streaming, give slight boost
      confidence += 0.1;
    }

    // Consider specialization
    if (requirements.specialization && model.knowledge) {
      const { knowledge } = model;
      if (knowledge.toLowerCase().includes(requirements.specialization.toLowerCase())) {
        confidence += 0.2;
      }
    }

    return Math.min(confidence, 1);
  }

  /**
   * Estimate model cost based on cost per thousand tokens
   */
  private estimateModelCost(model: ModelsDevModel): number {
    const { cost } = model;
    // Rough estimate assuming 1000 input and 1000 output tokens
    const raw = ((cost?.input ?? 0) + (cost?.output ?? 0)) * 10;
    // Floor at a tiny baseline so models with missing cost data still register
    return Math.max(raw, 0.0001);
  }

  /**
   * Generate reasoning for model selection
   */
  private generateReasoning(model: ModelsDevModel, requirements: TaskRequirements): string {
    const reasons: string[] = [];

    if (model.tool_call && requirements.capabilities?.tool_calling) {
      reasons.push('Supports tool calling');
    }

    const { limit } = model;
    if (limit?.context && limit.context > 200_000) {
      reasons.push('Large context window');
    }

    const { cost } = model;
    if (cost && cost.input + cost.output < 0.01) {
      reasons.push('Cost-effective');
    }

    return reasons.join(', ') || 'Selected based on requirements';
  }
}

export * from './local-providers/index.js';
export { selectModel, selectModelForProvider } from './search-contracts.js';
