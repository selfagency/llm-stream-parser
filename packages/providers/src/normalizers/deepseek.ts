import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';

const DEEPSEEK_FINISH_REASON_MAP: Record<string, FinishReason> = {
  content_filter: 'content-filter',
  insufficient_balance: 'error',
  length: 'length',
  stop: 'stop',
  tool_calls: 'tool-calls'
};

interface DeepSeekToolCallDeltaRaw {
  function?: {
    name?: string;
    arguments?: string;
  };
  id?: string;
  index: number;
}

function mapDeepSeekFinishReason(reason: string | null | undefined): FinishReason | undefined {
  if (!reason) {
    return;
  }
  return DEEPSEEK_FINISH_REASON_MAP[reason] ?? 'other';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isDeepSeekToolCallDeltaRaw(value: unknown): value is DeepSeekToolCallDeltaRaw {
  return isRecord(value) && typeof value.index === 'number';
}

function toNativeToolCallDelta(raw: DeepSeekToolCallDeltaRaw): NativeToolCallDelta {
  return {
    index: raw.index,
    ...(raw.id ? { id: raw.id } : {}),
    ...(raw.function?.name ? { name: raw.function.name } : {}),
    ...(raw.function?.arguments ? { argumentsDelta: raw.function.arguments } : {})
  };
}

function normalizeUsage(raw: unknown): UsageInfo | undefined {
  if (raw === null || typeof raw !== 'object') {
    return;
  }
  const usage = raw as Record<string, unknown>;

  const out: UsageInfo = {};
  if (typeof usage.prompt_tokens === 'number') {
    out.inputTokens = usage.prompt_tokens;
  }
  if (typeof usage.completion_tokens === 'number') {
    out.outputTokens = usage.completion_tokens;
  }
  if (typeof usage.total_tokens === 'number') {
    out.totalTokens = usage.total_tokens;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Normalizes a DeepSeek streaming chunk.
 * Compatible with DeepSeek-V3 and DeepSeek-R1 (using reasoning_content).
 */
export function normalizeDeepSeekChunk(raw: unknown): NormalizerResult | null {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const data = raw as Record<string, unknown>;

  const { choices } = data;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  // Guard against null entries in choices array
  const rawChoice = choices[0];
  if (rawChoice === null || typeof rawChoice !== 'object') {
    return null;
  }
  const choice = rawChoice as Record<string, unknown>;
  const rawDelta = choice.delta;
  const delta = (rawDelta === null || typeof rawDelta !== 'object' ? {} : rawDelta) as Record<string, unknown>;

  const content = typeof delta.content === 'string' ? delta.content : undefined;
  const thinking = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : undefined;

  let nativeToolCallDeltas: NativeToolCallDelta[] | undefined;
  if (Array.isArray(delta.tool_calls)) {
    nativeToolCallDeltas = delta.tool_calls.filter(isDeepSeekToolCallDeltaRaw).map(toNativeToolCallDelta);
  }

  const finishReason = mapDeepSeekFinishReason(choice.finish_reason as string);
  const usage = normalizeUsage(data.usage);

  return {
    chunk: {
      content,
      done: finishReason !== undefined,
      finishReason,
      nativeToolCallDeltas,
      thinking,
      usage
    },
    rawEvent: raw
  };
}
