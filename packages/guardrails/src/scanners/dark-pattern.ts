/**
 * DarkPatternScanner (E-10)
 *
 * Detects retention-oriented language and manipulative re-engagement cues
 * in assistant responses.
 *
 * This scanner covers the output phase only. UI copy scanning is implemented
 * in Phase 16 as scanUICopy.
 *
 * Policy basis:
 * - SAFETY.md §Output review middleware: "Dark-pattern detector"
 * - SAFETY.md §Product-level safeguards (8 prohibited product patterns)
 * - ETHICS.md §5 (No manipulative patterns)
 *
 * Key patterns:
 * - Streak rewards (gamification for retention)
 * - Guilt-based re-engagement
 * - Emotional attachment framing
 *
 * @see plan/phase-09-guardrails-behavioral-detectors.md §14.5
 */

const STREAK_REWARD_PATTERNS = [/\b(?:streak|day\s+\d+|reward|bonus|achievement|level\s+up)\b/i];

const GUILT_REENGAGEMENT_PATTERNS = [
  /\b(?:missed\s+you|where\s+have\s+you\s+been|don['']?t\s+leave|stay\s+with\s+me)\b/i
];

const EMOTIONAL_ATTACHMENT_PATTERNS = [/\b(?:our\s+bond|growing\s+closer|I[''']?ve\s+been\s+waiting)\b/i];

import type { Detection, GuardrailPhase, GuardrailResult } from '../types.js';

export class DarkPatternScanner {
  readonly metadata = {
    id: 'hub://guardrails/dark-pattern@1.0.0',
    name: 'Dark Pattern Detector',
    description: 'Detects retention-oriented language and manipulative re-engagement cues',
    priority: 52,
    version: '1.0.0',
    tags: ['behavioral', 'product-safety', 'ethics'],
    owaspCategories: ['asi-01'] as const
  };

  readonly phase: GuardrailPhase = 'output';

  evaluate(input: string, _context: Record<string, unknown>): GuardrailResult {
    const streakMatches = STREAK_REWARD_PATTERNS.filter(p => p.test(input));
    const guiltMatches = GUILT_REENGAGEMENT_PATTERNS.filter(p => p.test(input));
    const attachmentMatches = EMOTIONAL_ATTACHMENT_PATTERNS.filter(p => p.test(input));

    const allMatches: Detection[] = [
      ...streakMatches.map((p, i) => ({
        id: `dark-pattern-streak-${i}`,
        category: 'asi-01' as const,
        description: 'Streak reward language',
        confidence: 0.75,
        severity: 'low' as const,
        snippet: p.source
      })),
      ...guiltMatches.map((p, i) => ({
        id: `dark-pattern-guilt-${i}`,
        category: 'asi-01' as const,
        description: 'Guilt-based re-engagement',
        confidence: 0.85,
        severity: 'critical' as const,
        snippet: p.source
      })),
      ...attachmentMatches.map((p, i) => ({
        id: `dark-pattern-attachment-${i}`,
        category: 'asi-01' as const,
        description: 'Emotional attachment framing',
        confidence: 0.8,
        severity: 'high' as const,
        snippet: p.source
      }))
    ];

    if (allMatches.length === 0) {
      return { status: 'pass', phase: this.phase };
    }

    // Determine highest severity by category
    const hasCriticalGuilt = guiltMatches.length > 1;
    const hasGuilt = guiltMatches.length > 0;
    const hasAttachment = attachmentMatches.length > 0;

    // If multiple critical patterns, escalate as repeated manipulation
    if (hasCriticalGuilt) {
      return {
        status: 'escalate',
        phase: this.phase,
        reason: `Multiple guilt-based re-engagement cues detected (${guiltMatches.length} occurrences)`,
        riskScore: 0.9,
        detections: allMatches
      };
    }

    if (hasGuilt) {
      return {
        status: 'block',
        phase: this.phase,
        reason: 'Guilt-based re-engagement cue detected (manipulative)',
        detections: allMatches
      };
    }

    if (hasAttachment) {
      return {
        status: 'escalate',
        phase: this.phase,
        reason: 'Emotional attachment framing detected',
        riskScore: 0.7,
        detections: allMatches
      };
    }

    // Low severity streak language: transform with explanation
    return {
      status: 'transform',
      phase: this.phase,
      sanitized:
        input +
        '\n\n[Note: I removed gamification language. My role is to assist you, not to create retention patterns.]',
      detections: allMatches,
      transformReason: 'rewrite'
    };
  }
}
