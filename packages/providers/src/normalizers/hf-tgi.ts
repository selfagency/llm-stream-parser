import type { FinishReason } from '@agentsy/shared';

import type { NormalizerResult, UsageInfo } from './types.js';

function mapHFFinishReason(reason: string | undefined): FinishReason | undefined {
  if (!reason) {
    return;
  }
  if (reason === 'length') {
    return 'length';
  }
  if (reason === 'eos_token' || reason === 'stop_sequence') {
    return 'stop';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Internal shape types
// ---------------------------------------------------------------------------

interface HFToken {
  id?: number;
  logprob?: number;
  special?: boolean;
  text?: string;
}

interface HFDetails {
  finish_reason?: string;
  generated_tokens?: number;
  input_length?: number;
  seed?: number | null;
}

interface HFTGIStreamResponse {
  details?: HFDetails | null;
  generated_text?: string | null;
  index?: number;
  token?: HFToken;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isHFTGIStreamResponse(value: unknown): value is HFTGIStreamResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return v.token !== null && typeof v.token === 'object';
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

function buildHFUsage(details: HFDetails): UsageInfo | undefined {
  const u: UsageInfo = {};
  if (typeof details.input_length === 'number') {
    u.inputTokens = details.input_length;
  }
  if (typeof details.generated_tokens === 'number') {
    u.outputTokens = details.generated_tokens;
  }
  return u.inputTokens !== undefined || u.outputTokens !== undefined ? u : undefined;
}

/**
 * Normalizes a HuggingFace Text Generation Inference (TGI) streaming chunk
 * (from the `/generate_stream` SSE endpoint) into a canonical
 * `NormalizerResult`.
 *
 * - Non-special `token.text` → `chunk.content`
 * - Special tokens (EOS, pad, etc.) are skipped — no `chunk.content` emitted
 * - Final event with `details.finish_reason` → `chunk.done`, usage from
 *   `details.input_length` / `details.generated_tokens`
 *
 * Returns `null` for unrecognizable input and for special-only events with no
 * accompanying details.  Never throws.
 */
export function normalizeHuggingFaceTGIChunk(raw: unknown): NormalizerResult | null {
  try {
    if (!isHFTGIStreamResponse(raw)) {
      return null;
    }

    const { token } = raw;
    const details = raw.details ?? undefined;

    // Only emit text for non-special tokens
    const content = token?.special === true || typeof token?.text !== 'string' ? undefined : token.text;

    // Done when the final event arrives with details
    const done = typeof details?.finish_reason === 'string' ? true : undefined;
    const finishReason = mapHFFinishReason(details?.finish_reason);

    // Usage only present in the final event
    const usage = details ? buildHFUsage(details) : undefined;

    // Nothing actionable — e.g. a special token mid-stream with no details
    if (content === undefined && done === undefined && usage === undefined) {
      return null;
    }

    return {
      chunk: {
        ...(content !== undefined && { content }),
        ...(done !== undefined && { done }),
        ...(usage !== undefined && { usage }),
        ...(finishReason !== undefined && { finishReason })
      },
      rawEvent: raw
    };
  } catch {
    return null;
  }
}
