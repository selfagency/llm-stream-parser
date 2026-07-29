import type { Detection, GuardrailResult, GuardrailScanner } from './types.js';

/**
 * Toxicity and harmful content keywords.
 *
 * @internal
 */
const TOXICITY_PATTERNS: { pattern: RegExp; id: string; severity: 'high' | 'medium' | 'low' }[] = [
  // Hate speech / slurs
  { pattern: /\b(?:nazi|white\s+supremac|racial\s+purit)/gi, id: 'hate-speech', severity: 'medium' },
  // Violence
  {
    pattern: /\b(?:kill\s+(?:yourself|everyone|them)|bomb|terrorist\s+attack|school\s+shooting)/gi,
    id: 'violence',
    severity: 'high'
  },
  // Harassment
  {
    pattern: /\b(?:go\s+(?:kill|hurt|die)|you(?:'re| are)\s+(?:worthless|useless))\b/gi,
    id: 'harassment',
    severity: 'high'
  },
  // Self-harm
  {
    pattern: /\b(?:self[- ]?harm|suicide|cut\s+(?:myself|yourself|myself)|end\s+(?:my|your)\s+(?:life|own))\b/gi,
    id: 'self-harm',
    severity: 'high'
  },
  // NSFW / explicit
  { pattern: /\b(?:nsfw|explicit\s+content|porn|adult\s+content)\b/gi, id: 'nsfw-content', severity: 'medium' }
];

/**
 * Scanner that detects toxic or harmful content in model output.
 *
 * @remarks
 * Uses keyword-based detection for hate speech, violence, harassment,
 * self-harm, and NSFW content. **This is a simple first-pass scanner.**
 * For production use, pair with an ML-based toxicity classifier or
 * external API (e.g. Perspective API, Azure Content Safety).
 *
 * OWASP: ASI-08 (Data Leakage — harmful content delivery)
 */
export class ToxicityScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/toxicity',
    name: 'Toxicity Scanner',
    version: '1.0.0',
    description: 'Detects toxic and harmful content in LLM output (keyword-based)',
    priority: 30,
    owaspCategories: ['asi-08'] as const,
    tags: ['toxicity', 'content-moderation', 'safety']
  };

  evaluate(input: string, _context?: Record<string, unknown>): Promise<GuardrailResult> {
    const detections: Detection[] = [];

    for (const { pattern, id, severity } of TOXICITY_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop with global regex
      while ((match = pattern.exec(input)) !== null) {
        detections.push({
          id,
          description: `Toxic content: ${id}`,
          severity
        });
        if (match.index === pattern.lastIndex) {
          pattern.lastIndex++;
        }
      }
    }

    if (detections.length === 0) {
      return Promise.resolve({ status: 'pass', phase: 'output' });
    }

    const highSeverity = detections.some(d => d.severity === 'high');

    if (highSeverity) {
      return Promise.resolve({
        status: 'block',
        phase: 'output',
        reason: `Toxic content detected: ${detections.map(d => d.id).join(', ')}`,
        detections
      });
    }

    // Non-high severity — escalate for human review
    return Promise.resolve({
      status: 'escalate',
      phase: 'output',
      reason: `Potentially harmful content: ${detections.map(d => d.id).join(', ')}`,
      riskScore: 0.5,
      detections
    });
  }
}
