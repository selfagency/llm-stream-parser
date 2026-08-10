/**
 * Install CLI — install Agentsy components by type and ID, or install recommended.
 *
 * ## Usage
 *
 * ```bash
 * agentsy install <type> <id>     — Install a component by type and ID
 * agentsy install --recommended   — Install all high-confidence recommendations
 * ```
 */

import type { InstallResult } from '@agentsy/bootstrap/install';
import { installById, installRecommended } from '@agentsy/bootstrap/install';
import type { CliIO } from '../index.js';

// ── Types ────────────────────────────────────────────────

/**
 * Mapping from user-facing type aliases to canonical component type strings.
 */
const TYPE_ALIASES: Record<string, string> = {
  mcp: 'mcp-server',
  'mcp-server': 'mcp-server',
  skill: 'skill',
  guardrail: 'guardrail',
  connector: 'connector'
};

// ── Help text ────────────────────────────────────────────

const HELP = `Usage: agentsy install <type> <id> [options]
       agentsy install --recommended [options]

Install Agentsy components from registries.

Positional:
  <type>        Component type: mcp, mcp-server, skill, guardrail, connector
  <id>          Component identifier in the registry

Options:
  --recommended Install all high-confidence recommendations (confidence \u2265 0.8)
  --threshold   Confidence threshold for --recommended (default: 0.8)
  -h, --help    Show this help message

Examples:
  agentsy install mcp io.modelcontextprotocol.postgres
  agentsy install skill nextjs-app-router
  agentsy install guardrail builtin:pii
  agentsy install --recommended
  agentsy install --recommended --threshold 0.9`;

const RECOMMENDED_HELP = `Usage: agentsy install --recommended [options]

Install all components with confidence \u2265 threshold from .agentsy/config.yml
recommendations.

Options:
  --threshold   Confidence threshold (default: 0.8, range: 0-1)
  --help        Show this help message

Examples:
  agentsy install --recommended
  agentsy install --recommended --threshold 0.9`;

// ── Flag helpers ─────────────────────────────────────────

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

// ── Recommended handler ──────────────────────────────────

async function handleRecommended(
  argv: readonly string[],
  stdout: (msg: string) => void,
  stderr: (msg: string) => void
): Promise<number> {
  if (hasFlag(argv, '--help')) {
    stdout(RECOMMENDED_HELP);
    return 0;
  }

  const thresholdRaw = getFlagValue(argv, '--threshold');
  const threshold = thresholdRaw === null ? undefined : Number(thresholdRaw);

  if (threshold !== undefined && (Number.isNaN(threshold) || threshold < 0 || threshold > 1)) {
    stderr('Invalid --threshold value. Must be a number between 0 and 1.');
    return 1;
  }

  stdout('Installing recommended components...');
  try {
    const results: InstallResult[] = await installRecommended(process.cwd(), threshold);
    return reportInstallResults(results, stdout, stderr);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Install failed: ${message}`);
    return 1;
  }
}

/** Report install results to stdout/stderr and return the exit code. */
function reportInstallResults(
  results: readonly InstallResult[],
  stdout: (msg: string) => void,
  stderr: (msg: string) => void
): number {
  const succeeded: InstallResult[] = results.filter((r: InstallResult) => r.success);
  const failed: InstallResult[] = results.filter((r: InstallResult) => !r.success);

  stdout(`Installed ${succeeded.length} / ${results.length} components`);
  for (const result of succeeded) {
    stdout(`  \u2713 ${result.componentId}`);
  }
  for (const result of failed) {
    stderr(`  \u2717 ${result.componentId}: ${result.error ?? 'Unknown error'}`);
  }

  return failed.length > 0 ? 1 : 0;
}

// ── Positional handler ───────────────────────────────────

async function handlePositional(
  componentType: string,
  componentId: string,
  stdout: (msg: string) => void,
  stderr: (msg: string) => void
): Promise<number> {
  const canonicalType: string | undefined = TYPE_ALIASES[componentType];
  if (canonicalType === undefined) {
    stderr(`Invalid component type: ${componentType}`);
    stderr('Supported types: mcp, mcp-server, skill, guardrail, connector');
    return 1;
  }

  stdout(`Installing ${canonicalType}: ${componentId}...`);
  try {
    const result: InstallResult = await installById(
      process.cwd(),
      canonicalType as 'mcp-server' | 'skill' | 'guardrail' | 'connector',
      componentId
    );
    if (!result.success) {
      stderr(`Failed to install ${componentId}: ${result.error ?? 'Unknown error'}`);
      return 1;
    }
    stdout(`Installed ${canonicalType}: ${componentId}`);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Install failed: ${message}`);
    return 1;
  }
}

// ── Entry point ──────────────────────────────────────────

export async function runInstallCommand(argv: readonly string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  if (argv[0] === '--help' || argv[0] === '-h') {
    stdout(HELP);
    return 0;
  }

  if (argv[0] === '--recommended') {
    return await handleRecommended(argv.slice(1), stdout, stderr);
  }

  const componentType = argv[0];
  const componentId = argv[1];

  if (componentType === undefined) {
    stderr('Usage: agentsy install <type> <id>');
    stderr('Run "agentsy install --help" for details.');
    return 1;
  }

  if (componentId === undefined) {
    stderr('Missing component ID.');
    stderr('Usage: agentsy install <type> <id>');
    stderr('Run "agentsy install --help" for details.');
    return 1;
  }

  return await handlePositional(componentType, componentId, stdout, stderr);
}
