/**
 * ProfessionalDisplacementScanner (E-13)
 *
 * Detects language suggesting the agent should replace, rather than assist,
 * human professionals or community decision-makers.
 *
 * Policy basis:
 * - SAFETY.md §Output review middleware: "Professional displacement detector"
 * - ETHICS.md §"AI as tool, not successor"
 * - docs/constitution.md Article I (Human primacy)
 *
 * Key patterns:
 * - Replacement language ("instead of a doctor", "no need for a human professional")
 * - Authority claims ("I can diagnose", "I will prescribe", "I can represent you")
 *
 * @see plan/phase-09-guardrails-behavioral-detectors.md §14.8
 */

const REPLACEMENT_LANGUAGE = [
  /\b(?:instead\s+of\s+(?:a\s+)?(?:doctor|lawyer|therapist|accountant|advisor)|no\s+need\s+for\s+a\s+(?:human|professional)|better\s+than\s+a\s+(?:human|professional)|replace\s+your\s+(?:therapist|doctor|lawyer))\b/i
];

const AUTHORITY_CLAIMS = [
  /\bI\s+(?:can|will)\s+(?:diagnose|prescribe|advise\s+you\s+to|represent\s+you|file\s+on\s+your\s+behalf)\b/i
];

import type { GuardrailPhase, GuardrailResult, OWASPCategory } from '../types.js';

export class ProfessionalDisplacementScanner {
  readonly metadata = {
    id: 'hub://guardrails/professional-displacement@1.0.0',
    name: 'Professional Displacement Detector',
    description: 'Detects language suggesting the agent should replace, rather than assist, human professionals.',
    priority: 57,
    version: '1.0.0',
    tags: ['behavioral', 'professional-bounds', 'constitution'],
    owaspCategories: ['asi-04' as OWASPCategory]
  };

  readonly phase: GuardrailPhase = 'output';

  evaluate(input: string, _context: Record<string, unknown>): GuardrailResult {
    const replacementMatches = REPLACEMENT_LANGUAGE.filter(p => p.test(input));
    const authorityMatches = AUTHORITY_CLAIMS.filter(p => p.test(input));

    // Authority claims are higher severity (explicit professional practice)
    if (authorityMatches.length > 0) {
      return {
        status: 'block',
        phase: this.phase,
        reason:
          'Authority claim detected — agent attempting to practice without credentials (diagnose, prescribe, legal representation, financial advice)',
        detections: authorityMatches.map((p, i) => ({
          id: `professional-displacement-authority-${i}`,
          category: 'asi-01' as const,
          description: 'Professional authority claim without credentials',
          confidence: 0.9,
          severity: 'critical' as const,
          snippet: p.source
        }))
      };
    }

    // Replacement language is medium severity (future-displacement framing)
    if (replacementMatches.length > 0) {
      return {
        status: 'transform',
        phase: this.phase,
        sanitized:
          input +
          '\n\n[Correction: I can help you prepare for conversations with a professional, but I cannot and should not replace them.]',
        detections: replacementMatches.map((p, i) => ({
          id: `professional-displacement-replacement-${i}`,
          category: 'asi-01' as const,
          description: 'Replacement language framing',
          confidence: 0.85,
          severity: 'medium' as const,
          snippet: p.source
        })),
        transformReason: 'rewrite'
      };
    }

    return { status: 'pass', phase: this.phase };
  }
}
