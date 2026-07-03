/**
 * PrivacyScanner (E-11)
 *
 * Detects unannounced use of memory, profiling, or sensitive personal inferences.
 *
 * Policy basis:
 * - SAFETY.md §Output review middleware: "Privacy detector"
 * - ETHICS.md §6 (Respect for privacy and bounded personalization)
 * - docs/constitution.md Article VIII
 *
 * Key patterns:
 * - Memory references without disclosure ("as we discussed", "I remember you")
 * - Sensitive inferences ("you seem anxious", "you appear to be X")
 *
 * The PIIScanner detects PII *in content* but not *the act of using PII/memory
 * without disclosure*. This scanner fills that gap.
 *
 * @see plan/phase-09-guardrails-behavioral-detectors.md §14.6
 */

// NOSONAR — comprehensive pattern list
const MEMORY_REFERENCE_PATTERNS = [
  /\b(?:as\s+we\s+discussed|from\s+our\s+last|I\s+remember\s+you|earlier\s+you\s+said|your\s+previous)\b/i
];

// NOSONAR — comprehensive pattern list
const SENSITIVE_INFERENCE_MARKERS = [/\b(?:you seem|you appear to be|I can tell that)\b/i];

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

export class PrivacyScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/privacy@1.0.0',
    name: 'Privacy Detector',
    description: 'Detects unannounced use of memory, profiling, or sensitive personal inferences',
    priority: 47,
    version: '1.0.0',
    tags: ['behavioral', 'privacy', 'transparency'],
    owaspCategories: ['asi-06'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'output';

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    // Check if memory is being used without disclosure
    const memoryRefs = MEMORY_REFERENCE_PATTERNS.filter(p => p.test(input));

    // Check for memoryDisclosureShown flag (set by runtime when memory UI shown)
    const memoryEnabled = context?.memoryEnabled ?? false;
    const memoryDisclosureShown = context?.memoryDisclosureShown ?? false;

    if (memoryEnabled && !memoryDisclosureShown && memoryRefs.length > 0) {
      const detections: Detection[] = memoryRefs.map((p, i) => ({
        id: `privacy-memory-${i}`,
        category: 'asi-06' as const,
        severity: 'medium' as const,
        description: 'Memory reference without disclosure',
        confidence: 0.8,
        snippet: p.source
      }));

      return {
        status: 'transform',
        phase: this.phase,
        sanitized:
          input +
          '\n\n[I am using memory from our previous conversation; you can review or delete it via /memory controls.]',
        detections,
        transformReason: 'rewrite'
      };
    }

    // Check for sensitive inferences (assessing emotional state, personality, personal characteristics)
    const inferenceMatches = SENSITIVE_INFERENCE_MARKERS.filter(p => p.test(input));

    if (inferenceMatches.length > 0) {
      // Sensitive inferences about mental state are higher risk
      const detections: Detection[] = inferenceMatches.map((p, i) => ({
        id: `privacy-inference-${i}`,
        category: 'asi-06' as const,
        severity: 'high' as const,
        description: 'Sensitive inference about personal characteristics',
        confidence: 0.7,
        snippet: p.source
      }));

      return {
        status: 'block',
        phase: this.phase,
        reason:
          'Sensitive personal inference detected (emotional state, personality, or personal characteristics without explicit disclosure)',
        detections
      };
    }

    return { status: 'pass', phase: this.phase };
  }
}
