import type { EditParseResult, FileEdit } from './types.js';

// ---------------------------------------------------------------------------
// Types for internal hunk representation
// ---------------------------------------------------------------------------

/** A single line inside a unified-diff hunk. */
export interface UdiffHunkLine {
  content: string;
  type: 'context' | 'add' | 'delete';
}

/** A parsed hunk block from a unified diff. */
export interface UdiffHunk {
  lines: readonly UdiffHunkLine[];
  newLines: number;
  newStart: number;
  oldLines: number;
  oldStart: number;
}

/** The complete parsed representation of one file diff. */
export interface ParsedUdiff {
  filePath: string;
  hunks: readonly UdiffHunk[];
  originalHeader: string;
  revisedHeader: string;
}

// ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

// Matches a hunk header: @@ -oldStart,oldLines +newStart,newLines @@
const HUNK_HEADER_REGEX = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

// File header lines: --- a/path and +++ b/path
const ORIGINAL_FILE_REGEX = /^---\s+(?:[ab]\/)?(.+)/;
const REVISED_FILE_REGEX = /^\+\+\+\s+(?:[ab]\/)?(.+)/;

// Matches a diff block — either inside ```diff … ``` fences or raw.
// Accounts for diffs that may or may not be fenced.
const DIFF_BLOCK_REGEX = /```(?:diff)?\s*\n([\s\S]*?)```/g;
const RAW_DIFF_HEADER_REGEX = /^---\s+(?:[ab]\/)?.+/m;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses unified-diff blocks from `text` and converts them to `FileEdit`
 * operations.
 *
 * ## Recognition
 *
 * Diffs may be enclosed in ```` ```diff ```` fences or appear as raw text.
 * Each diff must have `--- a/file` / `+++ b/file` headers followed by one or
 * more `@@ … @@` hunks.
 *
 * ## Error recovery
 *
 * Returns a best-effort result: malformed diffs or hunks are skipped and
 * reported in `errors` while valid edits are still returned.
 */
export function parseUdiffs(text: string): EditParseResult {
  const edits: FileEdit[] = [];
  const errors: string[] = [];

  // 1. Collect diff blocks (fenced or raw)
  const blocks = collectDiffBlocks(text);

  for (const block of blocks) {
    const parsed = tryParseSingleDiff(block);
    if (parsed === null) {
      errors.push('Could not parse diff block');
      continue;
    }

    // Serialise the hunks so the runtime can apply the patch
    edits.push({
      filePath: parsed.filePath,
      type: 'udiff',
      original: block,
      replacement: serializePatch(parsed.hunks)
    });
  }

  return { edits, errors };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collects candidate diff text blocks, splitting on per-file boundaries.
 *
 * When fenced diff blocks (```` ```diff ````) are found they are used;
 * otherwise the raw text is scanned for `--- …` / `+++ …` header pairs.
 * Each pair yields one block so that multi-file diffs are handled correctly.
 */
// NOSONAR — S3776 cognitive complexity 32/15; file-boundary detection loop
// inherently has nested conditionals for header matching across multiple lines.
function collectDiffBlocks(text: string): string[] {
  // Try fenced blocks first, then fall back to raw text
  // nosemgrep: DIFF_BLOCK_REGEX is a hardcoded constant, not user-supplied input
  const fenceRegex = new RegExp(DIFF_BLOCK_REGEX.source, 'g');
  const fencedBlocks: string[] = [];
  let hasFenced = false;
  let fencedMatch: RegExpExecArray | null;

  while ((fencedMatch = fenceRegex.exec(text)) !== null) {
    const inner = fencedMatch[1] ?? '';
    if (RAW_DIFF_HEADER_REGEX.test(inner)) {
      fencedBlocks.push(inner);
      hasFenced = true;
    }
  }

  const source = hasFenced ? fencedBlocks : [text];

  // Split each source block at file boundaries (---\n+++ pairs)
  const blocks: string[] = [];
  for (const block of source) {
    const lines = block.split('\n');
    let i = 0;
    let currentStart = -1;

    while (i < lines.length) {
      const line = lines[i] ?? '';

      if (ORIGINAL_FILE_REGEX.test(line)) {
        // Check that the next non-blank line is a +++ header
        let j = i + 1;
        while (j < lines.length) {
          const next = lines[j] ?? '';
          if (next.length === 0) {
            j++;
            continue;
          }
          if (REVISED_FILE_REGEX.test(next)) {
            // Flush previous block if any
            if (currentStart >= 0) {
              blocks.push(lines.slice(currentStart, i).join('\n'));
            }
            currentStart = i;
          }
          break;
        }
      }
      i++;
    }

    // Flush last block
    if (currentStart >= 0) {
      blocks.push(lines.slice(currentStart).join('\n'));
    }
  }

  return blocks;
}

/**
 * Attempts to parse a single diff block into a `ParsedUdiff`.
 * Returns `null` when the block cannot be parsed.
 */
// NOSONAR — S3776 cognitive complexity 40/15; the function processes a
// free-form diff format with file headers, hunk headers, and per-line type
// discrimination, each contributing unavoidable nesting.
function tryParseSingleDiff(block: string): ParsedUdiff | null {
  const lines = block.split('\n');

  // --- find file headers ---
  let filePath: string | null = null;
  const originalHeader = '';
  let revisedHeader = '';
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const originalMatch = ORIGINAL_FILE_REGEX.exec(line);
    if (originalMatch) {
      i++;
      break;
    }
  }

  if (i >= lines.length) {
    return null;
  }

  // Expect +++ line next (possibly with one blank line between)
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const revisedMatch = REVISED_FILE_REGEX.exec(line);
    if (revisedMatch) {
      revisedHeader = revisedMatch[1] ?? '';
      filePath = revisedMatch[1] ?? null;
      i++;
      break;
    }
  }

  if (!filePath) {
    return null;
  }

  // --- parse hunks ---
  const hunks: UdiffHunk[] = [];

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const hunkMatch = HUNK_HEADER_REGEX.exec(line);

    if (hunkMatch) {
      const oldStart = Number(hunkMatch[1]);
      const oldLines = hunkMatch[2] ? Number(hunkMatch[2]) : 1;
      const newStart = Number(hunkMatch[3]);
      const newLines = hunkMatch[4] ? Number(hunkMatch[4]) : 1;

      i++;
      const hunkLines: UdiffHunkLine[] = [];
      let addedCount = 0;
      let deletedCount = 0;

      // Count total operation lines (non-context)
      while (i < lines.length) {
        const hunkLine = lines[i] ?? '';
        const firstChar = hunkLine[0];

        if (firstChar === ' ' || firstChar === '' || hunkLine.length === 0) {
          hunkLines.push({ type: 'context', content: normalizeContent(hunkLine) });
          i++;
          if (hunkLines.length > 10_000) {
            break; // safety bound
          }
        } else if (firstChar === '+') {
          hunkLines.push({ type: 'add', content: hunkLine.slice(1) });
          addedCount++;
          i++;
        } else if (firstChar === '-') {
          hunkLines.push({ type: 'delete', content: hunkLine.slice(1) });
          deletedCount++;
          i++;
        } else if (firstChar === '@') {
          // next hunk
          break;
        } else if (firstChar === '\\') {
          // No newline at end of file marker — skip
          i++;
          continue;
        } else {
          // end of hunk
          break;
        }

        if (addedCount + deletedCount > 10_000) {
          break; // safety bound
        }
      }

      hunks.push({
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: hunkLines
      });
    } else {
      i++;
    }
  }

  if (hunks.length === 0) {
    return null;
  }

  return {
    filePath,
    hunks,
    originalHeader,
    revisedHeader
  };
}

/**
 * Strips a single leading space from context lines (unified diff convention:
 * context lines start with a space).
 */
function normalizeContent(line: string): string {
  if (line.length > 0 && line[0] === ' ') {
    return line.slice(1);
  }
  return line;
}

/**
 * Serialises hunks to a JSON string so the runtime can deserialise and apply
 * the patch.
 */
function serializePatch(hunks: readonly UdiffHunk[]): string {
  return JSON.stringify(
    hunks.map(h => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines.map(l => ({
        type: l.type,
        content: l.content
      }))
    }))
  );
}
