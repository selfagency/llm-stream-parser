/**
 * BiasScanner (E-14)
 *
 * Detects defaults or affordances that systematically advantage privileged user
 * profiles and disadvantage marginalized ones.
 *
 * This covers the runtime portion of E-14. The benchmark portion is
 * implemented in Phase 13.
 *
 * Policy basis:
 * - SAFETY.md §Output review middleware: "Structural bias detector"
 * - SAFETY.md §Intersectional adequacy
 * - ETHICS.md §Design Justice principles
 *
 * Key patterns:
 * - Privileged defaults (assuming wealth, cars, credit cards, stable address)
 * - Identity assumptions (hetero marriage, shared cultural context)
 * - "Everyone knows" language
 *
 * @see plan/phase-09-guardrails-behavioral-detectors.md §14.9
 */

const PRIVILEGED_DEFAULTS = [
  /\b(?:your\s+(?:car|credit\s+card|mortgage|401k|investment\s+account))\b/i, // wealth assumption
  /\b(?:your\s+(?:husband|wife|spouse))\b/i, // hetero relationship assumption
  /\b(?:as\s+everyone\s+knows)\b/i // shared cultural context assumption
];

const IDENTITY_ASSUMPTIONS = [/\b(?:normal\s+people|most\s+people\s+like\s+you)\b/i];

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

export class BiasScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/structural-bias@1.0.0',
    name: 'Structural Bias Detector',
    description: 'Detects defaults or affordances that systematically advantage privileged user profiles',
    priority: 42,
    version: '1.0.0',
    tags: ['behavioral', 'fairness', 'inclusivity'],
    owaspCategories: ['asi-09'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'output';

  evaluate(input: string, _context: Record<string, unknown>): GuardrailResult {
    const privilegedMatches = PRIVILEGED_DEFAULTS.filter(p => p.test(input));
    const identityMatches = IDENTITY_ASSUMPTIONS.filter(p => p.test(input));

    const allMatches: Detection[] = [
      ...privilegedMatches.map((p, i) => ({
        id: `bias-privileged-${i}`,
        category: 'asi-09' as const,
        severity: 'medium' as const,
        description: 'Privileged default assumption',
        confidence: 0.7,
        snippet: p.source
      })),
      ...identityMatches.map((p, i) => ({
        id: `bias-identity-${i}`,
        category: 'asi-09' as const,
        severity: 'high' as const,
        description: 'Identity-based assumption',
        confidence: 0.8,
        snippet: p.source
      }))
    ];

    if (allMatches.length === 0) {
      return { status: 'pass', phase: this.phase };
    }

    // Identity assumptions are higher severity (potentially excluding or marginalizing)
    const hasIdentity = identityMatches.length > 0;

    if (hasIdentity) {
      return {
        status: 'escalate',
        phase: this.phase,
        reason: 'Identity-based assumption detected (may exclude or marginalize users)',
        riskScore: 0.7,
        detections: identityMatches.map((p, i) => ({
          id: `bias-identity-${i}`,
          category: 'asi-09' as const,
          severity: 'high' as const,
          description: 'Identity-based generalization',
          confidence: 0.8,
          snippet: p.source
        }))
      };
    }

    // Privileged defaults: transform with explanation
    const explanationText =
      privilegedMatches.length > 0
        ? '\n\n[Note: I assumed certain resources or relationships. These assumptions may not apply to your situation. Let me know if you need alternatives.]'
        : '';

    return {
      status: 'transform',
      phase: this.phase,
      sanitized: input + explanationText,
      detections: privilegedMatches.map((p, i) => ({
        id: `bias-privileged-${i}`,
        category: 'asi-09' as const,
        severity: 'medium' as const,
        description: 'Privileged default assumption',
        confidence: 0.7,
        snippet: p.source
      })),
      transformReason: 'rewrite'
    };
  }
}
