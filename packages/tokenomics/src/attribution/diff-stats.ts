/**
 * Diff statistics reader for AI session attribution.
 *
 * Reads `git diff --stat` output and returns structured line/fill/commit
 * counts. Called by the ledger writer at session end to populate
 * `ArtifactRecord` fields.
 *
 * @module attribution/diff-stats
 */

import { execSync } from 'node:child_process';

// =============================================================================
// Types
// =============================================================================

/**
 * Structured diff statistics for a session's commits.
 */
export interface DiffStats {
  /** Number of commits in the range. */
  commitCount: number;
  /** Number of files changed. */
  filesChanged: number;
  /** Total lines added across all commits. */
  linesAdded: number;
  /** Total lines deleted across all commits. */
  linesDeleted: number;
}

// =============================================================================
// Diff stat readers
// =============================================================================

/**
 * Read diff statistics for a commit range.
 *
 * Runs `git diff --stat` for the given range and parses the summary line
 * to extract lines added, lines deleted, and files changed.
 *
 * When `since` is omitted, reads stats for the last commit only
 * (`HEAD~1..HEAD`).
 *
 * @param repoRoot - Absolute path to the git repository root.
 * @param since    - Optional git ref or revision range to diff from.
 *                   Defaults to `HEAD~1` (last commit).
 * @returns Structured diff statistics.
 *
 * @example
 * ```typescript
 * const stats = readDiffStats('/path/to/repo');
 * // { linesAdded: 42, linesDeleted: 3, filesChanged: 2, commitCount: 1 }
 * ```
 */
export function readDiffStats(repoRoot: string, since?: string): DiffStats {
  const range = since === undefined ? 'HEAD~1..HEAD' : `${since}..HEAD`;

  const output = execSync(['git', 'diff', '--stat', range].join(' '), {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8'
  });

  return parseDiffStatOutput(output);
}

/**
 * Read diff statistics for the working tree vs the last commit.
 *
 * Runs `git diff --stat HEAD` to compare the working tree (unstaged
 * changes) against the last commit.
 *
 * @param repoRoot - Absolute path to the git repository root.
 * @returns Structured diff statistics for unstaged changes.
 *
 * @example
 * ```typescript
 * const stats = readWorkingTreeDiff('/path/to/repo');
 * // { linesAdded: 10, linesDeleted: 2, filesChanged: 1, commitCount: 0 }
 * ```
 */
export function readWorkingTreeDiff(repoRoot: string): DiffStats {
  const output = execSync('git diff --stat HEAD', {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf-8'
  });

  return parseDiffStatOutput(output);
}

// =============================================================================
// Parsing
// =============================================================================

/**
 * Parse `git diff --stat` output into structured counts.
 *
 * The summary line has the format:
 * ```
 *  N files changed, M insertions(+), K deletions(-)
 * ```
 *
 * @param output - Raw output from `git diff --stat`.
 * @returns Parsed diff statistics.
 */
export function parseDiffStatOutput(output: string): DiffStats {
  const lines = output.trim().split('\n');
  const summaryLine = lines.at(-1);

  if (summaryLine === undefined || summaryLine === '') {
    return { linesAdded: 0, linesDeleted: 0, filesChanged: 0, commitCount: 0 };
  }

  const filesChanged = extractNumber(summaryLine, /(\d+)\s+file/);
  const linesAdded = extractNumber(summaryLine, /(\d+)\s+insertion/);
  const linesDeleted = extractNumber(summaryLine, /(\d+)\s+deletion/);

  return {
    linesAdded,
    linesDeleted,
    filesChanged,
    commitCount: 0 // commit count is not available from --stat alone
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Extract a number from a string using a regex pattern.
 *
 * @param text    - The text to search.
 * @param pattern - Regex with a single capture group for the number.
 * @returns The extracted number, or 0 if not found.
 */
function extractNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (match === null) {
    return 0;
  }
  return Number.parseInt(match[1] ?? '0', 10);
}
