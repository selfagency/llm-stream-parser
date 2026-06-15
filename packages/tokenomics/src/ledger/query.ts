/**
 * High-level query API for the session ledger.
 *
 * Wraps the low-level `LedgerStore` with typed filter and aggregate
 * interfaces.  Aggregate fields that are not yet stored in the schema
 * (`totalCommits`, `totalLinesAdded`) return 0 as placeholders for
 * future enrichment.
 */

import type { LedgerAggregateRow, LedgerQueryFilter, LedgerStore } from './store.js';

// =============================================================================
// Re-export the low-level filter for convenience
// =============================================================================

export type { LedgerQueryFilter as LedgerFilter } from './store.js';

// =============================================================================
// Aggregate — richer than the raw store aggregate
// =============================================================================

/**
 * Aggregated metrics over a set of ledger entries.
 *
 * `totalCommits` and `totalLinesAdded` are placeholders (return 0)
 * until commit/line tracking is added to the session schema.
 */
export interface LedgerAggregate {
  /** Average frustration count across matched sessions. */
  avgFrustrationScore: number;
  /** Average cache efficiency: cached / (cached + generated). */
  cacheEfficiencyAvg: number;
  /** ISO-8601 period label (e.g. "2026-W24", "2026-06"). */
  period: string;
  /** Number of sessions in the aggregate. */
  sessionCount: number;
  /** Total commits (placeholder — not yet tracked in schema). */
  totalCommits: number;
  /** Total cost of sessions that had at least one frustration signal. */
  totalCostAtFrustration: number;
  /** Total cost across all matched sessions (USD). */
  totalCostUsd: number;
  /** Total lines of code added (placeholder — not yet tracked in schema). */
  totalLinesAdded: number;
}

// =============================================================================
// Period helpers
// =============================================================================

/**
 * Format a date as an ISO week string (e.g. "2026-W24").
 */
export function formatWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Format a date as an ISO month string (e.g. "2026-06").
 */
export function formatMonth(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Format a date as an ISO day string (e.g. "2026-06-15").
 */
export function formatDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// =============================================================================
// Query functions
// =============================================================================

/**
 * Query ledger entries with a typed filter.
 * Delegates directly to `store.query()`.
 */
export function queryLedger(store: LedgerStore, filter?: LedgerQueryFilter) {
  return store.query(filter);
}

/**
 * Compute a `LedgerAggregate` from the store's raw aggregate row.
 *
 * @param store   The ledger store.
 * @param filter  Optional filter to scope the aggregation.
 * @param period  ISO-8601 period label (e.g. "2026-W24", "2026-06").
 */
export function aggregateLedger(
  store: LedgerStore,
  filter: LedgerQueryFilter | undefined,
  period: string
): LedgerAggregate {
  const raw: LedgerAggregateRow = store.aggregate(filter);

  const totalArtifacts = raw.totalArtifactsGenerated + raw.totalArtifactsCached;
  const cacheEfficiencyAvg = totalArtifacts > 0 ? raw.totalArtifactsCached / totalArtifacts : 0;

  return {
    period,
    totalCostUsd: raw.totalCostUsd,
    totalCommits: 0,
    totalLinesAdded: 0,
    avgFrustrationScore: raw.avgFrustrationScore,
    totalCostAtFrustration: raw.totalCostAtFrustration,
    cacheEfficiencyAvg,
    sessionCount: raw.sessionCount
  };
}

/**
 * Aggregate ledger entries grouped by week.
 *
 * @param store  The ledger store.
 * @param since  Start of the range (inclusive).
 * @param until  End of the range (inclusive).
 */
export function aggregateByWeek(store: LedgerStore, since: Date, until: Date): LedgerAggregate[] {
  return aggregateByPeriod(store, since, until, 'week');
}

/**
 * Aggregate ledger entries grouped by month.
 *
 * @param store  The ledger store.
 * @param since  Start of the range (inclusive).
 * @param until  End of the range (inclusive).
 */
export function aggregateByMonth(store: LedgerStore, since: Date, until: Date): LedgerAggregate[] {
  return aggregateByPeriod(store, since, until, 'month');
}

/**
 * Aggregate ledger entries grouped by day.
 *
 * @param store  The ledger store.
 * @param since  Start of the range (inclusive).
 * @param until  End of the range (inclusive).
 */
export function aggregateByDay(store: LedgerStore, since: Date, until: Date): LedgerAggregate[] {
  return aggregateByPeriod(store, since, until, 'day');
}

// =============================================================================
// Internal
// =============================================================================

type PeriodGranularity = 'day' | 'week' | 'month';

function aggregateByPeriod(
  store: LedgerStore,
  since: Date,
  until: Date,
  granularity: PeriodGranularity
): LedgerAggregate[] {
  const entries = store.query({ since, until });

  // Group entries by period key
  const groups = new Map<string, typeof entries>();

  for (const entry of entries) {
    const key = formatPeriodKey(entry.startedAt, granularity);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [entry]);
    } else {
      group.push(entry);
    }
  }

  // Build aggregate per group
  const results: LedgerAggregate[] = [];

  for (const [period, group] of groups) {
    const sessionCount = group.length;
    let totalCostUsd = 0;
    let totalArtifactsGenerated = 0;
    let totalArtifactsCached = 0;
    let totalFrustrationCount = 0;
    let totalCostAtFrustration = 0;

    for (const e of group) {
      totalCostUsd += e.spend.totalCost;
      totalArtifactsGenerated += e.artifacts.generated;
      totalArtifactsCached += e.artifacts.cached;
      totalFrustrationCount += e.frustration.count;
      if (e.frustration.count > 0) {
        totalCostAtFrustration += e.spend.totalCost;
      }
    }

    const totalArtifacts = totalArtifactsGenerated + totalArtifactsCached;
    const cacheEfficiencyAvg = totalArtifacts > 0 ? totalArtifactsCached / totalArtifacts : 0;
    const avgFrustrationScore = sessionCount > 0 ? totalFrustrationCount / sessionCount : 0;

    results.push({
      period,
      totalCostUsd,
      totalCommits: 0,
      totalLinesAdded: 0,
      avgFrustrationScore,
      totalCostAtFrustration,
      cacheEfficiencyAvg,
      sessionCount
    });
  }

  // Sort by period ascending
  results.sort((a, b) => a.period.localeCompare(b.period));

  return results;
}

function formatPeriodKey(date: Date, granularity: PeriodGranularity): string {
  switch (granularity) {
    case 'day': {
      return formatDay(date);
    }
    case 'week': {
      return formatWeek(date);
    }
    case 'month': {
      return formatMonth(date);
    }
    /* c8 ignore next 2 — exhaustive switch */
    default: {
      return formatMonth(date);
    }
  }
}
