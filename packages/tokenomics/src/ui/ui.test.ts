/**
 * Tests for tokenomics UI formatters — status bar and dashboard.
 */

import { describe, expect, it } from 'vitest';
import { type DashboardData, formatDashboard } from './dashboard.js';
import { formatCacheEfficiency, formatStatusBar, frustrationEmoji, type StatusBarState } from './status-bar.js';

// =============================================================================
// Status bar tests
// =============================================================================

describe('frustrationEmoji', () => {
  it('returns ✅ for low frustration (< 0.3)', () => {
    expect(frustrationEmoji(0)).toBe('\u2705');
    expect(frustrationEmoji(0.15)).toBe('\u2705');
    expect(frustrationEmoji(0.29)).toBe('\u2705');
  });

  it('returns 😤 for medium frustration (0.3–0.6)', () => {
    expect(frustrationEmoji(0.3)).toBe('\u{1F624}');
    expect(frustrationEmoji(0.45)).toBe('\u{1F624}');
    expect(frustrationEmoji(0.59)).toBe('\u{1F624}');
  });

  it('returns 🔥 for high frustration (>= 0.6)', () => {
    expect(frustrationEmoji(0.6)).toBe('\u{1F525}');
    expect(frustrationEmoji(0.75)).toBe('\u{1F525}');
    expect(frustrationEmoji(1)).toBe('\u{1F525}');
  });
});

describe('formatCacheEfficiency', () => {
  it('formats as percentage', () => {
    expect(formatCacheEfficiency(0)).toBe('0%');
    expect(formatCacheEfficiency(0.5)).toBe('50%');
    expect(formatCacheEfficiency(0.71)).toBe('71%');
    expect(formatCacheEfficiency(1)).toBe('100%');
  });
});

describe('formatStatusBar', () => {
  it('formats a complete status bar', () => {
    const state: StatusBarState = {
      sessionCost: 0.43,
      commitCount: 3,
      frustrationScore: 0.12,
      cacheEfficiency: 0.71
    };

    const result = formatStatusBar(state);
    expect(result).toContain('Session: $0.43');
    expect(result).toContain('3 commits');
    expect(result).toContain('\u2705'); // low frustration emoji
    expect(result).toContain('12%');
    expect(result).toContain('cache 71%');
  });

  it('uses singular "commit" for 1 commit', () => {
    const state: StatusBarState = {
      sessionCost: 1.0,
      commitCount: 1,
      frustrationScore: 0,
      cacheEfficiency: 0.5
    };

    const result = formatStatusBar(state);
    expect(result).toContain('1 commit');
    expect(result).not.toContain('commits');
  });

  it('shows 🔥 for high frustration', () => {
    const state: StatusBarState = {
      sessionCost: 0,
      commitCount: 0,
      frustrationScore: 0.8,
      cacheEfficiency: 0
    };

    const result = formatStatusBar(state);
    expect(result).toContain('\u{1F525}');
    expect(result).toContain('80%');
  });

  it('shows 😤 for medium frustration', () => {
    const state: StatusBarState = {
      sessionCost: 0,
      commitCount: 0,
      frustrationScore: 0.45,
      cacheEfficiency: 0
    };

    const result = formatStatusBar(state);
    expect(result).toContain('\u{1F624}');
    expect(result).toContain('45%');
  });

  it('handles zero values', () => {
    const state: StatusBarState = {
      sessionCost: 0,
      commitCount: 0,
      frustrationScore: 0,
      cacheEfficiency: 0
    };

    const result = formatStatusBar(state);
    expect(result).toContain('$0.00');
    expect(result).toContain('0 commits');
    expect(result).toContain('0%');
    expect(result).toContain('cache 0%');
  });
});

// =============================================================================
// Dashboard tests
// =============================================================================

describe('formatDashboard', () => {
  const sampleData: DashboardData = {
    period: 'Last 7 days',
    dailySpend: [
      { date: '2026-06-09', value: 1.23 },
      { date: '2026-06-10', value: 0.87 },
      { date: '2026-06-11', value: 2.45 }
    ],
    dailyCommits: [
      { date: '2026-06-09', value: 3 },
      { date: '2026-06-10', value: 5 },
      { date: '2026-06-11', value: 2 }
    ],
    costPerCommitTrend: [
      { date: '2026-06-09', value: 0.41 },
      { date: '2026-06-10', value: 0.17 },
      { date: '2026-06-11', value: 1.23 }
    ],
    frustrationHeatmap: [
      { date: '2026-06-09', score: 0.1, sessionCount: 2 },
      { date: '2026-06-10', score: 0.6, sessionCount: 1 },
      { date: '2026-06-11', score: 0.3, sessionCount: 3 }
    ],
    pendingPatches: 2
  };

  it('renders the period in the header', () => {
    const result = formatDashboard(sampleData);
    expect(result).toContain('Last 7 days');
  });

  it('renders daily spend section', () => {
    const result = formatDashboard(sampleData);
    expect(result).toContain('Daily Spend');
    expect(result).toContain('2026-06-09');
    expect(result).toContain('$1.23');
  });

  it('renders daily commits section', () => {
    const result = formatDashboard(sampleData);
    expect(result).toContain('Daily Commits');
    expect(result).toContain('5');
  });

  it('renders cost per commit trend', () => {
    const result = formatDashboard(sampleData);
    expect(result).toContain('Cost per Commit Trend');
    expect(result).toContain('$0.41');
  });

  it('renders frustration heatmap', () => {
    const result = formatDashboard(sampleData);
    expect(result).toContain('Frustration Heatmap');
    expect(result).toContain('10%');
    expect(result).toContain('60%');
  });

  it('renders pending patches count', () => {
    const result = formatDashboard(sampleData);
    expect(result).toContain('Patches pending review:');
    expect(result).toContain('2');
  });

  it('handles empty data gracefully', () => {
    const emptyData: DashboardData = {
      period: 'Last 7 days',
      dailySpend: [],
      dailyCommits: [],
      costPerCommitTrend: [],
      frustrationHeatmap: [],
      pendingPatches: 0
    };

    const result = formatDashboard(emptyData);
    expect(result).toContain('Last 7 days');
    expect(result).toContain('(no data)');
    expect(result).toContain('(no frustration data)');
    expect(result).toContain('0');
  });
});
