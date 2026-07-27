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
function collectFencedBlocks(text: string): string[] | null {
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

  return hasFenced ? fencedBlocks : null;
}

function splitFileBoundaries(lines: string[]): string[] {
  const blocks: string[] = [];
  let i = 0;
  let currentStart = -1;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (ORIGINAL_FILE_REGEX.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j] ?? '';
        if (next.length === 0) {
          j++;
          continue;
        }
        if (REVISED_FILE_REGEX.test(next)) {
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

  if (currentStart >= 0) {
    blocks.push(lines.slice(currentStart).join('\n'));
  }
  return blocks;
}

function collectDiffBlocks(text: string): string[] {
  const fenced = collectFencedBlocks(text);
  const sources = fenced ?? [text];
  const blocks: string[] = [];

  for (const block of sources) {
    blocks.push(...splitFileBoundaries(block.split('\n')));
  }

  return blocks;
}

/**
 * Attempts to parse a single diff block into a `ParsedUdiff`.
 * Returns `null` when the block cannot be parsed.
 */
function findDiffHeader(lines: string[]): { filePath: string | null; revisedHeader: string; startIndex: number } {
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (ORIGINAL_FILE_REGEX.exec(line)) {
      i++;
      break;
    }
  }
  if (i >= lines.length) {
    return { filePath: null, revisedHeader: '', startIndex: i };
  }

  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const revisedMatch = REVISED_FILE_REGEX.exec(line);
    if (revisedMatch) {
      return { filePath: revisedMatch[1] ?? null, revisedHeader: revisedMatch[1] ?? '', startIndex: i + 1 };
    }
  }
  return { filePath: null, revisedHeader: '', startIndex: i };
}

function classifyHunkLine(
  firstChar: string | undefined,
  hunkLine: string
): { type: 'context' | 'add' | 'delete' | 'skip' | 'end'; content?: string } {
  if (firstChar === ' ' || firstChar === '' || hunkLine.length === 0) {
    return { type: 'context', content: normalizeContent(hunkLine) };
  }
  if (firstChar === '+') {
    return { type: 'add', content: hunkLine.slice(1) };
  }
  if (firstChar === '-') {
    return { type: 'delete', content: hunkLine.slice(1) };
  }
  if (firstChar === '@') {
    return { type: 'end' };
  }
  if (firstChar === '\\') {
    return { type: 'skip' };
  }
  return { type: 'end' };
}

function parseSingleHunk(lines: string[], startIndex: number): { hunk: UdiffHunk | null; nextIndex: number } {
  if (startIndex >= lines.length) {
    return { hunk: null, nextIndex: startIndex };
  }
  const hunkLine = lines[startIndex] ?? '';
  const hunkMatch = HUNK_HEADER_REGEX.exec(hunkLine);
  if (!hunkMatch) {
    return { hunk: null, nextIndex: startIndex + 1 };
  }

  const oldStart = Number(hunkMatch[1]);
  const oldLines = hunkMatch[2] ? Number(hunkMatch[2]) : 1;
  const newStart = Number(hunkMatch[3]);
  const newLines = hunkMatch[4] ? Number(hunkMatch[4]) : 1;

  let i = startIndex + 1;
  const hunkLines: UdiffHunkLine[] = [];
  let addedCount = 0;
  let deletedCount = 0;

  while (i < lines.length) {
    const classification = classifyHunkLine(lines[i]?.[0], lines[i] ?? '');
    if (classification.type === 'end') {
      break;
    }
    if (classification.type === 'skip') {
      i++;
      continue;
    }
    if (classification.type === 'context') {
      hunkLines.push({ type: 'context', content: classification.content ?? '' });
      i++;
    }
    if (classification.type === 'add') {
      hunkLines.push({ type: 'add', content: classification.content ?? '' });
      addedCount++;
      i++;
    }
    if (classification.type === 'delete') {
      hunkLines.push({ type: 'delete', content: classification.content ?? '' });
      deletedCount++;
      i++;
    }

    if (hunkLines.length > 10_000 || addedCount + deletedCount > 10_000) {
      break;
    }
  }

  const hunk: UdiffHunk = { oldStart, oldLines, newStart, newLines, lines: hunkLines };
  return { hunk, nextIndex: i };
}

function tryParseSingleDiff(block: string): ParsedUdiff | null {
  const lines = block.split('\n');
  const header = findDiffHeader(lines);
  if (!header.filePath) {
    return null;
  }

  const hunks: UdiffHunk[] = [];
  let i = header.startIndex;

  while (i < lines.length) {
    const result = parseSingleHunk(lines, i);
    if (result.hunk) {
      hunks.push(result.hunk);
    }
    i = result.nextIndex;
  }

  if (hunks.length === 0) {
    return null;
  }

  return { filePath: header.filePath, hunks, originalHeader: '', revisedHeader: header.revisedHeader };
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
