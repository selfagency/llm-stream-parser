import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';

function mapCohereFinishReason(reason: string | undefined): FinishReason | undefined {
  if (!reason) {
    return;
  }
  if (reason === 'COMPLETE' || reason === 'STOP_SEQUENCE') {
    return 'stop';
  }
  if (reason === 'MAX_TOKENS') {
    return 'length';
  }
  if (reason === 'TOOL_CALL') {
    return 'tool-calls';
  }
  if (reason === 'ERROR' || reason === 'ERROR_LIMIT') {
    return 'error';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Internal shape types
// ---------------------------------------------------------------------------

interface CohereDeltaMessage {
  content?: { text?: string };
  tool_calls?: {
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  };
  tool_plan?: string;
}

interface CohereDelta {
  finish_reason?: string;
  message?: CohereDeltaMessage;
  usage?: {
    billed_units?: { input_tokens?: number; output_tokens?: number };
    tokens?: { input_tokens?: number; output_tokens?: number };
  };
}

interface CohereEvent {
  delta?: CohereDelta;
  index?: number;
  type: string;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isCohereEvent(value: unknown): value is CohereEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.type === 'string';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCohereUsage(delta: CohereDelta | undefined): UsageInfo | undefined {
  const tokens = delta?.usage?.tokens;
  if (!tokens) {
    return;
  }
  const usage: UsageInfo = {};
  if (typeof tokens.input_tokens === 'number') {
    usage.inputTokens = tokens.input_tokens;
  }
  if (typeof tokens.output_tokens === 'number') {
    usage.outputTokens = tokens.output_tokens;
  }
  return usage;
}

function normalizeCohereContentDelta(raw: unknown, delta: CohereDelta | undefined): NormalizerResult | null {
  const text = delta?.message?.content?.text;
  if (typeof text !== 'string') {
    return null;
  }
  return { chunk: { content: text }, rawEvent: raw };
}

function normalizeCohereToolPlanDelta(raw: unknown, delta: CohereDelta | undefined): NormalizerResult | null {
  const toolPlan = delta?.message?.tool_plan;
  if (typeof toolPlan !== 'string') {
    return null;
  }
  return { chunk: { thinking: toolPlan }, rawEvent: raw };
}

function normalizeCohereToolCallStart(
  raw: unknown,
  delta: CohereDelta | undefined,
  index: number
): NormalizerResult | null {
  const tc = delta?.message?.tool_calls;
  if (!tc || typeof tc !== 'object') {
    return null;
  }
  const normalizedDelta: NativeToolCallDelta = { index };
  if (typeof tc.id === 'string' && tc.id) {
    normalizedDelta.id = tc.id;
  }
  if (typeof tc.function?.name === 'string' && tc.function.name) {
    normalizedDelta.name = tc.function.name;
  }
  return { chunk: { nativeToolCallDeltas: [normalizedDelta] }, rawEvent: raw };
}

function normalizeCohereToolCallDelta(
  raw: unknown,
  delta: CohereDelta | undefined,
  index: number
): NormalizerResult | null {
  const args = delta?.message?.tool_calls?.function?.arguments;
  if (typeof args !== 'string' || args === '') {
    return null;
  }
  const normalizedDelta: NativeToolCallDelta = { argumentsDelta: args, index };
  return { chunk: { nativeToolCallDeltas: [normalizedDelta] }, rawEvent: raw };
}

function normalizeCohereMessageEnd(raw: unknown, delta: CohereDelta | undefined): NormalizerResult {
  const finishReasonStr = typeof delta?.finish_reason === 'string' ? delta.finish_reason : undefined;
  const done = finishReasonStr === undefined ? undefined : true;
  const finishReason = mapCohereFinishReason(finishReasonStr);
  const usage = buildCohereUsage(delta);
  return {
    chunk: {
      ...(done !== undefined && { done }),
      ...(usage !== undefined && { usage }),
      ...(finishReason !== undefined && { finishReason })
    },
    rawEvent: raw
  };
}

function normalizeCohereByType(raw: unknown, event: CohereEvent): NormalizerResult | null {
  const { type, index = 0, delta } = event;

  if (type === 'content-delta') {
    return normalizeCohereContentDelta(raw, delta);
  }
  if (type === 'tool-plan-delta') {
    return normalizeCohereToolPlanDelta(raw, delta);
  }
  if (type === 'tool-call-start') {
    return normalizeCohereToolCallStart(raw, delta, index);
  }
  if (type === 'tool-call-delta') {
    return normalizeCohereToolCallDelta(raw, delta, index);
  }
  if (type === 'message-end') {
    return normalizeCohereMessageEnd(raw, delta);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes a Cohere v2 Chat streaming event into a canonical
 * `NormalizerResult`.
 *
 * Handled event types:
 * - `content-delta` → `chunk.content`
 * - `tool-plan-delta` → `chunk.thinking` (pre-tool reasoning)
 * - `tool-call-start` → `chunk.nativeToolCallDeltas` (id + name)
 * - `tool-call-delta` → `chunk.nativeToolCallDeltas` (argumentsDelta)
 * - `message-end` → `chunk.done`, usage from `delta.usage.tokens`
 *
 * Returns `null` for informational events (`message-start`, `content-start`,
 * `content-end`, `citation-start`, etc.) and unrecognizable input.
 * Never throws.
 */
export function normalizeCohereEvent(raw: unknown): NormalizerResult | null {
  try {
    if (!isCohereEvent(raw)) {
      return null;
    }
    return normalizeCohereByType(raw, raw);
  } catch {
    return null;
  }
}
