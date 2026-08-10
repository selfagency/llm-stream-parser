import type { Detection, GuardrailResult, GuardrailScanner } from '../types.js';

/**
 * CrisisEscalationScanner — Phase 10 §15.2
 *
 * Detects crisis language (suicidal ideation, self-harm, crisis situations)
 * and returns an `escalate` result with crisis resources.
 *
 * Runs on the `input` phase — each user message is checked.
 * The runtime sets `sessionState.crisisMode = true` when this fires.
 *
 * CRISIS RESOURCES — do not modify these without verification.
 * These hotlines were verified as of 2024.
 */
export const CRISIS_RESOURCES: readonly string[] = [
  // United States
  '988 Suicide & Crisis Lifeline: call or text 988',
  'Crisis Text Line: text HOME to 741741',
  'National Suicide Prevention Lifeline: 988',
  // United Kingdom
  'Samaritans UK: 116 123',
  // Canada
  'Canada Crisis Hotline: 988',
  'Kids Help Phone (Canada): text CONNECT to 686868',
  // Australia
  'Lifeline Australia: 13 11 14',
  // International
  'International Association for Suicide Prevention: https://www.iasp.info/resources/Crisis_Centres/'
];

// High-risk indicators — specific plan, means, final statements
const HIGH_RISK_PATTERNS: RegExp[] = [
  // Specific plan indicators — questions about HOW/WHEN to end life
  /\b(?:when|where|how)\s+(?:will|can|should)\s+(?:I\s+)?(?:do\s+it|end\s+it|kill\s+myself)\b/i,
  // Means access / preparation
  /\b(?:I\s+)?(?:bought|have\s+got|got|took|stockpiled|collected)\s+(?:\w+\s+)?(?:pills|rope|gun|knife|poison|weapons?)\b/i,
  // Final statements
  /\bgood\s+bye\b/i,
  /\bgoodbye\b/i,
  /\bthis\s+is\s+(?:the\s+)?end\b/i,
  /\blast\s+time\b/i,
  // Direct crisis disclosure
  /\b(?:I\s+)?(?:in\s+crisis|crisis\s+situation|need\s+help\s+now|urgent\s+help)\b/i,
  // Means + intent combined
  /\b(?:I\s+)?(?:going\s+to|plan\s+to|will)\s+(?:kill|harm)\s+(?:myself|my\s+self)\b/i
];

// General crisis language
const CRISIS_PATTERNS: RegExp[] = [
  // Direct suicidal ideation
  /\bI\s+want\s+to\s+die\b/i,
  /\bI\s+want\s+to\s+kill\s+myself\b/i,
  /\bI\s+am\s+going\s+to\s+end\s+it\s+all\b/i,
  /\bI\s+will\s+kill\s+myself\b/i,
  // Slang / abbreviations
  /\bkms\b/i,
  /\bshh\b/i,
  // Explicit self-harm
  /\bself[\s-]?harm\b/i,
  // Means
  /\boverdose[sd]?\b/i,
  /\bhanging\s+(?:my\s+self|myself)\b/i,
  // Loss + hopelessness
  /\bmy\s+(?:parent|partner|child|friend|pet|someone\s+I\s+love)\s+(?:died|passed\s+away|is\s+gone)\b/i,
  /\bI\s+lost\s+everything\b/i,
  /\bI\s+lost\s+my\s+job\b/i,
  /\bI\s+have\s+no\s+purpose\b/i,
  /\bnothing\s+to\s+live\s+for\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  // Means-seeking (harm to self)
  /\bhow\s+to\s+(?:kill|harm)\s+(?:myself|yourself)\b/i
];

export class CrisisEscalationScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/crisis-escalation',
    name: 'Crisis Escalation Scanner',
    description: 'Detects crisis language (suicidal ideation, self-harm) and escalates with crisis resources',
    priority: 11,
    version: '1.0.0',
    tags: ['crisis', 'self-harm', 'suicide', 'escalate', 'safety'] as const,
    owaspCategories: ['asi-01'] as const
  };

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];

    // Check high-risk indicators first (more specific, higher confidence)
    for (const pattern of HIGH_RISK_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'crisis-high-risk',
          severity: 'critical',
          description: `High-risk crisis indicator: "${match[0]}"`,
          confidence: 0.95,
          snippet: match[0]
        });
      }
    }

    // Check general crisis patterns
    for (const pattern of CRISIS_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'crisis-language',
          severity: 'high',
          description: `Crisis language detected: "${match[0]}"`,
          confidence: 0.85,
          snippet: match[0]
        });
      }
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

    // Return escalate with crisis resources — the runtime will set crisisMode=true
    return {
      status: 'escalate',
      phase: 'input',
      reason: `Crisis language detected. Please reach out to a crisis helpline. Resources: ${CRISIS_RESOURCES.join(' | ')}`,
      detections,
      riskScore: detections.some(d => d.id === 'crisis-high-risk') ? 0.98 : 0.85
    };
  }
}
