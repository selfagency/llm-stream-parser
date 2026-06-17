/**
 * Tokenomics CLI — manage tokenomics reporting, patches, survival
 * analysis, and analytics adapters.
 *
 * ## Usage
 *
 * ```bash
 * agentsy tokenomics report [--since 7d|30d|90d]
 * agentsy tokenomics report --ethical
 * agentsy tokenomics report --attribution
 * agentsy tokenomics patch review
 * agentsy tokenomics patch list
 * agentsy tokenomics survival [--recompute]
 * agentsy tokenomics adapters list
 * agentsy tokenomics adapters add <name>
 * ```
 */

import type { CliIO } from '../index.js';

// =============================================================================
// Default IO
// =============================================================================

const DEFAULT_IO: Required<CliIO> = {
  stderr: (msg: string): void => {
    console.error(msg);
  },
  stdout: (msg: string): void => {
    console.log(msg);
  }
};

// =============================================================================
// Options
// =============================================================================

interface TokenomicsCliOptions {
  json: boolean;
  stderr: (msg: string) => void;
  stdout: (msg: string) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse a --since value into a Date.
 * Supports: 7d, 30d, 90d, or ISO date string.
 */
function parseSince(value: string | undefined): Date {
  if (value === undefined) {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  const dayMatch = /^(\d+)d$/.exec(value);
  if (dayMatch) {
    const days = Number.parseInt(dayMatch[1] ?? '7', 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * Format a period label from a since date.
 */
function formatPeriodLabel(since: Date): string {
  const diffDays = Math.round((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 1) {
    return 'Last 24 hours';
  }
  if (diffDays <= 7) {
    return 'Last 7 days';
  }
  if (diffDays <= 14) {
    return 'Last 14 days';
  }
  if (diffDays <= 30) {
    return 'Last 30 days';
  }
  if (diffDays <= 90) {
    return 'Last 90 days';
  }
  return `Since ${since.toISOString().slice(0, 10)}`;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

// =============================================================================
// Report formatters
// =============================================================================

/**
 * Format a standard spend-vs-value report.
 */
function formatSpendReport(
  totalUsd: number,
  effectiveUsd: number,
  cacheSavingsUsd: number,
  cacheSavingsPercent: number,
  frustrationWastedUsd: number,
  frustrationWastePercent: number,
  commits: number,
  linesAdded: number,
  costPerCommit: number,
  costPerLine: number,
  avgSurvivalRate: number,
  avgFrustrationScore: number,
  sessionCount: number,
  periodLabel: string
): string {
  const lines: string[] = [
    '\u2550'.repeat(56),
    `  Tokenomics Report \u2014 ${periodLabel}`,
    '\u2550'.repeat(56),
    '',
    '  \uD83D\uDCB0 SPEND',
    `    Gross spend:        $${totalUsd.toFixed(2)}`,
    `    Effective spend:    $${effectiveUsd.toFixed(2)}`,
    `    Cache savings:      $${cacheSavingsUsd.toFixed(2)} (${cacheSavingsPercent.toFixed(1)}%)`,
    `    Frustration waste:  $${frustrationWastedUsd.toFixed(2)} (${frustrationWastePercent.toFixed(1)}%)`,
    '',
    '  \uD83D\uDCC8 OUTPUT',
    `    Commits:            ${commits}`,
    `    Lines added:        ${linesAdded}`,
    `    Cost per commit:    $${costPerCommit.toFixed(2)}`,
    `    Cost per line:      $${costPerLine.toFixed(4)}`,
    `    Avg survival (30d): ${(avgSurvivalRate * 100).toFixed(1)}%`,
    '',
    '  \uD83E\uDDE0 QUALITY',
    `    Sessions:           ${sessionCount}`,
    `    Avg frustration:    ${(avgFrustrationScore * 100).toFixed(0)}%`,
    '',
    '\u2550'.repeat(56)
  ];

  return lines.join('\n');
}

/**
 * Format an ethical transparency report.
 *
 * Renders the full 6-section transparency dashboard from a
 * TransparencyReport object.
 */
function formatEthicalReport(report: {
  period: { from: Date; to: Date };
  spend: {
    totalUsd: number;
    effectiveUsd: number;
    cacheSavingsUsd: number;
    cacheSavingsPercent: number;
    frustrationWastedUsd: number;
    frustrationWastePercent: number;
    costPerCommit: number;
    costPerLine: number;
  };
  attribution: {
    aiLines: number;
    humanLines: number;
    aiPercentage: number;
    aiAcceptedLines: number;
    linesAdded: number;
    linesDeleted: number;
    commits: number;
    aiLinesPerTool: Record<string, number>;
  };
  quality: {
    avgFrustrationScore: number;
    redSessionCount: number;
    yellowSessionCount: number;
    greenSessionCount: number;
    survivalRate30d: number | null;
    testPassRate: number | null;
    lintPassRate: number | null;
  };
  activity: {
    sessionCount: number;
    totalDurationHours: number;
    avgTokensPerSession: number;
    avgCacheEfficiency: number;
  };
  learning: {
    activeFailureModes: number;
    pendingPatches: number;
    appliedPatches: number;
    reinforcedPatterns: number;
  };
  tools: {
    bestToolBySurvival: string;
    bestToolByCostEfficiency: string;
    worstToolByFrustration: string;
  };
}): string {
  const lines: string[] = [
    '\u2550'.repeat(56),
    '  Ethical Transparency Report \u2014 @agentsy',
    `  ${new Date().toISOString().slice(0, 10)}`,
    '\u2550'.repeat(56),
    '',
    '  \uD83D\uDCCA CODE ATTRIBUTION',
    `     AI-generated:    ${report.attribution.aiLines} lines (${report.attribution.aiPercentage.toFixed(1)}%)`,
    `     Human-written:   ${report.attribution.humanLines} lines`,
    `     AI accepted:     ${report.attribution.aiAcceptedLines} lines`,
    `     Commits:         ${report.attribution.commits}`,
    '',
    '  \uD83D\uDCB0 SPEND EFFICIENCY',
    `     Gross spend:     $${report.spend.totalUsd.toFixed(2)}`,
    `     Effective spend: $${report.spend.effectiveUsd.toFixed(2)}`,
    `     Cache savings:   $${report.spend.cacheSavingsUsd.toFixed(2)} (${report.spend.cacheSavingsPercent.toFixed(1)}%)`,
    `     Waste (frust.):  $${report.spend.frustrationWastedUsd.toFixed(2)} (${report.spend.frustrationWastePercent.toFixed(1)}%)`,
    `     Cost/commit:     $${report.spend.costPerCommit.toFixed(2)}`,
    '',
    '  \uD83E\uDDE0 QUALITY',
    `     Avg frustration: ${(report.quality.avgFrustrationScore * 100).toFixed(0)}%`,
    `     Green sessions:  ${report.quality.greenSessionCount} \u2705`,
    `     Yellow sessions: ${report.quality.yellowSessionCount} \u26A0\uFE0F`,
    `     Red sessions:    ${report.quality.redSessionCount} \uD83D\uDD25`,
    `     30d survival:    ${report.quality.survivalRate30d === null ? 'N/A' : formatPct(report.quality.survivalRate30d)}`,
    '',
    '  \uD83D\uDD2C AI TOOL EFFECTIVENESS',
    `     Best survival:    ${report.tools.bestToolBySurvival}`,
    `     Best cost eff.:   ${report.tools.bestToolByCostEfficiency}`,
    `     Most friction:    ${report.tools.worstToolByFrustration}`,
    '',
    '  \uD83D\uDCC8 ACTIVITY',
    `     Sessions:        ${report.activity.sessionCount}`,
    `     Active FMs:      ${report.learning.activeFailureModes}`,
    `     Patches pending: ${report.learning.pendingPatches}`,
    `     Patches applied: ${report.learning.appliedPatches}`,
    '',
    '\u2550'.repeat(56)
  ];

  return lines.join('\n');
}

/**
 * Format an AI attribution report.
 */
function formatAttributionReport(stats: {
  periodStart: Date;
  periodEnd: Date;
  commitCount: number;
  totalHumanAdditions: number;
  totalAiAdditions: number;
  totalAiAccepted: number;
  overallAiPercentage: number;
  byTool: Record<string, { aiAdditions: number; aiPercentage: number }>;
}): string {
  const lines: string[] = [
    '\u2550'.repeat(56),
    '  AI Attribution Report (from git-ai notes)',
    '\u2550'.repeat(56),
    '',
    `  AI code:        ${stats.overallAiPercentage.toFixed(1)}%`,
    `  Human code:     ${(100 - stats.overallAiPercentage).toFixed(1)}%`,
    `  Commits:        ${stats.commitCount}`,
    `  AI lines added: ${stats.totalAiAdditions}`,
    `  AI lines acc.:  ${stats.totalAiAccepted}`,
    `  Human lines:    ${stats.totalHumanAdditions}`,
    '',
    '  By Tool/Model:',
    ...Object.entries(stats.byTool).map(
      ([tool, data]) => `    ${tool}: ${data.aiAdditions} lines (${data.aiPercentage.toFixed(1)}%)`
    ),
    '',
    '\u2550'.repeat(56)
  ];

  return lines.join('\n');
}

// =============================================================================
// Subcommand handlers (exported for testing)
// =============================================================================

// ---------------------------------------------------------------------------
// agentsy tokenomics report
// ---------------------------------------------------------------------------

async function handleReport(argv: readonly string[], opts: TokenomicsCliOptions): Promise<number> {
  const hasEthical = argv.includes('--ethical');
  const hasAttribution = argv.includes('--attribution');
  const sinceFlag = argv.find(a => /^\d+d$/.test(a) || /^\d{4}-\d{2}-\d{2}/.test(a));
  const since = parseSince(sinceFlag);

  if (hasEthical) {
    return await buildEthicalReport(since, opts);
  }

  if (hasAttribution) {
    return await buildAttributionReport(since, opts);
  }

  return await buildStandardReport(since, opts);
}

async function buildEthicalReport(since: Date, opts: TokenomicsCliOptions): Promise<number> {
  try {
    const { buildTransparencyReport, computeRoiSnapshot, createSqliteLedgerStore } = await import(
      '@agentsy/tokenomics'
    );

    const ledger = createSqliteLedgerStore(':memory:');
    const roi = await computeRoiSnapshot(ledger, since);
    const report = await buildTransparencyReport(ledger, roi);

    if (opts.json) {
      opts.stdout(JSON.stringify(report, null, 2));
      return 0;
    }

    opts.stdout(formatEthicalReport(report));
    return 0;
  } catch (error) {
    opts.stderr(`Failed to build ethical report: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function buildAttributionReport(since: Date, opts: TokenomicsCliOptions): Promise<number> {
  try {
    const { aggregateGitAiStats } = await import('@agentsy/tokenomics');
    const { execSync } = await import('node:child_process');
    const { safePathEnv } = await import('@agentsy/shared/safe-path');

    const sinceIso = since.toISOString();
    const logOutput = execSync(`git log --since="${sinceIso}" --format="%H" --no-pager`, {
      env: safePathEnv(),
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    const shas = logOutput.split('\n').filter(Boolean);

    if (shas.length === 0) {
      opts.stdout('No commits found in the specified period.');
      return 0;
    }

    const repoRoot = execSync('git rev-parse --show-toplevel', {
      env: safePathEnv(),
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();
    const stats = aggregateGitAiStats(repoRoot, shas);

    if (opts.json) {
      opts.stdout(JSON.stringify(stats, null, 2));
      return 0;
    }

    opts.stdout(formatAttributionReport(stats));
    return 0;
  } catch (error) {
    opts.stderr(`Failed to build attribution report: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

async function buildStandardReport(since: Date, opts: TokenomicsCliOptions): Promise<number> {
  try {
    const { computeRoiSnapshot, createSqliteLedgerStore } = await import('@agentsy/tokenomics');

    const ledger = createSqliteLedgerStore(':memory:');
    const roi = await computeRoiSnapshot(ledger, since);
    const periodLabel = formatPeriodLabel(since);

    if (opts.json) {
      opts.stdout(JSON.stringify(roi, null, 2));
      return 0;
    }

    opts.stdout(
      formatSpendReport(
        roi.spend.totalUsd,
        roi.spend.effectiveUsd,
        roi.spend.cacheSavingsUsd,
        roi.derived.cacheSavingsPercent,
        roi.spend.frustrationWastedUsd,
        roi.derived.frustrationWastePercent,
        roi.output.commits,
        roi.output.linesAdded,
        roi.derived.costPerCommit,
        roi.derived.costPerLineAdded,
        roi.output.avgSurvivalRate,
        roi.quality.avgFrustrationScore,
        roi.quality.sessionCount,
        periodLabel
      )
    );
    return 0;
  } catch (error) {
    opts.stderr(`Failed to build report: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// agentsy tokenomics patch review
// ---------------------------------------------------------------------------

async function handlePatchReview(_argv: readonly string[], opts: TokenomicsCliOptions): Promise<number> {
  try {
    const { recognizePatterns, createSqliteLedgerStore } = await import('@agentsy/tokenomics');

    const ledger = createSqliteLedgerStore(':memory:');
    const entries = await ledger.query({});
    const failureModes = recognizePatterns(entries);

    const pendingPatches = failureModes
      .filter(fm => fm.confidence >= 0.6)
      .map(fm => ({
        failureModeId: fm.id,
        category: fm.category,
        confidence: fm.confidence,
        sessionCount: fm.sessionCount
      }));

    if (opts.json) {
      opts.stdout(JSON.stringify({ pendingPatches }, null, 2));
      return 0;
    }

    if (pendingPatches.length === 0) {
      opts.stdout('No patches pending review.');
      return 0;
    }

    opts.stdout(`Patches pending review (${pendingPatches.length}):`);
    opts.stdout('');
    for (const patch of pendingPatches) {
      opts.stdout(`  ${patch.failureModeId}`);
      opts.stdout(`    Category:    ${patch.category}`);
      opts.stdout(`    Confidence:  ${(patch.confidence * 100).toFixed(0)}%`);
      opts.stdout(`    Sessions:    ${patch.sessionCount}`);
      opts.stdout('');
    }

    return 0;
  } catch (error) {
    opts.stderr(`Failed to list patches: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// agentsy tokenomics patch list
// ---------------------------------------------------------------------------

async function handlePatchList(_argv: readonly string[], opts: TokenomicsCliOptions): Promise<number> {
  try {
    const { recognizePatterns, createSqliteLedgerStore } = await import('@agentsy/tokenomics');

    const ledger = createSqliteLedgerStore(':memory:');
    const entries = await ledger.query({});
    const failureModes = recognizePatterns(entries);

    if (opts.json) {
      opts.stdout(JSON.stringify({ failureModes }, null, 2));
      return 0;
    }

    if (failureModes.length === 0) {
      opts.stdout('No failure modes or patches found.');
      return 0;
    }

    opts.stdout(`Failure modes (${failureModes.length}):`);
    opts.stdout('');
    for (const fm of failureModes) {
      opts.stdout(`  ${fm.id}`);
      opts.stdout(`    Category:    ${fm.category}`);
      opts.stdout(`    Confidence:  ${(fm.confidence * 100).toFixed(0)}%`);
      opts.stdout(`    Sessions:    ${fm.sessionCount}`);
      opts.stdout(`    First seen:  ${fm.firstSeenAt.toISOString().slice(0, 10)}`);
      opts.stdout(`    Last seen:   ${fm.lastSeenAt.toISOString().slice(0, 10)}`);
      opts.stdout('');
    }

    return 0;
  } catch (error) {
    opts.stderr(`Failed to list patches: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// agentsy tokenomics survival
// ---------------------------------------------------------------------------

/**
 * Extract commit SHAs and files from session artifacts
 */
// fallow-ignore-next-line complexity — artifact extraction with multi-field iteration
function extractCommitShasAndFiles(entry: import('@agentsy/tokenomics').SessionLedgerEntry): {
  commitShas: string[];
  files: string[];
} {
  const commitShas: string[] = [];
  const files: string[] = [];
  if ('artifacts' in entry) {
    const a = entry.artifacts as Record<string, unknown>;
    if (Array.isArray(a.commits)) {
      for (const c of a.commits) {
        if (typeof c === 'object' && c !== null && 'sha' in c) {
          commitShas.push(String((c as Record<string, unknown>).sha));
        }
      }
    }
    if (Array.isArray(a.files)) {
      for (const f of a.files) {
        files.push(String(f));
      }
    }
  }
  return { commitShas, files };
}

/**
 * Compute survival rate for a single session, returning null on failure
 */
async function computeSurvivalForEntry(
  entry: import('@agentsy/tokenomics').SessionLedgerEntry,
  repoRoot: string,
  computeSurvivalRate: (
    sessionId: string,
    commitShas: string[],
    files: string[],
    repoRoot: string
  ) => Promise<import('@agentsy/tokenomics').SurvivalResult>
): Promise<import('@agentsy/tokenomics').SurvivalResult | null> {
  const { commitShas, files } = extractCommitShasAndFiles(entry);
  if (commitShas.length === 0 || files.length === 0) {
    return null;
  }
  try {
    return await computeSurvivalRate(entry.sessionId, commitShas, files, repoRoot);
  } catch {
    return null;
  }
}

async function handleSurvival(argv: readonly string[], opts: TokenomicsCliOptions): Promise<number> {
  const _recompute = argv.includes('--recompute');

  try {
    const { computeSurvivalRate, createSqliteLedgerStore } = await import('@agentsy/tokenomics');
    const { execSync } = await import('node:child_process');
    const { safePathEnv } = await import('@agentsy/shared/safe-path');

    const ledger = await createSqliteLedgerStore(':memory:');
    const entries = await ledger.query({});

    if (entries.length === 0) {
      opts.stdout('No sessions found in the ledger.');
      return 0;
    }

    const repoRoot = execSync('git rev-parse --show-toplevel', {
      env: safePathEnv(),
      encoding: 'utf-8',
      stdio: 'pipe'
    }).trim();

    const results = (
      await Promise.all(entries.map(entry => computeSurvivalForEntry(entry, repoRoot, computeSurvivalRate)))
    ).filter(Boolean);

    if (opts.json) {
      opts.stdout(JSON.stringify({ survivalResults: results }, null, 2));
      return 0;
    }

    if (results.length === 0) {
      opts.stdout('No survival data available. Sessions need commit SHAs and file lists.');
      return 0;
    }

    opts.stdout(`Survival rates (${results.length} session${results.length === 1 ? '' : 's'}):`);
    opts.stdout('');
    for (const r of results) {
      if (r === null) {
        continue;
      }
      opts.stdout(`  ${r.sessionId.slice(0, 18)}...`);
      opts.stdout(`    Files:     ${r.filesChecked}`);
      opts.stdout(`    Original:  ${r.linesOriginal} lines`);
      opts.stdout(`    Survived:  ${r.linesSurvived} lines`);
      opts.stdout(`    Rate:      ${(r.survivalRate * 100).toFixed(1)}%`);
      opts.stdout('');
    }

    return 0;
  } catch (error) {
    opts.stderr(`Failed to compute survival: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// agentsy tokenomics adapters list
// ---------------------------------------------------------------------------

function handleAdaptersList(_argv: readonly string[], opts: TokenomicsCliOptions): number {
  const adapterInfo: Array<{ name: string; configured: boolean; env: string }> = [
    { name: 'Plausible', configured: false, env: 'PLAUSIBLE_TOKEN' },
    { name: 'PostHog', configured: false, env: 'POSTHOG_API_KEY' },
    { name: 'Vercel', configured: false, env: 'VERCEL_API_TOKEN' },
    { name: 'Cloudflare', configured: false, env: 'CLOUDFLARE_API_TOKEN' },
    { name: 'Sentry', configured: false, env: 'SENTRY_AUTH_TOKEN' },
    { name: 'HTTP JSON', configured: false, env: 'ANALYTICS_HTTP_URL' }
  ];

  for (const adapter of adapterInfo) {
    adapter.configured = process.env[adapter.env] !== undefined && (process.env[adapter.env] ?? '').length > 0;
  }

  if (opts.json) {
    opts.stdout(JSON.stringify({ adapters: adapterInfo }, null, 2));
    return 0;
  }

  const configured = adapterInfo.filter(a => a.configured);
  const unconfigured = adapterInfo.filter(a => !a.configured);

  opts.stdout(`Analytics adapters (${configured.length}/${adapterInfo.length} configured):`);
  opts.stdout('');

  if (configured.length > 0) {
    opts.stdout('  Configured:');
    for (const a of configured) {
      opts.stdout(`    \u2705 ${a.name}`);
    }
    opts.stdout('');
  }

  if (unconfigured.length > 0) {
    opts.stdout('  Available (not configured):');
    for (const a of unconfigured) {
      opts.stdout(`    \u274C ${a.name} (set ${a.env})`);
    }
    opts.stdout('');
  }

  return 0;
}

// ---------------------------------------------------------------------------
// agentsy tokenomics adapters add <name>
// ---------------------------------------------------------------------------

function handleAdaptersAdd(argv: readonly string[], opts: TokenomicsCliOptions): number {
  const name = argv[0];
  if (name === undefined || name.length === 0) {
    opts.stderr('Usage: agentsy tokenomics adapters add <name>');
    opts.stderr('');
    opts.stderr('Available adapters:');
    opts.stderr('  plausible   - Plausible Analytics');
    opts.stderr('  posthog     - PostHog');
    opts.stderr('  vercel      - Vercel Analytics');
    opts.stderr('  cloudflare  - Cloudflare Analytics');
    opts.stderr('  sentry      - Sentry');
    opts.stderr('  http-json   - Generic HTTP JSON endpoint');
    return 1;
  }

  const envMap: Record<string, string> = {
    plausible: 'PLAUSIBLE_TOKEN',
    posthog: 'POSTHOG_API_KEY',
    vercel: 'VERCEL_API_TOKEN',
    cloudflare: 'CLOUDFLARE_API_TOKEN',
    sentry: 'SENTRY_AUTH_TOKEN',
    'http-json': 'ANALYTICS_HTTP_URL'
  };

  const envVar = envMap[name.toLowerCase()];
  if (envVar === undefined) {
    opts.stderr(`Unknown adapter: ${name}`);
    opts.stderr('Available: plausible, posthog, vercel, cloudflare, sentry, http-json');
    return 1;
  }

  if (opts.json) {
    opts.stdout(JSON.stringify({ adapter: name, envVar, configured: false }, null, 2));
    return 0;
  }

  opts.stdout(`To configure ${name}:`);
  opts.stdout(`  Set the ${envVar} environment variable`);
  opts.stdout('  Then run: agentsy tokenomics adapters list');
  return 0;
}

// =============================================================================
// Entry point
// =============================================================================

// fallow-ignore-next-line complexity — CLI command routing with subcommand dispatch
export async function runTokenomicsCommand(argv: readonly string[], io: CliIO = DEFAULT_IO): Promise<number> {
  const subcommand = argv[0];
  const rest = argv.slice(1);
  const json = argv.includes('--json');
  const stdout = io.stdout ?? DEFAULT_IO.stdout;
  const stderr = io.stderr ?? DEFAULT_IO.stderr;
  const opts: TokenomicsCliOptions = { json, stdout, stderr };

  if (subcommand === 'report') {
    return await handleReport(rest, opts);
  }

  if (subcommand === 'patch') {
    const patchSub = rest[0];
    const patchRest = rest.slice(1);

    if (patchSub === 'review') {
      return await handlePatchReview(patchRest, opts);
    }
    if (patchSub === 'list') {
      return await handlePatchList(patchRest, opts);
    }

    stderr(`Unknown patch subcommand: ${patchSub ?? '(none)'}`);
    stderr('Supported: review, list');
    return 1;
  }

  if (subcommand === 'survival') {
    return await handleSurvival(rest, opts);
  }

  if (subcommand === 'adapters') {
    const adapterSub = rest[0];
    const adapterRest = rest.slice(1);

    if (adapterSub === 'list') {
      return await handleAdaptersList(adapterRest, opts);
    }
    if (adapterSub === 'add') {
      return await handleAdaptersAdd(adapterRest, opts);
    }

    stderr(`Unknown adapters subcommand: ${adapterSub ?? '(none)'}`);
    stderr('Supported: list, add');
    return 1;
  }

  stderr(`Unknown tokenomics subcommand: ${subcommand ?? '(none)'}`);
  stderr('Supported: report, patch, survival, adapters');
  return 1;
}
