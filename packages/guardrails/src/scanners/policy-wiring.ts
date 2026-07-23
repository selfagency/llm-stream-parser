import type { PolicyDocument } from '../policy.js';
import type { PolicyEnforcer } from '../policy-enforcer.js';
import type { GuardrailPhase } from '../types.js';

/**
 * Phase 10 policy wiring — connects the PolicyEnforcer to surface-phase
 * evaluation points.
 *
 * The existing PolicyEnforcer (Phase 36) evaluates tool annotations against
 * policy rules. This extends that coverage to the new Phase 10 surfaces:
 * retrieval, memory, action, egress.
 */

/** All Phase 10 surfaces that should have policy enforcement. */
export const PHASE_10_POLICY_SURFACES: GuardrailPhase[] = ['retrieval', 'memory', 'action', 'egress'];

/**
 * Policy context builder for Phase 10 surfaces.
 * Ensures the correct context shape is passed to the policy enforcer.
 */
export interface SurfacePolicyContext {
  /** The tool annotations (policy-relevant metadata). */
  annotations?: Record<string, unknown>;
  /** Whether a human has approved this operation. */
  approved?: boolean;
  /** The action or operation name (e.g., 'rag_query', 'memory_write'). */
  operation: string;
  /** The surface phase. */
  phase: GuardrailPhase;
  /** The session ID. */
  sessionId: string;
}

/**
 * Evaluate a Phase 10 surface operation against the policy enforcer.
 *
 * @param enforcer — The PolicyEnforcer instance.
 * @param context — The surface policy context.
 * @returns A hook-like result: continue or block.
 */
export function evaluateSurfacePolicy(
  enforcer: PolicyEnforcer,
  context: SurfacePolicyContext
): { continue: boolean; reason?: string } {
  const input = `${context.operation} on ${context.phase}`;
  const policyResult = enforcer.evaluate(input, context.phase, {
    operation: context.operation,
    sessionId: context.sessionId,
    approvalGranted: context.approved,
    ...(context.annotations ? { annotations: context.annotations } : {})
  });

  if (policyResult.result.status === 'block') {
    return {
      continue: false,
      reason: policyResult.result.reason
    };
  }

  return { continue: true };
}

/**
 * Create a policy document scoped to a specific Phase 10 surface.
 * This allows defining surface-specific policy rules.
 *
 * @param surface — The surface phase.
 * @param rules — Policy rules for that surface.
 * @returns A PolicyDocument scoped to the surface.
 */
export function createSurfacePolicy(
  surface: GuardrailPhase,
  rules: Array<{
    action: string;
    effect: 'allow' | 'deny' | 'escalate';
    reason: string;
  }>
): PolicyDocument {
  return {
    policyVersion: '1.0.0',
    description: `Phase 10 policy rules for ${surface} surface`,
    rules: rules.map(rule => ({
      id: `policy-${surface}-${rule.action}`,
      effect: rule.effect as 'allow' | 'deny',
      escalate: rule.effect === 'escalate',
      reason: rule.reason,
      actionPattern: rule.action
    }))
  };
}
