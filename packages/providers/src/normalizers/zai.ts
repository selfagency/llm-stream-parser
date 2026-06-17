import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';

const ZAI_FINISH_REASON_MAP: Record<string, FinishReason> = {
  length: 'length',
  model_context_window_exceeded: 'error',
  network_error: 'error',
  sensitive: 'content-filter',
  stop: 'stop',
  tool_calls: 'tool-calls'
};

function mapZAiFinishReason(reason: string | null | undefined): FinishReason | undefined {
  if (!reason) {
    return;
  }
  return ZAI_FINISH_REASON_MAP[reason] ?? 'other';
}

interface ZAiToolCallDelta {
  function?: { name?: string | null; arguments?: string | null };
  id?: string | null;
  index: number;
}

interface ZAiChoice {
  delta?: {
    content?: string | null;
    reasoning_content?: string | null;
    tool_calls?: ZAiToolCallDelta[];
  };
  finish_reason?: string | null;
  index?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function nonEmptyString(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mapToolCallDelta(delta: ZAiToolCallDelta): NativeToolCallDelta {
  const mapped: NativeToolCallDelta = {
    index: delta.index
  };

  const id = nonEmptyString(delta.id);
  if (id !== undefined) {
    mapped.id = id;
  }

  const name = nonEmptyString(delta.function?.name);
  if (name !== undefined) {
    mapped.name = name;
  }

  const argumentsDelta = nonEmptyString(delta.function?.arguments);
  if (argumentsDelta !== undefined) {
    mapped.argumentsDelta = argumentsDelta;
  }

  return mapped;
}

function isZAiToolCallDelta(value: unknown): value is ZAiToolCallDelta {
  return isRecord(value) && typeof value.index === 'number';
}

function extractNativeToolCallDeltas(delta: ZAiChoice['delta']): NativeToolCallDelta[] | undefined {
  if (!Array.isArray(delta?.tool_calls) || delta.tool_calls.length === 0) {
    return;
  }

  const mapped = delta.tool_calls.filter(isZAiToolCallDelta).map(mapToolCallDelta);
  return mapped.length > 0 ? mapped : undefined;
}

function buildChunkFromParts(parts: {
  content?: string;
  thinking?: string;
  nativeToolCallDeltas?: NativeToolCallDelta[];
  done?: boolean;
  finishReason?: FinishReason;
  usage?: UsageInfo;
}): NormalizerResult['chunk'] {
  const chunk: NormalizerResult['chunk'] = {};
  if (parts.content !== undefined) {
    chunk.content = parts.content;
  }
  if (parts.thinking !== undefined) {
    chunk.thinking = parts.thinking;
  }
  if (parts.nativeToolCallDeltas !== undefined) {
    chunk.nativeToolCallDeltas = parts.nativeToolCallDeltas;
  }
  if (parts.done !== undefined) {
    chunk.done = parts.done;
  }
  if (parts.finishReason !== undefined) {
    chunk.finishReason = parts.finishReason;
  }
  if (parts.usage !== undefined) {
    chunk.usage = parts.usage;
  }
  return chunk;
}

function normalizeUsage(raw: unknown): UsageInfo | undefined {
  if (!isRecord(raw)) {
    return;
  }

  const usage: UsageInfo = {};

  if (typeof raw.prompt_tokens === 'number') {
    usage.inputTokens = raw.prompt_tokens;
  }
  if (typeof raw.completion_tokens === 'number') {
    usage.outputTokens = raw.completion_tokens;
  }
  if (typeof raw.total_tokens === 'number') {
    usage.totalTokens = raw.total_tokens;
  }

  if (typeof raw.input_tokens === 'number') {
    usage.inputTokens = raw.input_tokens;
  }
  if (typeof raw.output_tokens === 'number') {
    usage.outputTokens = raw.output_tokens;
  }

  if (
    typeof usage.inputTokens === 'number' &&
    typeof usage.outputTokens === 'number' &&
    usage.totalTokens === undefined
  ) {
    usage.totalTokens = usage.inputTokens + usage.outputTokens;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
}

/**
 * Normalizes a Z.ai streaming chunk into canonical `NormalizerResult`.
 *
 * Handles OpenAI-compatible chunk envelopes while centralizing Z.ai-specific
 * finish-reason mapping and tolerant usage extraction.
 */
// fallow-ignore-next-line complexity
export function normalizeZAiChunk(raw: unknown): NormalizerResult | null {
  try {
    if (!isRecord(raw)) {
      return null;
    }
    const choicesUnknown = raw.choices;
    if (!Array.isArray(choicesUnknown) || choicesUnknown.length === 0) {
      return null;
    }

    const choice = choicesUnknown[0] as ZAiChoice;
    const delta = isRecord(choice.delta) ? choice.delta : undefined;

    const content = typeof delta?.content === 'string' ? delta.content : undefined;
    const thinking = typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : undefined;

    const nativeToolCallDeltas = extractNativeToolCallDeltas(delta);

    const mappedFinishReason = mapZAiFinishReason(choice.finish_reason ?? null);
    const done = choice.finish_reason == null ? undefined : true;
    const usage = normalizeUsage(raw.usage);

    const chunk = buildChunkFromParts({
      ...(content === undefined ? {} : { content }),
      ...(thinking === undefined ? {} : { thinking }),
      ...(nativeToolCallDeltas === undefined ? {} : { nativeToolCallDeltas }),
      ...(done === undefined ? {} : { done }),
      ...(mappedFinishReason === undefined ? {} : { finishReason: mappedFinishReason }),
      ...(usage === undefined ? {} : { usage })
    });

    if (Object.keys(chunk).length === 0) {
      return null;
    }
    return { chunk, rawEvent: raw };
  } catch {
    return null;
  }
}
