/**
 * Tests for tokenomics CLI command handlers.
 *
 * All git operations and ledger operations are mocked to avoid
 * requiring an actual git repository or SQLite in the test environment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliIO } from '../index.js';
import { runTokenomicsCommand } from './tokenomics.js';

// =============================================================================
// Mock external modules
// =============================================================================

const mockExecSync = vi.hoisted(() => vi.fn());
const mockComputeRoiSnapshot = vi.hoisted(() => vi.fn());
const mockBuildTransparencyReport = vi.hoisted(() => vi.fn());
const mockCreateSqliteLedgerStore = vi.hoisted(() => vi.fn());
const mockAggregateGitAiStats = vi.hoisted(() => vi.fn());
const mockRecognizePatterns = vi.hoisted(() => vi.fn());
const mockComputeSurvivalRate = vi.hoisted(() => vi.fn());

vi.mock('@agentsy/tokenomics', () => ({
  computeRoiSnapshot: mockComputeRoiSnapshot,
  buildTransparencyReport: mockBuildTransparencyReport,
  createSqliteLedgerStore: mockCreateSqliteLedgerStore,
  aggregateGitAiStats: mockAggregateGitAiStats,
  recognizePatterns: mockRecognizePatterns,
  computeSurvivalRate: mockComputeSurvivalRate
}));

vi.mock('node:child_process', () => ({
  execSync: mockExecSync
}));

// =============================================================================
// IO spy helpers
// =============================================================================

interface IoSpy {
  stderr: ReturnType<typeof vi.fn>;
  stdout: ReturnType<typeof vi.fn>;
}

function createIoSpy(): CliIO & IoSpy {
  return { stdout: vi.fn(), stderr: vi.fn() } as unknown as CliIO & IoSpy;
}

function _createOpts(io: CliIO & IoSpy) {
  return {
    json: false,
    stdout: io.stdout,
    stderr: io.stderr
  };
}

// =============================================================================
// Mock data
// =============================================================================

const mockRoiSnapshot = {
  period: { from: new Date('2026-06-08'), to: new Date('2026-06-15') },
  spend: {
    totalUsd: 12.5,
    effectiveUsd: 11.25,
    cacheSavingsUsd: 1.25,
    frustrationWastedUsd: 2.0,
    breakdown: {
      inputTokens: 50_000,
      outputTokens: 30_000,
      cacheWriteTokens: 10_000,
      cacheReadTokens: 5000,
      totalRequests: 100
    }
  },
  output: { commits: 5, linesAdded: 125, prsOpened: 1, deploymentsCorrelated: 0, avgSurvivalRate: 0.8 },
  quality: { avgFrustrationScore: 0.25, sessionCount: 10, greenSessions: 7, yellowSessions: 2, redSessions: 1 },
  derived: {
    costPerCommit: 2.5,
    costPerLineAdded: 0.1,
    costPerSurvivingLine: 0.125,
    cacheSavingsPercent: 10,
    frustrationWastePercent: 16
  }
};

const mockTransparencyReport = {
  period: { from: new Date('2026-06-08'), to: new Date('2026-06-15') },
  spend: {
    totalUsd: 12.5,
    effectiveUsd: 11.25,
    cacheSavingsUsd: 1.25,
    cacheSavingsPercent: 10,
    frustrationWastedUsd: 2.0,
    frustrationWastePercent: 16,
    costPerCommit: 2.5,
    costPerLine: 0.1
  },
  attribution: {
    aiLines: 80,
    humanLines: 45,
    aiPercentage: 64,
    aiAcceptedLines: 70,
    linesAdded: 125,
    linesDeleted: 0,
    commits: 5,
    aiLinesPerTool: { 'claude-code': 50, 'gpt-4o': 30 }
  },
  quality: {
    avgFrustrationScore: 0.25,
    redSessionCount: 1,
    yellowSessionCount: 2,
    greenSessionCount: 7,
    survivalRate30d: null,
    testPassRate: null,
    lintPassRate: null
  },
  activity: {
    sessionCount: 10,
    totalDurationHours: 4.5,
    avgTokensPerSession: 5000,
    avgCacheEfficiency: 0
  },
  learning: {
    activeFailureModes: 2,
    pendingPatches: 3,
    appliedPatches: 5,
    reinforcedPatterns: 4
  },
  tools: {
    bestToolBySurvival: 'claude-code',
    bestToolByCostEfficiency: 'gpt-4o',
    worstToolByFrustration: 'claude-code'
  }
};

const mockGitAiStats = {
  periodStart: new Date('2026-06-08'),
  periodEnd: new Date('2026-06-15'),
  commitCount: 5,
  totalHumanAdditions: 45,
  totalAiAdditions: 80,
  totalAiAccepted: 70,
  overallAiPercentage: 64,
  byTool: { 'claude-code': { aiAdditions: 50, aiPercentage: 40 }, 'gpt-4o': { aiAdditions: 30, aiPercentage: 24 } }
};

const mockFailureModes = [
  {
    id: 'fm_001',
    category: 'rewrite-loop',
    confidence: 0.85,
    sessionCount: 5,
    firstSeenAt: new Date('2026-06-01'),
    lastSeenAt: new Date('2026-06-15'),
    dominantSignalKind: 'rewrite' as const,
    evidenceSessions: ['s1', 's2', 's3'],
    contextFingerprint: 'ctx1',
    avgFrustrationScore: 0.7,
    agentIds: ['agent1'],
    modelIds: ['model1']
  },
  {
    id: 'fm_002',
    category: 'tool-rejection',
    confidence: 0.45,
    sessionCount: 2,
    firstSeenAt: new Date('2026-06-05'),
    lastSeenAt: new Date('2026-06-10'),
    dominantSignalKind: 'retry' as const,
    evidenceSessions: ['s4'],
    contextFingerprint: 'ctx2',
    avgFrustrationScore: 0.5,
    agentIds: ['agent2'],
    modelIds: ['model2']
  }
];

const mockSurvivalResult = {
  sessionId: 'sess_test',
  commitShas: ['abc123'],
  filesChecked: 3,
  linesOriginal: 150,
  linesSurvived: 120,
  survivalRate: 0.8,
  computedAt: new Date()
};

// =============================================================================
// Tests
// =============================================================================

describe('runTokenomicsCommand', () => {
  beforeEach(() => {
    mockCreateSqliteLedgerStore.mockReturnValue({
      query: vi.fn().mockReturnValue([]),
      aggregate: vi.fn().mockReturnValue({
        totalCostUsd: 0,
        totalTokens: 0,
        totalRequests: 0,
        totalCostAtFrustration: 0,
        sessionCount: 0
      })
    });
    mockComputeRoiSnapshot.mockResolvedValue(mockRoiSnapshot);
    mockBuildTransparencyReport.mockResolvedValue(mockTransparencyReport);
    mockExecSync.mockReturnValue('');
    mockAggregateGitAiStats.mockReturnValue(mockGitAiStats);
    mockRecognizePatterns.mockReturnValue(mockFailureModes);
    mockComputeSurvivalRate.mockReturnValue(mockSurvivalResult);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // report subcommand
  // ---------------------------------------------------------------------------

  it('report prints spend report in text format', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['report'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Tokenomics Report'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('$12.50'));
  });

  it('report --json outputs JSON', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['report', '--json'], io);
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('"period"')
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse((jsonCall as NonNullable<typeof jsonCall>)[0] as string);
    expect(parsed).toHaveProperty('spend');
    expect(parsed).toHaveProperty('output');
  });

  it('report --ethical prints ethical transparency report', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['report', '--ethical'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Ethical Transparency Report'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('CODE ATTRIBUTION'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('SPEND EFFICIENCY'));
  });

  it('report --attribution prints AI attribution report', async () => {
    mockExecSync
      .mockReturnValueOnce('abc123\ndef456\n') // git log
      .mockReturnValueOnce('/repo'); // git rev-parse
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['report', '--attribution'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('AI Attribution Report'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('64.0%'));
  });

  it('report --attribution handles no commits', async () => {
    mockExecSync
      .mockReturnValueOnce('') // git log — no commits
      .mockReturnValueOnce('/repo');
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['report', '--attribution'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('No commits found'));
  });

  it('report with --since 30d parses the period', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['report', '30d'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Last 30 days'));
  });

  // ---------------------------------------------------------------------------
  // patch subcommand
  // ---------------------------------------------------------------------------

  it('patch review lists pending patches', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['patch', 'review'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Patches pending review'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('rewrite-loop'));
  });

  it('patch review --json outputs JSON', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['patch', 'review', '--json'], io);
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('"pendingPatches"')
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse((jsonCall as NonNullable<typeof jsonCall>)[0] as string);
    expect(parsed).toHaveProperty('pendingPatches');
  });

  it('patch list lists all failure modes', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['patch', 'list'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Failure modes'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('rewrite-loop'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('tool-rejection'));
  });

  it('patch list --json outputs JSON', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['patch', 'list', '--json'], io);
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('"failureModes"')
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse((jsonCall as NonNullable<typeof jsonCall>)[0] as string);
    expect(parsed).toHaveProperty('failureModes');
    expect(parsed.failureModes).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // survival subcommand
  // ---------------------------------------------------------------------------

  it('survival prints survival rates', async () => {
    mockCreateSqliteLedgerStore.mockReturnValue({
      query: vi.fn().mockReturnValue([
        {
          sessionId: 'sess_test',
          artifacts: { commits: [{ sha: 'abc123' }], files: ['src/test.ts'] }
        }
      ]),
      aggregate: vi.fn().mockReturnValue({})
    });
    mockExecSync.mockReturnValue('/repo');
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['survival'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Survival rates'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('80.0%'));
  });

  it('survival handles no sessions', async () => {
    mockCreateSqliteLedgerStore.mockReturnValue({
      query: vi.fn().mockReturnValue([]),
      aggregate: vi.fn().mockReturnValue({})
    });
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['survival'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('No sessions found'));
  });

  // ---------------------------------------------------------------------------
  // adapters subcommand
  // ---------------------------------------------------------------------------

  it('adapters list prints adapter status', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['adapters', 'list'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Analytics adapters'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('Plausible'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('PostHog'));
  });

  it('adapters list --json outputs JSON', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['adapters', 'list', '--json'], io);
    expect(exitCode).toBe(0);
    const jsonCall = io.stdout.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('"adapters"')
    );
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse((jsonCall as NonNullable<typeof jsonCall>)[0] as string);
    expect(parsed).toHaveProperty('adapters');
    expect(parsed.adapters).toHaveLength(6);
  });

  it('adapters add shows instructions for known adapter', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['adapters', 'add', 'plausible'], io);
    expect(exitCode).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('To configure plausible'));
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('PLAUSIBLE_TOKEN'));
  });

  it('adapters add errors for unknown adapter', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['adapters', 'add', 'unknown'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown adapter'));
  });

  it('adapters add errors when no name provided', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['adapters', 'add'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  // ---------------------------------------------------------------------------
  // unknown subcommand
  // ---------------------------------------------------------------------------

  it('returns 1 for unknown subcommand', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['unknown'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown tokenomics subcommand'));
  });

  it('returns 1 for unknown patch subcommand', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['patch', 'unknown'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown patch subcommand'));
  });

  it('returns 1 for unknown adapters subcommand', async () => {
    const io = createIoSpy();
    const exitCode = await runTokenomicsCommand(['adapters', 'unknown'], io);
    expect(exitCode).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining('Unknown adapters subcommand'));
  });
});
