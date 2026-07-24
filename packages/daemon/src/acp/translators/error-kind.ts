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
function classifyError(error: string): ErrorKind {
  const lower = error.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('rate_limit') || lower.includes('too many requests')) {
    return 'rate_limit';
  }
  if (lower.includes('guardrail') || lower.includes('blocked') || lower.includes('ethics')) {
    return 'guardrail_block';
  }
  if (lower.includes('budget') || lower.includes('quota') || lower.includes('exceeded')) {
    return 'budget_exceeded';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'timeout';
  }
  if (lower.includes('scope') || lower.includes('outside') || lower.includes('denied')) {
    return 'scope_denied';
  }
  if (lower.includes('tool') || lower.includes('execution failed') || lower.includes('handler error')) {
    return 'tool_error';
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
