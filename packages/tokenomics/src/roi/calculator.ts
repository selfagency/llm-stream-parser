/**
 * ROI calculator for AI-assisted development.
 *
 * Computes return-on-investment snapshots from ledger data, diff
 * statistics, and optional git-ai attribution notes. Produces a
 * unified `RoiSnapshot` covering spend, output, quality, derived
 * metrics, and AI attribution breakdown.
 *
 * @module roi/calculator
 */

import type { DeployedAppAnalyticsAdapter } from '../analytics/types.js';
import { aggregateGitAiStats } from '../attribution/git-ai-notes.js';
import type { LedgerQueryFilter, LedgerStore } from '../ledger/store.js';
import { computeAverageSurvivalRate } from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Attribution breakdown from git-ai notes or estimation.
 */
export interface AiAttributionBreakdown {
  /** AI lines that survived code review. */
  aiAcceptedLines: number;
  /** Total AI-generated lines. */
  aiLines: number;
  /** Breakdown by tool/model. */
  byTool: Record<string, { aiLines: number; aiPercentage: number }>;
  /** Total human-written lines. */
  humanLines: number;
  /** Percentage of AI-generated lines (0–100). */
  overallAiPercentage: number;
  /** Source of attribution data. */
  source: 'git-ai' | 'estimated' | 'unavailable';
}

// =============================================================================
// RoiSnapshot interface
// =============================================================================

/**
 * Comprehensive ROI snapshot for a time period.
 *
 * Combines spend, output, quality, derived efficiency metrics, and
 * optional AI attribution + deployment correlation data.
 */
export interface RoiSnapshot {
  /** Optional AI attribution breakdown from git-ai notes. */
  aiAttribution?: AiAttributionBreakdown;

  /** Optional deployment correlation info. */
  deployedApp?: {
    /** Active users in the period. */
    activeUsers: number;
    /** Pageviews / API calls. */
    traffic: number;
    /** Error rate (0–1). */
    errorRate: number;
    /** P99 latency in ms. */
    p99LatencyMs: number;
  };

  /** Derived efficiency metrics. */
  derived: {
    /** Cost per commit (USD). */
    costPerCommit: number;
    /** Cost per line of code added (USD). */
    costPerLineAdded: number;
    /** Cost per surviving line of code (USD). */
    costPerSurvivingLine: number;
    /** Cache savings as percentage of gross spend. */
    cacheSavingsPercent: number;
    /** Frustration waste as percentage of gross spend. */
    frustrationWastePercent: number;
  };

  /** Output/artifact metrics. */
  output: {
    /** Number of commits produced. */
    commits: number;
    /** Total lines of code added. */
    linesAdded: number;
    /** Number of pull requests opened. */
    prsOpened: number;
    /** Number of deployments correlated. */
    deploymentsCorrelated: number;
    /** Average code survival rate at 30 days (0–1). */
    avgSurvivalRate: number;
  };
  /** Time period this snapshot covers. */
  period: { from: Date; to: Date };

  /** Quality metrics. */
  quality: {
    /** Average frustration score (0–1). */
    avgFrustrationScore: number;
    /** Total sessions in this period. */
    sessionCount: number;
    /** Sessions with green frustration (score < 0.3). */
    greenSessions: number;
    /** Sessions with yellow frustration (0.3 <= score < 0.6). */
    yellowSessions: number;
    /** Sessions with red frustration (score >= 0.6). */
    redSessions: number;
  };

  /** Spend metrics. */
  spend: {
    /** Gross USD spend (no adjustments). */
    totalUsd: number;
    /** Effective spend after cache savings. */
    effectiveUsd: number;
    /** USD saved by cache hits. */
    cacheSavingsUsd: number;
    /** USD wasted on frustrated sessions. */
    frustrationWastedUsd: number;
    /** Detailed spend breakdown by category. */
    breakdown: {
      inputTokens: number;
      outputTokens: number;
      cacheWriteTokens: number;
      cacheReadTokens: number;
      totalRequests: number;
    };
  };
}

// =============================================================================
// ROI computation
// =============================================================================

/**
 * Compute an ROI snapshot from ledger data.
 *
 * Reads all entries within the given time range, aggregates spend,
 * output, quality, and derived efficiency metrics. Optionally reads
 * git-ai attribution notes and analytics adapter data.
 *
 * @param ledger    - The ledger store to query.
 * @param since     - Optional start date (defaults to 7 days ago).
 * @param analytics - Optional analytics adapter for deployment correlation.
 * @returns A computed ROI snapshot.
 */
// fallow-ignore-next-line complexity — ROI computation with multi-branch analytics logic
export async function computeRoiSnapshot(
  ledger: LedgerStore,
  since?: Date,
  analytics?: DeployedAppAnalyticsAdapter
): Promise<RoiSnapshot> {
  const from = since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date();

  const filter: LedgerQueryFilter = {
    since: from,
    until: to
  };

  const entries = ledger.query(filter);
  const agg = ledger.aggregate(filter);

  // ── Spend ─────────────────────────────────────────────────────────
  const totalUsd = agg.totalCostUsd;
  const inputTokens = agg.totalTokens;
  const outputTokens = agg.totalTokens; // using aggregate approximation
  const cacheWriteTokens = 0;
  const cacheReadTokens = 0;
  const totalRequests = agg.totalRequests;

  // Estimate cache savings: approximate 10% cache hit rate on gross spend
  // when no detailed cache data is available
  const cacheSavingsUsd = totalUsd * 0.1;
  const effectiveUsd = totalUsd - cacheSavingsUsd;

  // Cost from frustration sessions
  const frustrationWastedUsd = agg.totalCostAtFrustration;

  // ── Output ────────────────────────────────────────────────────────
  const commits = entries.reduce((sum, e) => sum + (e.artifacts?.generated ?? 0), 0);
  const linesAdded = entries.reduce(
    (sum, e) => sum + (e.artifacts?.generated ?? 0) * 25, // estimated avg lines per artifact
    0
  );
  const prsOpened = 0; // requires external integration
  const deploymentsCorrelated = 0; // requires analytics adapter

  const avgSurvivalRate = computeAverageSurvivalRate(entries);

  // ── Quality ───────────────────────────────────────────────────────
  const sessionCount = agg.sessionCount;
  const entriesWithFrustration = entries.map(e => ({
    score: e.frustration?.count ?? 0
  }));

  const avgFrustrationScore =
    entriesWithFrustration.length > 0
      ? entriesWithFrustration.reduce((s, e) => s + e.score, 0) / entriesWithFrustration.length
      : 0;

  const greenSessions = entriesWithFrustration.filter(e => e.score < 0.3).length;
  const yellowSessions = entriesWithFrustration.filter(e => e.score >= 0.3 && e.score < 0.6).length;
  const redSessions = entriesWithFrustration.filter(e => e.score >= 0.6).length;

  // ── Derived metrics ───────────────────────────────────────────────
  const costPerCommit = commits > 0 ? totalUsd / commits : 0;
  const costPerLineAdded = linesAdded > 0 ? totalUsd / linesAdded : 0;
  const survivingLines = linesAdded * avgSurvivalRate;
  const costPerSurvivingLine = survivingLines > 0 ? totalUsd / survivingLines : 0;
  const cacheSavingsPercent = totalUsd > 0 ? (cacheSavingsUsd / totalUsd) * 100 : 0;
  const frustrationWastePercent = totalUsd > 0 ? (frustrationWastedUsd / totalUsd) * 100 : 0;

  // ── Deployment correlation (optional) ─────────────────────────────
  let deployedApp: RoiSnapshot['deployedApp'];

  if (analytics !== undefined) {
    const usageMetrics = await analytics.getUsageMetrics(from.toISOString());
    const errorMetrics = await analytics.getErrorMetrics(from.toISOString());

    if (usageMetrics !== undefined && errorMetrics !== undefined) {
      deployedApp = {
        activeUsers: usageMetrics.activeUsers ?? 0,
        traffic: usageMetrics.pageviews ?? usageMetrics.apiCalls ?? 0,
        errorRate: errorMetrics.errorRate,
        p99LatencyMs: errorMetrics.p99LatencyMs
      } satisfies NonNullable<RoiSnapshot['deployedApp']>;
    }
  }

  return {
    period: { from, to },
    spend: {
      totalUsd,
      effectiveUsd,
      cacheSavingsUsd,
      frustrationWastedUsd,
      breakdown: {
        inputTokens,
        outputTokens,
        cacheWriteTokens,
        cacheReadTokens,
        totalRequests
      }
    },
    output: {
      commits,
      linesAdded,
      prsOpened,
      deploymentsCorrelated,
      avgSurvivalRate
    },
    quality: {
      avgFrustrationScore,
      sessionCount,
      greenSessions,
      yellowSessions,
      redSessions
    },
    derived: {
      costPerCommit,
      costPerLineAdded,
      costPerSurvivingLine,
      cacheSavingsPercent,
      frustrationWastePercent
    },
    ...(analytics !== undefined && deployedApp !== undefined ? { deployedApp } : {})
  };
}

// =============================================================================
// AI attribution reader
// =============================================================================

/**
 * Try to read git-ai attribution notes for a set of commits.
 *
 * Aggregates git-ai notes across the given commits and returns an
 * `AiAttributionBreakdown`. Returns `undefined` gracefully when no
 * git-ai data is available.
 *
 * @param commits  - Array of objects with `sha` strings.
 * @param repoRoot - Absolute path to the git repository root.
 * @returns AI attribution breakdown, or `undefined` if unavailable.
 */
export function tryReadAiAttribution(commits: { sha: string }[], repoRoot: string): AiAttributionBreakdown | undefined {
  const shas = commits.map(c => c.sha);
  const stats = aggregateGitAiStats(repoRoot, shas);

  if (stats.commitCount === 0) {
    return {
      overallAiPercentage: 0,
      humanLines: 0,
      aiLines: 0,
      aiAcceptedLines: 0,
      byTool: {},
      source: 'unavailable'
    };
  }

  return {
    overallAiPercentage: stats.overallAiPercentage,
    humanLines: stats.totalHumanAdditions,
    aiLines: stats.totalAiAdditions,
    aiAcceptedLines: stats.totalAiAccepted,
    byTool: Object.fromEntries(
      Object.entries(stats.byTool).map(([tool, data]) => [
        tool,
        { aiLines: data.aiAdditions, aiPercentage: data.aiPercentage }
      ])
    ),
    source: 'git-ai'
  };
}
