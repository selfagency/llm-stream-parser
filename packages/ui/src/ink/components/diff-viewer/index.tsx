import { Box, Text } from 'ink';
import { useMemo } from 'react';

import type { AcidPalette } from '../../theme/palette.ts';

// =============================================================================
// Types
// =============================================================================

/** A single diff hunk. */
export interface DiffHunk {
  readonly index: number;
  readonly lines: readonly DiffLine[];
  readonly location: string;
}

/** A single line within a diff hunk. */
export interface DiffLine {
  readonly content: string;
  readonly index: number;
  readonly type: 'add' | 'remove' | 'context';
}

export interface DiffViewerProps {
  /** File path for the title. */
  readonly filePath: string;
  /** Modified content (right side of diff). */
  readonly modified: string;
  /** Original content (left side of diff). */
  readonly original: string;
  /** Semantic palette. */
  readonly palette: AcidPalette;
}

// =============================================================================
// Myers LCS diff — 3 isolated phases
// =============================================================================

/**
 * Phase 1: Build the LCS DP table.
 *
 * Returns an (m+1) × (n+1) matrix where dp[i][j] = length of LCS
 * between origLines[0..i-1] and modLines[0..j-1].
 */
// nosemgrep: array-indexing — DP table addresses bounded by m,n; no user input
function buildLcsTable(origLines: string[], modLines: string[]): number[][] {
  const m = origLines.length;
  const n = modLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const origLine = origLines[i - 1] as string;
    const row = dp[i] as number[];
    const prevRow = dp[i - 1] as number[];
    for (let j = 1; j <= n; j++) {
      if (origLine === modLines[j - 1]) {
        row[j] = (prevRow[j - 1] as number) + 1;
      } else {
        row[j] = Math.max(prevRow[j] as number, row[j - 1] as number);
      }
    }
  }
  return dp;
}

/**
 * Phase 2: Backtrack through the LCS table to produce a reverse diff.
 */
// nosemgrep: array-indexing — DP table addresses bounded by m,n; no user input
function backtrackDiff(dp: number[][], origLines: string[], modLines: string[]): DiffLine[] {
  const reverseLines: DiffLine[] = [];
  let i = origLines.length;
  let j = modLines.length;

  while (i > 0 || j > 0) {
    const row = dp[i] as number[];
    const prevRow = dp[i - 1] as number[];

    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      reverseLines.push({ content: origLines[i - 1] as string, index: reverseLines.length, type: 'context' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (row[j - 1] as number) >= (prevRow[j] as number))) {
      reverseLines.push({ content: modLines[j - 1] as string, index: reverseLines.length, type: 'add' });
      j--;
    } else if (i > 0) {
      reverseLines.push({ content: origLines[i - 1] as string, index: reverseLines.length, type: 'remove' });
      i--;
    }
  }

  return reverseLines.reverse();
}

/**
 * Phase 3: Group diff lines into hunks with at most 5 context lines between changes.
 */
function groupIntoHunks(allLines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffLine[] = [];
  let hunkIndex = 0;
  let contextCount = 0;
  let lastWasChange = false;

  for (const line of allLines) {
    if (line.type === 'context') {
      if (lastWasChange) {
        contextCount = 1;
        currentHunk.push(line);
        lastWasChange = false;
      } else if (currentHunk.length > 0) {
        contextCount++;
        if (contextCount <= 5) {
          currentHunk.push(line);
        } else if (currentHunk.length > 0) {
          hunks.push({
            index: hunkIndex++,
            lines: currentHunk,
            location: `@@ -${1 + currentHunk.length} +${1 + currentHunk.length} @@`
          });
          currentHunk = [];
        }
      }
    } else {
      currentHunk.push(line);
      lastWasChange = true;
      contextCount = 0;
    }
  }

  // Flush final hunk
  if (currentHunk.length > 0) {
    hunks.push({
      index: hunkIndex++,
      lines: currentHunk,
      location: `@@ -${1 + currentHunk.length} +${1 + currentHunk.length} @@`
    });
  }
  return hunks;
}

/**
 * Compute a simple line-based diff between two strings.
 * Uses Myers-like longest-common-subsequence approach.
 * Decomposed into 3 isolated phases for testability and maintainability.
 */
function computeDiff(original: string, modified: string): DiffHunk[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const dp = buildLcsTable(origLines, modLines);
  const allLines = backtrackDiff(dp, origLines, modLines);
  return groupIntoHunks(allLines);
}

/**
 * Diff viewer — displays line-based diffs with color-coded
 * additions (green) and removals (red).
 *
 * Renders hunks with @@ headers in the classic unified-diff
 * format, using BBS-style borders.
 */
export function DiffViewer({ filePath, original, modified, palette }: DiffViewerProps) {
  const hunks = useMemo(() => computeDiff(original, modified), [original, modified]);

  return (
    <Box borderColor={palette.frameBorder} borderStyle="bold" flexDirection="column" paddingX={1}>
      {/* Title bar */}
      <Box>
        <Text bold color={palette.frameBright}>
          {'Δ '}
          {filePath}
        </Text>
      </Box>

      <Text color={palette.frameDim}>━</Text>

      {/* Hunks */}
      {hunks.length === 0 ? (
        <Text color={palette.muted}>No changes</Text>
      ) : (
        hunks.map(hunk => (
          <Box flexDirection="column" key={hunk.index} marginTop={1}>
            {/* Hunk header */}
            <Box>
              <Text bold color={palette.assistantAccent}>
                {hunk.location}
              </Text>
            </Box>

            {/* Hunk lines */}
            {hunk.lines.map(line => (
              <Box key={line.index}>
                <Text color={diffColor(line.type, palette)}>
                  {diffPrefix(line.type)}
                  {line.content}
                </Text>
              </Box>
            ))}
          </Box>
        ))
      )}

      {/* Summary */}
      <Box marginTop={1}>
        <Text color={palette.muted} dimColor>
          {hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0)} additions,{' '}
          {hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'remove').length, 0)} deletions
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Map a diff line type to a palette color key.
 */
function diffColor(type: DiffLine['type'], palette: AcidPalette): string {
  if (type === 'add') {
    return palette.success;
  }
  if (type === 'remove') {
    return palette.error;
  }
  return palette.frameDim;
}

/**
 * Get the prefix character for a diff line type.
 */
function diffPrefix(type: DiffLine['type']): string {
  if (type === 'add') {
    return '+';
  }
  if (type === 'remove') {
    return '-';
  }
  return ' ';
}
