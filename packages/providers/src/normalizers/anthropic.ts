import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';
import { isObject, toNumber } from './utils.js';

function mapAnthropicStopReason(reason: string | null): FinishReason | undefined {
  if (!reason) {
    return;
  }
  if (reason === 'end_turn') {
    return 'stop';
  }
  if (reason === 'tool_use') {
    return 'tool-calls';
  }
  if (reason === 'max_tokens') {
    return 'length';
  }
  if (reason === 'stop_sequence') {
    return 'stop';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Normalizer for Anthropic Claude Messages API streaming events (SSE)
//
// Event types handled:
//   message_start               → usage.inputTokens (from message.usage.input_tokens)
//   content_block_start         → nativeToolCallDeltas (tool_use blocks only)
//   content_block_delta         → chunk.content (text_delta)
//                                  chunk.thinking (thinking_delta)
//                                  nativeToolCallDeltas (input_json_delta)
//   message_delta               → chunk.done (stop_reason), usage.outputTokens
//   message_stop                → chunk.done = true
//
//   content_block_stop, ping, and all other event types return null.
// ---------------------------------------------------------------------------

function handleMessageStart(raw: Record<string, unknown>): NormalizerResult | null {
  const { message } = raw;
  if (!isObject(message)) {
    return null;
  }
  const msgUsage = message.usage;
  if (!isObject(msgUsage)) {
    return null;
  }
  const inputTokens = toNumber(msgUsage.input_tokens);
  if (inputTokens === undefined) {
    return null;
  }
  const usage: UsageInfo = { inputTokens };
  return { chunk: { usage }, rawEvent: raw };
}

function handleContentBlockStart(raw: Record<string, unknown>): NormalizerResult | null {
  const contentBlock = raw.content_block;
  if (!isObject(contentBlock)) {
    return null;
  }
  if (contentBlock.type !== 'tool_use') {
    return null;
  }

  const index = toNumber(raw.index) ?? 0;
  const id = typeof contentBlock.id === 'string' ? contentBlock.id : undefined;
  const name = typeof contentBlock.name === 'string' ? contentBlock.name : undefined;

  const delta: NativeToolCallDelta = { index };
  if (id !== undefined) {
    delta.id = id;
  }
  if (name !== undefined) {
    delta.name = name;
  }

  return { chunk: { nativeToolCallDeltas: [delta] }, rawEvent: raw };
}

function handleContentBlockDelta(raw: Record<string, unknown>): NormalizerResult | null {
  const deltaObj = raw.delta;
  if (!isObject(deltaObj)) {
    return null;
  }
  const deltaType = deltaObj.type;
  const index = toNumber(raw.index) ?? 0;

  if (deltaType === 'text_delta') {
    const { text } = deltaObj;
    if (typeof text !== 'string') {
      return null;
    }
    return { chunk: { content: text }, rawEvent: raw };
  }

  if (deltaType === 'thinking_delta') {
    const { thinking } = deltaObj;
    if (typeof thinking !== 'string') {
      return null;
    }
    return { chunk: { thinking }, rawEvent: raw };
  }

  if (deltaType === 'input_json_delta') {
    const partialJson = deltaObj.partial_json;
    if (typeof partialJson !== 'string') {
      return null;
    }
    const tcDelta: NativeToolCallDelta = { argumentsDelta: partialJson, index };
    return { chunk: { nativeToolCallDeltas: [tcDelta] }, rawEvent: raw };
  }

  return null;
}

function handleMessageDelta(raw: Record<string, unknown>): NormalizerResult | null {
  const deltaObj = raw.delta;
  const stopReason = isObject(deltaObj) && typeof deltaObj.stop_reason === 'string' ? deltaObj.stop_reason : null;

  const done = stopReason === 'end_turn' || stopReason === 'tool_use' ? true : undefined;
  const finishReason = mapAnthropicStopReason(stopReason);

  const usageObj = raw.usage;
  let usage: UsageInfo | undefined;
  if (isObject(usageObj)) {
    const outputTokens = toNumber(usageObj.output_tokens);
    if (outputTokens !== undefined) {
      usage = { outputTokens };
    }
  }

  if (done === undefined && usage === undefined) {
    return null;
  }

  return {
    chunk: {
      ...(done !== undefined && { done }),
      ...(usage !== undefined && { usage }),
      ...(finishReason !== undefined && { finishReason })
    },
    rawEvent: raw
  };
}

/**
 * Normalizes a single Anthropic Claude SSE streaming event into a canonical
 * `NormalizerResult`.  Returns `null` for events that carry no useful
 * consumer-facing data (e.g. `content_block_stop`, `ping`).
 *
 * Never throws — malformed or adversarial input is silently ignored.
 */
export function normalizeAnthropicEvent(raw: unknown): NormalizerResult | null {
  try {
    if (!isObject(raw)) {
      return null;
    }
    const { type } = raw;
    if (typeof type !== 'string') {
      return null;
    }

    if (type === 'message_start') {
      return handleMessageStart(raw);
    }
    if (type === 'content_block_start') {
      return handleContentBlockStart(raw);
    }
    if (type === 'content_block_delta') {
      return handleContentBlockDelta(raw);
    }
    if (type === 'message_delta') {
      return handleMessageDelta(raw);
    }
    if (type === 'message_stop') {
      return { chunk: { done: true }, rawEvent: raw };
    }

    // content_block_stop, ping, error, etc.
    return null;
  } catch {
    return null;
  }
}
