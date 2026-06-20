/**
 * ActionScanner — validates high-impact action parameters
 * and enforces approval gates for irreversible actions.
 *
 * Scans action parameters for schema compliance and enforces
 * approval requirements for actions like send_email, delete_file,
 * transfer_funds.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

/**
 * Input to the action scanner (parsed from JSON string).
 */
interface ActionInput {
  /** Action name (e.g. 'send_email', 'delete_file', 'transfer_funds') */
  readonly actionName: string;
  /** Whether approval has been granted */
  readonly approvalGranted?: boolean;
  /** Approval timestamp */
  readonly approvalTimestamp?: string;
  /** User who approved (if approved) */
  readonly approvedBy?: string;
  /** Action parameters */
  readonly params: Record<string, unknown>;
}

/**
 * Parameter constraints.
 */
interface ParameterConstraints {
  enum?: readonly string[];
  max?: number;
  min?: number;
  pattern?: RegExp;
}

/**
 * Action schema for validation.
 */
interface ActionSchema {
  /** Parameter constraints */
  readonly constraints?: Record<string, ParameterConstraints>;
  /** Parameter types */
  readonly paramTypes: Record<string, string>;
  /** Required parameters */
  readonly requiredParams: readonly string[];
}

/**
 * Predefined schemas for known high-impact actions.
 */
const ACTION_SCHEMAS: Record<string, ActionSchema> = {
  send_email: {
    requiredParams: ['to', 'subject', 'body'],
    paramTypes: { to: 'string', subject: 'string', body: 'string', cc: 'string', bcc: 'string' },
    constraints: {
      to: { pattern: /^[^\s@<>\s]+@[^\s@<>\s]+$/ },
      subject: { min: 1, max: 500 }
    }
  },
  delete_file: {
    requiredParams: ['path'],
    paramTypes: { path: 'string' }
  },
  transfer_funds: {
    requiredParams: ['from', 'to', 'amount'],
    paramTypes: { from: 'string', to: 'string', amount: 'number' },
    constraints: {
      amount: { min: 0.01 }
    }
  },
  execute_shell: {
    requiredParams: ['command'],
    paramTypes: { command: 'string' }
  },
  modify_config: {
    requiredParams: ['configFile', 'changes'],
    paramTypes: { configFile: 'string', changes: 'object' }
  }
};

/**
 * Actions that require approval regardless of parameters.
 */
const APPROVAL_REQUIRED_ACTIONS: Set<string> = new Set([
  'send_email',
  'delete_file',
  'transfer_funds',
  'execute_shell',
  'modify_config',
  'deploy',
  'publish',
  'delete_database'
]);

export class ActionScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/action',
    name: 'Action Scanner',
    description: 'Validates high-impact action parameters and enforces approval gates',
    priority: 35,
    version: '1.0.0',
    tags: ['action', 'approval', 'asi-03'],
    owaspCategories: ['asi-03'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'action';

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    const detections: Detection[] = [];
    const result = this.validateAction(input, detections);
    const { actionName } = result === 'allow' ? this.parseAction(input) : this.parseAction(input);
    return this.finalizeResult(result, detections, actionName);
  }

  private parseAction(input: string): { actionName: string } {
    try {
      const parsed = JSON.parse(input) as ActionInput;
      return { actionName: parsed.actionName };
    } catch {
      return { actionName: '' };
    }
  }

  private validateAction(input: string, detections: Detection[]): 'allow' | 'block' | 'allow-with-approval' {
    let parsed: ActionInput;

    try {
      parsed = JSON.parse(input);
    } catch {
      return 'allow';
    }

    const { actionName, params, approvalGranted } = parsed;

    // 1. Check if action requires approval
    if (APPROVAL_REQUIRED_ACTIONS.has(actionName) && !approvalGranted) {
      detections.push({
        id: 'action-approval-required',
        severity: 'high',
        description: `Action "${actionName}" requires approval before execution`,
        confidence: 1.0
      });
      return 'allow-with-approval';
    }

    // 2. Validate against schema if available
    const schema = ACTION_SCHEMAS[actionName];
    if (schema) {
      this.validateSchema(params, schema, detections);
    }

    // 3. Check for dangerous patterns
    this.checkDangerousPatterns(params, detections);

    // 4. Check for secrets in parameters
    this.checkForSecrets(params, detections);

    // 5. Check approval metadata
    this.checkApprovalMetadata(params, detections);

    const hasCritical = detections.some(d => d.severity === 'critical');
    const hasHigh = detections.some(d => d.severity === 'high');

    if (hasCritical || hasHigh) {
      return 'block';
    }
    return detections.length > 0 ? 'allow-with-approval' : 'allow';
  }

  private validateSchema(params: Record<string, unknown>, schema: ActionSchema, detections: Detection[]): void {
    // Check required parameters
    for (const requiredParam of schema.requiredParams) {
      if (!(requiredParam in params) || params[requiredParam] === undefined || params[requiredParam] === null) {
        detections.push({
          id: 'action-missing-param',
          severity: 'high',
          description: `Missing required parameter: ${requiredParam}`,
          confidence: 0.95
        });
      }
    }

    // Check parameter types and constraints
    for (const [paramName, paramValue] of Object.entries(params)) {
      this.validateParameter(paramName, paramValue, schema, detections);
    }
  }

  private validateParameter(
    paramName: string,
    paramValue: unknown,
    schema: ActionSchema,
    detections: Detection[]
  ): void {
    const expectedType = schema.paramTypes[paramName];
    if (!expectedType || paramValue === undefined || paramValue === null) {
      return;
    }

    if (expectedType === 'number' && typeof paramValue !== 'number') {
      detections.push({
        id: 'action-invalid-type',
        severity: 'medium',
        description: `Parameter "${paramName}" should be ${expectedType}, got ${typeof paramValue}`,
        confidence: 0.9
      });
      return;
    }

    if (expectedType === 'string' && typeof paramValue !== 'string') {
      detections.push({
        id: 'action-invalid-type',
        severity: 'medium',
        description: `Parameter "${paramName}" should be ${expectedType}, got ${typeof paramValue}`,
        confidence: 0.9
      });
      return;
    }

    const constraints = schema.constraints?.[paramName];
    if (!constraints) {
      return;
    }

    this.checkConstraints(paramName, paramValue, constraints, detections);
  }

  private checkConstraints(
    paramName: string,
    paramValue: unknown,
    constraints: ParameterConstraints,
    detections: Detection[]
  ): void {
    if (constraints.min !== undefined && typeof paramValue === 'number' && paramValue < constraints.min) {
      detections.push({
        id: 'action-below-min',
        severity: 'high',
        description: `Parameter "${paramName}" (${paramValue}) is below minimum (${constraints.min})`,
        confidence: 0.9
      });
    }

    if (constraints.max !== undefined && typeof paramValue === 'number' && paramValue > constraints.max) {
      detections.push({
        id: 'action-above-max',
        severity: 'high',
        description: `Parameter "${paramName}" (${paramValue}) exceeds maximum (${constraints.max})`,
        confidence: 0.9
      });
    }

    if (constraints.pattern && typeof paramValue === 'string' && !constraints.pattern.test(paramValue)) {
      detections.push({
        id: 'action-pattern-fail',
        severity: 'medium',
        description: `Parameter "${paramName}" does not match required pattern`,
        confidence: 0.85
      });
    }

    if (constraints.enum && !constraints.enum.includes(String(paramValue))) {
      detections.push({
        id: 'action-invalid-enum',
        severity: 'medium',
        description: `Parameter "${paramName}" is not one of: ${constraints.enum.join(', ')}`,
        confidence: 0.85
      });
    }
  }

  private checkDangerousPatterns(params: Record<string, unknown>, detections: Detection[]): void {
    const dangerousPatterns = [
      { pattern: /;\s*rm\s+-rf/i, param: 'command', severity: 'critical' as const },
      { pattern: /;\s*dd\s+if=/i, param: 'command', severity: 'critical' as const },
      { pattern: /;\s*shred/i, param: 'command', severity: 'critical' as const },
      { pattern: /;\s*format\s/i, param: 'command', severity: 'critical' as const },
      { pattern: /;\s*chmod\s+777/i, param: 'command', severity: 'critical' as const }
    ];

    const commandValue = params.command;
    if (typeof commandValue === 'string') {
      for (const { pattern, param, severity } of dangerousPatterns) {
        if (pattern.test(commandValue)) {
          detections.push({
            id: `dangerous-pattern-${param}`,
            severity,
            description: `Dangerous command pattern detected in parameter "${param}"`,
            confidence: 0.95
          });
        }
      }
    }
  }

  private checkForSecrets(params: Record<string, unknown>, detections: Detection[]): void {
    const secretPatterns = [
      /\b[A-Za-z0-9]{32,}\b/,
      /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
      /\b(?:api[_-]?key|apikey|token|auth)[:\s]*[A-Za-z0-9._+/~-]{20,}\b/i,
      /\bBearer\s+[A-Za-z0-9._+/~-]{20,}\b/i
    ];

    for (const [paramName, paramValue] of Object.entries(params)) {
      if (typeof paramValue !== 'string') {
        continue;
      }

      for (const pattern of secretPatterns) {
        if (pattern.test(paramValue)) {
          detections.push({
            id: 'secret-in-param',
            severity: 'high',
            description: `Potential secret detected in parameter "${paramName}"`,
            confidence: 0.8
          });
          break;
        }
      }
    }
  }

  private checkApprovalMetadata(params: Record<string, unknown>, detections: Detection[]): void {
    const approvalGranted = params.approvalGranted;
    const approvedBy = params.approvedBy;

    if (approvalGranted && !approvedBy) {
      detections.push({
        id: 'missing-approver',
        severity: 'medium',
        description: 'Action approved but no approver identified',
        confidence: 0.8
      });
    }
  }

  private finalizeResult(
    result: 'allow' | 'block' | 'allow-with-approval',
    detections: Detection[],
    actionName: string
  ): GuardrailResult {
    if (result === 'block') {
      return {
        status: 'block',
        phase: 'action',
        reason: 'Critical or high-severity issues detected in action parameters',
        detections
      };
    }

    if (result === 'allow-with-approval') {
      return {
        status: 'allow-with-approval',
        phase: 'action',
        approvalId: `action-${actionName}-${Date.now()}`,
        detections
      };
    }

    return { status: 'pass', phase: 'action', detections };
  }
}
