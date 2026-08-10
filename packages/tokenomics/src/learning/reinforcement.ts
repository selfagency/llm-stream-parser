/**
 * Reinforcement — positive reinforcement pattern tracking for the
 * learning loop.
 *
 * When a session meets all criteria (frustrationScore < 0.15,
 * testsPassed, survivalRate > 0.80), a ReinforcedPattern is upserted
 * to increase routing weight for the associated model/agent combination.
 *
 * @module learning/reinforcement
 */

import { randomUUID } from 'node:crypto';
import type { SessionLedgerEntry } from '../ledger/types.js';
import type { ReinforcedPattern, ReinforcementOptions } from './types.js';

// =============================================================================
// Default options
// =============================================================================

const DEFAULT_OPTIONS: Required<ReinforcementOptions> = {
  maxFrustrationScore: 0.15,
  minSurvivalRate: 0.8,
  baseRoutingWeight: 1.0
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Process a ledger entry and upsert a ReinforcedPattern if the session
 * meets all positive reinforcement criteria.
 *
 * Criteria:
 * 1. Frustration score must be below maxFrustrationScore (default: 0.15)
 * 2. Tests must have passed (inferred from tags or quality score)
 * 3. Survival rate must be above minSurvivalRate (default: 0.80)
 *
 * @param entry            - The ledger entry to evaluate.
 * @param existingPatterns - Currently tracked reinforced patterns.
 * @param options          - Reinforcement options.
 * @returns The upserted ReinforcedPattern, or null if criteria not met.
 */
export function reinforcePattern(
  entry: SessionLedgerEntry,
  existingPatterns: ReinforcedPattern[],
  options?: ReinforcementOptions
): ReinforcedPattern | null {
  const opts: Required<ReinforcementOptions> = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  // Check frustration criteria
  const frustrationScore = computeFrustrationScoreFromEntry(entry);
  if (frustrationScore > opts.maxFrustrationScore) {
    return null;
  }

  // Check tests passed criteria
  if (!checkTestsPassed(entry)) {
    return null;
  }

  // Check survival rate criteria
  if (entry.survivalRate30d === null) {
    return null;
  }
  if (entry.survivalRate30d < opts.minSurvivalRate) {
    return null;
  }

  // Check that we have a model and agent
  if (!(entry.modelId && entry.agentId)) {
    return null;
  }

  // Derive task category from tags
  const taskCategory = deriveTaskCategory(entry.tags);

  // Build skill fingerprint
  const skillFingerprint = buildSkillFingerprint(entry);

  // Find existing pattern
  const existingIdx = existingPatterns.findIndex(
    p => p.modelId === entry.modelId && p.agentId === entry.agentId && p.taskCategory === taskCategory
  );

  if (existingIdx >= 0) {
    // Update existing pattern
    const existing = existingPatterns[existingIdx];
    if (!existing) {
      return null;
    }

    const newSessionCount = existing.sessionCount + 1;
    const newAvgFrustration =
      (existing.avgFrustrationScore * existing.sessionCount + frustrationScore) / newSessionCount;
    const survivalRate = entry.survivalRate30d ?? existing.avgSurvivalRate;
    const newAvgSurvival = (existing.avgSurvivalRate * existing.sessionCount + survivalRate) / newSessionCount;

    // Decay weight slightly to avoid runaway growth, then boost
    const decayedWeight = existing.routingWeight * 0.98;
    const boost = 0.05;
    const newWeight = Math.min(2.0, decayedWeight + boost);

    return {
      ...existing,
      avgFrustrationScore: Number(newAvgFrustration.toFixed(4)),
      avgSurvivalRate: Number(newAvgSurvival.toFixed(4)),
      sessionCount: newSessionCount,
      routingWeight: Number(newWeight.toFixed(4))
    };
  }

  // Create new pattern
  const survivalRate = entry.survivalRate30d ?? 0;

  return {
    id: randomUUID(),
    modelId: entry.modelId,
    agentId: entry.agentId,
    skillFingerprint,
    taskCategory,
    avgFrustrationScore: frustrationScore,
    avgSurvivalRate: survivalRate,
    sessionCount: 1,
    routingWeight: opts.baseRoutingWeight
  };
}

/**
 * Get routing weights from all reinforced patterns.
 *
 * Returns a map of `{modelId: { agentId: weight }}` that can be used
 * by the routing system to boost scores for well-performing pairs.
 *
 * @param patterns - Currently tracked reinforced patterns.
 * @returns A nested routing weight map.
 */
export function getRoutingWeights(patterns: ReinforcedPattern[]): Record<string, Record<string, number>> {
  // Null-prototype object prevents prototype pollution via __proto__/constructor/prototype modelIds
  const weights: Record<string, Record<string, number>> = Object.create(null) as Record<string, Record<string, number>>;

  for (const pattern of patterns) {
    const agentWeights = weights[pattern.modelId] ?? (Object.create(null) as Record<string, number>);
    agentWeights[pattern.agentId] = pattern.routingWeight;
    weights[pattern.modelId] = agentWeights;
  }

  return weights;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute a frustration score from a ledger entry's frustration record.
 *
 * Since the ledger entry stores raw frustration counts, we derive
 * a normalized score: count / 10 (empirical baseline), capped at 1.0.
 */
function computeFrustrationScoreFromEntry(entry: SessionLedgerEntry): number {
  return Math.min(1, entry.frustration.count / 10);
}

/**
 * Check whether a session's tests passed.
 *
 * Uses heuristic indicators: the presence of a "tests-passed" tag
 * or a quality score above 0.5.
 */
function checkTestsPassed(entry: SessionLedgerEntry): boolean {
  const tagNorm = entry.tags.map(t => t.toLowerCase());

  // Direct tag match
  if (tagNorm.includes('tests-passed') || tagNorm.includes('test-passed')) {
    return true;
  }

  // Quality score heuristic: scores > 0.5 usually indicate passing tests
  if (entry.quality.score > 0.5 && entry.quality.feedbackCount > 0) {
    return true;
  }

  return false;
}

/**
 * Derive a task category from session tags.
 *
 * Falls back to 'general' when no task-specific tags are present.
 * Category is the first tag that looks like a task label (reasonably
 * short, not an ID).
 */
function deriveTaskCategory(tags: string[]): string {
  const categoryKeywords = [
    'feature',
    'bugfix',
    'refactor',
    'docs',
    'test',
    'config',
    'review',
    'deploy',
    'research',
    'chore'
  ];

  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const keyword of categoryKeywords) {
      if (lower.includes(keyword)) {
        return keyword;
      }
    }
  }

  return 'general';
}

/**
 * Build a skill fingerprint from ledger entry properties.
 *
 * Combines model and agent IDs and the first matching task category
 * tag into a stable fingerprint string.
 */
function buildSkillFingerprint(entry: SessionLedgerEntry): string {
  const firstCategoryTag = deriveTaskCategory(entry.tags);
  return `${entry.modelId}:${entry.agentId}:${firstCategoryTag}`;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { ReinforcedPattern, ReinforcementOptions };
