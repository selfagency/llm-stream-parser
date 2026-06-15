/**
 * Tests for ROI calculator, MCP server, git-ai notes reader,
 * git-ai adapter, and transparency report.
 *
 * All git operations are mocked via `vi.mock` to avoid requiring an
 * actual git repository in the test environment. Ledger operations
 * use an in-memory SQLite store.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitGitAiCheckpoint } from '../attribution/git-ai-adapter.js';
import { aggregateGitAiStats, readGitAiCommitStats } from '../attribution/git-ai-notes.js';
import { createSqliteLedgerStore } from '../ledger/store.js';
import type { SessionLedgerEntry } from '../ledger/types.js';
import { computeRoiSnapshot, tryReadAiAttribution } from './calculator.js';
import {
  getArtifactOutput,
  getCodeSurvival,
  getCostPerUnit,
  getDeploymentCorrelation,
  getFrustrationReport,
  getSpendSummary,
  mcpTools
} from './mcp-server.js';
import { buildTransparencyReport } from './transparency-report.js';

// =============================================================================
// Mock execSync for git-dependent functions
// =============================================================================

const mockExecSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execSync: mockExecSync
}));

vi.mock('node:fs', () => ({
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync
}));

// =============================================================================
// Helpers: build ledger entries
// =============================================================================

function makeEntry(overrides: Partial<SessionLedgerEntry> = {}): SessionLedgerEntry {
  const base: SessionLedgerEntry = {
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: 'sess_test',
    agentId: 'test-agent',
    modelId: 'claude-sonnet-4',
    provider: 'anthropic',
    startedAt: new Date(Date.now() - 3_600_000),
    endedAt: new Date(),
    durationMs: 3_600_000,
    spend: { requestCount: 10, totalCost: 0.5, totalTokens: 15_000 },
    artifacts: { cached: 2, generated: 3 },
    quality: { feedbackCount: 1, score: 0.85 },
    frustration: { count: 0.1, reasons: [] },
    survivalRate30d: 0.75,
    tags: ['test']
  };
  return { ...base, ...overrides };
}

// =============================================================================
// git-ai notes reader
// =============================================================================

describe('readGitAiCommitStats', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('reads git-ai stats from git notes ref', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        additions: { human: 100, ai: 50 },
        accepted: { ai: 45 },
        breakdown: {
          'claude-code': { additions: 30, accepted: 28 },
          copilot: { additions: 20, accepted: 17 }
        }
      })
    );

    const result = readGitAiCommitStats('/fake/repo', 'abc123');
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }

    expect(result.sha).toBe('abc123');
    expect(result.humanAdditions).toBe(100);
    expect(result.aiAdditions).toBe(50);
    expect(result.aiAccepted).toBe(45);
    expect(result.totalAdded).toBe(150);
    expect(result.aiPercentage).toBeCloseTo(33.333, 1);
    expect(result.toolModelBreakdown['claude-code']).toEqual({
      aiAdditions: 30,
      aiAccepted: 28
    });
    expect(result.toolModelBreakdown['copilot']).toEqual({
      aiAdditions: 20,
      aiAccepted: 17
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git notes --ref=ai show abc123'),
      expect.objectContaining({ cwd: '/fake/repo' })
    );
  });

  it('returns null when git-ai is not installed (empty output)', () => {
    mockExecSync.mockReturnValue('');
    const result = readGitAiCommitStats('/fake/repo', 'abc123');
    expect(result).toBeNull();
  });

  it('returns null on git command failure', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });
    const result = readGitAiCommitStats('/fake/repo', 'abc123');
    expect(result).toBeNull();
  });

  it('defaults aiAccepted to aiAdditions when accepted field is missing', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        additions: { human: 30, ai: 20 }
      })
    );

    const result = readGitAiCommitStats('/fake/repo', 'abc123');
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.aiAccepted).toBe(20);
    expect(result.toolModelBreakdown).toEqual({});
  });

  it('handles commit with 100% human lines', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        additions: { human: 100, ai: 0 }
      })
    );

    const result = readGitAiCommitStats('/fake/repo', 'abc123');
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.aiPercentage).toBe(0);
    expect(result.humanAdditions).toBe(100);
    expect(result.aiAdditions).toBe(0);
  });

  it('handles commit with 100% AI lines', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        additions: { human: 0, ai: 200 }
      })
    );

    const result = readGitAiCommitStats('/fake/repo', 'abc123');
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    expect(result.aiPercentage).toBe(100);
    expect(result.humanAdditions).toBe(0);
    expect(result.aiAdditions).toBe(200);
  });
});

describe('aggregateGitAiStats', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('aggregates stats across multiple commits', () => {
    // First commit: 100 human, 50 AI
    // Second commit: 30 human, 70 AI
    mockExecSync
      .mockReturnValueOnce(
        JSON.stringify({
          additions: { human: 100, ai: 50 },
          accepted: { ai: 45 },
          breakdown: { 'claude-code': { additions: 50, accepted: 45 } }
        })
      )
      .mockReturnValueOnce(
        JSON.stringify({
          additions: { human: 30, ai: 70 },
          accepted: { ai: 65 },
          breakdown: { copilot: { additions: 70, accepted: 65 } }
        })
      );

    const result = aggregateGitAiStats('/fake/repo', ['abc111', 'abc222']);
    expect(result.commitCount).toBe(2);
    expect(result.totalHumanAdditions).toBe(130);
    expect(result.totalAiAdditions).toBe(120);
    expect(result.totalAiAccepted).toBe(110);
    expect(result.overallAiPercentage).toBeCloseTo(48, 1);
    expect(result.byTool['claude-code']).toBeDefined();
    expect(result.byTool['claude-code']!.aiAdditions).toBe(50);
    expect(result.byTool['copilot']!.aiAdditions).toBe(70);
  });

  it('returns zero stats when no commits have git-ai notes', () => {
    mockExecSync.mockReturnValue('');
    const result = aggregateGitAiStats('/fake/repo', ['abc111', 'abc222']);
    expect(result.commitCount).toBe(0);
    expect(result.totalHumanAdditions).toBe(0);
    expect(result.totalAiAdditions).toBe(0);
    expect(result.overallAiPercentage).toBe(0);
    expect(result.byTool).toEqual({});
  });

  it('handles mixed availability (some commits have notes, some do not)', () => {
    mockExecSync
      .mockReturnValueOnce(
        JSON.stringify({
          additions: { human: 50, ai: 50 },
          accepted: { ai: 48 }
        })
      )
      .mockReturnValueOnce('') // second commit has no notes
      .mockReturnValueOnce(''); // handle potential third call from aggregate
    // The aggregate only reads for commits[0] and commits[1], no more

    const result = aggregateGitAiStats('/fake/repo', ['abc111', 'abc222']);
    expect(result.commitCount).toBe(1);
    expect(result.totalHumanAdditions).toBe(50);
    expect(result.totalAiAdditions).toBe(50);
    expect(result.overallAiPercentage).toBe(50);
  });
});

// =============================================================================
// git-ai adapter
// =============================================================================

describe('emitGitAiCheckpoint', () => {
  beforeEach(() => {
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReset();
    mockMkdirSync.mockReset();
  });

  it('writes git-ai checkpoint JSONL to .git-ai directory', () => {
    mockExistsSync.mockReturnValue(true);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    emitGitAiCheckpoint('/fake/repo', ['src/test.ts'], {
      agent: 'agentsy/coder',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      sessionId: 'sess_abc123',
      costUsd: 0.43,
      cacheEfficiency: 0.71,
      frustrationScore: 0.08,
      durationMs: 120_000,
      tokensUsed: { input: 5000, output: 1000, cacheHit: 2000 }
    });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockWriteFileSync.mock.calls[0] as [string, string, object];
    expect(filePath).toContain('.git-ai/checkpoints.jsonl');
    expect(content).toContain('"version":3');
    expect(content).toContain('"agent":"agentsy/coder"');
    expect(content).toContain('"model":"claude-sonnet-4"');
    expect(content).toContain('"session":"sess_abc123"');
    expect(content).toContain('"cost":0.43');
    expect(content).toContain('"frustration":0.08');
    expect(content).toContain('"files":["src/test.ts"]');
    expect(content.endsWith('\n')).toBe(true);

    expect(consoleLog).toHaveBeenCalled();
    consoleLog.mockRestore();
  });

  it('creates .git-ai directory if it does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    emitGitAiCheckpoint('/fake/repo', ['src/a.ts'], {
      agent: 'agentsy/coder',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      sessionId: 'sess_abc123',
      costUsd: 0.1,
      cacheEfficiency: 0.5,
      frustrationScore: 0,
      durationMs: 5000,
      tokensUsed: { input: 100, output: 50, cacheHit: 30 }
    });

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.git-ai'),
      expect.objectContaining({ recursive: true })
    );
  });
});

// =============================================================================
// ROI calculator
// =============================================================================

describe('computeRoiSnapshot', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('computes ROI snapshot from ledger entries', async () => {
    // Insert several entries with different artifacts and frustration levels
    store.insert(
      makeEntry({
        id: 'e1',
        spend: { requestCount: 10, totalCost: 1.0, totalTokens: 30_000 },
        artifacts: { cached: 2, generated: 5 },
        frustration: { count: 0.1, reasons: [] },
        survivalRate30d: 0.8
      })
    );
    store.insert(
      makeEntry({
        id: 'e2',
        spend: { requestCount: 5, totalCost: 0.5, totalTokens: 10_000 },
        artifacts: { cached: 1, generated: 3 },
        frustration: { count: 0.7, reasons: ['tool_rejection'] },
        survivalRate30d: 0.6
      })
    );
    store.insert(
      makeEntry({
        id: 'e3',
        spend: { requestCount: 20, totalCost: 2.0, totalTokens: 50_000 },
        artifacts: { cached: 4, generated: 8 },
        frustration: { count: 0.4, reasons: ['rapid_retry'] },
        survivalRate30d: 0.9
      })
    );

    const since = new Date(Date.now() - 86_400_000);
    const roi = await computeRoiSnapshot(store, since);

    expect(roi.period.from).toEqual(since);
    expect(roi.spend.totalUsd).toBeCloseTo(3.5, 1);
    expect(roi.spend.cacheSavingsUsd).toBeCloseTo(0.35, 2);
    expect(roi.spend.effectiveUsd).toBeCloseTo(3.15, 2);
    expect(roi.spend.frustrationWastedUsd).toBeCloseTo(3.5, 1); // all sessions have some frustration count > 0
    expect(roi.output.commits).toBe(16); // 5 + 3 + 8
    expect(roi.output.avgSurvivalRate).toBeCloseTo(0.767, 2);
    expect(roi.quality.sessionCount).toBe(3);
    expect(roi.quality.greenSessions).toBe(1); // score 0.1
    expect(roi.quality.yellowSessions).toBe(1); // score 0.4
    expect(roi.quality.redSessions).toBe(1); // score 0.7
    expect(roi.derived.costPerCommit).toBeCloseTo(3.5 / 16, 3);
    expect(roi.derived.cacheSavingsPercent).toBeCloseTo(10, 1);
  });

  it('handles empty ledger', async () => {
    const roi = await computeRoiSnapshot(store);
    expect(roi.spend.totalUsd).toBe(0);
    expect(roi.output.commits).toBe(0);
    expect(roi.output.linesAdded).toBe(0);
    expect(roi.quality.sessionCount).toBe(0);
    expect(roi.quality.greenSessions).toBe(0);
    expect(roi.quality.avgFrustrationScore).toBe(0);
  });

  it('defaults since to 7 days ago', async () => {
    const roi = await computeRoiSnapshot(store);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(roi.period.from.getTime()).toBeGreaterThanOrEqual(sevenDaysAgo - 1000);
  });

  it('sets deployedApp when analytics adapter is provided', async () => {
    const mockAnalytics = {
      name: 'MockAnalytics',
      getUsageMetrics: vi.fn().mockResolvedValue({
        pageviews: 1000,
        activeUsers: 250,
        period: { since: new Date().toISOString() }
      }),
      getErrorMetrics: vi.fn().mockResolvedValue({
        errorRate: 0.02,
        p99LatencyMs: 450,
        incidentCount: 1,
        period: { since: new Date().toISOString() }
      }),
      getDeploymentEvents: vi.fn().mockResolvedValue([])
    };

    const roi = await computeRoiSnapshot(store, undefined, mockAnalytics);
    expect(roi.deployedApp).toBeDefined();
    expect(roi.deployedApp?.activeUsers).toBe(250);
    expect(roi.deployedApp?.traffic).toBe(1000);
    expect(roi.deployedApp?.errorRate).toBe(0.02);
    expect(roi.deployedApp?.p99LatencyMs).toBe(450);
  });
});

describe('tryReadAiAttribution', () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it('returns unavailable when no git-ai notes exist', () => {
    mockExecSync.mockReturnValue('');
    const result = tryReadAiAttribution([{ sha: 'abc123' }], '/fake/repo');
    expect(result).toBeDefined();
    if (result === undefined) {
      return;
    }
    expect(result.source).toBe('unavailable');
    expect(result.overallAiPercentage).toBe(0);
    expect(result.byTool).toEqual({});
  });

  it('returns git-ai attribution from commit list', () => {
    mockExecSync.mockReturnValue(
      JSON.stringify({
        additions: { human: 80, ai: 120 },
        accepted: { ai: 100 },
        breakdown: { 'claude-code': { additions: 120, accepted: 100 } }
      })
    );

    const result = tryReadAiAttribution([{ sha: 'abc123' }], '/fake/repo');
    expect(result).toBeDefined();
    if (result === undefined) {
      return;
    }
    expect(result.source).toBe('git-ai');
    expect(result.overallAiPercentage).toBeCloseTo(60, 1);
    expect(result.humanLines).toBe(80);
    expect(result.aiLines).toBe(120);
    expect(result.aiAcceptedLines).toBe(100);
    expect(result.byTool['claude-code']).toBeDefined();
    expect(result.byTool['claude-code']!.aiLines).toBe(120);
  });

  it('returns undefined for empty commit list', () => {
    const result = tryReadAiAttribution([], '/fake/repo');
    expect(result).toBeDefined();
    if (result === undefined) {
      return;
    }
    expect(result.source).toBe('unavailable');
  });
});

// =============================================================================
// MCP server tools
// =============================================================================

describe('mcpTools registry', () => {
  it('has all 6 tools registered', () => {
    expect(Object.keys(mcpTools)).toHaveLength(6);
    expect(mcpTools).toHaveProperty('get_spend_summary');
    expect(mcpTools).toHaveProperty('get_artifact_output');
    expect(mcpTools).toHaveProperty('get_cost_per_unit');
    expect(mcpTools).toHaveProperty('get_frustration_report');
    expect(mcpTools).toHaveProperty('get_code_survival');
    expect(mcpTools).toHaveProperty('get_deployment_correlation');
  });
});

describe('getSpendSummary', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
    store.insert(
      makeEntry({
        id: 'spend1',
        spend: { requestCount: 10, totalCost: 1.0, totalTokens: 30_000 },
        frustration: { count: 0.2, reasons: ['rapid_retry'] }
      })
    );
    store.insert(
      makeEntry({
        id: 'spend2',
        spend: { requestCount: 20, totalCost: 2.5, totalTokens: 60_000 },
        frustration: { count: 0.0, reasons: [] }
      })
    );
  });

  afterEach(() => {
    store.close();
  });

  it('computes spend summary from ledger', () => {
    const result = getSpendSummary(store);
    expect(result.totalUsd).toBeCloseTo(3.5, 1);
    expect(result.cacheSavingsUsd).toBeCloseTo(0.35, 2);
    expect(result.effectiveUsd).toBeCloseTo(3.15, 2);
    expect(result.sessionCount).toBe(2);
    expect(result.totalRequests).toBe(30);
    expect(result.totalTokens).toBe(90_000);
    expect(result.period.from).toBeDefined();
    expect(result.period.to).toBeDefined();
  });

  it('returns zero values for empty ledger', () => {
    const emptyStore = createSqliteLedgerStore(':memory:');
    const result = getSpendSummary(emptyStore);
    expect(result.totalUsd).toBe(0);
    expect(result.sessionCount).toBe(0);
    emptyStore.close();
  });
});

describe('getArtifactOutput', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
    store.insert(
      makeEntry({
        id: 'art1',
        artifacts: { cached: 1, generated: 5 }
      })
    );
    store.insert(
      makeEntry({
        id: 'art2',
        artifacts: { cached: 3, generated: 10 }
      })
    );
  });

  afterEach(() => {
    store.close();
  });

  it('computes artifact output from ledger', () => {
    const result = getArtifactOutput(store);
    expect(result.commits).toBe(15); // 5 + 10
    expect(result.linesAdded).toBe(375); // 15 * 25
    expect(result.prsOpened).toBe(0);
    expect(result.filesChanged).toBe(15); // totalArtifactsGenerated from agg
  });
});

describe('getCostPerUnit', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
    store.insert(
      makeEntry({
        id: 'cpu1',
        spend: { requestCount: 10, totalCost: 1.0, totalTokens: 30_000 },
        artifacts: { cached: 2, generated: 4 },
        survivalRate30d: 0.8
      })
    );
  });

  afterEach(() => {
    store.close();
  });

  it('computes cost per unit metrics', () => {
    const result = getCostPerUnit(store);
    expect(result.costPerCommit).toBeCloseTo(1.0 / 4, 3);
    expect(result.avgSurvivalRate).toBeCloseTo(0.8, 2);
    expect(result.costPerLineAdded).toBeGreaterThan(0);
    expect(result.totalUsd).toBeCloseTo(1.0, 1);
  });
});

describe('getFrustrationReport', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
    store.insert(
      makeEntry({
        id: 'fr1',
        frustration: { count: 0.1, reasons: [] }
      })
    );
    store.insert(
      makeEntry({
        id: 'fr2',
        spend: { requestCount: 5, totalCost: 0.5, totalTokens: 10_000 },
        frustration: { count: 0.7, reasons: ['tool_rejection', 'repair_loop'] }
      })
    );
    store.insert(
      makeEntry({
        id: 'fr3',
        spend: { requestCount: 8, totalCost: 0.8, totalTokens: 20_000 },
        frustration: { count: 0.4, reasons: ['rapid_retry'] }
      })
    );
  });

  afterEach(() => {
    store.close();
  });

  it('computes frustration report from ledger', () => {
    const result = getFrustrationReport(store);
    expect(result.greenSessionCount).toBe(1);
    expect(result.yellowSessionCount).toBe(1);
    expect(result.redSessionCount).toBe(1);
    expect(result.totalSessionCount).toBe(3);
    expect(result.topFrustrationReasons).toContain('tool_rejection');
    expect(result.topFrustrationReasons).toContain('repair_loop');
    expect(result.topFrustrationReasons).toContain('rapid_retry');
  });
});

describe('getCodeSurvival', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
    store.insert(
      makeEntry({
        id: 'surv1',
        survivalRate30d: 0.8
      })
    );
    store.insert(
      makeEntry({
        id: 'surv2',
        survivalRate30d: 0.6
      })
    );
    store.insert(
      makeEntry({
        id: 'surv3',
        survivalRate30d: null
      })
    );
  });

  afterEach(() => {
    store.close();
  });

  it('computes code survival summary', () => {
    const result = getCodeSurvival(store);
    expect(result.avgSurvivalRate30d).toBeCloseTo(0.7, 2);
    expect(result.entriesWithSurvivalData).toBe(2);
    expect(result.totalEntries).toBe(3);
  });

  it('returns null survival when no data', () => {
    const emptyStore = createSqliteLedgerStore(':memory:');
    emptyStore.insert(makeEntry({ id: 'no_surv', survivalRate30d: null }));
    const result = getCodeSurvival(emptyStore);
    expect(result.avgSurvivalRate30d).toBeNull();
    expect(result.entriesWithSurvivalData).toBe(0);
    emptyStore.close();
  });
});

function emptyInsert(store: ReturnType<typeof createSqliteLedgerStore>, entry: SessionLedgerEntry): void {
  store.insert(entry);
}

describe('getDeploymentCorrelation', () => {
  it('returns zero defaults', () => {
    const store = createSqliteLedgerStore(':memory:');
    const result = getDeploymentCorrelation(store);
    expect(result.activeUsers).toBe(0);
    expect(result.traffic).toBe(0);
    expect(result.errorRate).toBe(0);
    expect(result.deployments).toBe(0);
    store.close();
  });
});

// =============================================================================
// Transparency report
// =============================================================================

describe('buildTransparencyReport', () => {
  let store: ReturnType<typeof createSqliteLedgerStore>;
  const baseRoi = {
    period: { from: new Date('2026-06-01'), to: new Date('2026-06-15') },
    spend: {
      totalUsd: 100,
      effectiveUsd: 90,
      cacheSavingsUsd: 10,
      frustrationWastedUsd: 15,
      breakdown: {
        inputTokens: 500_000,
        outputTokens: 100_000,
        cacheWriteTokens: 50_000,
        cacheReadTokens: 20_000,
        totalRequests: 200
      }
    },
    output: { commits: 50, linesAdded: 1250, prsOpened: 5, deploymentsCorrelated: 3, avgSurvivalRate: 0.75 },
    quality: { avgFrustrationScore: 0.25, sessionCount: 20, greenSessions: 12, yellowSessions: 6, redSessions: 2 },
    derived: {
      costPerCommit: 2,
      costPerLineAdded: 0.08,
      costPerSurvivingLine: 0.107,
      cacheSavingsPercent: 10,
      frustrationWastePercent: 15
    }
  };

  beforeEach(() => {
    store = createSqliteLedgerStore(':memory:');
    // Insert entries matching the ROI snapshot period
    for (let i = 0; i < 5; i++) {
      store.insert(
        makeEntry({
          id: `tr_${i}`,
          startedAt: new Date('2026-06-10'),
          durationMs: 1_800_000, // 30 min
          spend: { requestCount: 10, totalCost: 1.0, totalTokens: 25_000 }
        })
      );
    }
  });

  afterEach(() => {
    store.close();
  });

  it('builds report with all 6 sections', async () => {
    const report = await buildTransparencyReport(store, baseRoi);

    // Section 1: Spend
    expect(report.spend.totalUsd).toBe(100);
    expect(report.spend.effectiveUsd).toBe(90);
    expect(report.spend.cacheSavingsUsd).toBe(10);
    expect(report.spend.costPerCommit).toBe(2);
    expect(report.spend.costPerLine).toBe(0.08);

    // Section 2: Attribution (no git-ai data)
    expect(report.attribution.aiLines).toBe(0);
    expect(report.attribution.humanLines).toBe(0);
    expect(report.attribution.aiPercentage).toBe(0);
    expect(report.attribution.commits).toBe(50);
    expect(report.attribution.linesAdded).toBe(1250);

    // Section 3: Quality
    expect(report.quality.avgFrustrationScore).toBe(0.25);
    expect(report.quality.greenSessionCount).toBe(12);
    expect(report.quality.yellowSessionCount).toBe(6);
    expect(report.quality.redSessionCount).toBe(2);

    // Section 4: Activity
    expect(report.activity.sessionCount).toBe(20);

    // Section 5: Learning
    expect(report.learning.activeFailureModes).toBe(0);

    // Section 6: Tools
    expect(report.tools.bestToolBySurvival).toBe('N/A');
  });

  it('includes git-ai attribution when stats are provided', async () => {
    const gitAiStats = {
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-15'),
      commitCount: 30,
      totalHumanAdditions: 800,
      totalAiAdditions: 1200,
      totalAiAccepted: 1000,
      overallAiPercentage: 60,
      byTool: {
        'claude-code': { aiAdditions: 800, aiPercentage: 40 },
        copilot: { aiAdditions: 400, aiPercentage: 20 }
      }
    };

    const report = await buildTransparencyReport(store, baseRoi, gitAiStats);
    expect(report.attribution.aiPercentage).toBe(60);
    expect(report.attribution.aiLines).toBe(1200);
    expect(report.attribution.humanLines).toBe(800);
    expect(report.attribution.aiAcceptedLines).toBe(1000);
    expect(report.attribution.aiLinesPerTool['claude-code']).toBe(800);
    expect(report.attribution.aiLinesPerTool['copilot']).toBe(400);
  });

  it('computes session activity from ledger data', async () => {
    const report = await buildTransparencyReport(store, baseRoi);
    expect(report.activity.totalDurationHours).toBeCloseTo(5 * 0.5, 2); // 5 entries * 30 min each
    expect(report.activity.avgTokensPerSession).toBe(25_000);
  });
});
