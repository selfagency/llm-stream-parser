import type { ReadableStream } from 'node:stream/web';

import type { CompletionRequest, CompletionResponse, NormalizedChunk } from '@agentsy/shared';

import type { NormalizerProvider } from './pipeline/create-pipeline.js';
import { createUniversalClient, type UniversalClientConfig } from './universal-client/client.js';

/**
 * A lightweight provider entry for the request path layer.
 *
 * Represents a single provider configuration that can be selected
 * by the RequestHandler based on model matching.
 */
export interface RequestPathProvider {
  /** API key for authentication */
  apiKey?: string;
  /** Base URL override (defaults to provider-specific default) */
  baseUrl?: string;
  /** Unique identifier for this provider entry */
  id: string;
  /** Default model for this provider entry */
  model?: string;
  /** Human-readable name for display in UI/logs */
  name: string;
  /** Provider type (openai, anthropic, gemini, ollama, etc.) */
  provider: NormalizerProvider;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Options for creating a RequestHandler.
 */
export interface RequestHandlerOptions {
  /** Default model when the request doesn't specify one */
  defaultModel?: string;
  /** Provider entries to select from */
  providers: RequestPathProvider[];
}

/**
 * A high-level handler for provider requests.
 *
 * Wraps one or more UniversalClient instances and provides
 * automatic provider selection based on model matching.
 */
export interface RequestHandler {
  /**
   * Execute a non-streaming completion request.
   *
   * Selects the appropriate provider based on the request model,
   * then delegates to UniversalClient.complete().
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Execute a streaming completion request.
   *
   * Selects the appropriate provider based on the request model,
   * then delegates to UniversalClient.stream().
   */
  stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>>;

  /**
   * Returns a new RequestHandler bound to a specific model.
   *
   * The returned handler always uses the given model regardless
   * of what the CompletionRequest specifies.
   */
  withModel(model: string): RequestHandler;
}

/**
 * Creates a RequestHandler that selects providers by model matching.
 *
 * Provider selection strategy:
 * 1. Exact match on the request model against provider model configs
 * 2. Fall back to first available provider
 *
 * @example
 * ```typescript
 * const handler = createRequestHandler({
 *   providers: [
 *     {
 *       id: 'openai-gpt4',
 *       name: 'OpenAI GPT-4',
 *       provider: 'openai',
 *       apiKey: process.env['OPENAI_API_KEY'],
 *       model: 'gpt-4'
 *     }
 *   ]
 * });
 *
 * const response = await handler.complete({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export function createRequestHandler(options: RequestHandlerOptions): RequestHandler {
  const { providers, defaultModel } = options;

  if (providers.length === 0) {
    throw new Error('At least one provider is required');
  }

  // Pre-resolve UniversalClientConfigs for each provider entry
  const configs = new Map<string, UniversalClientConfig>();
  for (const entry of providers) {
    const cfg: UniversalClientConfig = { provider: entry.provider };
    if (entry.apiKey !== undefined) {
      cfg.apiKey = entry.apiKey;
    }
    if (entry.baseUrl !== undefined) {
      cfg.baseUrl = entry.baseUrl;
    }
    if (entry.timeoutMs !== undefined) {
      cfg.timeoutMs = entry.timeoutMs;
    }
    configs.set(entry.id, cfg);
  }

  /**
   * Find the best-matching provider entry for a given model string.
   */
  function findProvider(model?: string): { entry: RequestPathProvider; config: UniversalClientConfig } | undefined {
    const targetModel = model ?? defaultModel;

    // Exact match on model
    if (targetModel) {
      const exactMatch = providers.find(p => p.model === targetModel);
      if (exactMatch) {
        const config = configs.get(exactMatch.id);
        if (config) {
          return { entry: exactMatch, config };
        }
      }
    }

    // Fall back to first available provider
    const first = providers[0];
    if (!first) {
      return;
    }

    const config = configs.get(first.id);
    if (!config) {
      return;
    }

    return { entry: first, config };
  }

  function buildHandler(boundModel?: string): RequestHandler {
    return {
      complete(request: CompletionRequest): Promise<CompletionResponse> {
        const model = boundModel ?? request.model;
        const resolved = findProvider(model);

        if (!resolved) {
          throw new Error(`No provider found for model: ${model ?? '(none)'}`);
        }

        const client = createUniversalClient(resolved.config);
        return client.complete({
          ...request,
          model: resolved.entry.model ?? model ?? 'default'
        });
      },

      stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
        const model = boundModel ?? request.model;
        const resolved = findProvider(model);

        if (!resolved) {
          throw new Error(`No provider found for model: ${model ?? '(none)'}`);
        }

        const client = createUniversalClient(resolved.config);
        return client.stream({
          ...request,
          model: resolved.entry.model ?? model ?? 'default',
          stream: true
        });
      },

      withModel(model: string): RequestHandler {
        return buildHandler(model);
      }
    };
  }

  return buildHandler(defaultModel);
}
