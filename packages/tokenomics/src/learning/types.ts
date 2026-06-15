/**
 * Learning loop types for the tokenomics system.
 *
 * The learning loop closes the feedback cycle by detecting recurring
 * frustration patterns (FailureMode), generating corrective patches
 * (PromptPatch), and tracking reinforcement signals when sessions
 * go well (ReinforcedPattern).
 *
 * @module learning/types
 */

import type { FrustrationEventKind } from '../signals/types.js';

// =============================================================================
// Failure mode — recurring frustration pattern
// =============================================================================

/**
 * A recurring failure pattern detected across multiple agent sessions.
 *
 * Failure modes are identified statistically by clustering sessions
 * that share model/agent/task context and exhibit similar frustration
 * signals. Each failure mode represents an opportunity to improve the
 * agent's behavior through prompt patches or routing adjustments.
 */
export interface FailureMode {
  /** Agent IDs observed in this pattern. */
  agentIds: string[];
  /** Average frustration score across evidence sessions. */
  avgFrustrationScore: number;
  /** Human-readable category label (e.g. "rewrite-loop", "tool-rejection"). */
  category: string;
  /** Statistical confidence [0, 1] in the pattern's validity. */
  confidence: number;
  /** Context fingerprint derived from model/agent/task context. */
  contextFingerprint: string;
  /** Dominant frustration kind driving this failure mode. */
  dominantSignalKind: FrustrationEventKind;
  /** Session IDs that form the evidence for this failure mode. */
  evidenceSessions: string[];
  /** When the pattern was first observed. */
  firstSeenAt: Date;
  /** Unique identifier. */
  id: string;
  /** When the pattern was last observed. */
  lastSeenAt: Date;
  /** Model IDs observed in this pattern. */
  modelIds: string[];
  /** Number of sessions exhibiting this pattern. */
  sessionCount: number;
}

// =============================================================================
// Prompt patch — corrective action for a failure mode
// =============================================================================

/**
 * Target surface for a prompt patch.
 *
 * Each target type corresponds to a different place where behavior
 * can be modified — instructions, skill definitions, tool policies,
 * or model routing configurations.
 */
export type PatchTarget = 'instructions' | 'skill' | 'tool-policy' | 'model-routing';

/**
 * Lifecycle status of a prompt patch.
 */
export type PatchStatus = 'pending' | 'approved' | 'rejected' | 'applied';

/**
 * A generated corrective patch for a failure mode.
 *
 * Patches are produced by an LLM (one call per failure mode) based on
 * structured evidence from the sessions that form the failure mode.
 * They require approval before being applied unless confidence >= 0.9.
 */
export interface PromptPatch {
  /** When the patch was applied (null if not yet applied). */
  appliedAt: Date | null;
  /** Confidence this patch will resolve the failure mode [0, 1]. */
  confidence: number;
  /** Generated patch content (instructions, policy, etc.). */
  content: string;
  /** When the patch was created. */
  createdAt: Date;
  /** The failure mode this patch addresses. */
  failureModeId: string;
  /** Unique identifier. */
  id: string;
  /** Reason for rejection (null if not rejected). */
  rejectionReason?: string;
  /** Section or sub-path within the target. */
  section: string;
  /** Current lifecycle status. */
  status: PatchStatus;
  /** Target surface for the patch. */
  target: PatchTarget;
  /** Path within the target surface (e.g. skill name, config key). */
  targetPath: string;
}

// =============================================================================
// Reinforced pattern — positive reinforcement signal
// =============================================================================

/**
 * A positively reinforced pattern — a combination of model, agent, and
 * task context that consistently produces good outcomes.
 *
 * Reinforced patterns increase routing weight for the associated
 * model/agent combination, making it more likely to be selected
 * for similar tasks in the future.
 */
export interface ReinforcedPattern {
  /** The agent that performed well. */
  agentId: string;
  /** Average frustration score across pattern sessions. */
  avgFrustrationScore: number;
  /** Average survival rate across pattern sessions. */
  avgSurvivalRate: number;
  /** Unique identifier. */
  id: string;
  /** The model that performed well. */
  modelId: string;
  /** Routing weight boost [0, 2] for this model/agent pair. */
  routingWeight: number;
  /** Number of sessions contributing to this pattern. */
  sessionCount: number;
  /** Optional skill fingerprint for context. */
  skillFingerprint: string;
  /** Task category where the pattern was observed. */
  taskCategory: string;
}

// =============================================================================
// Clustering input types
// =============================================================================

/**
 * An intermediate cluster produced during pattern recognition.
 *
 * Represents a group of sessions that share the same dominant
 * frustration signal and have compatible context fingerprints.
 */
export interface SignalCluster {
  /** Agent IDs in the cluster. */
  agentIds: string[];
  /** Average frustration score across sessions. */
  avgFrustrationScore: number;
  /** Context fingerprint shared across the cluster. */
  contextFingerprint: string;
  /** The dominant frustration event kind for this cluster. */
  dominantSignalKind: FrustrationEventKind;
  /** First observed timestamp. */
  firstSeenAt: Date;
  /** Last observed timestamp. */
  lastSeenAt: Date;
  /** Model IDs in the cluster. */
  modelIds: string[];
  /** Session IDs in the cluster. */
  sessionIds: string[];
  /** Counter of each frustration kind across sessions in this cluster. */
  signalKindCounts: Record<string, number>;
}

// =============================================================================
// Options
// =============================================================================

/**
 * Options for the pattern recognition process.
 */
export interface PatternRecognitionOptions {
  /** Context keys to use for fingerprinting (default: ['modelId', 'agentId']). */
  fingerprintKeys?: string[];
  /** Lookback window in days (default: 90). */
  lookbackDays?: number;
  /** Minimum confidence to promote a cluster (default: 0.6). */
  minConfidence?: number;
  /** Minimum sessions to promote a cluster to a FailureMode (default: 3). */
  minSessionCount?: number;
}

/**
 * Options for the patch generation process.
 */
export interface PatchGenerationOptions {
  /** Minimum patch confidence to apply automatically (default: 0.9). */
  autoApplyThreshold?: number;
  /** LLM model to use for generation (default: 'gpt-4o'). */
  model?: string;
}

/**
 * Options for the reinforcement process.
 */
export interface ReinforcementOptions {
  /** Base routing weight for new patterns (default: 1.0). */
  baseRoutingWeight?: number;
  /** Maximum frustration score to qualify as a positive session (default: 0.15). */
  maxFrustrationScore?: number;
  /** Minimum survival rate to qualify (default: 0.80). */
  minSurvivalRate?: number;
}
