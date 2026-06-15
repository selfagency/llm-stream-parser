/**
 * Pattern recognizer — statistical clustering of frustration signals
 * into FailureMode candidates.
 *
 * This module scans ledger entries for clusters of similar frustration
 * signals, grouping by session context (model, agent, task category)
 * and dominant frustration event kind. It produces FailureMode records
 * when sufficient evidence accumulates (sessionCount >= 3, confidence >= 0.6).
 *
 * No LLM calls are used — pure statistical clustering.
 *
 * @module learning/pattern-recognizer
 */

import type { SessionLedgerEntry } from '../ledger/types.js';
import type { FrustrationEventKind } from '../signals/types.js';
import type { FailureMode, PatternRecognitionOptions, SignalCluster } from './types.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OPTIONS: Required<PatternRecognitionOptions> = {
  minSessionCount: 3,
  minConfidence: 0.6,
  lookbackDays: 90,
  fingerprintKeys: ['modelId', 'agentId']
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Scan ledger entries for clusters of similar frustration signals and
 * produce FailureMode records when sufficient evidence exists.
 *
 * @param entries             - Session ledger entries to scan.
 * @param existingFailureModes - Previously detected failure modes (for dedup).
 * @param options             - Pattern recognition options.
 * @returns Detected failure modes.
 */
export function recognizePatterns(
  entries: SessionLedgerEntry[],
  existingFailureModes: FailureMode[] = [],
  options?: PatternRecognitionOptions
): FailureMode[] {
  const opts: Required<PatternRecognitionOptions> = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  // Filter by lookback window
  const cutoffMs = Date.now() - opts.lookbackDays * 86_400_000;
  const recentEntries = entries.filter(e => e.endedAt.getTime() >= cutoffMs);

  // Filter to entries with frustration signals
  const frustratedEntries = recentEntries.filter(e => e.frustration.count > 0);

  if (frustratedEntries.length === 0) {
    return [];
  }

  const clusters = buildClusters(frustratedEntries, opts.fingerprintKeys);
  return promoteToFailureModes(clusters, existingFailureModes, opts);
}

function buildClusters(entries: SessionLedgerEntry[], fingerprintKeys: string[]): Map<string, SignalCluster> {
  const clusterMap = new Map<string, SignalCluster>();

  for (const entry of entries) {
    const fingerprint = buildContextFingerprint(entry, fingerprintKeys);
    const dominantKind = extractDominantKind(entry);
    const key = `${fingerprint}::${dominantKind}`;
    const existing = clusterMap.get(key);

    if (existing) {
      existing.sessionIds.push(entry.sessionId);
      existing.signalKindCounts[dominantKind] = (existing.signalKindCounts[dominantKind] ?? 0) + 1;

      if (!existing.modelIds.includes(entry.modelId)) {
        existing.modelIds.push(entry.modelId);
      }
      if (!existing.agentIds.includes(entry.agentId)) {
        existing.agentIds.push(entry.agentId);
      }

      existing.avgFrustrationScore = computeRollingAverage(
        existing.avgFrustrationScore,
        existing.sessionIds.length - 1,
        computeSignalScore(entry)
      );

      if (entry.endedAt.getTime() > existing.lastSeenAt.getTime()) {
        existing.lastSeenAt = entry.endedAt;
      }
    } else {
      clusterMap.set(key, {
        dominantSignalKind: dominantKind,
        signalKindCounts: { [dominantKind]: 1 },
        sessionIds: [entry.sessionId],
        contextFingerprint: fingerprint,
        modelIds: [entry.modelId],
        agentIds: [entry.agentId],
        avgFrustrationScore: computeSignalScore(entry),
        firstSeenAt: entry.endedAt,
        lastSeenAt: entry.endedAt
      });
    }
  }

  return clusterMap;
}

function promoteToFailureModes(
  clusterMap: Map<string, SignalCluster>,
  existingFailureModes: FailureMode[],
  opts: Required<PatternRecognitionOptions>
): FailureMode[] {
  const existingIds = new Set(existingFailureModes.map(f => f.id));
  const failureModes: FailureMode[] = [];

  for (const [_key, cluster] of clusterMap) {
    const sessionCount = cluster.sessionIds.length;
    if (sessionCount < opts.minSessionCount) {
      continue;
    }

    const homogeneity = computeClusterHomogeneity(cluster);
    const confidence = computeConfidence(sessionCount, homogeneity);

    if (confidence < opts.minConfidence) {
      continue;
    }

    const category = deriveCategory(cluster.dominantSignalKind, cluster.contextFingerprint);
    const modeId = generateFailureModeId(cluster);

    if (existingIds.has(modeId)) {
      continue;
    }

    failureModes.push({
      id: modeId,
      category,
      dominantSignalKind: cluster.dominantSignalKind,
      sessionCount,
      confidence,
      evidenceSessions: [...cluster.sessionIds],
      contextFingerprint: cluster.contextFingerprint,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      avgFrustrationScore: cluster.avgFrustrationScore,
      agentIds: [...cluster.agentIds],
      modelIds: [...cluster.modelIds]
    });
  }

  return failureModes;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a context fingerprint from specified fields of a ledger entry.
 *
 * The fingerprint is a deterministic string derived from the entry's
 * model, agent, and optionally other context fields. This is used
 * to group similar sessions together.
 */
function buildContextFingerprint(entry: SessionLedgerEntry, keys: string[]): string {
  const parts: string[] = [];

  for (const key of keys) {
    switch (key) {
      case 'modelId':
        parts.push(`m:${entry.modelId}`);
        break;
      case 'agentId':
        parts.push(`a:${entry.agentId}`);
        break;
      default:
        break;
    }
  }

  return parts.join('|');
}

/**
 * Extract the dominant frustration kind from a ledger entry's reasons.
 *
 * Parses the first frustration reason and maps it to a FrustrationEventKind.
 * Falls back to a generic label when no known pattern is matched.
 */
function extractDominantKind(entry: SessionLedgerEntry): FrustrationEventKind {
  const reasons = entry.frustration.reasons;
  if (reasons.length === 0) {
    return 'tool_rejection' as FrustrationEventKind;
  }

  const reason = reasons[0]?.toLowerCase() ?? '';

  if (reason.includes('rewrite') || reason.includes('revert')) {
    return 'immediate_rewrite' as FrustrationEventKind;
  }
  if (reason.includes('retry') || reason.includes('timeout')) {
    return 'rapid_retry' as FrustrationEventKind;
  }
  if (reason.includes('reject') || reason.includes('denied')) {
    return 'tool_rejection' as FrustrationEventKind;
  }
  if (reason.includes('repair') || reason.includes('fix')) {
    return 'repair_loop' as FrustrationEventKind;
  }
  if (reason.includes('error') || reason.includes('fail')) {
    return 'post_write_error' as FrustrationEventKind;
  }
  if (reason.includes('abandon') || reason.includes('quit')) {
    return 'session_abandonment' as FrustrationEventKind;
  }
  if (reason.includes('negative')) {
    return 'explicit_negative' as FrustrationEventKind;
  }
  if (reason.includes('switch') || reason.includes('swap')) {
    return 'model_switch' as FrustrationEventKind;
  }

  return 'tool_rejection' as FrustrationEventKind;
}

/**
 * Compute a signal score from a ledger entry's frustration data.
 *
 * Uses count divided by 10 (empirical baseline) capped at 1.0
 * as a simple frustration density metric.
 */
function computeSignalScore(entry: SessionLedgerEntry): number {
  return Math.min(1, entry.frustration.count / 10);
}

/**
 * Compute the homogeneity of a cluster — how concentrated the signals
 * are in the dominant kind vs. spread across multiple kinds.
 *
 * Returns a value in [0, 1] where 1.0 means all signals are the same kind.
 */
function computeClusterHomogeneity(cluster: SignalCluster): number {
  const counts = Object.values(cluster.signalKindCounts);
  if (counts.length === 0) {
    return 0;
  }

  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) {
    return 0;
  }

  const maxCount = Math.max(...counts);
  return maxCount / total;
}

/**
 * Compute confidence that a cluster represents a genuine recurring pattern.
 *
 * Confidence increases with session count (diminishing returns) and
 * cluster homogeneity (highly concentrated signals are more reliable).
 */
function computeConfidence(sessionCount: number, homogeneity: number): number {
  // Session scaling: asymptotic approach to 1.0, 80% at 8 sessions
  const sessionFactor = 1 - Math.exp(-sessionCount / 4);

  // Combined confidence: 60% from sessions, 40% from homogeneity
  return sessionFactor * 0.6 + homogeneity * 0.4;
}

/**
 * Derive a human-readable category from the dominant signal kind
 * and context fingerprint.
 */
function deriveCategory(dominantKind: FrustrationEventKind, fingerprint: string): string {
  const kindLabels: Record<string, string> = {
    immediate_rewrite: 'rewrite-loop',
    rapid_retry: 'retry-storm',
    tool_rejection: 'tool-rejection-loop',
    repair_loop: 'repair-cycle',
    post_write_error: 'post-write-error',
    session_abandonment: 'session-abandonment',
    explicit_negative: 'explicit-negative-feedback',
    model_switch: 'model-switch-instability',
    context_explosion: 'context-overflow'
  };

  const kindLabel = kindLabels[dominantKind] ?? 'unknown-pattern';
  const modelMatch = fingerprint.match(/m:([^|]+)/);
  const modelTag = modelMatch ? modelMatch[1] : 'unknown';

  return `${kindLabel}@${modelTag}`;
}

/**
 * Generate a deterministic failure mode ID from cluster properties.
 *
 * Uses a simple hash of the fingerprint and dominant kind to ensure
 * the same pattern produces the same ID across runs.
 */
function generateFailureModeId(cluster: SignalCluster): string {
  const raw = `${cluster.contextFingerprint}::${cluster.dominantSignalKind}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    // biome-ignore lint/suspicious/noBitwiseOperators: stable hash for deterministic ID generation
    hash = (hash << 5) - hash + char;
    // biome-ignore lint/suspicious/noBitwiseOperators: 32-bit integer conversion
    hash |= 0;
  }
  return `fm_${Math.abs(hash).toString(36).padStart(6, '0')}`;
}

/**
 * Compute a rolling average when adding a new value to an existing average.
 */
function computeRollingAverage(currentAvg: number, currentCount: number, newValue: number): number {
  if (currentCount <= 0) {
    return newValue;
  }
  return currentAvg + (newValue - currentAvg) / (currentCount + 1);
}

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type { FailureMode, PatternRecognitionOptions, SignalCluster };
