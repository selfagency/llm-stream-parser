import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';

function mapOpenAIFinishReason(reason: string | null | undefined): FinishReason | undefined {
  if (!reason) {
    return;
  }
  if (reason === 'stop') {
    return 'stop';
  }
  if (reason === 'length') {
    return 'length';
  }
  if (reason === 'tool_calls' || reason === 'function_call') {
    return 'tool-calls';
  }
  if (reason === 'content_filter') {
    return 'content-filter';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Internal shape types (narrow enough for safe access without `any`)
// ---------------------------------------------------------------------------

interface OpenAIToolCallDelta {
  function?: { name?: string | null; arguments?: string | null };
  id?: string | null;
  index: number;
  type?: string;
}

interface OpenAIDelta {
  content?: string | null;
  reasoning?: string | null;
  reasoning_content?: string | null;
  role?: string;
  tool_calls?: OpenAIToolCallDelta[];
}

interface OpenAIChoice {
  delta: OpenAIDelta;
  finish_reason: string | null;
  index: number;
}

interface OpenAIUsage {
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
}

interface OpenAIChatChunk {
  choices: OpenAIChoice[];
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  usage?: OpenAIUsage | null;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isOpenAIChatChunk(value: unknown): value is OpenAIChatChunk {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  // Accept if object field matches, or if there's a choices array (permissive
  // for providers that use OpenAI-compatible formats without the object field).
  if (v.object !== undefined && v.object !== 'chat.completion.chunk') {
    return false;
  }
  if (!Array.isArray(v.choices)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapOpenAIToolCallDelta(tc: OpenAIToolCallDelta): NativeToolCallDelta {
  const result: NativeToolCallDelta = { index: tc.index };
  if (tc.id) {
    result.id = tc.id;
  }
  if (tc.function?.name) {
    result.name = tc.function.name;
  }
  if (typeof tc.function?.arguments === 'string' && tc.function.arguments !== '') {
    result.argumentsDelta = tc.function.arguments;
  }
  return result;
}

function getThinkingContent(
  reasoningField: string | null | undefined,
  reasoningContentField: string | null | undefined
): string | undefined {
  if (typeof reasoningField === 'string') {
    return reasoningField;
  }
  if (typeof reasoningContentField === 'string') {
    return reasoningContentField;
  }
}

function getContentParts(delta: OpenAIDelta | undefined): {
  content?: string;
  thinking?: string;
} {
  const content = typeof delta?.content === 'string' ? delta.content : undefined;
  // Some providers (Ollama / DeepSeek) put reasoning in a `reasoning` field
  // rather than OpenAI's `reasoning_content` field.  Map it to `thinking` so
  // the response appears in the streaming output.
  const reasoningField = delta?.reasoning;
  const reasoningContentField = delta?.reasoning_content;
  const thinking = getThinkingContent(reasoningField, reasoningContentField);
  const out: { content?: string; thinking?: string } = {};
  if (content !== undefined) {
    out.content = content;
  }
  if (thinking !== undefined) {
    out.thinking = thinking;
  }
  return out;
}

function getFinishReasonParts(choice: OpenAIChoice | undefined): {
  done?: true;
  finishReason?: FinishReason;
} {
  const finishReason = choice?.finish_reason;
  const mappedFinishReason = mapOpenAIFinishReason(finishReason);
  const out: { done?: true; finishReason?: FinishReason } = {};
  if (finishReason !== null && finishReason !== undefined) {
    out.done = true;
  }
  if (mappedFinishReason !== undefined) {
    out.finishReason = mappedFinishReason;
  }
  return out;
}

function getNativeToolCallDeltas(delta: OpenAIDelta | undefined): NativeToolCallDelta[] | undefined {
  const toolCalls = delta?.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return toolCalls
      .filter((tc): tc is OpenAIToolCallDelta => tc && typeof tc === 'object')
      .map(mapOpenAIToolCallDelta);
  }
}
function getUsageParts(raw: OpenAIChatChunk): { usage?: UsageInfo } {
  if (raw.usage) {
    const usage: UsageInfo = {};
    if (typeof raw.usage.prompt_tokens === 'number') {
      usage.inputTokens = raw.usage.prompt_tokens;
    }
    if (typeof raw.usage.completion_tokens === 'number') {
      usage.outputTokens = raw.usage.completion_tokens;
    }
    if (typeof raw.usage.total_tokens === 'number') {
      usage.totalTokens = raw.usage.total_tokens;
    }
    return { usage };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes an OpenAI Chat Completions streaming chunk into a canonical
 * `NormalizerResult`.  Returns `null` if the chunk is not recognizable as an
 * OpenAI Chat Completions chunk.
 *
 * Never throws — malformed or adversarial input is silently skipped.
 */
export function normalizeOpenAIChatChunk(raw: unknown): NormalizerResult | null {
  try {
    if (isOpenAIChatChunk(raw)) {
      const [choice] = raw.choices;
      const delta = choice?.delta;
      const nativeToolCallDeltas = getNativeToolCallDeltas(delta);

      const chunk: Record<string, unknown> = {
        ...getContentParts(delta),
        ...getFinishReasonParts(choice),
        ...getUsageParts(raw)
      };
      if (nativeToolCallDeltas !== undefined) {
        chunk.nativeToolCallDeltas = nativeToolCallDeltas;
      }

      return { chunk, rawEvent: raw };
    }

    return null;
  } catch {
    return null;
  }
}
