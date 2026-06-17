/**
 * Git commit trailer management for AI session attribution.
 *
 * Writes structured metadata as git commit trailers (RFC 2822 trailer format)
 * using `git interpret-trailers`. Opt-in only — controlled by
 * `agentsy.git.attribution = 'trailers' | 'none'` config.
 *
 * @module attribution/git-trailers
 */

import { execSync } from 'node:child_process';
import { safePathEnv } from '@agentsy/shared/safe-path';

// =============================================================================
// Types
// =============================================================================

/**
 * AI session metadata that can be attached to a commit as git trailers.
 *
 * Each field maps to a well-known trailer key:
 * - `sessionId`       → `AI-Session`
 * - `modelId`         → `AI-Model`
 * - `providerId`      → `AI-Provider`
 * - `costUsd`         → `AI-Cost-USD`
 * - `cacheEfficiency` → `AI-Cache-Efficiency`
 * - `frustrationScore`→ `AI-Frustration-Score`
 */
export interface AiTrailers {
  /** Cache efficiency ratio (0.0–1.0). */
  cacheEfficiency: number;
  /** Total cost in USD for the session. */
  costUsd: number;
  /** Frustration score (0.0–1.0). */
  frustrationScore: number;
  /** Model identifier (e.g. "claude-sonnet-4-5"). */
  modelId: string;
  /** Provider identifier (e.g. "anthropic"). */
  providerId: string;
  /** Unique session identifier (e.g. "agentsy:sess_abc123"). */
  sessionId: string;
}

// =============================================================================
// Trailer key constants
// =============================================================================

const TRAILER_KEYS = {
  sessionId: 'AI-Session',
  modelId: 'AI-Model',
  providerId: 'AI-Provider',
  costUsd: 'AI-Cost-USD',
  cacheEfficiency: 'AI-Cache-Efficiency',
  frustrationScore: 'AI-Frustration-Score'
} as const;

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format AI session metadata as RFC 2822 git trailer lines.
 *
 * Each trailer is formatted as `Key: value` with a trailing newline.
 * Numeric values are formatted to 4 decimal places where applicable.
 *
 * @param trailers - The AI session metadata to format.
 * @returns A string of trailer lines suitable for appending to a commit message.
 *
 * @example
 * ```typescript
 * const text = formatTrailers({
 *   sessionId: 'agentsy:sess_abc123',
 *   modelId: 'claude-sonnet-4-5',
 *   providerId: 'anthropic',
 *   costUsd: 0.43,
 *   cacheEfficiency: 0.71,
 *   frustrationScore: 0.08
 * });
 * // AI-Session: agentsy:sess_abc123
 * // AI-Model: claude-sonnet-4-5
 * // AI-Provider: anthropic
 * // AI-Cost-USD: 0.43
 * // AI-Cache-Efficiency: 0.71
 * // AI-Frustration-Score: 0.08
 * ```
 */
export function formatTrailers(trailers: AiTrailers): string {
  const lines: string[] = [];

  lines.push(`${TRAILER_KEYS.sessionId}: ${trailers.sessionId}`);
  lines.push(`${TRAILER_KEYS.modelId}: ${trailers.modelId}`);
  lines.push(`${TRAILER_KEYS.providerId}: ${trailers.providerId}`);
  lines.push(`${TRAILER_KEYS.costUsd}: ${formatNumeric(trailers.costUsd)}`);
  lines.push(`${TRAILER_KEYS.cacheEfficiency}: ${formatNumeric(trailers.cacheEfficiency)}`);
  lines.push(`${TRAILER_KEYS.frustrationScore}: ${formatNumeric(trailers.frustrationScore)}`);

  return `${lines.join('\n')}\n`;
}

// =============================================================================
// Parsing
// =============================================================================

/**
 * Parse AI session metadata from a commit message's trailer block.
 *
 * Scans the commit message for known `AI-*` trailer keys and returns
 * a structured `AiTrailers` object. Returns `null` if no AI trailers
 * are found.
 *
 * @param commitMessage - The full commit message text.
 * @returns Parsed trailers, or `null` if none found.
 *
 * @example
 * ```typescript
 * const msg = `feat: implement cache\n\nAI-Session: agentsy:sess_abc123\nAI-Model: claude-sonnet-4-5`;
 * const trailers = parseTrailers(msg);
 * // { sessionId: 'agentsy:sess_abc123', modelId: 'claude-sonnet-4-5', ... }
 * ```
 */
export function parseTrailers(commitMessage: string): AiTrailers | null {
  const lines = commitMessage.split('\n');

  const raw: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    const colonIndex = trimmed.indexOf(':');

    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    if (key.startsWith('AI-')) {
      raw[key] = value;
    }
  }

  if (Object.keys(raw).length === 0) {
    return null;
  }

  const sessionId = raw[TRAILER_KEYS.sessionId];
  const modelId = raw[TRAILER_KEYS.modelId];
  const providerId = raw[TRAILER_KEYS.providerId];
  const costUsd = raw[TRAILER_KEYS.costUsd];
  const cacheEfficiency = raw[TRAILER_KEYS.cacheEfficiency];
  const frustrationScore = raw[TRAILER_KEYS.frustrationScore];

  if (sessionId === undefined || modelId === undefined || providerId === undefined) {
    return null;
  }

  return {
    sessionId,
    modelId,
    providerId,
    costUsd: costUsd === undefined ? 0 : Number.parseFloat(costUsd),
    cacheEfficiency: cacheEfficiency === undefined ? 0 : Number.parseFloat(cacheEfficiency),
    frustrationScore: frustrationScore === undefined ? 0 : Number.parseFloat(frustrationScore)
  };
}

// =============================================================================
// Append to staged commit
// =============================================================================

/**
 * Append AI session trailers to the currently staged commit.
 *
 * Uses `git interpret-trailers` to append trailers to the commit message
 * of the staged commit. This is an opt-in operation — it should only be
 * called when the user has configured `agentsy.git.attribution = 'trailers'`.
 *
 * The function runs `git log --format=%B -n 1 HEAD` to get the current
 * commit message, appends the formatted trailers, and pipes the result
 * back through `git interpret-trailers --in-place`.
 *
 * @param trailers - The AI session metadata to append.
 * @returns A promise that resolves when the trailers have been written.
 *
 * @throws If the git command fails (e.g. no staged commit, not a git repo).
 */
export function appendTrailersToStagedCommit(trailers: AiTrailers): void {
  const trailerArgs = buildTrailerArgs(trailers);

  execSync(['git', 'interpret-trailers', '--in-place', ...trailerArgs, 'HEAD'].join(' '), {
    env: safePathEnv(),
    stdio: 'pipe',
    encoding: 'utf-8'
  });
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Format a numeric value for trailer output.
 *
 * Rounds to 4 decimal places and removes trailing zeros.
 */
function formatNumeric(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number(value.toFixed(4)).toString();
}

/**
 * Build `--trailer` arguments for `git interpret-trailers`.
 */
function buildTrailerArgs(trailers: AiTrailers): string[] {
  const args: string[] = [];

  args.push(`--trailer=${TRAILER_KEYS.sessionId}=${trailers.sessionId}`);
  args.push(`--trailer=${TRAILER_KEYS.modelId}=${trailers.modelId}`);
  args.push(`--trailer=${TRAILER_KEYS.providerId}=${trailers.providerId}`);
  args.push(`--trailer=${TRAILER_KEYS.costUsd}=${formatNumeric(trailers.costUsd)}`);
  args.push(`--trailer=${TRAILER_KEYS.cacheEfficiency}=${formatNumeric(trailers.cacheEfficiency)}`);
  args.push(`--trailer=${TRAILER_KEYS.frustrationScore}=${formatNumeric(trailers.frustrationScore)}`);

  return args;
}
