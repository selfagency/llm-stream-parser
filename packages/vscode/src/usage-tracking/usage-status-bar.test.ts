import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getQuotaStatus, UsageStatusBar } from './usage-status-bar.js';

function makeColorScheme() {
  return { error: '#ff0000', warning: '#ffa500', normal: '#00ff00' };
}

describe(UsageStatusBar, () => {
  const mockVscode = {
    StatusBarAlignment: { Right: 1 },
    window: {
      createStatusBarItem: vi.fn().mockReturnValue({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn()
      })
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('show initializes status bar item when VS Code available', async () => {
    vi.stubGlobal('vscode', mockVscode);

    const ds = {
      refreshQuota: vi
        .fn()
        .mockResolvedValue({ used: 500, total: 1000, unit: 'tokens', percentUsed: 0.5, window: 'daily' })
    };
    const bar = new UsageStatusBar({
      displayName: 'Test',
      colorScheme: makeColorScheme(),
      quotaDataSource: ds
    });

    await expect(bar.show()).resolves.not.toThrow();
    bar.dispose();
  });

  it('updateDisplay sets tooltip with template', () => {
    vi.stubGlobal('vscode', mockVscode);

    const bar = new UsageStatusBar({
      displayName: 'Test',
      colorScheme: makeColorScheme(),
      quotaDataSource: { refreshQuota: vi.fn() },
      tooltipTemplate: 'Used: {{used}} / {{total}} ({{percent}}%)'
    });

    // Set internal statusBarItem to a mock
    (bar as unknown as { statusBarItem: Record<string, unknown> }).statusBarItem = {
      text: '',
      tooltip: '',
      color: undefined,
      hide: vi.fn()
    };

    bar.updateDisplay({ used: 300, total: 1000, unit: 'tokens', percentUsed: 0.3, window: 'daily' });

    const item = (bar as unknown as { statusBarItem: Record<string, unknown> }).statusBarItem;
    expect(item.tooltip).toContain('300');
    expect(item.tooltip).toContain('1,000');
    expect(item.tooltip).toContain('30%');
  });

  it('updateDisplay sets warning color at threshold', () => {
    vi.stubGlobal('vscode', mockVscode);

    const bar = new UsageStatusBar({
      displayName: 'Test',
      colorScheme: makeColorScheme(),
      quotaDataSource: { refreshQuota: vi.fn() },
      warningThreshold: 0.5,
      errorThreshold: 0.9
    });

    const mockItem = { text: '', tooltip: '', color: undefined, hide: vi.fn() };
    (bar as unknown as { statusBarItem: Record<string, unknown> }).statusBarItem = mockItem;

    bar.updateDisplay({ used: 700, total: 1000, unit: 'tokens', percentUsed: 0.7, window: 'daily' });

    expect(mockItem.color).toBe('#ffa500'); // warning
  });

  it('updateDisplay sets error color at threshold', () => {
    vi.stubGlobal('vscode', mockVscode);

    const bar = new UsageStatusBar({
      displayName: 'Test',
      colorScheme: makeColorScheme(),
      quotaDataSource: { refreshQuota: vi.fn() },
      warningThreshold: 0.5,
      errorThreshold: 0.9
    });

    const mockItem = { text: '', tooltip: '', color: undefined, hide: vi.fn() };
    (bar as unknown as { statusBarItem: Record<string, unknown> }).statusBarItem = mockItem;

    bar.updateDisplay({ used: 950, total: 1000, unit: 'tokens', percentUsed: 0.95, window: 'daily' });

    expect(mockItem.color).toBe('#ff0000'); // error
  });

  it('setStatusColor is no-op without colorScheme', () => {
    vi.stubGlobal('vscode', mockVscode);

    const bar = new UsageStatusBar({
      displayName: 'Test',
      quotaDataSource: { refreshQuota: vi.fn() }
    });

    const mockItem = { text: '', tooltip: '', color: undefined, hide: vi.fn() };
    (bar as unknown as { statusBarItem: Record<string, unknown> }).statusBarItem = mockItem;

    bar.updateDisplay({ used: 950, total: 1000, unit: 'tokens', percentUsed: 0.95, window: 'daily' });

    expect(mockItem.color).toBeUndefined();
  });
});
