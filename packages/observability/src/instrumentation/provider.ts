/**
 * Provider call instrumentation.
 *
 * Wraps LLM provider calls with OpenTelemetry spans that capture latency,
 * token counts, model names, and estimated cost.
 *
 * This is designed to wrap the `UniversalClient.complete()` and
 * `UniversalClient.stream()` methods so every provider invocation is
 * automatically traced.
 *
 * @example
 * ```ts
 * import { instrumentProviderClient } from '@agentsy/observability/instrumentation';
 *
 * const client = instrumentProviderClient(tracer, universalClient, {
 *   providerName: 'openai',
 *   modelName: 'gpt-4o'
 * });
 *
 * // All calls are now traced
 * const response = await client.complete(request);
 * ```
 */

import type { CompletionRequest, CompletionResponse, NormalizedChunk } from '@agentsy/shared';

import type { Span, Tracer } from '../core/types.js';

/**
 * Semantic attribute keys for provider call instrumentation.
 * Follows GenAI OTel semantic conventions.
 */
export const ProviderSpanAttributes = {
  /** GenAI attribute indicating which LLM provider handled the request */
  GENAI_REQUEST_MODEL: 'gen_ai.request.model',
  /** GenAI attribute for the provider name */
  GENAI_RESPONSE_ID: 'gen_ai.response.id',
  /** GenAI attribute for the finish reason */
  GENAI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  /** GenAI attribute for output tokens */
  GENAI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  /** Custom attribute: provider name */
  PROVIDER_NAME: 'gen_ai.request.provider',
  /** Custom attribute: estimated cost in USD */
  PROVIDER_COST_USD: 'gen_ai.usage.cost_usd',
  /** Custom attribute: total latency in milliseconds */
  PROVIDER_LATENCY_MS: 'gen_ai.request.latency_ms',
  /** Custom attribute: streaming vs non-streaming */
  PROVIDER_STREAMING: 'gen_ai.request.streaming',
  /** Custom attribute: client operation type */
  OPERATION_TYPE: 'llm.operation.type'
} as const;

/**
 * Rough per-token cost estimates for common models.
 * Used for cost attribution when the provider doesn't return cost data.
 * Values are in USD per 1M tokens.
 */
const MODEL_COST_ESTIMATES = new Map<string, { input: number; output: number }>([
  ['gpt-4o', { input: 2.5, output: 10 }],
  ['gpt-4o-mini', { input: 0.15, output: 0.6 }],
  ['gpt-4-turbo', { input: 10, output: 30 }],
  ['claude-opus-4', { input: 15, output: 75 }],
  ['claude-sonnet-4', { input: 3, output: 15 }],
  ['claude-haiku-3', { input: 0.25, output: 1.25 }],
  ['gemini-2.0-flash', { input: 0.1, output: 0.4 }],
  ['gemini-2.5-pro', { input: 1.25, output: 5 }],
  ['mistral-large', { input: 2, output: 6 }],
  ['deepseek-chat', { input: 0.14, output: 0.28 }]
]);

function estimateCost(model: string, inputTokens: number, outputTokens: number): number | undefined {
  // Try exact match, then prefix match
  let rates = MODEL_COST_ESTIMATES.get(model);
  if (!rates) {
    const prefix = [...MODEL_COST_ESTIMATES.keys()].find(k => model.startsWith(k));
    if (prefix) {
      rates = MODEL_COST_ESTIMATES.get(prefix);
    }
  }
  if (!rates) {
    return;
  }

  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

/**
 * Sets token usage and cost attributes on a span.
 */
// fallow-ignore-next-line complexity
function setSpanUsageAttributes(
  span: Span,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  model: string
): void {
  if (!usage) {
    return;
  }

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  span.setAttribute(ProviderSpanAttributes.GENAI_USAGE_INPUT_TOKENS, inputTokens);
  span.setAttribute(ProviderSpanAttributes.GENAI_USAGE_OUTPUT_TOKENS, outputTokens);

  const cost = estimateCost(model, inputTokens, outputTokens);
  if (cost !== undefined) {
    span.setAttribute(ProviderSpanAttributes.PROVIDER_COST_USD, cost);
  }
}

/**
 * Sets completion-specific attributes on a span after a request completes.
 */
function setCompletionSpanAttributes(
  span: Span,
  response: CompletionResponse,
  request: CompletionRequest,
  options: InstrumentProviderOptions,
  latencyMs: number
): void {
  span.setAttribute(ProviderSpanAttributes.PROVIDER_LATENCY_MS, latencyMs);

  setSpanUsageAttributes(span, response.usage, request.model ?? options.modelName ?? '');

  if (response.id) {
    span.setAttribute(ProviderSpanAttributes.GENAI_RESPONSE_ID, response.id);
  }
}

/**
 * Sets token usage and cost attributes on a stream span, then ends it.
 */
function finalizeStreamSpan(span: Span, inputTokens: number, outputTokens: number, model: string): void {
  if (inputTokens > 0 || outputTokens > 0) {
    span.setAttribute(ProviderSpanAttributes.GENAI_USAGE_INPUT_TOKENS, inputTokens);
    span.setAttribute(ProviderSpanAttributes.GENAI_USAGE_OUTPUT_TOKENS, outputTokens);

    const cost = estimateCost(model, inputTokens, outputTokens);
    if (cost !== undefined) {
      span.setAttribute(ProviderSpanAttributes.PROVIDER_COST_USD, cost);
    }
  }
  span.end();
}

/**
 * Processes a streaming response, forwarding chunks and tracking token usage.
 */
// fallow-ignore-next-line complexity
async function processStreamContent(
  span: Span,
  sourceStream: ReadableStream<NormalizedChunk>,
  controller: ReadableStreamDefaultController<NormalizedChunk>,
  request: CompletionRequest,
  options: InstrumentProviderOptions
): Promise<void> {
  const reader = sourceStream.getReader();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value.usage) {
        inputTokens = value.usage.inputTokens ?? inputTokens;
        outputTokens = value.usage.outputTokens ?? outputTokens;
      }

      controller.enqueue(value);
    }
  } catch (err) {
    span.recordException(err);
    throw err;
  } finally {
    finalizeStreamSpan(span, inputTokens, outputTokens, request.model ?? options.modelName ?? '');
    reader.releaseLock();
    controller.close();
  }
}

/** Options for {@link instrumentProviderClient}. */
export interface InstrumentProviderOptions {
  /** Default model name attached to all spans. */
  modelName?: string;
  /** Human-readable provider name (e.g. 'openai', 'anthropic'). */
  providerName: string;
}

/**
 * Wraps a `UniversalClient`-shaped object so every `complete()` and `stream()`
 * call is traced with provider metadata, latency, token usage, and estimated cost.
 *
 * The returned object has the same shape as the input client, making it a
 * transparent instrumentation layer.
 */
export function instrumentProviderClient<
  T extends {
    complete: (request: CompletionRequest) => Promise<CompletionResponse>;
    stream: (request: CompletionRequest) => Promise<ReadableStream<NormalizedChunk>>;
  }
>(tracer: Tracer, client: T, options: InstrumentProviderOptions): T {
  const { providerName } = options;

  const instrumented: T = {
    ...client,

    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const span = tracer.startSpan(`llm.complete.${providerName}`, {
        attributes: {
          [ProviderSpanAttributes.GENAI_REQUEST_MODEL]: request.model ?? options.modelName ?? 'unknown',
          [ProviderSpanAttributes.PROVIDER_NAME]: providerName,
          [ProviderSpanAttributes.OPERATION_TYPE]: 'complete',
          [ProviderSpanAttributes.PROVIDER_STREAMING]: !!request.stream
        }
      });

      const startTime = Date.now();

      try {
        const response = await client.complete(request);
        const latencyMs = Date.now() - startTime;

        setCompletionSpanAttributes(span, response, request, options, latencyMs);

        span.end();
        return response;
      } catch (err) {
        span.recordException(err);
        span.end();
        throw err;
      }
    },

    async stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
      const span = tracer.startSpan(`llm.stream.${providerName}`, {
        attributes: {
          [ProviderSpanAttributes.GENAI_REQUEST_MODEL]: request.model ?? options.modelName ?? 'unknown',
          [ProviderSpanAttributes.PROVIDER_NAME]: providerName,
          [ProviderSpanAttributes.OPERATION_TYPE]: 'stream',
          [ProviderSpanAttributes.PROVIDER_STREAMING]: true
        }
      });

      const startTime = Date.now();

      try {
        const stream = await client.stream(request);
        const latencyMs = Date.now() - startTime;
        span.setAttribute(ProviderSpanAttributes.PROVIDER_LATENCY_MS, latencyMs);

        const wrappedStream = new ReadableStream<NormalizedChunk>({
          start(controller) {
            return processStreamContent(span, stream, controller, request, options);
          }
        });

        return wrappedStream;
      } catch (err) {
        span.recordException(err);
        span.end();
        throw err;
      }
    }
  };

  return instrumented;
}
