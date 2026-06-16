import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';
import { isObject, toNumber } from './utils.js';

// ---------------------------------------------------------------------------
// Normalizer for Ollama NDJSON streaming chunks
//
// Two endpoints supported:
//   /api/chat    → normalizeOllamaChatChunk    (message.content / message.tool_calls)
//   /api/generate → normalizeOllamaGenerateChunk (response field)
//
// Note: Ollama streams inline <think> tags inside message.content for models
// that support extended reasoning.  Callers should pipe content through
// ThinkingParser to extract thinking from content if needed.
//
// Usage metrics (prompt_eval_count / eval_count) are only present on the
// final chunk (done: true).
// ---------------------------------------------------------------------------

function extractUsage(raw: Record<string, unknown>): UsageInfo | undefined {
  const inputTokens = toNumber(raw.prompt_eval_count);
  const outputTokens = toNumber(raw.eval_count);
  if (inputTokens === undefined && outputTokens === undefined) {
    return;
  }
  const usage: UsageInfo = {};
  if (inputTokens !== undefined) {
    usage.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    usage.outputTokens = outputTokens;
  }
  return usage;
}

/**
 * Normalizes an Ollama `/api/chat` streaming chunk into a canonical
 * `NormalizerResult`.  Returns `null` if the chunk has no `message` field
 * (use `normalizeOllamaGenerateChunk` for `/api/generate` chunks).
 *
 * Never throws — malformed or adversarial input is silently ignored.
 */
export function normalizeOllamaChatChunk(raw: unknown): NormalizerResult | null {
  try {
    if (!isObject(raw)) {
      return null;
    }
    if (!isObject(raw.message)) {
      return null;
    }

    const { message } = raw;
    const content = typeof message.content === 'string' ? message.content : undefined;
    const done = raw.done === true ? true : undefined;
    const usage = done === undefined ? undefined : extractUsage(raw);
    const finishReason: FinishReason | undefined = done === undefined ? undefined : 'stop';

    // Tool calls — Ollama delivers them as a single complete array (not
    // streamed as argument deltas).  Arguments is a parsed object; we
    // serialize to string to fit NativeToolCallDelta.argumentsDelta.
    let nativeToolCallDeltas: NativeToolCallDelta[] | undefined;
    if (Array.isArray(message.tool_calls)) {
      const mapped = (message.tool_calls as unknown[]).flatMap((tc, i) => {
        if (!isObject(tc)) {
          return [];
        }
        const fn = tc.function;
        if (!isObject(fn)) {
          return [];
        }
        const name = typeof fn.name === 'string' ? fn.name : undefined;
        const args = fn.arguments;
        const delta: NativeToolCallDelta = { index: i };
        if (name !== undefined) {
          delta.name = name;
        }
        if (args !== undefined) {
          delta.argumentsDelta = JSON.stringify(args);
        }
        return [delta];
      });
      if (mapped.length > 0) {
        nativeToolCallDeltas = mapped;
      }
    }

    const chunk = {
      ...(content !== undefined && { content }),
      ...(done !== undefined && { done }),
      ...(nativeToolCallDeltas !== undefined && { nativeToolCallDeltas }),
      ...(usage !== undefined && { usage }),
      ...(finishReason !== undefined && { finishReason })
    };

    return { chunk, rawEvent: raw };
  } catch {
    return null;
  }
}

/**
 * Normalizes an Ollama `/api/generate` streaming chunk into a canonical
 * `NormalizerResult`.  Returns `null` if the chunk has no string `response`
 * field (use `normalizeOllamaChatChunk` for `/api/chat` chunks).
 *
 * Never throws — malformed or adversarial input is silently ignored.
 */
export function normalizeOllamaGenerateChunk(raw: unknown): NormalizerResult | null {
  try {
    if (!isObject(raw)) {
      return null;
    }
    if (typeof raw.response !== 'string') {
      return null;
    }

    const content = raw.response;
    const done = raw.done === true ? true : undefined;
    const usage = done === undefined ? undefined : extractUsage(raw);
    const finishReason: FinishReason | undefined = done === undefined ? undefined : 'stop';

    const chunk = {
      content,
      ...(done !== undefined && { done }),
      ...(usage !== undefined && { usage }),
      ...(finishReason !== undefined && { finishReason })
    };

    return { chunk, rawEvent: raw };
  } catch {
    return null;
  }
}
