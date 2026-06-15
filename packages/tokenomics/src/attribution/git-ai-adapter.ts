/**
 * Git-ai compatibility adapter.
 *
 * Emits agentsy metadata in git-ai compatible format so users with
 * git-ai installed see richer attribution stats (cost, frustration,
 * cache efficiency, token usage) alongside line-level attribution.
 *
 * git-ai's `git ai blame` reads agent hooks that emit attribution data
 * at points during a session. This adapter emits agentsy-compatible
 * metadata that git-ai can consume.
 *
 * @module attribution/git-ai-adapter
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// =============================================================================
// Types
// =============================================================================

/**
 * Agentsy agent metadata compatible with the git-ai attribution standard.
 */
export interface GitAiAgentMetadata {
  /** Agent name (e.g. "agentsy/coder"). */
  agent: string;
  /** Cache efficiency ratio (0–1). */
  cacheEfficiency: number;
  /** Total cost in USD for the session or checkpoint. */
  costUsd: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Frustration score (0–1). */
  frustrationScore: number;
  /** Model identifier (e.g. "claude-sonnet-4-20250514"). */
  model: string;
  /** Provider identifier (e.g. "anthropic"). */
  provider: string;
  /** Session identifier for cross-referencing with the ledger. */
  sessionId: string;
  /** Token usage breakdown. */
  tokensUsed: {
    input: number;
    output: number;
    cacheHit: number;
  };
}

// =============================================================================
// Git-ai checkpoint emitter
// =============================================================================

const GIT_AI_DIR = '.git-ai';
const CHECKPOINT_FILE = 'checkpoints.jsonl';

/**
 * Emit a git-ai-compatible checkpoint record.
 *
 * Writes a JSONL entry to `.git-ai/checkpoints.jsonl` in the repo root,
 * which git-ai's daemon watches for per-line attribution. Also logs the
 * payload to stdout for tool-lifecycle integration.
 *
 * The format follows the git-ai Agent Attribution Standard v3:
 * https://github.com/git-ai-project/git-ai/blob/main/specs/git_ai_standard_v3.0.0.md
 *
 * @param repoRoot  - Absolute path to the git repository root.
 * @param filePaths - File paths affected by this checkpoint.
 * @param metadata  - Agent metadata to associate with this checkpoint.
 */
export function emitGitAiCheckpoint(repoRoot: string, filePaths: string[], metadata: GitAiAgentMetadata): void {
  const payload = {
    version: 3,
    agent: metadata.agent,
    model: metadata.model,
    provider: metadata.provider,
    session: metadata.sessionId,
    cost: metadata.costUsd,
    frustration: metadata.frustrationScore,
    cacheEfficiency: metadata.cacheEfficiency,
    tokens: metadata.tokensUsed,
    duration: metadata.durationMs,
    files: filePaths,
    timestamp: Date.now()
  };

  const jsonLine = `${JSON.stringify(payload)}\n`;

  // Write to the git-ai checkpoint file that their daemon watches
  const checkpointsDir = join(repoRoot, GIT_AI_DIR);
  if (!existsSync(checkpointsDir)) {
    mkdirSync(checkpointsDir, { recursive: true });
  }

  writeFileSync(join(checkpointsDir, CHECKPOINT_FILE), jsonLine, {
    encoding: 'utf-8',
    flag: 'a'
  });

  // Also emit for tool-lifecycle hook integration
  console.log(`[agentsy:git-ai] ${JSON.stringify(payload)}`);
}
