/**
 * UI module — barrel export.
 *
 * Exports status bar and dashboard formatters for terminal UI display
 * of tokenomics data.
 *
 * @module ui/index
 */

export type {
  DailyDataPoint,
  DashboardData,
  FrustrationHeatmapEntry
} from './dashboard.js';
export { formatDashboard } from './dashboard.js';
export type { StatusBarState } from './status-bar.js';
export { formatCacheEfficiency, formatStatusBar, frustrationEmoji } from './status-bar.js';
