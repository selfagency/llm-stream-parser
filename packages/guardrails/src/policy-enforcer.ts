import type { PolicyDocument, PolicyRule } from './policy.js';
import { DEFAULT_POLICY, evaluatePolicy } from './policy.js';
import type { Detection, GuardrailDecisionReceipt, GuardrailPhase, GuardrailResult } from './types.js';

// =============================================================================
// Action mapping tables
// =============================================================================

const ACTION_TO_STATUS: Record<string, GuardrailResult['status']> = {
  deny: 'block',
  require_approval: 'escalate',
  allow: 'pass',
  redact: 'transform',
  log: 'pass'
};

const ACTION_TO_RISK_TIER: Record<string, GuardrailDecisionReceipt['riskTier']> = {
  deny: 'prohibited',
  require_approval: 'high',
  redact: 'moderate'
};

// =============================================================================
// Detection factory
// =============================================================================

function makeDetection(
  id: string,
  severity: 'low' | 'medium' | 'high' | 'critical' | undefined,
  description: string | undefined,
  confidence: number
): Detection {
  return { id, severity: severity ?? 'medium', description: description ?? 'Policy enforcement', confidence };
}

// =============================================================================
// Result shape builders
// =============================================================================

function buildBlockResult(
  phase: GuardrailPhase,
  rule: { name?: string; description?: string; severity?: string } | undefined
): GuardrailResult {
  return {
    status: 'block',
    phase,
    reason: `Policy denied: ${rule?.name ?? 'unknown'} — ${rule?.description ?? ''}`,
    detections: [makeDetection('policy-deny', rule?.severity as 'critical' | undefined, rule?.description, 1.0)]
  };
}

function buildEscalateResult(
  phase: GuardrailPhase,
  rule: { name?: string; description?: string; severity?: string } | undefined
): GuardrailResult {
  return {
    status: 'escalate',
    phase,
    reason: `Policy requires approval: ${rule?.name ?? 'unknown'}`,
    riskScore: 0.8,
    detections: [makeDetection('policy-escalate', rule?.severity as 'high' | undefined, rule?.description, 0.95)]
  };
}

function buildTransformResult(
  phase: GuardrailPhase,
  rule: { description?: string; severity?: string } | undefined,
  input: string
): GuardrailResult {
  return {
    status: 'transform',
    phase,
    sanitized: input,
    transformReason: 'redaction',
    detections: [makeDetection('policy-redact', rule?.severity as 'medium' | undefined, rule?.description, 0.95)]
  };
}

const RESULT_BUILDERS: Record<
  string,
  (phase: GuardrailPhase, rule: PolicyRule | undefined, input: string) => GuardrailResult
> = {
  block: buildBlockResult,
  escalate: buildEscalateResult,
  transform: buildTransformResult
};

// =============================================================================
// Receipt builder
// =============================================================================

function buildReceipt(
  status: GuardrailResult['status'],
  action: string,
  riskTier: GuardrailDecisionReceipt['riskTier'],
  phase: GuardrailPhase,
  sessionId: string,
  ruleName: string | undefined,
  detections: readonly Detection[]
): GuardrailDecisionReceipt {
  return {
    policyId: `policy:${ruleName ?? 'unknown'}`,
    decision: status,
    reasonCode: action.toUpperCase(),
    riskTier,
    surface: phase === 'tool-input' ? 'tool' : 'input',
    phase,
    timestamp: new Date().toISOString(),
    correlationId: `${sessionId}:${Date.now()}`,
    sessionId,
    detections
  };
}

function buildPassReceipt(sessionId: string, phase: GuardrailPhase): GuardrailDecisionReceipt {
  return {
    policyId: 'policy:no-match',
    decision: 'pass',
    reasonCode: 'NO_MATCHING_POLICY_RULE',
    riskTier: 'low',
    surface: 'input',
    phase,
    timestamp: new Date().toISOString(),
    correlationId: `${sessionId}:${Date.now()}`,
    sessionId,
    detections: []
  };
}

// =============================================================================
// Policy context builder
// =============================================================================

function buildPolicyContext(
  input: string,
  phase: GuardrailPhase,
  context?: Record<string, unknown>
): Record<string, unknown> {
  const sessionId = (context?.sessionId as string) ?? 'unknown';
  const metadata: Record<string, unknown> = { phase, sessionId };
  const toolName = context?.toolName as string | undefined;

  if (toolName) {
    const toolAnnotations = context?.annotations as Record<string, boolean | undefined> | undefined;
    return {
      tool: { name: toolName, ...(toolAnnotations ? { annotations: toolAnnotations } : {}) },
      input: { text: input },
      metadata
    };
  }

  return { input: { text: input }, metadata };
}

// =============================================================================
// PolicyEnforcer
// =============================================================================

export class PolicyEnforcer {
  readonly #document: PolicyDocument;

  constructor(document?: PolicyDocument, _defaultPhase?: GuardrailPhase) {
    this.#document = document ?? DEFAULT_POLICY;
  }

  evaluate(
    input: string,
    phase: GuardrailPhase,
    context?: Record<string, unknown>
  ): {
    result: GuardrailResult;
    receipt: GuardrailDecisionReceipt;
  } {
    const sessionId = (context?.sessionId as string) ?? 'unknown';
    const policyContext = buildPolicyContext(input, phase, context);
    const evalResult = evaluatePolicy(this.#document, policyContext as Parameters<typeof evaluatePolicy>[1]);

    if (!(evalResult.matched && evalResult.action) || evalResult.action === 'allow') {
      return { result: { status: 'pass', phase }, receipt: buildPassReceipt(sessionId, phase) };
    }

    const status = ACTION_TO_STATUS[evalResult.action] ?? 'pass';
    const riskTier = ACTION_TO_RISK_TIER[evalResult.action] ?? 'low';
    const builder = RESULT_BUILDERS[status];
    const result = builder ? builder(phase, evalResult.rule, input) : { status: 'pass' as const, phase };
    const receipt = buildReceipt(
      result.status,
      evalResult.action,
      riskTier,
      phase,
      sessionId,
      evalResult.rule?.name,
      result.detections ?? []
    );

    return { result, receipt };
  }
}
