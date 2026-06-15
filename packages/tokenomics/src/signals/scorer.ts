/**
 * Frustration scorer — computes a normalized frustration score from
 * accumulated signal events.
 *
 * The score is a value in [0.0, 1.0] that represents the overall
 * frustration level of a session, considering both frustration signals
 * and satisfaction offsets.
 */

import type { FrustrationEvent, FrustrationEventKind, SatisfactionEvent, SignalWeights } from './types.js';
import { DEFAULT_SIGNAL_WEIGHTS } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Maximum contribution per frustration kind (prevents a single signal
 * type from dominating the score).
 */
const MAX_CONTRIBUTION_PER_KIND = 1.0;

/**
 * Maximum satisfaction offset that can reduce the frustration score.
 */
const MAX_SATISFACTION_OFFSET = 0.3;

/**
 * Satisfaction offset per event.
 */
const SATISFACTION_OFFSET_PER_EVENT = 0.1;

// =============================================================================
// Score category
// =============================================================================

/**
 * Frustration level category.
 */
export type FrustrationCategory = 'green' | 'yellow' | 'red';

// =============================================================================
// Result types
// =============================================================================

/**
 * Per-kind signal breakdown for the frustration score.
 */
export interface SignalBreakdown {
  count: number;
  kind: FrustrationEventKind;
  weightedContribution: number;
}

/**
 * Complete frustration scoring result for a session.
 */
export interface FrustrationScoreResult {
  /** Human-readable category. */
  category: FrustrationCategory;
  /** Cost spent (USD) at the time of scoring. */
  costAtFrustrationLevel: number;
  /** Number of satisfaction events that offset the score. */
  satisfactionCount: number;
  /** Satisfaction offset applied (capped at MAX_SATISFACTION_OFFSET). */
  satisfactionOffset: number;
  /** Normalized frustration score in [0.0, 1.0]. */
  score: number;
  /** Per-kind signal breakdown. */
  signals: SignalBreakdown[];
}

// =============================================================================
// Scoring
// =============================================================================

/**
 * Compute a normalized frustration score from accumulated signals.
 *
 * Algorithm:
 * 1. Count frustration events per kind (capped at 1.0 per kind)
 * 2. Multiply each count by its configured weight
 * 3. Sum weighted contributions → raw score
 * 4. Subtract satisfaction offset (up to MAX_SATISFACTION_OFFSET)
 * 5. Clamp result to [0.0, 1.0]
 *
 * @param frustration  Frustration events from the session.
 * @param satisfaction Satisfaction events from the session.
 * @param spendUsd     Total spend in USD for the session.
 * @param weights      Signal weight overrides (defaults used when omitted).
 * @returns The computed frustration score result.
 */
export function computeFrustrationScore(
  frustration: FrustrationEvent[],
  satisfaction: SatisfactionEvent[],
  spendUsd: number,
  weights?: Partial<SignalWeights>
): FrustrationScoreResult {
  const resolvedWeights: SignalWeights = {
    ...DEFAULT_SIGNAL_WEIGHTS,
    ...weights
  };

  // Count events per kind (capped at 1.0 per kind)
  const kindCounts = new Map<FrustrationEventKind, number>();
  for (const event of frustration) {
    const current = kindCounts.get(event.kind) ?? 0;
    kindCounts.set(event.kind, current + 1);
  }

  // Build signal breakdown
  const signals: SignalBreakdown[] = [];
  let rawScore = 0;

  for (const [kind, count] of kindCounts) {
    const cappedCount = Math.min(count, MAX_CONTRIBUTION_PER_KIND);
    const weight = getWeight(kind, resolvedWeights);
    const weightedContribution = cappedCount * weight;
    rawScore += weightedContribution;

    signals.push({
      kind,
      count,
      weightedContribution
    });
  }

  // Satisfaction offset
  const satisfactionOffset = Math.min(satisfaction.length * SATISFACTION_OFFSET_PER_EVENT, MAX_SATISFACTION_OFFSET);

  // Clamp to [0.0, 1.0]
  const score = Math.max(0, Math.min(1, rawScore - satisfactionOffset));

  // Category
  const category = scoreToCategory(score);

  return {
    score,
    category,
    costAtFrustrationLevel: spendUsd,
    signals,
    satisfactionCount: satisfaction.length,
    satisfactionOffset
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Get the configured weight for a frustration kind.
 * Informational kinds (model_switch, context_explosion) return 0.
 */
function getWeight(kind: FrustrationEventKind, weights: SignalWeights): number {
  switch (kind) {
    case 'immediate_rewrite':
      return weights.immediate_rewrite;
    case 'rapid_retry':
      return weights.rapid_retry;
    case 'tool_rejection':
      return weights.tool_rejection;
    case 'repair_loop':
      return weights.repair_loop;
    case 'post_write_error':
      return weights.post_write_error;
    case 'session_abandonment':
      return weights.session_abandonment;
    case 'explicit_negative':
      return weights.explicit_negative;
    case 'model_switch':
    case 'context_explosion':
      return 0;
  }
}

/**
 * Convert a numeric score to a human-readable category.
 */
function scoreToCategory(score: number): FrustrationCategory {
  if (score < 0.3) {
    return 'green';
  }
  if (score < 0.6) {
    return 'yellow';
  }
  return 'red';
}
