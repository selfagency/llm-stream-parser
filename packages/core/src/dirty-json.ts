/**
 * DirtyJson — A tolerant JSON parser for malformed LLM output.
 *
 * Uses a 5-tier recovery approach:
 * 1. Strict `JSON.parse`
 * 2. Remove trailing commas
 * 3. Add missing closing brackets
 * 4. Brace-match extraction of the first JSON object
 * 5. Return `null`
 *
 * Also strips `//`-style comments before recovery attempts.
 *
 * @module
 */

// ── Comment stripping ───────────────────────────────────────────────────────

/**
 * Strip `//`-style comments from a JSON string while preserving string contents.
 */
function stripSingleLineComments(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    if (escaped) {
      result += char;
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      i++;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      i++;
      continue;
    }

    if (!inString && char === '/' && i + 1 < text.length && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') {
        i++;
      }
      // Replace the comment with a space to avoid merging tokens
      result += ' ';
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

// ── Recovery helpers ────────────────────────────────────────────────────────

/**
 * Remove trailing commas before closing brackets (`]` / `}`).
 */
function removeTrailingCommas(text: string): string {
  return text.replaceAll(/,\s*([}\]])/gu, '$1');
}

/**
 * Count opening and closing brackets and append any that are missing.
 */
function addMissingClosingBrackets(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }

    if (char === '{') {
      stack.push('}');
    } else if (char === '[') {
      stack.push(']');
    } else if ((char === '}' || char === ']') && stack.at(-1) === char) {
      stack.pop();
    }
  }

  let result = text;
  for (let i = stack.length - 1; i >= 0; i--) {
    result += stack[i]!;
  }

  return result;
}

/**
 * Find the first top-level JSON object `{...}` in a string using brace matching.
 * Returns the matched substring (including braces) or `null`.
 */
// NOSONAR
function findFirstJsonObject(text: string): string | null {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a potentially malformed JSON string with 5-tier recovery.
 *
 * @typeParam T - The expected return type (defaults to `unknown`).
 * @param input - Raw input string, possibly containing malformed JSON.
 * @returns The parsed value, or `null` if no valid JSON could be extracted.
 */
export function dirtyParse<T = unknown>(input: string): T | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Tier 1: Strict JSON.parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Continue to recovery tiers.
  }

  // Strip comments before further recovery attempts.
  const cleaned = stripSingleLineComments(trimmed);

  // Tier 2: Remove trailing commas
  try {
    const noTrailing = removeTrailingCommas(cleaned);
    return JSON.parse(noTrailing) as T;
  } catch {
    // Continue to tier 3.
  }

  // Tier 3: Add missing closing brackets (also try with trailing comma fix)
  try {
    const withBrackets = addMissingClosingBrackets(cleaned);
    return JSON.parse(withBrackets) as T;
  } catch {
    // Try adding brackets + removing trailing commas.
    try {
      const withBrackets = addMissingClosingBrackets(cleaned);
      const fixed = removeTrailingCommas(withBrackets);
      return JSON.parse(fixed) as T;
    } catch {
      // Continue to tier 4.
    }
  }

  // Tier 4: Brace-match extraction
  const extracted = findFirstJsonObject(cleaned);
  if (extracted !== null) {
    // Try bare extraction first.
    try {
      return JSON.parse(extracted) as T;
    } catch {
      // Try extraction + trailing comma fix.
      try {
        const noTrailing = removeTrailingCommas(extracted);
        return JSON.parse(noTrailing) as T;
      } catch {
        // Continue to tier 5.
      }
    }
  }

  // Tier 5: Return null
  return null;
}

/**
 * Streaming tolerant JSON parser that accumulates chunks via `feed()`.
 *
 * @example
 * ```ts
 * const parser = new DirtyJson();
 * parser.feed('{ "a"');
 * parser.feed(': 1 }');
 * const result = parser.parse<{ a: number }>(); // { a: 1 }
 * parser.reset();
 * ```
 */
export class DirtyJson {
  private buffer = '';

  /** Accumulate a chunk of streaming JSON input. */
  feed(chunk: string): void {
    this.buffer += chunk;
  }

  /** Parse the accumulated buffer with 5-tier recovery. */
  parse<T = unknown>(): T | null {
    return dirtyParse<T>(this.buffer);
  }

  /** Clear the accumulated buffer. */
  reset(): void {
    this.buffer = '';
  }
}
