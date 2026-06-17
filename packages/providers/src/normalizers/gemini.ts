import type { FinishReason } from '@agentsy/shared';

import type { NativeToolCallDelta, NormalizerResult, UsageInfo } from './types.js';
import { isObject, toNumber } from './utils.js';

function mapGeminiFinishReason(reason: string | null): FinishReason | undefined {
  if (!reason) {
    return;
  }
  if (reason === 'STOP') {
    return 'stop';
  }
  if (reason === 'MAX_TOKENS') {
    return 'length';
  }
  if (reason === 'SAFETY' || reason === 'RECITATION' || reason === 'PROHIBITED_CONTENT' || reason === 'SPII') {
    return 'content-filter';
  }
  if (reason === 'MALFORMED_FUNCTION_CALL') {
    return 'other';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Normalizer for Google Gemini generateContent streaming chunks
//
// Handles the REST streaming response format (application/x-ndjson or SSE).
// Each chunk is a generateContentResponse JSON object.
//
// Part types handled within candidates[0].content.parts:
//   { text: string }                       → chunk.content (concatenated)
//   { thought: true, text: string }        → chunk.thinking (concatenated, Gemini 2.0+)
//   { functionCall: { name, args } }       → nativeToolCallDeltas
//
// finishReason STOP / MAX_TOKENS / SAFETY / RECITATION / OTHER → done: true
// usageMetadata → usage
// ---------------------------------------------------------------------------

const FINISH_REASONS_DONE = new Set(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GeminiPartsResult {
  nativeToolCallList: NativeToolCallDelta[];
  textContent: string | undefined;
  thinking: string | undefined;
}

// #lizard forgives
function buildFunctionCallDelta(fc: Record<string, unknown>, index: number): NativeToolCallDelta {
  const delta: NativeToolCallDelta = { index };
  const name = typeof fc.name === 'string' ? fc.name : undefined;
  const { args } = fc;
  if (name !== undefined) {
    delta.name = name;
  }
  if (args !== undefined) {
    delta.argumentsDelta = JSON.stringify(args);
  }
  return delta;
}

function processGeminiParts(parts: unknown[]): GeminiPartsResult {
  let textContent: string | undefined;
  let thinking: string | undefined;
  const nativeToolCallList: NativeToolCallDelta[] = [];
  let toolCallIndex = 0;

  for (const part of parts) {
    if (!isObject(part)) {
      continue;
    }

    if (part.thought === true && typeof part.text === 'string') {
      thinking = (thinking ?? '') + part.text;
      continue;
    }

    if (typeof part.text === 'string') {
      textContent = (textContent ?? '') + part.text;
      continue;
    }

    const fc = part.functionCall;
    if (isObject(fc)) {
      nativeToolCallList.push(buildFunctionCallDelta(fc, toolCallIndex++));
    }
  }

  return { nativeToolCallList, textContent, thinking };
}

function extractGeminiUsage(raw: Record<string, unknown>): UsageInfo | undefined {
  const { usageMetadata } = raw;
  if (!isObject(usageMetadata)) {
    return;
  }
  const usage: UsageInfo = {};
  const input = toNumber(usageMetadata.promptTokenCount);
  const output = toNumber(usageMetadata.candidatesTokenCount);
  const total = toNumber(usageMetadata.totalTokenCount);
  if (input !== undefined) {
    usage.inputTokens = input;
  }
  if (output !== undefined) {
    usage.outputTokens = output;
  }
  if (total !== undefined) {
    usage.totalTokens = total;
  }
  return usage;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

function validateGeminiInput(raw: unknown): boolean {
  if (!isObject(raw)) {
    return false;
  }
  if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) {
    return false;
  }
  return true;
}

function getFirstCandidate(
  raw: unknown
): { content?: { parts?: unknown[] }; finishReason?: string; parts?: unknown[] } | null {
  if (!isObject(raw)) {
    return null;
  }

  const rawWithCandidates = raw as { candidates?: unknown[] };
  const candidates = rawWithCandidates.candidates as Array<{
    content?: { parts?: unknown[] };
    finishReason?: string;
    parts?: unknown[];
  }>;
  const candidate = candidates.length > 0 ? candidates[0] : undefined;
  if (!(candidate && isObject(candidate))) {
    return null;
  }
  return candidate;
}

/**
 * Normalizes a Google Gemini `generateContent` streaming chunk into a
 * canonical `NormalizerResult`.  Returns `null` if the chunk has no
 * `candidates` array or the first candidate has no content.
 *
 * Never throws — malformed or adversarial input is silently ignored.
 */
// fallow-ignore-next-line complexity — conditional field extraction from streaming chunk
export function normalizeGeminiChunk(raw: unknown): NormalizerResult | null {
  try {
    if (!validateGeminiInput(raw)) {
      return null;
    }

    const candidate = getFirstCandidate(raw);
    if (!candidate) {
      return null;
    }

    const { content } = candidate;
    const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : null;
    const done = finishReason !== null && FINISH_REASONS_DONE.has(finishReason) ? true : undefined;
    const mappedFinishReason = mapGeminiFinishReason(finishReason);

    const parts = isObject(content) && Array.isArray(content.parts) ? content.parts : [];
    const { textContent, thinking, nativeToolCallList } = processGeminiParts(parts);
    const usage = isObject(raw) ? extractGeminiUsage(raw) : undefined;

    const chunk = {
      ...(textContent !== undefined && { content: textContent }),
      ...(thinking !== undefined && { thinking }),
      ...(done !== undefined && { done }),
      ...(nativeToolCallList.length > 0 && {
        nativeToolCallDeltas: nativeToolCallList
      }),
      ...(usage !== undefined && { usage }),
      ...(mappedFinishReason !== undefined && {
        finishReason: mappedFinishReason
      })
    };

    return { chunk, rawEvent: raw };
  } catch {
    return null;
  }
}
