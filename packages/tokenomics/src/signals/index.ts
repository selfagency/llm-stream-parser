/**
 * Signals module — frustration/satisfaction detection, collection, and scoring.
 *
 * Phase 2 of the tokenomics plan: detect when users are frustrated with
 * agent output and compute a normalized frustration score for each session.
 */

// Abandonment detector
export { detectAbandonment, MIN_SESSION_MS } from './abandonment-detector.js';
// Collector
export type { EmbeddingFunction, HookRegistry } from './collector.js';
export { SignalCollector } from './collector.js';
// Retry detector
export { cosineSimilarity, RETRY_SIMILARITY_THRESHOLD, RETRY_TURN_WINDOW, RetryDetector } from './retry-detector.js';
// Rewrite detector
export { MIN_REWRITE_LINES, REWRITE_WINDOW_MS, RewriteDetector } from './rewrite-detector.js';
// Scorer types
export type {
  FrustrationCategory,
  FrustrationScoreResult,
  SignalBreakdown
} from './scorer.js';
// Scorer
export { computeFrustrationScore } from './scorer.js';
// Types
export type {
  FrustrationEvent,
  FrustrationEventKind,
  SatisfactionEvent,
  SatisfactionEventKind,
  SignalWeights
} from './types.js';
export { DEFAULT_SIGNAL_WEIGHTS } from './types.js';
