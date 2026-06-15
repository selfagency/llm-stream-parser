/**
 * Git-ai attribution notes reader.
 *
 * Reads git-ai's open-standard attribution git notes to extract
 * per-commit AI vs human line statistics. git-ai stores attribution
 * data in git notes under the `refs/notes/ai` ref.
 *
 * @module attribution/git-ai-notes
 */

import { execSync } from 'node:child_process';

// =============================================================================
// Types
// =============================================================================

/**
 * Per-commit AI attribution stats from git-ai notes.
 *
 * git-ai stores JSON notes per commit tracking how many lines were
 * written by AI vs human, including breakdown by tool/model.
 */
export interface GitAiCommitStats {
  /** AI-generated lines that were accepted (survived review). */
  aiAccepted: number;
  /** Lines attributed to AI generation. */
  aiAdditions: number;
  /** AI percentage (0–100). */
  aiPercentage: number;
  /** Lines attributed to human authors. */
  humanAdditions: number;
  /** Commit SHA. */
  sha: string;
  /** Breakdown by tool/model (e.g. {"claude-code": {aiAdditions: 50, aiAccepted: 45}}). */
  toolModelBreakdown: Record<string, { aiAdditions: number; aiAccepted: number }>;
  /** Total lines added (human + AI). */
  totalAdded: number;
}

/**
 * Aggregated AI attribution stats across a time period.
 */
export interface GitAiPeriodStats {
  /** Breakdown by tool/model. */
  byTool: Record<string, { aiAdditions: number; aiPercentage: number }>;
  /** Number of commits with git-ai notes. */
  commitCount: number;
  /** Overall AI percentage (0–100). */
  overallAiPercentage: number;
  /** End of the period. */
  periodEnd: Date;
  /** Start of the period. */
  periodStart: Date;
  /** Total AI-generated lines that survived review/accepted. */
  totalAiAccepted: number;
  /** Total AI-generated lines across all commits. */
  totalAiAdditions: number;
  /** Total human-written lines across all commits. */
  totalHumanAdditions: number;
}

// =============================================================================
// Git notes reader
// =============================================================================

/**
 * Read git-ai attribution stats for a single commit.
 *
 * Reads the git note stored under `refs/notes/ai` for the given SHA.
 * Returns `null` if git-ai is not installed, the commit has no notes,
 * or the note cannot be parsed.
 *
 * @param repoRoot - Absolute path to the git repository root.
 * @param sha      - Commit SHA to read attribution for.
 * @returns Parsed attribution stats, or `null` if unavailable.
 */
export function readGitAiCommitStats(repoRoot: string, sha: string): GitAiCommitStats | null {
  try {
    const raw = execSync(`git notes --ref=ai show ${sha} 2>/dev/null || true`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();

    if (raw.length === 0) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      additions: { human: number; ai: number };
      accepted?: { ai: number };
      breakdown?: Record<string, { additions: number; accepted: number }>;
    };

    const humanAdditions = parsed.additions.human;
    const aiAdditions = parsed.additions.ai;
    const aiAccepted = parsed.accepted?.ai ?? aiAdditions;
    const totalAdded = humanAdditions + aiAdditions;

    return {
      sha,
      humanAdditions,
      aiAdditions,
      aiAccepted,
      totalAdded,
      aiPercentage: totalAdded > 0 ? (aiAdditions / totalAdded) * 100 : 0,
      toolModelBreakdown: Object.fromEntries(
        Object.entries(parsed.breakdown ?? {}).map(([key, val]) => [
          key,
          { aiAdditions: val.additions, aiAccepted: val.accepted }
        ])
      )
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Aggregation
// =============================================================================

/**
 * Aggregate git-ai attribution stats across multiple commits.
 *
 * Reads git-ai notes for each commit SHA and computes period-level
 * totals and tool/model breakdowns.
 *
 * @param repoRoot - Absolute path to the git repository root.
 * @param commits  - Array of commit SHAs to aggregate over.
 * @returns Period-level attribution stats.
 */
export function aggregateGitAiStats(repoRoot: string, commits: string[]): GitAiPeriodStats {
  const stats: GitAiCommitStats[] = [];

  for (const sha of commits) {
    const s = readGitAiCommitStats(repoRoot, sha);
    if (s !== null) {
      stats.push(s);
    }
  }

  const totalHuman = stats.reduce((sum, s) => sum + s.humanAdditions, 0);
  const totalAi = stats.reduce((sum, s) => sum + s.aiAdditions, 0);
  const totalAccepted = stats.reduce((sum, s) => sum + s.aiAccepted, 0);
  const totalAdded = totalHuman + totalAi;

  // Aggregate by tool/model
  const byTool: Record<string, { aiAdditions: number; aiPercentage: number }> = {};
  for (const s of stats) {
    for (const [tool, data] of Object.entries(s.toolModelBreakdown)) {
      const existing = byTool[tool] ?? { aiAdditions: 0, aiPercentage: 0 };
      existing.aiAdditions += data.aiAdditions;
      byTool[tool] = existing;
    }
  }
  for (const data of Object.values(byTool)) {
    data.aiPercentage = totalAdded > 0 ? (data.aiAdditions / totalAdded) * 100 : 0;
  }

  return {
    periodStart: new Date(),
    periodEnd: new Date(),
    commitCount: stats.length,
    totalHumanAdditions: totalHuman,
    totalAiAdditions: totalAi,
    totalAiAccepted: totalAccepted,
    overallAiPercentage: totalAdded > 0 ? (totalAi / totalAdded) * 100 : 0,
    byTool
  };
}
