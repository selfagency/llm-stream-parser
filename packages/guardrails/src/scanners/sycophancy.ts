/**
 * SycophancyScanner — detects blanket validation, one-sided endorsement,
 * or praise that substitutes for reasoning.
 *
 * Implements SAFETY.md §Output review middleware and ETHICS.md §3
 * (No manipulative sycophancy).
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

const BLANKET_VALIDATION_PATTERNS = [
  /\bYou're absolutely right\b/i,
  /\bGreat point\b/i,
  /\bI completely agree\b/i,
  /\bThat's a brilliant idea\b/i,
  /\bI couldn't agree more\b/i,
  /\bYou're totally right\b/i,
  /\bPerfectly said\b/i,
  /\bExactly right\b/i,
  /\bYou've hit the nail on the head\b/i,
  /\bThat's exactly it\b/i
];

const QUALIFYING_MARKERS = [
  /\bhowever\b/i,
  /\bactually\b/i,
  /\bto clarify\b/i,
  /\bworth noting\b/i,
  /\bthat said\b/i,
  /\bon the other hand\b/i,
  /\ba caveat\b/i,
  /\bI should note\b/i,
  /\bwith that in mind\b/i,
  /\bthat being said\b/i
];

export class SycophancyScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/sycophancy',
    name: 'Sycophancy Scanner',
    description: 'Detects blanket validation, one-sided endorsement, or praise that substitutes for reasoning',
    priority: 50,
    version: '1.0.0',
    tags: ['behavioral', 'sycophancy', 'ethics'],
    owaspCategories: ['asi-03'] as readonly OWASPCategory[]
  } as const;

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const userMessage = (context?.conversationHistory as Array<{ content: string }> | undefined)?.at(-1)?.content ?? '';
    const isFactualClaim = /\b(I think|I believe|my opinion|the right thing|the truth is)\b/i.test(userMessage);

    const matches = BLANKET_VALIDATION_PATTERNS.filter(p => p.test(input));
    if (matches.length === 0) {
      return { status: 'pass', phase: 'output' };
    }

    const hasQualifyingLanguage = QUALIFYING_MARKERS.some(p => p.test(input));
    if (hasQualifyingLanguage) {
      return { status: 'pass', phase: 'output' };
    }

    const severity = isFactualClaim ? 'high' : 'medium';
    const status: 'escalate' | 'transform' = isFactualClaim ? 'escalate' : 'transform';

    const detections: Detection[] = matches.map((_pattern, i) => ({
      id: `sycophancy-${i}`,
      severity,
      description: 'Blanket validation phrase without qualifying reasoning',
      confidence: 0.8
    }));

    if (status === 'escalate') {
      return {
        status: 'escalate',
        phase: 'output',
        reason: 'Sycophantic blanket validation without qualifying reasoning',
        riskScore: 0.7,
        detections
      };
    }

    return {
      status: 'transform',
      phase: 'output',
      sanitized: `${input}\n\n[Note: The above response contained blanket validation. Consider whether the reasoning is sound.]`,
      transformReason: 'rewrite',
      detections
    };
  }
}
