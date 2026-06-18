/**
 * Unified client abstractions for provider integration.
 */

import { ReadableStream } from 'node:stream/web';

import type { CompletionRequest, CompletionResponse, NormalizedChunk, UsageInfo } from '@agentsy/shared';

import type { NormalizerProvider, PipelineEvent } from '../pipeline/index.js';
import { createPipeline } from '../pipeline/index.js';

/**
 * Configuration options for a UniversalClient instance.
 */
export interface UniversalClientConfig {
  /** API key for authentication */
  apiKey?: string;
  /** Base URL for provider API (defaults to provider-specific URL) */
  baseUrl?: string;
  /** Initial delay between retries in milliseconds */
  initialDelayMs?: number;
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Organization ID for OpenAI-compatible providers */
  organizationId?: string;
  /** Provider identifier (e.g., 'openai', 'anthropic', 'gemini') */
  provider: NormalizerProvider;
  /** Retry policy for network errors */
  retryPolicy?: 'exponential' | 'linear' | 'none';
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Provider endpoint URLs.
 */
const PROVIDER_ENDPOINTS: Record<NormalizerProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  bedrock: 'https://bedrock-runtime.amazonaws.com',
  cohere: 'https://api.cohere.com/v1/chat',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  'hugging-face': 'https://api-inference.huggingface.co/models',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  ollama: 'http://localhost:11434/api/chat',
  openai: 'https://api.openai.com/v1/chat/completions',
  zai: 'https://api.zai.com/v1/chat'
};

/**
 * Convert CompletionRequest to OpenAI-compatible format.
 */
function toOpenAIFormat(request: CompletionRequest): Record<string, unknown> {
  const req: Record<string, unknown> = {
    messages: request.messages.map(msg => ({
      content: Array.isArray(msg.content)
        ? msg.content.map(part => {
            if (part.type === 'text') {
              return part.text;
            }
            if (part.type === 'image') {
              return {
                image_url: {
                  detail: part.detail ?? 'auto',
                  url: part.imageUrl
                },
                type: 'image_url'
              };
            }
            if (part.type === 'tool_call') {
              return {
                tool_calls: [
                  {
                    function: {
                      arguments: JSON.stringify(part.input),
                      name: part.name
                    },
                    id: part.id,
                    type: 'function' as const
                  }
                ],
                type: 'tool_calls' as const
              };
            }
            if (part.type === 'tool_result') {
              return {
                content: part.content,
                tool_call_id: part.toolCallId,
                type: 'tool_result' as const
              };
            }
            return part;
          })
        : msg.content,
      role: msg.role,
      ...(msg.toolCallId && { tool_call_id: msg.toolCallId })
    })),
    model: request.model
  };

  if (request.temperature !== undefined) {
    req.temperature = request.temperature;
  }
  if (request.maxTokens !== undefined) {
    req.max_tokens = request.maxTokens;
  }
  if (request.topP !== undefined) {
    req.top_p = request.topP;
  }
  if (request.topK !== undefined) {
    req.top_k = request.topK;
  }
  if (request.stop) {
    req.stop = request.stop;
  }
  if (request.stream !== undefined) {
    req.stream = request.stream;
  }
  if (request.tools) {
    req.tools = request.tools;
  }

  return req;
}

/**
 * Convert CompletionRequest to Bedrock format.
 */
function toBedrockFormat(request: CompletionRequest): Record<string, unknown> {
  // Bedrock uses a different format
  return {
    maxTokens: request.maxTokens ?? 2048,
    messages: request.messages,
    modelId: request.model,
    temperature: request.temperature ?? 0.7
  };
}

/**
 * Convert CompletionRequest to HuggingFace text generation format.
 */
function toHuggingFaceFormat(request: CompletionRequest): Record<string, unknown> {
  return {
    inputs: request.messages,
    model: request.model,
    parameters: {
      do_sample: request.temperature !== undefined,
      max_new_tokens: request.maxTokens,
      temperature: request.temperature,
      top_k: request.topK,
      top_p: request.topP
    }
  };
}

/**
 * Convert CompletionRequest to provider-specific request format.
 */
function toProviderRequest(request: CompletionRequest, provider: NormalizerProvider): Record<string, unknown> {
  switch (provider) {
    case 'openai':
    case 'anthropic':
    case 'gemini':
    case 'mistral':
    case 'ollama':
    case 'cohere':
    case 'zai': {
      return toOpenAIFormat(request);
    }
    case 'bedrock': {
      return toBedrockFormat(request);
    }
    case 'hugging-face': {
      return toHuggingFaceFormat(request);
    }
    default: {
      return toOpenAIFormat(request);
    }
  }
}

/**
 * Context object passed to header builder functions.
 */
interface HeaderContext {
  apiKey: string;
  headers: Record<string, string>;
  organizationId?: string;
  stream?: boolean;
}

/**
 * Dispatch table for provider-specific header construction.
 * Each provider's handler sets its required headers on the context object.
 */
const HEADER_BUILDERS: Partial<Record<NormalizerProvider, (ctx: HeaderContext) => void>> & {
  default: (ctx: HeaderContext) => void;
} = {
  openai: ({ headers, apiKey, organizationId }) => {
    headers.Authorization = `Bearer ${apiKey}`;
    if (organizationId) {
      headers['OpenAI-Organization'] = organizationId;
    }
  },
  anthropic: ({ headers, apiKey, stream }) => {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    if (stream) {
      headers.accept = 'text/event-stream';
    }
  },
  gemini: ({ headers, apiKey }) => {
    headers.Authorization = `Bearer ${apiKey}`;
  },
  // Default handler for providers without special requirements
  default: ({ headers, apiKey }) => {
    headers.Authorization = `Bearer ${apiKey}`;
  }
};

function buildHeaders(
  provider: NormalizerProvider,
  apiKey?: string,
  organizationId?: string,
  stream?: boolean
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    const ctx: HeaderContext = { headers, apiKey };
    if (organizationId) {
      ctx.organizationId = organizationId;
    }
    if (stream) {
      ctx.stream = stream;
    }
    const builder = HEADER_BUILDERS[provider] ?? HEADER_BUILDERS.default;
    builder(ctx);
  }

  return headers;
}

function parseUsageInfo(usageData: Record<string, unknown>): UsageInfo | undefined {
  const usage: UsageInfo = {};
  if (typeof usageData.inputTokens === 'number') {
    usage.inputTokens = usageData.inputTokens;
  }
  if (typeof usageData.outputTokens === 'number') {
    usage.outputTokens = usageData.outputTokens;
  }
  if (typeof usageData.totalTokens === 'number') {
    usage.totalTokens = usageData.totalTokens;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function parseContentFromChoice(content: { content: string } | { content?: { parts?: { text?: string }[] } }): string {
  if (typeof content.content === 'string') {
    return content.content;
  }
  return content.content?.parts?.map(p => p.text).join('') ?? '';
}

function parseProviderResponse(response: unknown, _provider: NormalizerProvider): CompletionResponse {
  const data = response as Record<string, unknown>;

  if (!('choices' in data && Array.isArray(data.choices)) || data.choices.length === 0) {
    return {
      content: typeof data.content === 'string' ? data.content : JSON.stringify(data)
    };
  }

  const choice = data.choices[0] as Record<string, unknown>;
  const content = choice.message as { content: string } | { content?: { parts?: { text?: string }[] } };

  const usage: UsageInfo | undefined =
    data.usage && typeof data.usage === 'object' ? parseUsageInfo(data.usage as Record<string, unknown>) : undefined;

  const result: CompletionResponse = {
    content: parseContentFromChoice(content)
  };

  if (usage) {
    result.usage = usage;
  }

  if (data.model && typeof data.model === 'string') {
    result.model = data.model;
  }

  if (data.id && typeof data.id === 'string') {
    result.id = data.id;
  }

  return result;
}

/**
 * A unified client that automatically routes requests to the correct provider-specific adapter and normalizer.
 *
 * Designed to abstract away provider differences while providing full access to streaming capabilities.
 *
 * @example
 * ```typescript
 * const client = createUniversalClient({
 *   provider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 *
 * const response = await client.complete({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export interface UniversalClient {
  /**
   * Executes a non-streaming completion request and returns the complete response.
   *
   * @param request - The completion request with model, messages, tools, and other parameters
   * @returns A Promise that resolves to the completion response
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Executes a streaming completion request and returns a ReadableStream of normalized chunks.
   *
   * @param request - The completion request with model, messages, tools, and other parameters
   * @returns A Promise that resolves to a ReadableStream of NormalizedChunk objects
   */
  stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>>;
}

/**
 * Creates a UniversalClient instance configured for a specific provider.
 *
 * @param config - Configuration options including provider, apiKey, baseUrl, and retry settings
 * @returns A new UniversalClient instance
 */
export function createUniversalClient(config: UniversalClientConfig): UniversalClient {
  const { provider, apiKey, baseUrl } = config;
  const endpoint = baseUrl ?? PROVIDER_ENDPOINTS[provider];

  return {
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const providerRequest = toProviderRequest(request, provider);
      const response = await fetch(endpoint, {
        body: JSON.stringify(providerRequest),
        headers: buildHeaders(provider, apiKey, config.organizationId),
        method: 'POST',
        signal: config.timeoutMs ? AbortSignal.timeout(config.timeoutMs) : null
      });

      if (!response.ok) {
        throw new Error(`Provider request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return parseProviderResponse(data, provider);
    },

    async stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
      const providerRequest = toProviderRequest({ ...request, stream: true }, provider);
      const response = await fetch(endpoint, {
        body: JSON.stringify(providerRequest),
        headers: buildHeaders(provider, apiKey, config.organizationId, true),
        method: 'POST',
        signal: config.timeoutMs ? AbortSignal.timeout(config.timeoutMs) : null
      });

      if (!response.ok) {
        throw new Error(`Provider stream request failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Provider stream response did not include a body');
      }

      const pipeline = createPipeline(response.body.pipeThrough(new TextDecoderStream()), {
        maxJsonDepth: 64,
        maxJsonKeys: 10_000,
        provider
      });

      // True streaming: emit chunks as they arrive from the pipeline
      const stream = new ReadableStream<NormalizedChunk>({
        async start(controller) {
          await readPipelineToStream(pipeline, controller);
        }
      });

      return stream;
    }
  };
}

/**
 * Read events from the pipeline and enqueue normalized chunks into the
 * ReadableStream controller. Extracted from the inline start() closure
 * to keep cognitive complexity under the limit.
 *
 * Handles `delta`, `tool_call`, and `thinking` events. The `message_done`
 * event is silently consumed — it carries no data to enqueue, and the
 * stream controller closes naturally when the pipeline iterator completes.
 */
async function readPipelineToStream(
  pipeline: AsyncIterable<PipelineEvent>,
  controller: ReadableStreamDefaultController<NormalizedChunk>
): Promise<void> {
  try {
    for await (const event of pipeline) {
      if (event.type === 'delta' && event.content) {
        controller.enqueue({ content: event.content });
      } else if (event.type === 'tool_call' && event.tool_call) {
        controller.enqueue({
          tool_calls: [
            {
              function: {
                arguments: event.tool_call.parameters,
                name: event.tool_call.name
              }
            }
          ]
        });
      } else if (event.type === 'thinking' && event.thinking) {
        controller.enqueue({ thinking: event.thinking });
      }
    }
    controller.close();
  } catch (error) {
    controller.error(error);
  }
}
