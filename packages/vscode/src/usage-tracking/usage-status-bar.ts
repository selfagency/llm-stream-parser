import type { UsageQuota, UsageStatusBarConfig } from '../types/errors.js';

const DEFAULT_REFRESH_INTERVAL = 60_000;
const DEFAULT_TOOLTIP = '{{used}} / {{total}} {{unit}} used ({{percent}}%)';
const DEFAULT_WARNING_THRESHOLD = 0.8;
const DEFAULT_ERROR_THRESHOLD = 0.95;

/**
 * Displays quota usage in the VS Code status bar with configurable thresholds.
 * Uses dynamic import to gracefully degrade when VS Code is unavailable.
 */
export class UsageStatusBar {
  // Use unknown to avoid type compatibility issues with VS Code's StatusBarItem
  private statusBarItem: unknown = undefined;
  private readonly config: UsageStatusBarConfig;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposables: { dispose(): void }[] = [];

  constructor(config: UsageStatusBarConfig) {
    this.config = config;
  }

  /**
   * Initialize and show the status bar item.
   * No-op if VS Code is unavailable.
   */
  async show(): Promise<void> {
    try {
      const vscode = await import('vscode');
      const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      if (!item) {
        return;
      }
      this.statusBarItem = item;
      if (this.config.onClickRefresh) {
        const itemWithCommand = item as unknown as { command: string };
        itemWithCommand.command = 'agentsy.refreshUsage';
      }
      this.disposables.push(item);
      await this.refresh();
      item.show();
      this.startAutoRefresh();
    } catch {
      // VS Code not available
    }
  }

  /**
   * Refresh quota from data source and update display.
   */
  async refresh(): Promise<UsageQuota | undefined> {
    try {
      const quota = await this.config.quotaDataSource.refreshQuota();
      this.updateDisplay(quota);
      return quota;
    } catch {
      return;
    }
  }

  /**
   * Set the status bar item color based on quota usage thresholds.
   */
  private setStatusColor(item: Record<string, unknown>, percentUsed: number): void {
    const { colorScheme } = this.config;
    if (!colorScheme) {
      return;
    }
    const warning = this.config.warningThreshold ?? DEFAULT_WARNING_THRESHOLD;
    const error = this.config.errorThreshold ?? DEFAULT_ERROR_THRESHOLD;
    const status = getQuotaStatus(percentUsed, warning, error);
    switch (status) {
      case 'error':
        item.color = colorScheme.error;
        break;
      case 'warning':
        item.color = colorScheme.warning;
        break;
      case 'normal':
        item.color = colorScheme.normal;
        break;
    }
  }

  /**
   * Update the status bar display for a given quota.
   */
  updateDisplay(quota: UsageQuota): void {
    if (!this.statusBarItem) {
      return;
    }

    const item = this.statusBarItem as Record<string, unknown>;
    const percent = Math.round(quota.percentUsed * 100);

    const text = `$(pulse) ${this.config.displayName}: ${quota.used.toLocaleString()} / ${quota.total.toLocaleString()} ${quota.unit}`;
    item.text = text;

    const template = this.config.tooltipTemplate ?? DEFAULT_TOOLTIP;
    item.tooltip = template
      .replace('{{used}}', quota.used.toLocaleString())
      .replace('{{total}}', quota.total.toLocaleString())
      .replace('{{unit}}', quota.unit)
      .replace('{{percent}}', String(percent));

    this.setStatusColor(item, quota.percentUsed);
  }

  /**
   * Hide the status bar item.
   */
  hide(): void {
    if (this.statusBarItem) {
      const item = this.statusBarItem as Record<string, unknown>;
      const hide = item.hide as (() => void) | undefined;
      hide?.();
    }
  }

  dispose(): void {
    this.stopAutoRefresh();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.config.quotaDataSource.dispose?.();
  }

  private startAutoRefresh(): void {
    const interval = this.config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL;
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => {
        // Refresh errors are handled internally
      });
    }, interval);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}

/**
 * Format quota percentage as a short string for status bar display.
 */
export function formatQuotaText(quota: UsageQuota): string {
  const percent = Math.round(quota.percentUsed * 100);
  return `${quota.used.toLocaleString()} / ${quota.total.toLocaleString()} ${quota.unit} (${percent}%)`;
}

/**
 * Determine the status level based on percentage thresholds.
 */
export function getQuotaStatus(
  percentUsed: number,
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  errorThreshold = DEFAULT_ERROR_THRESHOLD
): 'normal' | 'warning' | 'error' {
  if (percentUsed >= errorThreshold) {
    return 'error';
  }
  if (percentUsed >= warningThreshold) {
    return 'warning';
  }
  return 'normal';
}
