/**
 * Dashboard panel for the tokenomics system.
 *
 * Renders a text-based dashboard for terminal UI (TUI) display,
 * showing daily spend, daily commits, cost-per-commit trends,
 * frustration heatmap, and pending patches.
 *
 * @module ui/dashboard
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A single data point in a daily spend or commit series.
 */
export interface DailyDataPoint {
  /** ISO date string (e.g. "2026-06-15"). */
  date: string;
  /** Numeric value (USD or count). */
  value: number;
}

/**
 * A single entry in the frustration heatmap.
 */
export interface FrustrationHeatmapEntry {
  /** ISO date string. */
  date: string;
  /** Average frustration score for that day (0–1). */
  score: number;
  /** Number of sessions contributing to this entry. */
  sessionCount: number;
}

/**
 * Data required to render the dashboard.
 */
export interface DashboardData {
  /** Cost-per-commit trend (array of {date, value} where value is USD). */
  costPerCommitTrend: DailyDataPoint[];
  /** Daily commit count series. */
  dailyCommits: DailyDataPoint[];
  /** Daily spend series in USD. */
  dailySpend: DailyDataPoint[];
  /** Frustration heatmap entries. */
  frustrationHeatmap: FrustrationHeatmapEntry[];
  /** Number of pending patches awaiting review. */
  pendingPatches: number;
  /** Human-readable period label (e.g. "Last 7 days", "Last 30 days"). */
  period: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a USD value for display.
 */
function formatUsd(value: number): string {
  if (value >= 100) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }
  return `$${value.toFixed(4)}`;
}

/**
 * Format a frustration score as a colored bar segment.
 *
 * Returns a visual bar using block characters:
 * - █ = high frustration (score >= 0.6)
 * - ▓ = medium frustration (0.3 <= score < 0.6)
 * - ░ = low frustration (score < 0.3)
 */
function frustrationBar(score: number, width = 10): string {
  const filled = Math.round(score * width);
  const high = Math.min(filled, Math.round(0.6 * width));
  const med = Math.max(0, filled - high);
  const low = width - high - med;

  return (
    '\u2588'.repeat(high) + // █
    '\u2593'.repeat(med) + // ▓
    '\u2591'.repeat(low) // ░
  );
}

/**
 * Format a simple ASCII bar chart for a series of values.
 */
function asciiBarChart(
  data: DailyDataPoint[],
  label: string,
  formatValue: (v: number) => string,
  width = 50
): string[] {
  if (data.length === 0) {
    return [`  ${label}: (no data)`];
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const lines: string[] = [`  ${label}:`];

  for (const point of data) {
    const barLen = Math.max(1, Math.round((point.value / maxVal) * width));
    const bar = '\u2588'.repeat(barLen);
    lines.push(`    ${point.date}  ${bar}  ${formatValue(point.value)}`);
  }

  return lines;
}

// =============================================================================
// Dashboard formatter
// =============================================================================

/**
 * Format a text-based tokenomics dashboard for TUI display.
 *
 * Renders sections for daily spend, daily commits, cost-per-commit
 * trend, frustration heatmap, and pending patches.
 *
 * @param data - Dashboard data to render.
 * @returns A multi-line formatted dashboard string.
 */
export function formatDashboard(data: DashboardData): string {
  const lines: string[] = [
    '\u2550'.repeat(60),
    `  Tokenomics Dashboard \u2014 ${data.period}`,
    '\u2550'.repeat(60),
    ''
  ];

  // ── Daily spend ──────────────────────────────────────────────
  lines.push(
    '\u2500 Daily Spend \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
  );
  lines.push(...asciiBarChart(data.dailySpend, 'Spend (USD)', formatUsd));
  lines.push('');

  // ── Daily commits ─────────────────────────────────────────────
  lines.push(
    '\u2500 Daily Commits \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
  );
  lines.push(...asciiBarChart(data.dailyCommits, 'Commits', String));
  lines.push('');

  // ── Cost per commit trend ─────────────────────────────────────
  lines.push(
    '\u2500 Cost per Commit Trend \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
  );
  lines.push(...asciiBarChart(data.costPerCommitTrend, 'Cost/commit', formatUsd));
  lines.push('');

  // ── Frustration heatmap ───────────────────────────────────────
  lines.push(
    '\u2500 Frustration Heatmap \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
  );

  if (data.frustrationHeatmap.length === 0) {
    lines.push('  (no frustration data)');
  } else {
    for (const entry of data.frustrationHeatmap) {
      const bar = frustrationBar(entry.score);
      const pct = Math.round(entry.score * 100);
      const sessions = `${entry.sessionCount} session${entry.sessionCount === 1 ? '' : 's'}`;
      lines.push(`    ${entry.date}  ${bar}  ${pct}% (${sessions})`);
    }
  }

  lines.push('');

  // ── Pending patches ───────────────────────────────────────────
  lines.push(
    '\u2500 Learning Loop \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
  );
  lines.push(`  Patches pending review:  ${data.pendingPatches}`);
  lines.push('');

  lines.push('\u2550'.repeat(60));

  return lines.join('\n');
}
