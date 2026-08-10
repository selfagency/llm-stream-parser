/**
 * Routing diagnostics — explainable routing decisions with rejection reasons.
 *
 * Captures why a particular model/replica was selected and which candidates
 * were rejected, enabling transparent debugging of routing behavior.
 */

import type { ModelEntry, ModelReplica, ModelSelectionResult, ModelTier } from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface RoutingDiagnostic {
  /** Whether the decision involved escalation to a higher tier. */
  escalationUsed: boolean;
  /** Candidates that were considered and rejected, with reasons. */
  rejectedCandidates: Array<{
    modelId?: string;
    replicaId?: string;
    reasons: string[];
  }>;
  /** Requested tier. */
  requestedTier: ModelTier;
  /** Requested use case. */
  requestedUseCase?: string;
  /** The selected model entry. */
  selectedModel?: ModelEntry;
  /** The selected replica. */
  selectedReplica?: ModelReplica;
  /** Whether the decision involved spillover to another tier. */
  spilloverUsed: boolean;
  /** When the routing decision was made. */
  timestamp: string;
}

// =============================================================================
// Builder
// =============================================================================

/**
 * Build a routing diagnostic from a model selection result and context.
 */
export function buildRoutingDiagnostic(
  selection: ModelSelectionResult,
  context: {
    tier: ModelTier;
    useCase?: string;
    spilloverUsed?: boolean;
    escalationUsed?: boolean;
  }
): RoutingDiagnostic {
  const diagnostic: RoutingDiagnostic = {
    timestamp: new Date().toISOString(),
    requestedTier: context.tier,
    rejectedCandidates: selection.rejectedCandidates.map(c => ({
      replicaId: c.id,
      reasons: c.reasons
    })),
    spilloverUsed: context.spilloverUsed ?? false,
    escalationUsed: context.escalationUsed ?? false
  };
  if (context.useCase !== undefined) {
    diagnostic.requestedUseCase = context.useCase;
  }
  return diagnostic;
}

/**
 * Format a routing diagnostic as a human-readable string.
 */
export function formatRoutingDiagnostic(diagnostic: RoutingDiagnostic): string {
  const lines: string[] = [
    `Routing Decision — ${diagnostic.timestamp}`,
    `  Tier:        ${diagnostic.requestedTier}`,
    `  Use case:    ${diagnostic.requestedUseCase ?? '(none)'}`,
    `  Spillover:   ${diagnostic.spilloverUsed ? 'yes' : 'no'}`,
    `  Escalation:  ${diagnostic.escalationUsed ? 'yes' : 'no'}`,
    ''
  ];

  if (diagnostic.selectedModel) {
    lines.push(`  Selected model:  ${diagnostic.selectedModel.id} (${diagnostic.selectedModel.tier})`);
  }
  if (diagnostic.selectedReplica) {
    lines.push(`  Selected replica: ${diagnostic.selectedReplica.id} (${diagnostic.selectedReplica.providerId})`);
  }

  const rejected = diagnostic.rejectedCandidates;
  if (rejected.length > 0) {
    const rejectedLines: string[] = ['', '  Rejected candidates:'];
    for (const candidate of rejected) {
      const id = candidate.replicaId ?? candidate.modelId ?? '(unknown)';
      rejectedLines.push(`    ${id}`);
      for (const reason of candidate.reasons) {
        rejectedLines.push(`      - ${reason}`);
      }
    }
    lines.push(...rejectedLines);
  }

  return lines.join('\n');
}
