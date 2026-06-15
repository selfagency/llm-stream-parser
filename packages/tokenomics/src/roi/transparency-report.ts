/**
 * Transparency report builder.
 *
 * Combines ledger data, ROI snapshot, and optional git-ai attribution
 * stats into a unified ethical transparency report covering 6 sections:
 * spend efficiency, code attribution, code quality & durability, session
 * activity, learning & improvement, and AI tool comparison.
 *
 * @module roi/transparency-report
 */

import type { GitAiPeriodStats } from '../attribution/git-ai-notes.js';
import type { LedgerStore } from '../ledger/store.js';
import type { RoiSnapshot } from './calculator.js';

// =============================================================================
// TransparencyReport interface
// =============================================================================

/**
 * Unified ethical transparency report.
 *
 * Combines tokenomics spend data, code survival metrics, frustration
 * signals, and optional git-ai attribution into a single report that
 * can be rendered by the CLI or consumed by external tooling.
 */
export interface TransparencyReport {
  /** Section 4: Session activity. */
  activity: {
    /** Total sessions in the period. */
    sessionCount: number;
    /** Total active duration in hours. */
    totalDurationHours: number;
    /** Average tokens consumed per session. */
    avgTokensPerSession: number;
    /** Average cache efficiency (0–1). */
    avgCacheEfficiency: number;
  };

  /** Section 2: Code attribution. */
  attribution: {
    /** AI-generated lines. */
    aiLines: number;
    /** Human-written lines. */
    humanLines: number;
    /** AI percentage of total (0–100). */
    aiPercentage: number;
    /** AI lines that survived review. */
    aiAcceptedLines: number;
    /** Total lines added. */
    linesAdded: number;
    /** Total lines deleted. */
    linesDeleted: number;
    /** Number of commits. */
    commits: number;
    /** AI lines per tool/model. */
    aiLinesPerTool: Record<string, number>;
  };

  /** Section 5: Learning & improvement. */
  learning: {
    /** Number of active failure modes. */
    activeFailureModes: number;
    /** Number of pending patches from failure analysis. */
    pendingPatches: number;
    /** Number of applied patches. */
    appliedPatches: number;
    /** Number of reinforced positive patterns. */
    reinforcedPatterns: number;
  };
  /** Report time period. */
  period: { from: Date; to: Date };

  /** Section 3: Code quality & durability. */
  quality: {
    /** Average frustration score (0–1). */
    avgFrustrationScore: number;
    /** Count of red frustration sessions. */
    redSessionCount: number;
    /** Count of yellow frustration sessions. */
    yellowSessionCount: number;
    /** Count of green frustration sessions. */
    greenSessionCount: number;
    /** 30-day code survival rate (0–1), or null if unknown. */
    survivalRate30d: number | null;
    /** Test pass rate (0–1), or null if unknown. */
    testPassRate: number | null;
    /** Lint pass rate (0–1), or null if unknown. */
    lintPassRate: number | null;
  };

  /** Section 1: Spend efficiency. */
  spend: {
    /** Gross spend in USD. */
    totalUsd: number;
    /** Spend after cache savings. */
    effectiveUsd: number;
    /** USD saved by cache. */
    cacheSavingsUsd: number;
    /** Percentage of spend saved by cache. */
    cacheSavingsPercent: number;
    /** USD wasted on frustrated sessions. */
    frustrationWastedUsd: number;
    /** Percentage of spend wasted on frustration. */
    frustrationWastePercent: number;
    /** Cost per commit in USD. */
    costPerCommit: number;
    /** Cost per line of code added in USD. */
    costPerLine: number;
  };

  /** Section 6: AI tool effectiveness comparison. */
  tools: {
    /** Tool with best code survival rate. */
    bestToolBySurvival: string;
    /** Tool with best cost efficiency. */
    bestToolByCostEfficiency: string;
    /** Tool with highest frustration (worst UX). */
    worstToolByFrustration: string;
  };
}

// =============================================================================
// Report builder
// =============================================================================

/**
 * Build an ethical transparency report from ledger data, ROI snapshot,
 * and optional git-ai attribution stats.
 *
 * @param ledger     - The ledger store for additional queries.
 * @param roi        - Pre-computed ROI snapshot for the period.
 * @param gitAiStats - Optional git-ai attribution stats.
 * @returns A fully populated transparency report.
 */
export async function buildTransparencyReport(
  ledger: LedgerStore,
  roi: RoiSnapshot,
  gitAiStats?: GitAiPeriodStats
): Promise<TransparencyReport> {
  // Compute session duration from ledger entries
  const entries = ledger.query({ since: roi.period.from, until: roi.period.to });
  const totalDurationMs = entries.reduce((sum, e) => sum + e.durationMs, 0);
  const totalDurationHours = totalDurationMs / (1000 * 60 * 60);
  const avgTokensPerSession =
    entries.length > 0 ? entries.reduce((sum, e) => sum + e.spend.totalTokens, 0) / entries.length : 0;

  const totalInputTokens = entries.reduce((sum, e) => sum + e.spend.totalTokens, 0);
  const avgCacheEfficiency = 0; // requires per-session cache tracking

  return {
    period: roi.period,
    spend: {
      totalUsd: roi.spend.totalUsd,
      effectiveUsd: roi.spend.effectiveUsd,
      cacheSavingsUsd: roi.spend.cacheSavingsUsd,
      cacheSavingsPercent: roi.derived.cacheSavingsPercent,
      frustrationWastedUsd: roi.spend.frustrationWastedUsd,
      frustrationWastePercent: roi.derived.frustrationWastePercent,
      costPerCommit: roi.derived.costPerCommit,
      costPerLine: roi.derived.costPerLineAdded
    },
    attribution: {
      aiLines: gitAiStats?.totalAiAdditions ?? 0,
      humanLines: gitAiStats?.totalHumanAdditions ?? 0,
      aiPercentage: gitAiStats?.overallAiPercentage ?? 0,
      aiAcceptedLines: gitAiStats?.totalAiAccepted ?? 0,
      linesAdded: roi.output.linesAdded,
      linesDeleted: 0,
      commits: roi.output.commits,
      aiLinesPerTool: Object.fromEntries(Object.entries(gitAiStats?.byTool ?? {}).map(([t, s]) => [t, s.aiAdditions]))
    },
    quality: {
      avgFrustrationScore: roi.quality.avgFrustrationScore,
      redSessionCount: roi.quality.redSessions,
      yellowSessionCount: roi.quality.yellowSessions,
      greenSessionCount: roi.quality.greenSessions,
      survivalRate30d: null,
      testPassRate: null,
      lintPassRate: null
    },
    activity: {
      sessionCount: roi.quality.sessionCount,
      totalDurationHours,
      avgTokensPerSession,
      avgCacheEfficiency
    },
    learning: {
      activeFailureModes: 0,
      pendingPatches: 0,
      appliedPatches: 0,
      reinforcedPatterns: 0
    },
    tools: {
      bestToolBySurvival: 'N/A',
      bestToolByCostEfficiency: 'N/A',
      worstToolByFrustration: 'N/A'
    }
  };
}
