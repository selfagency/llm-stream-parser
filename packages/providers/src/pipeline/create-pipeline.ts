import type { ReadableStream } from 'node:stream/web';
import type { ProcessorOptions, StreamChunk } from '@agentsy/core/processor';
import { LLMStreamProcessor } from '@agentsy/core/processor';
import { parseSSEStream } from '@agentsy/core/sse';
import { parseJson } from '@agentsy/core/structured';
import type { JsonObject } from '@agentsy/shared';

import {
  normalizeAnthropicEvent,
  normalizeBedrockConverseEvent,
  normalizeCohereEvent,
  normalizeGeminiChunk,
  normalizeHuggingFaceTGIChunk,
  normalizeMistralChunk,
  normalizeOllamaChatChunk,
  normalizeOpenAIChatChunk,
  normalizeZAiChunk
} from '../normalizers/index.js';

export type NormalizerProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'bedrock'
  | 'mistral'
  | 'ollama'
  | 'cohere'
  | 'hugging-face'
  | 'zai';

export interface PipelineOptions extends ProcessorOptions {
  /** Maximum nesting depth for SSE JSON payloads (default: 64) */
  maxJsonDepth?: number;
  /** Maximum number of keys in SSE JSON payloads (default: 10000) */
  maxJsonKeys?: number;
  provider: NormalizerProvider;
}

export interface PipelineEvent {
  content?: string;
  message?: string;
  provider: NormalizerProvider;
  thinking?: string;
  tool_call?: { name: string; parameters: JsonObject };
  type: 'delta' | 'thinking' | 'tool_call' | 'message_done' | 'error';
}

type Normalizer = (data: unknown) => { chunk: StreamChunk; rawEvent?: unknown } | null;

const NORMALIZERS: Record<NormalizerProvider, Normalizer> = {
  anthropic: normalizeAnthropicEvent,
  bedrock: normalizeBedrockConverseEvent,
  cohere: normalizeCohereEvent,
  gemini: normalizeGeminiChunk,
  'hugging-face': normalizeHuggingFaceTGIChunk,
  mistral: normalizeMistralChunk,
  ollama: normalizeOllamaChatChunk,
  openai: normalizeOpenAIChatChunk,
  zai: normalizeZAiChunk
};

function* processSSEEvent(
  sseEvent: { data?: string },
  normalizer: Normalizer,
  processor: LLMStreamProcessor,
  provider: NormalizerProvider,
  jsonParseOptions: { maxJsonDepth?: number; maxJsonKeys?: number }
): Generator<PipelineEvent> {
  if (!sseEvent.data || sseEvent.data === '[DONE]') {
    return;
  }

  const parsed = parseJson(sseEvent.data, jsonParseOptions);
  if (parsed === null) {
    yield {
      message: `Failed to parse JSON from SSE data: ${sseEvent.data.slice(0, 50)}...`,
      provider,
      type: 'error'
    };
    return;
  }

  const normalized = normalizer(parsed);

  if (!normalized || typeof normalized !== 'object' || !('chunk' in normalized)) {
    return;
  }

  const { chunk } = normalized;
  const output = processor.process(chunk);

  if (output.thinking) {
    yield { provider, thinking: output.thinking, type: 'thinking' };
  }

  if (output.content) {
    yield { content: output.content, provider, type: 'delta' };
  }

  for (const toolCall of output.toolCalls) {
    yield {
      provider,
      tool_call: {
        name: toolCall.name,
        parameters: toolCall.parameters
      },
      type: 'tool_call'
    };
  }

  if (output.done) {
    yield { provider, type: 'message_done' };
  }
}

function buildProcessorOptions(options: PipelineOptions): ProcessorOptions {
  const processorOpts: ProcessorOptions = {
    scrubContextTags: options.scrubContextTags ?? false
  };

  if (options.parseThinkTags !== undefined) {
    processorOpts.parseThinkTags = options.parseThinkTags;
  }
  if (options.extraScrubTags !== undefined) {
    processorOpts.extraScrubTags = options.extraScrubTags;
  }
  if (options.knownTools !== undefined) {
    processorOpts.knownTools = options.knownTools;
  }
  if (options.modelId !== undefined) {
    processorOpts.modelId = options.modelId;
  }

  return processorOpts;
}

function buildJsonParseOptions(options: PipelineOptions): {
  maxJsonDepth?: number;
  maxJsonKeys?: number;
} {
  const jsonParseOpts: { maxJsonDepth?: number; maxJsonKeys?: number } = {};
  if (options.maxJsonDepth !== undefined) {
    jsonParseOpts.maxJsonDepth = options.maxJsonDepth;
  }
  if (options.maxJsonKeys !== undefined) {
    jsonParseOpts.maxJsonKeys = options.maxJsonKeys;
  }
  return jsonParseOpts;
}

export async function* createPipeline(
  source: AsyncIterable<string> | ReadableStream<string>,
  options: PipelineOptions
): AsyncGenerator<PipelineEvent> {
  const normalizer = NORMALIZERS[options.provider];
  if (!normalizer) {
    throw new Error(`Unknown provider: ${options.provider}`);
  }

  const processor = new LLMStreamProcessor(buildProcessorOptions(options));
  const jsonParseOptions = buildJsonParseOptions(options);

  try {
    for await (const sseEvent of parseSSEStream(source)) {
      try {
        for (const event of processSSEEvent(sseEvent, normalizer, processor, options.provider, jsonParseOptions)) {
          yield event;
        }
      } catch (_error) {
        yield {
          message: _error instanceof Error ? _error.message : String(_error),
          provider: options.provider,
          type: 'error'
        };
      }
    }
  } catch (_error) {
    yield {
      message: _error instanceof Error ? _error.message : String(_error),
      provider: options.provider,
      type: 'error'
    };
  }
}
