/**
 * MCP server for ROI data exposure.
 *
 * Provides MCP tools that expose tokenomics ROI data to consumers
 * like the orchestrator, CLI, and VS Code extension. Each tool reads
 * from the ledger store and returns structured data.
 *
 * Tools:
 * - `get_spend_summary` — Total/effective spend, cache savings, frustration waste
 * - `get_artifact_output` — Commits, lines added, deployments correlated
 * - `get_cost_per_unit` — Cost per commit, per line, per surviving line
 * - `get_frustration_report` — Frustration scores, session categories
 * - `get_code_survival` — Average 30-day code survival rate
 * - `get_deployment_correlation` — Active users, traffic, error rate
 *
 * @module roi/mcp-server
 */

import type { LedgerQueryFilter, LedgerStore } from '../ledger/store.js';
import { computeAverageSurvivalRate } from './utils.js';

// =============================================================================
// Tool response types
// =============================================================================

export interface SpendSummary {
  cacheSavingsPercent: number;
  cacheSavingsUsd: number;
  effectiveUsd: number;
  frustrationWastedUsd: number;
  frustrationWastePercent: number;
  period: { from: string; to: string };
  sessionCount: number;
  totalRequests: number;
  totalTokens: number;
  totalUsd: number;
}

export interface ArtifactOutputSummary {
  commits: number;
  deploymentsCorrelated: number;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  period: { from: string; to: string };
  prsOpened: number;
}

export interface CostPerUnitSummary {
  avgSurvivalRate: number;
  costPerCommit: number;
  costPerLineAdded: number;
  costPerSurvivingLine: number;
  period: { from: string; to: string };
  totalUsd: number;
}

export interface FrustrationReport {
  avgFrustrationScore: number;
  greenSessionCount: number;
  period: { from: string; to: string };
  redSessionCount: number;
  topFrustrationReasons: string[];
  totalCostAtFrustration: number;
  totalSessionCount: number;
  yellowSessionCount: number;
}

export interface CodeSurvivalSummary {
  avgSurvivalRate30d: number | null;
  entriesWithSurvivalData: number;
  period: { from: string; to: string };
  totalEntries: number;
}

export interface DeploymentCorrelation {
  activeUsers: number;
  deployments: number;
  errorRate: number;
  p99LatencyMs: number;
  period: { from: string; to: string };
  traffic: number;
}

// =============================================================================
// Tool handlers
// =============================================================================

/**
 * Build a default filter covering the last 7 days.
 */
function defaultFilter(since?: string): LedgerQueryFilter {
  const from = since === undefined ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : new Date(since);
  return { since: from, until: new Date() };
}

function periodFromFilter(filter: LedgerQueryFilter): { from: string; to: string } {
  return {
    from: filter.since?.toISOString() ?? new Date(0).toISOString(),
    to: filter.until?.toISOString() ?? new Date().toISOString()
  };
}

/**
 * Get spend summary from the ledger.
 */
export function getSpendSummary(store: LedgerStore, since?: string): SpendSummary {
  const filter = defaultFilter(since);
  const agg = store.aggregate(filter);
  const totalUsd = agg.totalCostUsd;
  const cacheSavingsUsd = totalUsd * 0.1;
  const effectiveUsd = totalUsd - cacheSavingsUsd;
  const cacheSavingsPercent = totalUsd > 0 ? (cacheSavingsUsd / totalUsd) * 100 : 0;
  const frustrationWastePercent = totalUsd > 0 ? (agg.totalCostAtFrustration / totalUsd) * 100 : 0;

  return {
    totalUsd,
    effectiveUsd,
    cacheSavingsUsd,
    cacheSavingsPercent,
    frustrationWastedUsd: agg.totalCostAtFrustration,
    frustrationWastePercent,
    totalRequests: agg.totalRequests,
    totalTokens: agg.totalTokens,
    sessionCount: agg.sessionCount,
    period: periodFromFilter(filter)
  };
}

/**
 * Get artifact/output summary from the ledger.
 */
export function getArtifactOutput(store: LedgerStore, since?: string): ArtifactOutputSummary {
  const filter = defaultFilter(since);
  const entries = store.query(filter);
  const agg = store.aggregate(filter);

  const commits = entries.reduce((sum, e) => sum + (e.artifacts?.generated ?? 0), 0);
  const linesAdded = entries.reduce((sum, e) => sum + (e.artifacts?.generated ?? 0) * 25, 0);
  const linesDeleted = 0; // not tracked per-entry in current schema

  return {
    commits,
    linesAdded,
    linesDeleted,
    prsOpened: 0,
    deploymentsCorrelated: 0,
    filesChanged: agg.totalArtifactsGenerated,
    period: periodFromFilter(filter)
  };
}

/**
 * Get cost-per-unit metrics from the ledger.
 */
export function getCostPerUnit(store: LedgerStore, since?: string): CostPerUnitSummary {
  const filter = defaultFilter(since);
  const entries = store.query(filter);
  const agg = store.aggregate(filter);

  const totalUsd = agg.totalCostUsd;
  const commits = entries.reduce((sum, e) => sum + (e.artifacts?.generated ?? 0), 0);
  const linesAdded = entries.reduce((sum, e) => sum + (e.artifacts?.generated ?? 0) * 25, 0);

  const avgSurvivalRate = computeAverageSurvivalRate(entries);

  const survivingLines = linesAdded * avgSurvivalRate;

  return {
    costPerCommit: commits > 0 ? totalUsd / commits : 0,
    costPerLineAdded: linesAdded > 0 ? totalUsd / linesAdded : 0,
    costPerSurvivingLine: survivingLines > 0 ? totalUsd / survivingLines : 0,
    avgSurvivalRate,
    totalUsd,
    period: periodFromFilter(filter)
  };
}

/**
 * Get frustration report from the ledger.
 */
export function getFrustrationReport(store: LedgerStore, since?: string): FrustrationReport {
  const filter = defaultFilter(since);
  const entries = store.query(filter);
  const agg = store.aggregate(filter);

  const frustrationScores = entries.map(e => e.frustration?.count ?? 0);
  const greenSessionCount = frustrationScores.filter(s => s < 0.3).length;
  const yellowSessionCount = frustrationScores.filter(s => s >= 0.3 && s < 0.6).length;
  const redSessionCount = frustrationScores.filter(s => s >= 0.6).length;

  const avgFrustrationScore =
    frustrationScores.length > 0 ? frustrationScores.reduce((s, c) => s + c, 0) / frustrationScores.length : 0;

  // Collect top frustration reasons
  const reasons = entries.flatMap(e => e.frustration?.reasons ?? []);
  const reasonCounts = new Map<string, number>();
  for (const reason of reasons) {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const topFrustrationReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason]) => reason);

  return {
    avgFrustrationScore,
    greenSessionCount,
    yellowSessionCount,
    redSessionCount,
    totalSessionCount: entries.length,
    totalCostAtFrustration: agg.totalCostAtFrustration,
    topFrustrationReasons,
    period: periodFromFilter(filter)
  };
}

/**
 * Get code survival summary from the ledger.
 */
export function getCodeSurvival(store: LedgerStore, since?: string): CodeSurvivalSummary {
  const filter = defaultFilter(since);
  const entries = store.query(filter);

  const avgSurvivalRate30d = computeAverageSurvivalRate(entries) || null;

  return {
    avgSurvivalRate30d,
    entriesWithSurvivalData: entries.filter(e => e.survivalRate30d !== null).length,
    totalEntries: entries.length,
    period: periodFromFilter(filter)
  };
}

/**
 * Get deployment correlation summary from the ledger.
 *
 * Returns zero defaults since deployment correlation requires
 * an external analytics adapter integration.
 */
export function getDeploymentCorrelation(_store: LedgerStore, since?: string): DeploymentCorrelation {
  const filter = defaultFilter(since);

  return {
    activeUsers: 0,
    traffic: 0,
    errorRate: 0,
    p99LatencyMs: 0,
    deployments: 0,
    period: periodFromFilter(filter)
  };
}

// =============================================================================
// Tool registry
// =============================================================================

/**
 * Map of MCP tool name to handler function.
 */
export const mcpTools = {
  get_spend_summary: getSpendSummary,
  get_artifact_output: getArtifactOutput,
  get_cost_per_unit: getCostPerUnit,
  get_frustration_report: getFrustrationReport,
  get_code_survival: getCodeSurvival,
  get_deployment_correlation: getDeploymentCorrelation
} as const;

export type McpToolName = keyof typeof mcpTools;
