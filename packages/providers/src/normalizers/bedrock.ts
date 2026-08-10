import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';

function mapBedrockStopReason(reason: string | undefined): FinishReason | undefined {
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
  if (reason === 'guardrail_intervened' || reason === 'content_filtered') {
    return 'content-filter';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Internal shape types (SDK-deserialized ConverseStream event union)
// ---------------------------------------------------------------------------

interface BedrockContentBlockDelta {
  contentBlockIndex?: number;
  delta?: {
    text?: string;
    toolUse?: { input?: string };
    reasoningContent?: { text?: string };
  };
}

interface BedrockContentBlockStart {
  contentBlockIndex?: number;
  start?: {
    toolUse?: { toolUseId?: string; name?: string };
  };
}

interface BedrockTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface BedrockConverseEvent {
  contentBlockDelta?: BedrockContentBlockDelta;
  contentBlockStart?: BedrockContentBlockStart;
  contentBlockStop?: unknown;
  messageStart?: unknown;
  messageStop?: { stopReason?: string };
  metadata?: { usage?: BedrockTokenUsage };
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

const BEDROCK_EVENT_KEYS = new Set([
  'contentBlockDelta',
  'contentBlockStart',
  'contentBlockStop',
  'messageStart',
  'messageStop',
  'metadata'
]);

function isBedrockConverseEvent(value: unknown): value is BedrockConverseEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.keys(value).some(k => BEDROCK_EVENT_KEYS.has(k));
}

// ---------------------------------------------------------------------------
// Helper handlers
// ---------------------------------------------------------------------------

function handleBedrockContentBlockDelta(raw: BedrockConverseEvent): NormalizerResult | null {
  const { contentBlockIndex = 0, delta } = raw.contentBlockDelta ?? {};

  if (typeof delta?.text === 'string') {
    return { chunk: { content: delta.text }, rawEvent: raw };
  }

  if (delta?.toolUse && typeof delta.toolUse.input === 'string') {
    const tc: NativeToolCallDelta = {
      argumentsDelta: delta.toolUse.input,
      index: contentBlockIndex
    };
    return { chunk: { nativeToolCallDeltas: [tc] }, rawEvent: raw };
  }

  if (delta?.reasoningContent && typeof delta.reasoningContent.text === 'string') {
    return { chunk: { thinking: delta.reasoningContent.text }, rawEvent: raw };
  }

  return null;
}

function handleBedrockContentBlockStart(raw: BedrockConverseEvent): NormalizerResult | null {
  const { contentBlockIndex = 0, start } = raw.contentBlockStart ?? {};
  const toolUse = start?.toolUse;
  if (!toolUse) {
    return null;
  }

  const tc: NativeToolCallDelta = { index: contentBlockIndex };
  if (typeof toolUse.toolUseId === 'string' && toolUse.toolUseId) {
    tc.id = toolUse.toolUseId;
  }
  if (typeof toolUse.name === 'string' && toolUse.name) {
    tc.name = toolUse.name;
  }
  return { chunk: { nativeToolCallDeltas: [tc] }, rawEvent: raw };
}

function handleBedrockMetadata(raw: BedrockConverseEvent): NormalizerResult | null {
  const { usage } = raw.metadata ?? {};
  if (!usage) {
    return null;
  }
  const usageInfo: UsageInfo = {};
  if (typeof usage.inputTokens === 'number') {
    usageInfo.inputTokens = usage.inputTokens;
  }
  if (typeof usage.outputTokens === 'number') {
    usageInfo.outputTokens = usage.outputTokens;
  }
  if (typeof usage.totalTokens === 'number') {
    usageInfo.totalTokens = usage.totalTokens;
  }
  return { chunk: { usage: usageInfo }, rawEvent: raw };
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes an AWS Bedrock Converse API streaming event (as returned by the
 * AWS SDK v3 `ConverseStreamCommand`) into a canonical `NormalizerResult`.
 *
 * Accepts SDK-deserialized tagged-union event objects where a single key
 * identifies the event type, e.g.:
 *   `{ contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Hi" } } }`
 *
 * Handled event types:
 * - `contentBlockDelta` (text) → `chunk.content`
 * - `contentBlockDelta` (toolUse.input) → `chunk.nativeToolCallDeltas` (argumentsDelta)
 * - `contentBlockDelta` (reasoningContent.text) → `chunk.thinking`
 * - `contentBlockStart` (toolUse) → `chunk.nativeToolCallDeltas` (id + name)
 * - `messageStop` → `chunk.done`
 * - `metadata` → usage (inputTokens, outputTokens, totalTokens)
 *
 * Returns `null` for `messageStart`, `contentBlockStop`, and unrecognizable
 * input.  Never throws.
 */
export function normalizeBedrockConverseEvent(raw: unknown): NormalizerResult | null {
  try {
    if (!isBedrockConverseEvent(raw)) {
      return null;
    }

    if (raw.contentBlockDelta) {
      return handleBedrockContentBlockDelta(raw);
    }
    if (raw.contentBlockStart) {
      return handleBedrockContentBlockStart(raw);
    }
    if (raw.messageStop) {
      const stopReason = typeof raw.messageStop.stopReason === 'string' ? raw.messageStop.stopReason : undefined;
      const finishReason = mapBedrockStopReason(stopReason);
      return {
        chunk: {
          done: true,
          ...(finishReason !== undefined && { finishReason })
        },
        rawEvent: raw
      };
    }
    if (raw.metadata) {
      return handleBedrockMetadata(raw);
    }

    // messageStart, contentBlockStop → no actionable content
    return null;
  } catch {
    return null;
  }
}
