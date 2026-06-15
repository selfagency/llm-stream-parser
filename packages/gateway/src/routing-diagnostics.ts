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
  /** When the routing decision was made. */
  timestamp: string;
  /** Requested tier. */
  requestedTier: ModelTier;
  /** Requested use case. */
  requestedUseCase?: string;
  /** The selected model entry. */
  selectedModel?: ModelEntry;
  /** The selected replica. */
  selectedReplica?: ModelReplica;
  /** Candidates that were considered and rejected, with reasons. */
  rejectedCandidates: Array<{
    modelId?: string;
    replicaId?: string;
    reasons: string[];
  }>;
  /** Whether the decision involved spillover to another tier. */
  spilloverUsed: boolean;
  /** Whether the decision involved escalation to a higher tier. */
  escalationUsed: boolean;
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
  return {
    timestamp: new Date().toISOString(),
    requestedTier: context.tier,
    requestedUseCase: context.useCase,
    rejectedCandidates: selection.rejectedCandidates.map(c => ({
      replicaId: c.id,
      reasons: c.reasons
    })),
    spilloverUsed: context.spilloverUsed ?? false,
    escalationUsed: context.escalationUsed ?? false
  };
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

  if (diagnostic.rejectedCandidates.length > 0) {
    lines.push('');
    lines.push('  Rejected candidates:');
    for (const rejected of diagnostic.rejectedCandidates) {
      lines.push(`    ${rejected.replicaId ?? rejected.modelId ?? '(unknown)'}`);
      for (const reason of rejected.reasons) {
        lines.push(`      - ${reason}`);
      }
    }
  }

  return lines.join('\n');
}
