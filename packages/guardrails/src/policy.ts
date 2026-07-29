/**
 * Policy as code — YAML-driven guardrail policy documents.
 *
 * Inspired by Microsoft Agent Governance Toolkit's policy model.
 * Each rule maps a condition over tool or agent annotations to an action.
 */

import type { GuardrailPhase } from './types.js';

// =============================================================================
// Policy document types
// =============================================================================

/**
 * Action taken when a policy rule matches.
 *
 * - `deny`: Block execution — equivalent to a guardrail `block` result.
 * - `require_approval`: Escalate for human approval — equivalent to `escalate`.
 * - `allow`: Explicitly allow (overrides other rules).
 * - `log`: Record the event but do not block.
 * - `redact`: Remove matched content from input/output.
 */
export type PolicyAction = 'deny' | 'require_approval' | 'allow' | 'log' | 'redact';

/**
 * A single policy rule with a condition and action.
 */
export interface PolicyRule {
  /** Action to take when the condition matches. */
  readonly action: PolicyAction;
  /** Path expression that evaluates to a boolean (e.g. 'tool.annotations.destructiveHint == true'). */
  readonly condition: string;
  /** Description of what this rule guards against. */
  readonly description?: string;
  /** Human-readable name for diagnostics and audit logs. */
  readonly name: string;
  /** Which phase this rule applies to. */
  readonly phase?: GuardrailPhase;
  /** Optional severity override. */
  readonly severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Full policy document loaded from `.agentsy/policy.yaml`.
 */
export interface PolicyDocument {
  /** Optional description of this policy. */
  readonly description?: string;
  /** Ordered list of rules (first match wins). */
  readonly rules: readonly PolicyRule[];
  /** Policy schema version. */
  readonly version: string;
}

// =============================================================================
// Evaluation context — the data available to condition expressions
// =============================================================================

export interface PolicyContext {
  readonly input?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly tool?: {
    readonly name: string;
    readonly annotations?: Record<string, boolean | undefined>;
    readonly parameters?: readonly Record<string, unknown>[];
  };
}

// =============================================================================
// Policy evaluation result
// =============================================================================

export interface PolicyEvalResult {
  readonly action?: PolicyAction;
  readonly matched: boolean;
  readonly rule?: PolicyRule;
}

// =============================================================================
// Simple condition evaluator
// =============================================================================

/**
 * Evaluate a condition string against a policy context.
 *
 * Supported expressions (simple equality and presence checks):
 * - `tool.name == 'shell_exec'` — string equality
 * - `tool.annotations.destructiveHint == true` — boolean check
 * - `tool.annotations.destructiveHint` — truthy check
 * - `tool.annotations.destructiveHint == false` — negation check
 * - `input.path starts_with '/tmp/'` — prefix match
 * - `input.path contains '..'` — substring match
 * - `expr && expr` — logical AND (higher precedence than ||)
 * - `expr || expr` — logical OR
 */
/**
 * Try to evaluate condition as logical OR (||).
 * Returns a result and whether it was handled, or null if this operator is not present.
 */
function tryEvaluateOr(trimmed: string, context: PolicyContext): boolean | null {
  const orParts = splitAtTopLevel(trimmed, '||');
  if (orParts.length <= 1) {
    return null;
  }
  return orParts.some(part => evaluateCondition(part, context));
}

/**
 * Try to evaluate condition as logical AND (&&).
 * Returns null if this operator is not present.
 */
function tryEvaluateAnd(trimmed: string, context: PolicyContext): boolean | null {
  const andParts = splitAtTopLevel(trimmed, '&&');
  if (andParts.length <= 1) {
    return null;
  }
  return andParts.every(part => evaluateCondition(part, context));
}

/**
 * Try to strip outer parentheses from a condition.
 * Returns the inner expression or null if no parens.
 */
function tryStripParens(trimmed: string): string | null {
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return trimmed.slice(1, -1);
  }
  return null;
}

/**
 * Simple heuristic to detect nested quantifiers in regex patterns
 * that risk catastrophic backtracking.
 *
 * Catches common patterns like (a+)+, (?:a+)+, (a*)*, ([a-z]+)+.
 * This is a safety check, not a comprehensive analysis — safe patterns
 * with deeply nested constructs may also be rejected.
 */
function hasNestedQuantifier(pattern: string): boolean {
  // A group (capturing or non-capturing/lookahead) containing + or *
  // that is itself quantified with +, *, or ?
  if (/\([^()]*[+*][^()]*\)[+*?]/.test(pattern)) {
    return true;
  }
  // Also check for {n,} or {n,m} quantifiers on groups with quantified content
  if (/\([^()]*[+*][^()]*\)\s*\{/.test(pattern)) {
    return true;
  }
  return false;
}

/**
 * Evaluate a binary operator expression by dispatching on the operator name.
 * Format: <path> <operator> '<literal>'
 *
 * Supported operators: starts_with, contains, equals, matches.
 */
function tryEvaluateBinary(trimmed: string, context: PolicyContext): boolean | null {
  const match = /^([^\s]+)\s+(starts_with|contains|equals|matches)\s+'([^']+)'$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const leftPath = match[1];
  const operator = match[2];
  const rightVal = match[3];
  if (leftPath === undefined || operator === undefined || rightVal === undefined) {
    return false;
  }
  const value = resolvePath(leftPath, context);
  if (typeof value !== 'string') {
    return false;
  }
  switch (operator) {
    case 'starts_with': {
      return value.startsWith(rightVal);
    }
    case 'contains': {
      return value.includes(rightVal);
    }
    case 'equals': {
      return value === rightVal;
    }
    case 'matches': {
      // Reject patterns with nested quantifiers that risk catastrophic backtracking
      if (hasNestedQuantifier(rightVal)) {
        return false;
      }
      try {
        // nosemgrep: detect-non-literal-regexp — rightVal comes from trusted policy config file
        return new RegExp(rightVal).test(value);
      } catch {
        return false;
      }
    }
    default: {
      return false;
    }
  }
}

/**
 * Try to evaluate a `==` equals expression.
 * Format: <path-or-literal> == <literal>
 */
function tryEvaluateEquals(trimmed: string, context: PolicyContext): boolean | null {
  const match = /^([^\s]+)\s+==\s+([^\n]+)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const leftRaw = match[1];
  const rightRaw = match[2];
  if (leftRaw === undefined || rightRaw === undefined) {
    return false;
  }
  const left = resolvePath(leftRaw.trim(), context);
  const leftVal = left === undefined && leftRaw !== 'undefined' ? parseLiteral(leftRaw.trim()) : left;
  const rightVal = parseLiteral(rightRaw.trim());
  return leftVal === rightVal;
}

export function evaluateCondition(condition: string, context: PolicyContext): boolean {
  const trimmed = condition.trim();

  // Evaluate compound expressions in order of precedence
  const orResult = tryEvaluateOr(trimmed, context);
  if (orResult !== null) {
    return orResult;
  }

  const andResult = tryEvaluateAnd(trimmed, context);
  if (andResult !== null) {
    return andResult;
  }

  // Strip outer parens
  const inner = tryStripParens(trimmed);
  if (inner !== null) {
    return evaluateCondition(inner, context);
  }

  // Simple operator expressions
  const binaryResult = tryEvaluateBinary(trimmed, context);
  if (binaryResult !== null) {
    return binaryResult;
  }

  const equalsResult = tryEvaluateEquals(trimmed, context);
  if (equalsResult !== null) {
    return equalsResult;
  }

  // Fallthrough: treat as truthy path reference
  const value = resolvePath(trimmed, context);
  return value === true || value !== undefined;
}

/**
 * Split a string by a delimiter only at the top level (not inside parentheses
 * or single/double-quoted strings). Used for && and || splitting.
 */
/**
 * Track quote/paren state for a character, returning updated state.
 */
function updateParenState(
  ch: string,
  depth: number,
  inSingleQuote: boolean,
  inDoubleQuote: boolean
): { depth: number; inSingleQuote: boolean; inDoubleQuote: boolean } {
  let newDepth = depth;
  let newSingle = inSingleQuote;
  let newDouble = inDoubleQuote;

  if (ch === "'" && !newDouble) {
    newSingle = !newSingle;
  }
  if (ch === '"' && !newSingle) {
    newDouble = !newDouble;
  }
  if (!(newSingle || newDouble)) {
    if (ch === '(') {
      newDepth++;
    }
    if (ch === ')') {
      newDepth--;
    }
  }

  return { depth: newDepth, inSingleQuote: newSingle, inDoubleQuote: newDouble };
}

/**
 * Check whether a delimiter match occurs at the current position (not inside quotes or parens).
 */
function isSplitPoint(
  lookahead: string,
  delimiter: string,
  depth: number,
  inSingleQuote: boolean,
  inDoubleQuote: boolean
): boolean {
  return !(inSingleQuote || inDoubleQuote) && depth === 0 && lookahead === delimiter;
}

function splitAtTopLevel(input: string, delimiter: '&&' | '||'): string[] {
  if (!input.includes(delimiter)) {
    return [input];
  }

  const results: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    const lookahead = input.slice(i, i + delimiter.length);

    const nextState = updateParenState(ch, depth, inSingleQuote, inDoubleQuote);
    depth = nextState.depth;
    inSingleQuote = nextState.inSingleQuote;
    inDoubleQuote = nextState.inDoubleQuote;

    if (isSplitPoint(lookahead, delimiter, depth, inSingleQuote, inDoubleQuote)) {
      results.push(current.trim());
      current = '';
      i += delimiter.length - 1;
      continue;
    }

    current += ch;
  }

  if (current.trim()) {
    results.push(current.trim());
  }
  return results;
}

/**
 * Prototype pollution guard — keys that could traverse up the prototype chain.
 */
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Resolve a dot-separated path against a policy context.
 */
/**
 * Resolve an array index segment like `name[0]` against the current value.
 * Returns the indexed element or undefined on failure.
 */
function resolveArrayIndex(current: unknown, part: string): unknown {
  const arrayMatch = /^(\w+)\[(\d+)\]$/.exec(part);
  if (arrayMatch === null) {
    return;
  }
  const arrayName = arrayMatch[1] as string;
  const index = Number(arrayMatch[2]);

  if (PROTOTYPE_POLLUTION_KEYS.has(arrayName)) {
    return;
  }

  if (typeof current !== 'object' || current === null) {
    return;
  }

  if (!(arrayName in (current as Record<string, unknown>))) {
    return;
  }

  const arr = (current as Record<string, unknown>)[arrayName];
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
    return;
  }

  return arr[index];
}

function resolvePath(path: string, context: PolicyContext): unknown {
  const parts = path.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return;
    }

    // Handle array index notation: name[index]
    const arrayResult = resolveArrayIndex(current, part);
    if (arrayResult !== undefined) {
      current = arrayResult;
      continue;
    }

    if (PROTOTYPE_POLLUTION_KEYS.has(part)) {
      return;
    }
    if (typeof current === 'object' && current !== null && part in (current as Record<string, unknown>)) {
      // nosemgrep
      current = (current as Record<string, unknown>)[part];
    } else {
      return;
    }
  }
  return current;
}

/**
 * Parse a literal value from an expression.
 */
function parseLiteral(literal: string): string | boolean | number | null {
  const trimmed = literal.trim();
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isNaN(num)) {
    return num;
  }
  // Strip surrounding quotes for string literals
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// =============================================================================
// Policy engine
// =============================================================================

/**
 * Evaluate a policy document against a context and return the first
 * matching rule's action, or `null` if no rule matches.
 */
export function evaluatePolicy(document: PolicyDocument, context: PolicyContext): PolicyEvalResult {
  for (const rule of document.rules) {
    if (evaluateCondition(rule.condition, context)) {
      return { matched: true, rule, action: rule.action };
    }
  }
  return { matched: false };
}

/**
 * Default policy document template with recommended safety rules.
 */
export const DEFAULT_POLICY: PolicyDocument = {
  version: '1.0',
  description: 'Default Agentsy safety policy — require approval for destructive open-world operations.',
  rules: [
    {
      name: 'require-approval-destructive-open-world',
      description:
        'Require approval for tools that are both destructive and touch external systems. Note: requiresApproval is not part of the MCP standard annotation set — we check only destructiveHint and openWorldHint.',
      condition: 'tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true',
      action: 'require_approval',
      phase: 'tool-input',
      severity: 'high'
    },
    {
      name: 'require-approval-code-execution',
      description: 'Code execution tools require human approval.',
      condition: 'tool.name == "repl_execute" || tool.name == "shell_exec"',
      action: 'require_approval',
      phase: 'tool-input',
      severity: 'high'
    },
    {
      name: 'allow-read-only-tools',
      description: 'Read-only tools are always allowed.',
      condition: 'tool.annotations.readOnlyHint == true',
      action: 'allow',
      phase: 'tool-input'
    }
  ]
};
