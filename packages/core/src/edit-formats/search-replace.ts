import type { EditParseResult, FileEdit } from './types.js';

// ---------------------------------------------------------------------------
// RelativeIndenter
// ---------------------------------------------------------------------------

/**
 * Indentation-agnostic text matching.
 *
 * Normalises two blocks of text by stripping their common leading whitespace
 * so that SEARCH blocks match source code regardless of the base indentation
 * level they were authored at.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: API contract — external callers reference RelativeIndenter.normalize()
export class RelativeIndenter {
  /**
   * Returns the number of leading whitespace characters common to all
   * non-empty lines in `text`.  Returns 0 when there are no non-empty lines.
   */
  static baseIndent(text: string): number {
    const lines = text.split('\n');
    let min: number | undefined;

    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.length === 0) {
        continue; // skip empty / whitespace-only lines
      }
      const indent = line.length - trimmed.length;
      if (min === undefined || indent < min) {
        min = indent;
      }
    }

    return min ?? 0;
  }

  /**
   * Strips the common base indentation from every line in `text`.
   * Lines that are indented less than the base (e.g. blank lines) are not
   * modified.
   */
  static normalize(text: string): string {
    const base = RelativeIndenter.baseIndent(text);
    if (base === 0) {
      return text;
    }
    return text
      .split('\n')
      .map(line => (line.length >= base ? line.slice(base) : line))
      .join('\n');
  }

  /**
   * Returns `true` when `search` and `target` are structurally identical
   * after stripping their respective common-base indentation.
   */
  static matches(search: string, target: string): boolean {
    return RelativeIndenter.normalize(search) === RelativeIndenter.normalize(target);
  }
}

// ---------------------------------------------------------------------------
// Fence matching
// ---------------------------------------------------------------------------

// Matches ``` optionally followed by a language tag, then content up to ```
// The lazy quantifier ensures we match the nearest closing fence.
// NB: \w does not match hyphens, so allow [\w-]* for tags like "search-replace".
const FENCE_BLOCK_REGEX = /```([\w-]*)\n([\s\S]*?)```/g;

// ---------------------------------------------------------------------------
// Parse SEARCH / REPLACE blocks
// ---------------------------------------------------------------------------

/**
 * Searches for SEARCH/REPLACE blocks inside markdown code fences and converts
 * them to `FileEdit` operations.
 *
 * ## Format
 *
 * Each block has a **filepath** on the line immediately before the opening
 * fence, and an optional `<filename>` / `<path>` XML tag is also recognised on
 * that line:
 *
 * ```text
 * src/index.ts
 * ```search-replace
 * SEARCH
 * const x = 1
 * REPLACE
 * const x = 2
 * ```
 * ```
 *
 * ## Error recovery
 *
 * Blocks that lack a filepath or a valid SEARCH/REPLACE separator are
 * collected in `errors` while valid blocks are still returned in `edits`.
 * The function never throws.
 */
function extractOriginalText(searchSection: string, lang: string): string | null {
  if (searchSection.startsWith('SEARCH\n')) {
    return searchSection.slice('SEARCH\n'.length);
  }
  if (searchSection.startsWith('SEARCH\r\n')) {
    return searchSection.slice('SEARCH\r\n'.length);
  }
  if (lang === 'SEARCH' || lang === 'SEARCH-REPLACE') {
    return searchSection;
  }
  return null;
}

export function parseSearchReplace(text: string): EditParseResult {
  const edits: FileEdit[] = [];
  const errors: string[] = [];

  // nosemgrep: FENCE_BLOCK_REGEX is a hardcoded constant, not user-supplied input
  const fenceRegex = new RegExp(FENCE_BLOCK_REGEX.source, 'g');

  while (true) {
    const match = fenceRegex.exec(text);
    if (match === null) {
      break;
    }
    const lang = (match[1] ?? '').toUpperCase();
    const content = match[2] ?? '';

    const replaceSeparatorIdx = findReplaceSeparator(content);
    if (replaceSeparatorIdx === -1) {
      continue;
    }

    const beforeFence = text.slice(0, match.index).trimEnd();
    const lastNewline = beforeFence.lastIndexOf('\n');
    const filepathRaw = (lastNewline >= 0 ? beforeFence.slice(lastNewline + 1) : beforeFence).trim();

    const filepath = extractFilepath(filepathRaw);
    if (!filepath) {
      errors.push('Missing or unparseable filepath before SEARCH/REPLACE block');
      continue;
    }

    const searchSection = content.slice(0, replaceSeparatorIdx);
    const replaceSection = content.slice(replaceSeparatorIdx + '\nREPLACE\n'.length);

    if (!(lang === 'SEARCH' || lang === 'SEARCH-REPLACE' || lang === '')) {
      continue;
    }

    const originalText = extractOriginalText(searchSection, lang);
    if (originalText === null) {
      continue;
    }

    edits.push({
      filePath: filepath,
      type: 'search-replace',
      original: originalText.trimEnd(),
      replacement: replaceSection.trimEnd()
    });
  }

  return { edits, errors };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Finds the position of the first `\nREPLACE\n` separator in `content`.
 * Returns -1 when not found.
 */
function findReplaceSeparator(content: string): number {
  const idx = content.indexOf('\nREPLACE\n');
  if (idx !== -1) {
    return idx;
  }
  // Also try \r\n variant
  return content.indexOf('\nREPLACE\r\n');
}

/**
 * Extracts the file path from a raw line, stripping optional XML tags like
 * `<filename>path</filename>` or `<path>path</path>`.
 */
function extractFilepath(raw: string): string | null {
  if (raw.length === 0) {
    return null;
  }

  // Try XML tags: <filename>...</filename> or <path>...</path>
  const xmlMatch = /<filename>(.+?)<\/filename>|<path>(.+?)<\/path>/i.exec(raw);
  if (xmlMatch) {
    return (xmlMatch[1] ?? xmlMatch[2] ?? '').trim() || null;
  }

  // Otherwise use the raw text as-is
  return raw;
}
