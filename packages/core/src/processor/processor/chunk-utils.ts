import type { JsonObject, StreamChunk } from '@agentsy/shared';

import type { XmlToolCall } from '../../tool-calls/index.js';

const SHARED_TEXT_ENCODER = new TextEncoder();
const TAG_START_REGEX = /[A-Za-z_/:!?]/;

export function ensureText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function estimateChunkSize(chunk: StreamChunk, encoder: TextEncoder): number {
  let size = 0;
  if (typeof chunk.content === 'string') {
    size += encoder.encode(chunk.content).length;
  }
  if (typeof chunk.thinking === 'string') {
    size += encoder.encode(chunk.thinking).length;
  }
  if (Array.isArray(chunk.tool_calls)) {
    for (const call of chunk.tool_calls) {
      try {
        size += encoder.encode(JSON.stringify(call)).length;
      } catch {
        // Skip serialization errors (circular refs, BigInt, etc.)
      }
    }
  }
  if (Array.isArray(chunk.nativeToolCallDeltas)) {
    for (const delta of chunk.nativeToolCallDeltas) {
      try {
        size += encoder.encode(JSON.stringify(delta)).length;
      } catch {
        // Skip serialization errors
      }
    }
  }
  return size;
}

export function normalizeToolArguments(value: unknown): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JsonObject;
      }
    } catch {
      // Ignore malformed tool argument payloads; treat as empty args.
    }
  }

  return {};
}

export function mapNativeToolCalls(calls: StreamChunk['tool_calls']): XmlToolCall[] {
  if (!Array.isArray(calls) || calls.length === 0) {
    return [];
  }

  const mapped: XmlToolCall[] = [];

  for (const call of calls) {
    const name = typeof call?.function?.name === 'string' ? call.function.name : null;
    if (!name) {
      continue;
    }

    mapped.push({
      format: 'native-json',
      name,
      parameters: normalizeToolArguments(call.function?.arguments)
    });
  }

  return mapped;
}

export function enforceMaxLength(
  value: string,
  field: 'content' | 'thinking',
  maxInputLength: number,
  onWarning: (message: string, context?: Record<string, unknown>) => void
): string {
  const valueBytes = SHARED_TEXT_ENCODER.encode(value).length;
  if (maxInputLength <= 0 || valueBytes <= maxInputLength) {
    return value;
  }

  onWarning(`Chunk ${field} exceeded maxInputLength and was truncated`, {
    field,
    maxInputLength,
    originalLength: valueBytes
  });

  const charIndexForByteLimit = (() => {
    let bytes = 0;
    let index = 0;
    for (const char of value) {
      const charBytes = SHARED_TEXT_ENCODER.encode(char).length;
      if (bytes + charBytes > maxInputLength) {
        break;
      }
      bytes += charBytes;
      index += char.length;
    }
    return index;
  })();

  // Truncate at a tag boundary so we don't hand a partial `<tag...` fragment
  // to the XML parser. Walk back from the cut point to the last `<` that has
  // no matching `>` after it within the kept region.
  let cut = charIndexForByteLimit;
  const openIdx = value.lastIndexOf('<', charIndexForByteLimit - 1);
  if (openIdx !== -1) {
    const nextChar = value[openIdx + 1] ?? '';
    const looksLikeTagStart = TAG_START_REGEX.test(nextChar);
    const closeIdx = value.indexOf('>', openIdx);
    // If the closing `>` is beyond the cut (or absent), the tag is partial.
    if (looksLikeTagStart && (closeIdx === -1 || closeIdx >= charIndexForByteLimit)) {
      cut = openIdx;
    }
  }

  return value.slice(0, cut);
}
