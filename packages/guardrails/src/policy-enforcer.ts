import type { PolicyDocument } from './policy.js';
import { DEFAULT_POLICY, evaluatePolicy } from './policy.js';
import type { GuardrailDecisionReceipt, GuardrailPhase, GuardrailResult } from './types.js';

// =============================================================================
// Types
// =============================================================================

function policyActionToResultStatus(action: string | undefined): GuardrailResult['status'] {
  switch (action) {
    case 'deny': {
      return 'block';
    }
    case 'require_approval': {
      return 'escalate';
    }
    case 'allow': {
      return 'pass';
    }
    case 'redact': {
      return 'transform';
    }
    case 'log': {
      return 'pass';
    }
    default: {
      return 'pass';
    }
  }
}

function policyActionToRiskTier(action: string | undefined): GuardrailDecisionReceipt['riskTier'] {
  switch (action) {
    case 'deny': {
      return 'prohibited';
    }
    case 'require_approval': {
      return 'high';
    }
    case 'redact': {
      return 'moderate';
    }
    default: {
      return 'low';
    }
  }
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
    // Build policy context from pipeline context
    const sessionId = (context?.sessionId as string) ?? 'unknown';
    const metadata: Record<string, unknown> = { phase, sessionId };

    const toolName = context?.toolName as string | undefined;
    const toolAnnotations = context?.annotations as Record<string, boolean | undefined> | undefined;
    const policyContext = toolName
      ? {
          tool: { name: toolName, ...(toolAnnotations ? { annotations: toolAnnotations } : {}) },
          input: { text: input },
          metadata
        }
      : { input: { text: input }, metadata };

    const evalResult = evaluatePolicy(this.#document, policyContext as Parameters<typeof evaluatePolicy>[1]);

    if (evalResult.matched && evalResult.action && evalResult.action !== 'allow') {
      const status = policyActionToResultStatus(evalResult.action);
      const riskTier = policyActionToRiskTier(evalResult.action);
      const rule = evalResult.rule;
      const timestamp = new Date().toISOString();

      const result = this.#buildResult(status, phase, rule, input);

      const receipt: GuardrailDecisionReceipt = {
        policyId: `policy:${evalResult.rule?.name ?? 'unknown'}`,
        decision: status,
        reasonCode: evalResult.action.toUpperCase(),
        riskTier,
        surface: phase === 'tool-input' ? 'tool' : 'input',
        phase,
        timestamp,
        correlationId: `${sessionId}:${Date.now()}`,
        sessionId,
        detections: result.detections ?? []
      };

      return { result, receipt };
    }

    const passResult: GuardrailResult = { status: 'pass', phase };
    const passReceipt: GuardrailDecisionReceipt = {
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

    return { result: passResult, receipt: passReceipt };
  }

  #buildResult(
    status: GuardrailResult['status'],
    phase: GuardrailPhase,
    rule: NonNullable<ReturnType<typeof evaluatePolicy>['rule']> | undefined,
    input: string
  ): GuardrailResult {
    if (status === 'block') {
      return {
        status: 'block',
        phase,
        reason: `Policy denied: ${rule?.name} — ${rule?.description ?? ''}`,
        detections: [
          {
            id: 'policy-deny',
            severity: rule?.severity ?? 'critical',
            description: rule?.description ?? 'Policy violation',
            confidence: 1.0
          }
        ]
      };
    }
    if (status === 'escalate') {
      return {
        status: 'escalate',
        phase,
        reason: `Policy requires approval: ${rule?.name}`,
        riskScore: 0.8,
        detections: [
          {
            id: 'policy-escalate',
            severity: rule?.severity ?? 'high',
            description: rule?.description ?? 'Policy escalation',
            confidence: 0.95
          }
        ]
      };
    }
    return {
      status: 'transform',
      phase,
      sanitized: input,
      transformReason: 'redaction',
      detections: [
        {
          id: 'policy-redact',
          severity: rule?.severity ?? 'medium',
          description: rule?.description ?? 'Policy redaction',
          confidence: 0.95
        }
      ]
    };
  }
}
