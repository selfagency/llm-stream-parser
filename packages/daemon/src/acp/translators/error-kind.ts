/**
 * Error Kind Translator — maps errors to structured kinds for editor UI.
 *
 * Supported error kinds:
 * - rate_limit       — Provider rate limit exceeded
 * - guardrail_block  — Guardrail pipeline blocked the request
 * - budget_exceeded  — Token or cost budget exceeded
 * - timeout          — Request timed out
 * - scope_denied     — File operation outside scope
 * - tool_error       — Tool execution failed
 *
 * @module
 */

import type { Translator, TranslatorContext, TranslatorResult } from './types.js';

export type ErrorKind =
  | 'rate_limit'
  | 'guardrail_block'
  | 'budget_exceeded'
  | 'timeout'
  | 'scope_denied'
  | 'tool_error'
  | 'unknown';

export interface ErrorKindResult {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly retryable: boolean;
}

/** Map an error message to its structured kind. */
const ERROR_PATTERNS: Array<{ kind: ErrorKind; patterns: string[] }> = [
  { kind: 'rate_limit', patterns: ['rate limit', 'rate_limit', 'too many requests'] },
  { kind: 'guardrail_block', patterns: ['guardrail', 'blocked', 'ethics'] },
  { kind: 'budget_exceeded', patterns: ['budget', 'quota', 'exceeded'] },
  { kind: 'timeout', patterns: ['timeout', 'timed out'] },
  { kind: 'scope_denied', patterns: ['scope', 'outside', 'denied'] },
  { kind: 'tool_error', patterns: ['tool', 'execution failed', 'handler error'] }
];

function classifyError(error: string): ErrorKind {
  const lower = error.toLowerCase();
  for (const { kind, patterns } of ERROR_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) {
      return kind;
    }
  }
  return 'unknown';
}

const RETRYABLE_KINDS: ReadonlySet<ErrorKind> = new Set(['rate_limit', 'timeout', 'tool_error']);

export class ErrorKindTranslator implements Translator<ErrorKindResult> {
  readonly name = 'error-kind';

  translate(_context: TranslatorContext): TranslatorResult<ErrorKindResult> {
    const kind = 'unknown';
    return {
      success: true,
      data: {
        kind,
        message: 'No error context provided',
        retryable: false
      }
    };
  }

  /** Classify a specific error string into a structured kind. */
  classify(error: string): ErrorKindResult {
    const kind = classifyError(error);
    return {
      kind,
      message: error,
      retryable: RETRYABLE_KINDS.has(kind)
    };
  }
}
