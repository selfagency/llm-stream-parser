/**
 * Routing constraint types and enforcer for guardrails.
 *
 * These constraints are evaluated BEFORE gateway model selection.
 * When a constraint is violated, the enforcer returns a contestable
 * `ConstraintViolation` with a reason code, rather than failing
 * silently.
 *
 * Guardrails handles content policy (prompt injection, PII, ethics).
 * Routing constraints handle authorization (local-only, provider
 * exclusion, compliance rules). They share the runtime hook
 * substrate but live in different conceptual namespaces.
 */

// =============================================================================
// Constraint types
// =============================================================================

/**
 * A constraint that must be satisfied before a model call is routed.
 * Multiple constraints can be combined — they are ANDed together.
 *
 * Note: `@agentsy/gateway` defines `ModelSelectionConstraints` with
 * overlapping capability fields (requireTools, requireJsonMode).
 * When both systems are used together, capability requirements
 * should be kept in sync between the two interfaces.
 */
export interface RoutingConstraint {
  /** Exclude specific providers by id. */
  excludeProviders?: string[];
  /** Force local-only routing. Conflicts with excludeLocal. */
  localOnly?: boolean;

  /** Require specific capabilities. */
  requireJsonMode?: boolean;
  requireReasoning?: boolean;
  requireTools?: boolean;
  requireVision?: boolean;

  /** Optional tag for diagnostics (e.g. 'compliance-policy'). */
  tag?: string;
}

// =============================================================================
// Violation model
// =============================================================================

export type ConstraintViolationCode =
  | 'provider-excluded'
  | 'local-only-no-local-available'
  | 'missing-capability-json'
  | 'missing-capability-reasoning'
  | 'missing-capability-tools'
  | 'missing-capability-vision';

/**
 * Describes a single constraint violation. Multiple violations
 * may be returned for one routing decision.
 */
export interface ConstraintViolation {
  code: ConstraintViolationCode;
  constraint: RoutingConstraint;
  details: string;
}

// =============================================================================
// Evaluator types
// =============================================================================

export interface GatewayModelInfo {
  capabilities: {
    jsonMode: boolean;
    reasoning: boolean;
    tools: boolean;
    vision: boolean;
  };
  isLocal: boolean;
  providerId: string;
}

/**
 * Result of evaluating constraints against a model candidate.
 */
export interface ConstraintEvalResult {
  /** Whether the model satisfies all constraints. */
  pass: boolean;
  /** Violations (empty when pass is true). */
  violations: ConstraintViolation[];
}

// =============================================================================
// Enforcer
// =============================================================================

/**
 * Evaluate all constraints against a model candidate.
 * Returns all violations, not just the first.
 */
export function evaluateConstraints(constraint: RoutingConstraint, model: GatewayModelInfo): ConstraintEvalResult {
  const violations: ConstraintViolation[] = [];

  // Local-only
  if (constraint.localOnly === true && !model.isLocal) {
    violations.push({
      code: 'local-only-no-local-available',
      constraint,
      details: `Constraint requires local-only routing, but ${model.providerId} is a cloud provider`
    });
  }

  // Excluded providers
  if (constraint.excludeProviders?.includes(model.providerId)) {
    violations.push({
      code: 'provider-excluded',
      constraint,
      details: `${model.providerId} is in the excluded providers list`
    });
  }

  // Required capabilities
  if (constraint.requireJsonMode === true && !model.capabilities.jsonMode) {
    violations.push({
      code: 'missing-capability-json',
      constraint,
      details: 'Model does not support JSON mode'
    });
  }
  if (constraint.requireReasoning === true && !model.capabilities.reasoning) {
    violations.push({
      code: 'missing-capability-reasoning',
      constraint,
      details: 'Model does not support extended reasoning'
    });
  }
  if (constraint.requireTools === true && !model.capabilities.tools) {
    violations.push({
      code: 'missing-capability-tools',
      constraint,
      details: 'Model does not support function calling'
    });
  }
  if (constraint.requireVision === true && !model.capabilities.vision) {
    violations.push({
      code: 'missing-capability-vision',
      constraint,
      details: 'Model does not support vision input'
    });
  }

  return { pass: violations.length === 0, violations };
}

// =============================================================================
// Batch evaluator — filter candidates with denial reasons
// =============================================================================

/**
 * Result of evaluating routing constraints against a batch of candidates.
 */
export interface RoutingConstraintEvalBatchResult {
  /**
   * Contestable denial reasons emitted when no route satisfies policy.
   * These are structured reasons that can be challenged or overridden
   * by a human operator or higher-level policy.
   */
  contestableDenials: string[];
  /** Candidates that were rejected, with denial reasons. */
  denied: Array<{
    candidate: GatewayModelInfo;
    violations: ConstraintViolation[];
  }>;
  /** Candidates that passed all constraints. */
  passed: GatewayModelInfo[];
}

/**
 * Evaluate routing constraints against a batch of model candidates.
 * Returns filtered candidates with denial reasons for each rejected
 * candidate, and contestable denial reasons when no route satisfies
 * the policy.
 *
 * @param constraints - The routing constraints to evaluate.
 * @param candidates - The model candidates to evaluate.
 * @returns A batch result with passed, denied, and contestable denials.
 */
export function evaluateRoutingConstraints(
  constraints: RoutingConstraint,
  candidates: GatewayModelInfo[]
): RoutingConstraintEvalBatchResult {
  const passed: GatewayModelInfo[] = [];
  const denied: Array<{ candidate: GatewayModelInfo; violations: ConstraintViolation[] }> = [];
  const contestableDenials: string[] = [];

  for (const candidate of candidates) {
    const result = evaluateConstraints(constraints, candidate);
    if (result.pass) {
      passed.push(candidate);
    } else {
      denied.push({ candidate, violations: result.violations });
    }
  }

  // Emit contestable denial reasons when no route satisfies policy
  if (passed.length === 0 && denied.length > 0) {
    const violationCodes = new Set(denied.flatMap(d => d.violations.map(v => v.code)));
    for (const code of violationCodes) {
      switch (code) {
        case 'local-only-no-local-available': {
          contestableDenials.push(
            'No local models available for the requested tier/use case. ' +
              'Consider relaxing the localOnly constraint or installing a local provider.'
          );
          break;
        }
        case 'provider-excluded': {
          const excludedProviders = constraints.excludeProviders?.join(', ') ?? 'unknown';
          contestableDenials.push(
            `All candidates are from excluded providers (${excludedProviders}). ` +
              'Consider removing the provider exclusion or adding an allowed provider.'
          );
          break;
        }
        case 'missing-capability-json': {
          contestableDenials.push(
            'No model supports JSON mode in the requested tier. ' +
              'Consider relaxing the requireJsonMode constraint or escalating to a higher tier.'
          );
          break;
        }
        case 'missing-capability-reasoning': {
          contestableDenials.push(
            'No model supports extended reasoning in the requested tier. ' +
              'Consider relaxing the requireReasoning constraint or escalating to a higher tier.'
          );
          break;
        }
        case 'missing-capability-tools': {
          contestableDenials.push(
            'No model supports function calling in the requested tier. ' +
              'Consider relaxing the requireTools constraint or escalating to a higher tier.'
          );
          break;
        }
        case 'missing-capability-vision': {
          contestableDenials.push(
            'No model supports vision input in the requested tier. ' +
              'Consider relaxing the requireVision constraint or escalating to a higher tier.'
          );
          break;
        }
        default: {
          contestableDenials.push(
            `No route satisfies policy: constraint violation ${code}. ` +
              'Consider adjusting constraints or escalating to a higher tier.'
          );
          break;
        }
      }
    }
  }

  return { passed, denied, contestableDenials };
}
