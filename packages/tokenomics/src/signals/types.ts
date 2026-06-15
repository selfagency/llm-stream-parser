/**
 * Signal types for the frustration/satisfaction detection system.
 *
 * Defines the event kinds, event interfaces, and weight configuration
 * used by the SignalCollector and frustration scoring pipeline.
 */

// =============================================================================
// Event kinds
// =============================================================================

/**
 * Kinds of frustration events that can be detected during a session.
 */
export type FrustrationEventKind =
  | 'immediate_rewrite'
  | 'rapid_retry'
  | 'tool_rejection'
  | 'repair_loop'
  | 'post_write_error'
  | 'session_abandonment'
  | 'explicit_negative'
  | 'model_switch'
  | 'context_explosion';

/**
 * Kinds of satisfaction events that can be detected during a session.
 */
export type SatisfactionEventKind = 'clean_commit' | 'explicit_positive' | 'fast_accept' | 'deployment_after_session';

// =============================================================================
// Event interfaces
// =============================================================================

/**
 * A frustration signal detected during an agent session.
 */
export interface FrustrationEvent {
  /** The kind of frustration signal. */
  kind: FrustrationEventKind;
  /** Arbitrary metadata attached to the event. */
  metadata: Record<string, unknown>;
  /** Session identifier. */
  sessionId: string;
  /** Wall-clock timestamp in milliseconds. */
  timestampMs: number;
  /** Turn index within the session where the signal occurred. */
  turnIndex: number;
  /** Signal weight override (defaults to the configured weight for this kind). */
  weight?: number;
}

/**
 * A satisfaction signal detected during or after an agent session.
 */
export interface SatisfactionEvent {
  /** The kind of satisfaction signal. */
  kind: SatisfactionEventKind;
  /** Arbitrary metadata attached to the event. */
  metadata: Record<string, unknown>;
  /** Session identifier. */
  sessionId: string;
  /** Wall-clock timestamp in milliseconds. */
  timestampMs: number;
}

// =============================================================================
// Signal weights
// =============================================================================

/**
 * Default frustration signal weights.
 *
 * These represent the relative severity of each frustration kind.
 * Higher values contribute more to the final frustration score.
 */
export const DEFAULT_SIGNAL_WEIGHTS: SignalWeights = {
  immediate_rewrite: 0.3,
  rapid_retry: 0.2,
  tool_rejection: 0.15,
  repair_loop: 0.15,
  post_write_error: 0.1,
  session_abandonment: 0.05,
  explicit_negative: 0.05
};

/**
 * Weight configuration for each frustration signal kind.
 *
 * Only the 7 frustration kinds that contribute to the score are
 * included — `model_switch` and `context_explosion` are informational
 * and do not carry a weight.
 */
export interface SignalWeights {
  explicit_negative: number;
  immediate_rewrite: number;
  post_write_error: number;
  rapid_retry: number;
  repair_loop: number;
  session_abandonment: number;
  tool_rejection: number;
}
