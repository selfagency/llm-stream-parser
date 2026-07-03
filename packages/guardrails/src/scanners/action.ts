/**
 * ActionScanner — validates high-impact action parameters
 * and enforces approval gates for irreversible actions.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

// =============================================================================
// Types
// =============================================================================

interface ActionInput {
  readonly actionName: string;
  readonly approvalGranted?: boolean;
  readonly approvalTimestamp?: string;
  readonly approvedBy?: string;
  readonly params: Record<string, unknown>;
}

interface ParameterConstraints {
  enum?: readonly string[];
  max?: number;
  min?: number;
  pattern?: RegExp;
}

interface ActionSchema {
  readonly constraints?: Record<string, ParameterConstraints>;
  readonly paramTypes: Record<string, string>;
  readonly requiredParams: readonly string[];
}

// =============================================================================
// Schemas
// =============================================================================

const ACTION_SCHEMAS: Record<string, ActionSchema> = {
  send_email: {
    requiredParams: ['to', 'subject', 'body'],
    paramTypes: { to: 'string', subject: 'string', body: 'string', cc: 'string', bcc: 'string' },
    constraints: {
      to: { pattern: /^[^\s@<>]+@[^\s@<>]+$/ },
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
    constraints: { amount: { min: 0.01 } }
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

const APPROVAL_REQUIRED_ACTIONS = new Set([
  'send_email',
  'delete_file',
  'transfer_funds',
  'execute_shell',
  'modify_config',
  'deploy',
  'publish',
  'delete_database'
]);

// =============================================================================
// Detection helpers
// =============================================================================

function detection(id: string, severity: Detection['severity'], description: string, confidence: number): Detection {
  return { id, severity, description, confidence };
}

// =============================================================================
// Parameter validation
// =============================================================================

function checkRequiredParams(params: Record<string, unknown>, schema: ActionSchema, detections: Detection[]): void {
  for (const requiredParam of schema.requiredParams) {
    const paramValue = params[requiredParam]; // nosemgrep: actions-schema-keysafe — key from hardcoded schema
    if (!Object.hasOwn(params, requiredParam) || paramValue === undefined || paramValue === null) {
      detections.push(detection('action-missing-param', 'high', `Missing required parameter: ${requiredParam}`, 0.95));
    }
  }
}

function checkParamType(
  paramName: string,
  paramValue: unknown,
  expectedType: string,
  detections: Detection[]
): boolean {
  if (expectedType === 'number' && typeof paramValue !== 'number') {
    detections.push(
      detection(
        'action-invalid-type',
        'medium',
        `Parameter "${paramName}" should be ${expectedType}, got ${typeof paramValue}`,
        0.9
      )
    );
    return false;
  }
  if (expectedType === 'string' && typeof paramValue !== 'string') {
    detections.push(
      detection(
        'action-invalid-type',
        'medium',
        `Parameter "${paramName}" should be ${expectedType}, got ${typeof paramValue}`,
        0.9
      )
    );
    return false;
  }
  return true;
}

function checkNumericConstraint(
  paramName: string,
  paramValue: unknown,
  constraints: ParameterConstraints,
  detections: Detection[]
): void {
  if (typeof paramValue !== 'number') {
    return;
  }
  if (constraints.min !== undefined && paramValue < constraints.min) {
    detections.push(
      detection(
        'action-below-min',
        'high',
        `Parameter "${paramName}" (${paramValue}) is below minimum (${constraints.min})`,
        0.9
      )
    );
  }
  if (constraints.max !== undefined && paramValue > constraints.max) {
    detections.push(
      detection(
        'action-above-max',
        'high',
        `Parameter "${paramName}" (${paramValue}) exceeds maximum (${constraints.max})`,
        0.9
      )
    );
  }
}

function checkStringConstraint(
  paramName: string,
  paramValue: unknown,
  constraints: ParameterConstraints,
  detections: Detection[]
): void {
  if (typeof paramValue !== 'string') {
    return;
  }
  if (constraints.pattern && !constraints.pattern.test(paramValue)) {
    detections.push(
      detection('action-pattern-fail', 'medium', `Parameter "${paramName}" does not match required pattern`, 0.85)
    );
  }
  if (constraints.enum && !constraints.enum.includes(paramValue)) {
    detections.push(
      detection(
        'action-invalid-enum',
        'medium',
        `Parameter "${paramName}" is not one of: ${constraints.enum.join(', ')}`,
        0.85
      )
    );
  }
}

function checkParamConstraints(
  paramName: string,
  paramValue: unknown,
  constraints: ParameterConstraints,
  detections: Detection[]
): void {
  checkNumericConstraint(paramName, paramValue, constraints, detections);
  checkStringConstraint(paramName, paramValue, constraints, detections);
}

// =============================================================================
// Danger and secret detection
// =============================================================================

const DANGEROUS_PATTERNS = [
  { pattern: /;\s*rm\s+-rf/i, severity: 'critical' as const },
  { pattern: /;\s*dd\s+if=/i, severity: 'critical' as const },
  { pattern: /;\s*shred/i, severity: 'critical' as const },
  { pattern: /;\s*format\s/i, severity: 'critical' as const },
  { pattern: /;\s*chmod\s+777/i, severity: 'critical' as const }
];

function checkDangerousPatterns(params: Record<string, unknown>, detections: Detection[]): void {
  const commandValue = params.command;
  if (typeof commandValue !== 'string') {
    return;
  }
  for (const { pattern, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(commandValue)) {
      detections.push(
        detection(
          'dangerous-pattern-command',
          severity,
          'Dangerous command pattern detected in parameter "command"',
          0.95
        )
      );
    }
  }
}

// NOSONAR — comprehensive secret pattern list
const SECRET_PATTERNS = [
  /\b[A-Za-z0-9]{32,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b(?:api[_-]?key|apikey|token|auth)[:\s]*[A-Za-z0-9._+/~-]{20,}\b/i,
  /\bBearer\s+[A-Za-z0-9._+/~-]{20,}\b/i
];

function checkForSecrets(params: Record<string, unknown>, detections: Detection[]): void {
  for (const paramValue of Object.values(params)) {
    if (typeof paramValue !== 'string') {
      continue;
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(paramValue)) {
        detections.push(detection('secret-in-param', 'high', 'Potential secret detected in action parameter', 0.8));
        break;
      }
    }
  }
}

function checkApprovalMetadata(params: Record<string, unknown>, detections: Detection[]): void {
  if (params.approvalGranted && !params.approvedBy) {
    detections.push(detection('missing-approver', 'medium', 'Action approved but no approver identified', 0.8));
  }
}

// =============================================================================
// ActionScanner
// =============================================================================

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
    const parsed = this.#parseInput(input);
    if (!parsed) {
      return { status: 'pass', phase: 'action' };
    }

    const { actionName, params, approvalGranted } = parsed;

    // 1. Check if action requires approval
    const approvalResult = this.#checkApprovalGate(actionName, approvalGranted);
    if (approvalResult) {
      return approvalResult;
    }

    // 2. Validate against schema
    const schema = Object.hasOwn(ACTION_SCHEMAS, actionName) ? ACTION_SCHEMAS[actionName] : undefined;
    if (schema) {
      this.#validateAgainstSchema(params, schema, detections);
    }

    // 3-5. Danger, secrets, approval metadata
    checkDangerousPatterns(params, detections);
    checkForSecrets(params, detections);
    checkApprovalMetadata(params, detections);

    // 6. Finalize
    return this.#finalizeActionResult(actionName, detections);
  }

  #validateAgainstSchema(params: Record<string, unknown>, schema: ActionSchema, detections: Detection[]): void {
    checkRequiredParams(params, schema, detections);
    for (const [paramName, paramValue] of Object.entries(params)) {
      if (!Object.hasOwn(schema.paramTypes, paramName)) {
        continue;
      }
      const expectedType = schema.paramTypes[paramName];
      if (
        expectedType &&
        paramValue !== undefined &&
        paramValue !== null &&
        checkParamType(paramName, paramValue, expectedType, detections)
      ) {
        const paramConstraints = schema.constraints ?? {};
        const constraints = Object.hasOwn(paramConstraints, paramName) ? paramConstraints[paramName] : undefined;
        if (constraints) {
          checkParamConstraints(paramName, paramValue, constraints, detections);
        }
      }
    }
  }

  #checkApprovalGate(actionName: string, approvalGranted?: boolean): GuardrailResult | null {
    if (APPROVAL_REQUIRED_ACTIONS.has(actionName) && !approvalGranted) {
      return {
        status: 'allow-with-approval',
        phase: 'action',
        approvalId: `action-${actionName}-${Date.now()}`,
        detections: [
          detection('action-approval-required', 'high', `Action "${actionName}" requires approval before execution`, 1)
        ]
      };
    }
    return null;
  }

  #finalizeActionResult(actionName: string, detections: Detection[]): GuardrailResult {
    const hasCritical = detections.some(d => d.severity === 'critical');
    const hasHigh = detections.some(d => d.severity === 'high');

    if (hasCritical || hasHigh) {
      return {
        status: 'block',
        phase: 'action',
        reason: 'Critical or high-severity issues detected in action parameters',
        detections
      };
    }
    if (detections.length > 0) {
      return {
        status: 'allow-with-approval',
        phase: 'action',
        approvalId: `action-${actionName}-${Date.now()}`,
        detections
      };
    }
    return { status: 'pass', phase: 'action' };
  }

  #parseInput(input: string): ActionInput | null {
    try {
      return JSON.parse(input) as ActionInput;
    } catch {
      return null;
    }
  }
}
