/**
 * Code survival tracker for AI session attribution.
 *
 * Computes the survival rate of AI-generated code by running
 * `git blame --porcelain` on files written during a session and
 * counting lines still attributed to the session's commits.
 *
 * Lazy computation — intended to run 30 days after session end.
 *
 * @module attribution/survival
 */

import { execSync } from 'node:child_process';
import { safePathEnv } from '@agentsy/shared/safe-path';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a code survival computation for a single session.
 */
export interface SurvivalResult {
  /** Commit SHAs that were checked. */
  commitShas: string[];
  /** When the computation was performed. */
  computedAt: Date;
  /** Number of files that were checked. */
  filesChecked: number;
  /** Total lines originally written by the session's commits. */
  linesOriginal: number;
  /** Lines still attributed to the session's commits. */
  linesSurvived: number;
  /** Session identifier. */
  sessionId: string;
  /** Survival rate (linesSurvived / linesOriginal). */
  survivalRate: number;
}

// =============================================================================
// Survival computation
// =============================================================================

/**
 * Compute the code survival rate for a session's commits.
 *
 * For each file in `files`, runs `git blame --porcelain` and counts
 * lines whose commit SHA matches one of the session's commit SHAs.
 *
 * This is a lazy computation — it is designed to be called 30 days
 * after a session ends, giving time for the code to be modified or
 * replaced by subsequent work.
 *
 * @param sessionId - The session identifier.
 * @param commits   - Array of commit SHAs to attribute lines to.
 * @param files     - Array of file paths (relative to repo root) to check.
 * @param repoRoot  - Absolute path to the git repository root.
 * @returns The survival result.
 *
 * @example
 * ```typescript
 * const result = await computeSurvivalRate(
 *   'sess_abc123',
 *   ['abc123def', '456789ab'],
 *   ['src/feature.ts', 'src/utils.ts'],
 *   '/path/to/repo'
 * );
 * // { sessionId: 'sess_abc123', linesOriginal: 150, linesSurvived: 120, survivalRate: 0.8, ... }
 * ```
 */
export function computeSurvivalRate(
  sessionId: string,
  commits: string[],
  files: string[],
  repoRoot: string
): SurvivalResult {
  const commitSet = new Set(commits);
  let totalLines = 0;
  let survivedLines = 0;
  let filesChecked = 0;

  for (const file of files) {
    try {
      const blameOutput = execSync(['git', 'blame', '--porcelain', file].join(' '), {
        cwd: repoRoot,
        env: safePathEnv(),
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      const fileResult = countBlameLines(blameOutput, commitSet);
      totalLines += fileResult.total;
      survivedLines += fileResult.survived;
      filesChecked++;
    } catch {
      // File may have been deleted or renamed — skip silently
    }
  }

  const survivalRate = totalLines > 0 ? survivedLines / totalLines : 0;

  return {
    sessionId,
    commitShas: [...commits],
    filesChecked,
    linesOriginal: totalLines,
    linesSurvived: survivedLines,
    survivalRate: Number(survivalRate.toFixed(4)),
    computedAt: new Date()
  };
}

// =============================================================================
// Blame parsing
// =============================================================================

/**
 * Result of counting blame lines for a single file.
 */
interface BlameCount {
  /** Lines attributed to the target commits. */
  survived: number;
  /** Total lines in the file. */
  total: number;
}

/**
 * Count lines in `git blame --porcelain` output attributed to a set of commits.
 *
 * The porcelain format outputs one header block per commit, followed by
 * one line per file line. The header block starts with the commit SHA
 * and ends at the first tab-prefixed content line.
 *
 * @param output    - Raw output from `git blame --porcelain`.
 * @param commitSet - Set of commit SHAs to count as "survived".
 * @returns Count of total and survived lines.
 */
// fallow-ignore-next-line complexity
function countBlameLines(output: string, commitSet: Set<string>): BlameCount {
  const lines = output.split('\n');
  let total = 0;
  let survived = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line === '') {
      i++;
      continue;
    }

    // A blame entry starts with a commit SHA (40 hex chars) at position 0
    // followed by metadata fields on subsequent lines.
    // The content line is the first line starting with a tab.
    const commitSha = line.slice(0, 40);

    // Skip non-blame lines (e.g. boundary markers)
    if (!/^[0-9a-f]{40}$/.test(commitSha)) {
      i++;
      continue;
    }

    // Skip to the content line (first tab-prefixed line)
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine === undefined) {
        break;
      }
      if (nextLine.startsWith('\t')) {
        // This is a content line — count it
        total++;
        if (commitSet.has(commitSha)) {
          survived++;
        }
        i++;
        break;
      }
      i++;
    }
  }

  return { total, survived };
}
