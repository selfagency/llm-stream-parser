import { normalizeOpenAIChatChunk } from './openai.js';
import type { NormalizerResult } from './types.js';

/**
 * Extracts thinking content from a nested thinking array.
 */
function extractThinkingContent(thinkingArray: unknown[]): string {
  let result = '';

  for (const t of thinkingArray) {
    if (t && typeof t === 'object') {
      const inner = t as Record<string, unknown>;
      if (typeof inner.text === 'string') {
        result += inner.text;
      }
    }
  }

  return result;
}

/**
 * Extracts text and thinking content from a structured content block.
 * @returns [text, thinking] tuple
 */
function extractContentFromBlock(block: unknown): [string, string] {
  let text = '';
  let thinking = '';

  if (!block || typeof block !== 'object') {
    return [text, thinking];
  }

  const b = block as Record<string, unknown>;

  if (b.type === 'text' && typeof b.text === 'string') {
    text = b.text;
  } else if (b.type === 'thinking' && Array.isArray(b.thinking)) {
    thinking = extractThinkingContent(b.thinking);
  }

  return [text, thinking];
}

/**
 * Normalizes a Mistral AI streaming chunk into a canonical `NormalizerResult`.
 *
 * Most Mistral models use an OpenAI Chat Completions-compatible format and are
 * handled by `normalizeOpenAIChatChunk`.
 *
 * Native reasoning models (`magistral-*`) and models with adjustable reasoning
 * (`reasoning_effort`) use a structured content array in the delta instead of a
 * plain string:
 *
 * ```json
 * { "type": "thinking", "thinking": [{ "type": "text", "text": "..." }] }
 * { "type": "text", "text": "..." }
 * ```
 *
 * This function detects that format and extracts `content` and `thinking`
 * accordingly, merging with any tool-call or usage data from the standard path.
 *
 * Returns `null` for unrecognizable chunks.  Never throws.
 */
export function normalizeMistralChunk(raw: unknown): NormalizerResult | null {
  const standard = normalizeOpenAIChatChunk(raw);

  // Fast path: standard normalization already extracted content or thinking.
  if (standard?.chunk.content !== undefined || standard?.chunk.thinking !== undefined) {
    return standard;
  }

  // Slow path: check for Mistral's structured content array (2509/2507 format).
  const structuredContent = parseMistralStructuredContent(raw);
  if (!structuredContent) {
    return standard;
  }

  const { text, thinking } = structuredContent;
  if (!(text || thinking)) {
    return standard;
  }

  const base = standard ?? { chunk: {}, rawEvent: raw };
  return {
    chunk: {
      ...base.chunk,
      ...(text && { content: text }),
      ...(thinking && { thinking })
    },
    rawEvent: raw
  };
}

/**
 * Parses Mistral's structured content array from the raw chunk.
 * @returns [text, thinking] tuple, or null if no structured content found.
 */
function parseMistralStructuredContent(raw: unknown): { text: string; thinking: string } | null {
  try {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const { choices } = raw as Record<string, unknown>;
    if (!Array.isArray(choices) || choices.length === 0) {
      return null;
    }

    const delta = (choices[0] as Record<string, unknown>).delta as Record<string, unknown> | undefined;
    if (!Array.isArray(delta?.content)) {
      return null;
    }

    let text = '';
    let thinking = '';

    for (const block of delta.content as unknown[]) {
      const [blockText, blockThinking] = extractContentFromBlock(block);
      text += blockText;
      thinking += blockThinking;
    }

    return { text, thinking };
  } catch {
    return null;
  }
}
