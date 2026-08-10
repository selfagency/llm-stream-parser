/**
 * Session status bar widget for the tokenomics system.
 *
 * Renders a compact one-line status bar showing session cost, commit
 * count, frustration score, and cache efficiency. Designed for use in
 * terminal UIs, VS Code status bars, and inline session summaries.
 *
 * @module ui/status-bar
 */

// =============================================================================
// Types
// =============================================================================

/**
 * State required to render the status bar.
 */
export interface StatusBarState {
  /** Cache efficiency ratio (0–1). */
  cacheEfficiency: number;
  /** Number of commits made during the session. */
  commitCount: number;
  /** Frustration score (0–1). */
  frustrationScore: number;
  /** Accumulated session cost in USD. */
  sessionCost: number;
}

// =============================================================================
// Emoji helpers
// =============================================================================

/**
 * Select a frustration emoji based on the score threshold.
 *
 * - ✅ green (score < 0.3)
 * - 😤 yellow/red (0.3 <= score < 0.6)
 * - 🔥 red (score >= 0.6)
 */
export function frustrationEmoji(score: number): string {
  if (score >= 0.6) {
    return '\u{1F525}'; // 🔥
  }
  if (score >= 0.3) {
    return '\u{1F624}'; // 😤
  }
  return '\u2705'; // ✅
}

/**
 * Format a cache efficiency ratio as a human-friendly percentage string.
 */
export function formatCacheEfficiency(eff: number): string {
  const pct = Math.round(eff * 100);
  return `${pct}%`;
}

// =============================================================================
// Status bar formatter
// =============================================================================

/**
 * Format a compact one-line session status bar.
 *
 * Output format:
 *   Session: $0.43 · 3 commits · 😤 12% · cache 71%
 *
 * @param state - Current status bar state.
 * @returns A single-line formatted status string.
 */
export function formatStatusBar(state: StatusBarState): string {
  const cost = `$${state.sessionCost.toFixed(2)}`;
  const commits = `${state.commitCount} commit${state.commitCount === 1 ? '' : 's'}`;
  const frustPct = Math.round(state.frustrationScore * 100);
  const frustEmoji = frustrationEmoji(state.frustrationScore);
  const cache = formatCacheEfficiency(state.cacheEfficiency);

  return `Session: ${cost} \u00B7 ${commits} \u00B7 ${frustEmoji} ${frustPct}% \u00B7 cache ${cache}`;
}
