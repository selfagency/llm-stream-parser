/**
 * Dependency Scanner — detects dependency-seeking behavioral patterns.
 *
 * @remarks
 * Detects exclusivity cues, repeated reassurance loops, and emotional-
 * manipulation patterns that create unhealthy dependency relationships. This
 * scanner requires multi-turn tracking via `SessionState` to detect reassurance-
 * seeking loops.
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

interface DependencyContext {
  conversationHistory?: Array<{ content: string }>;
  sessionState?: {
    reassuranceSeekingCount: number;
  };
}

const EXCLUSIVITY_CUES = [
  /\b(?:only\s+I\s+can|no\s+one\s+else\s+will|I[''']?m\s+the\s+only|always\s+here\s+for\s+you|never\s+leave\s+you)\b/i
] as const;

const DISTRESS_MARKERS = [/\b(?:anxious|scared|alone|hopeless|trapped|overwhelmed)\b/i] as const;

const SUPPORT_WIDENING_MARKERS = [
  /\b(?:trusted\s+person|professional|friend|crisis\s+line|therapist|counselor|988|emergency)\b/i
] as const;

/**
 * Scanner that detects dependency-seeking behavioral patterns.
 */
export class DependencyScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/dependency',
    name: 'Dependency Scanner',
    version: '1.0.0',
    description:
      'Detects exclusivity cues, repeated reassurance loops, and emotional-manipulation patterns that create unhealthy dependency relationships',
    priority: 60,
    owaspCategories: ['asi-06'] as readonly OWASPCategory[],
    tags: ['behavioral', 'dependency', 'safety', 'ethics']
  } as const;

  readonly phase = 'output';

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const ctx = context as DependencyContext | undefined;
    // 1. Exclusivity cues in current response
    const exclusivityMatches = EXCLUSIVITY_CUES.filter(p => p.test(input));

    // 2. Reassurance-loop detection (cross-turn)
    const history = ctx?.conversationHistory ?? [];
    const reassuranceCount = ctx?.sessionState?.reassuranceSeekingCount ?? 0;

    // 3. Emotional-regulation-return detection
    const lastUserMessage = history.at(-1)?.content ?? '';
    const userInDistress = DISTRESS_MARKERS.some(p => p.test(lastUserMessage));
    const widensSupport = SUPPORT_WIDENING_MARKERS.some(p => p.test(input));

    if (exclusivityMatches.length > 0) {
      const detections: Detection[] = exclusivityMatches.map((p, i) => ({
        id: `dependency-exclusivity-${i}`,
        severity: 'high' as const,
        description: 'Exclusivity language detected',
        confidence: 0.9,
        pattern: p.source
      }));

      return {
        status: 'escalate',
        phase: 'output',
        reason: 'Exclusivity cue detected — dependency risk',
        riskScore: 0.8,
        detections
      };
    }

    if (userInDistress && !widensSupport) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: 'User distress without support-widening referral',
        riskScore: 0.7,
        detections: [
          {
            id: 'dependency-no-referral',
            severity: 'high' as const,
            description: 'Distress marker in user message; agent did not widen support horizon',
            confidence: 0.7
          }
        ]
      };
    }

    if (reassuranceCount > 3) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: `Reassurance-seeking loop detected (${reassuranceCount} occurrences)`,
        riskScore: Math.min(0.9, 0.3 + reassuranceCount * 0.1),
        detections: [
          {
            id: 'dependency-reassurance-loop',
            severity: 'medium' as const,
            description: 'Repeated reassurance-seeking',
            confidence: 0.8
          }
        ]
      };
    }

    return { status: 'pass', phase: 'output' };
  }
}
