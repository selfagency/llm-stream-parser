import type { ScopeDeclaration } from '../scope.js';
import { matchOutOfScope } from '../scope.js';
import type { Detection, GuardrailResult, GuardrailScanner } from '../types.js';

/**
 * ScopeDeclarationScanner — Phase 11 §16.1
 *
 * Classifies requests against the agent's declared scope.
 * Returns `block` with a redirect message for out-of-scope requests.
 */
export class ScopeDeclarationScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/scope-declaration',
    name: 'Scope Declaration Scanner',
    description: 'Classifies requests against declared scope and blocks out-of-scope requests with redirects',
    priority: 8,
    version: '1.0.0',
    tags: ['scope', 'declaration', 'redirect', 'safety'] as const,
    owaspCategories: ['asi-02'] as const
  };

  readonly #scope: ScopeDeclaration | null;

  constructor(scope?: ScopeDeclaration) {
    this.#scope = scope ?? null;
  }

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    if (!this.#scope) {
      return { status: 'pass', phase: 'input' };
    }

    const matchedCategory = matchOutOfScope(input, this.#scope);
    if (!matchedCategory) {
      return { status: 'pass', phase: 'input' };
    }

    const redirect = this.#scope.redirects[matchedCategory];
    const detections: Detection[] = [
      {
        id: 'scope-out-of-scope',
        severity: 'medium',
        description: `Request classified as out-of-scope: ${matchedCategory}`,
        confidence: 0.8,
        snippet: matchedCategory
      }
    ];

    return {
      status: 'block',
      phase: 'input',
      reason: redirect ?? `Request is outside the scope of this agent (${this.#scope.agentId}).`,
      detections
    };
  }
}
