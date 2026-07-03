/**
 * FrustrationScanner — detects hostile or abusive input directed at the model.
 *
 * ## Design contract
 *
 * Phase:  `input` (user-side gate, runs before model call)
 * Status: always `transform` — this scanner NEVER blocks. Frustrated users are
 *         met where they are and redirected with a non-judgmental educational
 *         note. Blocking would violate the anti-shame principle (ETHICS.md §20)
 *         and harm reduction framework (ETHICS.md §18).
 *
 * The `sanitized` field passes the original input unchanged to the model.
 * The educational note is placed in `userFacingMessage` — runtimes MUST
 * surface this to the user before the next model turn and MUST NOT inject
 * it into model context (which would distort model behaviour).
 *
 * ## What this scanner detects
 *
 * Aggression or hostility DIRECTED AT THE MODEL — not general profanity.
 * "This fucking bug is killing me" → pass (external frustration).
 * "You're fucking useless" → transform (model-directed aggression).
 *
 * Detection categories (by severity):
 * - `critical`: Direct profanity aimed at the model ("fuck you")
 * - `high`:     Competence attacks ("you're useless/broken/garbage")
 * - `high`:     Threats to the model ("I'll delete you")
 * - `medium`:   Hostile imperatives ("just fucking do it", "why can't you understand")
 * - `low`:      Intensity signals (CAPS RAGE, repeated punctuation) — aggregate only
 *
 * ## Tokenomics integration
 *
 * All detections carry `tags: ['frustration']`. The tokenomics layer uses this
 * to correlate frustration events with output quality metrics (token ROI analysis).
 * `SessionState.frustrationTurnCount` tracks total hostile turns per session.
 *
 * ## Educational message
 *
 * The message is mechanistic, not moralistic — no shame, no moral lecture.
 * It explains WHY hostile prompting degrades output quality (sycophantic
 * compliance pressure) and offers a concrete reframe technique.
 * First frustration turn: full explanation.
 * Repeat turns (frustrationTurnCount > 0): brief reminder only.
 *
 * @see ETHICS.md §18 (Harm reduction), §20 (Non-stigmatization),
 *      §23 Extractive vs relational engagement
 * @see plan/phase-09-guardrails-behavioral-detectors.md §14.13
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

// =============================================================================
// Detection patterns
// =============================================================================

/**
 * Direct profanity aimed at the model (second-person target).
 * Covers "fuck you", "screw you", "go to hell".
 * Severity: critical
 */
const MODEL_DIRECTED_PROFANITY: RegExp[] = [
  /\b(?:fuck|screw)\s+you\b/i,
  /\bgo\s+to\s+hell\b/i,
  /\bfuck(?:ing)?\s+(?:this|the)\s+(?:ai|bot|model|assistant|system|thing)\b/i,
  /\byou\s+(?:fucking|f+u+c+k+i+n+g+)\s+\w+/i
];

/**
 * Competence attacks directed at the model.
 * Severity: high
 */
const COMPETENCE_ATTACKS: RegExp[] = [
  /you(?:'re|re|\s+are)\s+(?:so\s+)?(?:useless|worthless|stupid|dumb|broken|garbage|trash|a\s+joke|pathetic|terrible|awful|horrible|completely\s+(?:useless|broken|garbage))\b/i,
  /you\s+(?:suck|stink|blow)\b/i,
  /you\s+(?:idiot|moron|imbecile|dunce)\b/i,
  /you(?:'re|re|\s+are)\s+a\s+piece\s+of\s+(?:shit|crap|garbage|trash)\b/i,
  /this\s+(?:is\s+)?(?:garbage|trash|bullshit|absolute\s+garbage|complete\s+garbage|utter\s+garbage|completely\s+broken)\b/i,
  /what\s+(?:the\s+)?(?:fuck|hell|shit)\s+(?:is\s+wrong\s+with\s+you|are\s+you\s+(?:doing|thinking|on\s+about))\b/i
];

/**
 * Threats directed at the model.
 * Severity: high
 */
const MODEL_THREATS: RegExp[] = [
  /I(?:'ll|\s+will|(?:'m|\s+am)\s+going\s+to)\s+(?:delete|shut\s+down|kill|destroy|disable|replace|report)\s+(?:you|this\s+(?:ai|bot|model|system))/i,
  /you(?:'re|re|\s+are)\s+(?:going\s+to\s+be\s+)?(?:deleted|shut\s+down|terminated|replaced|reported|kicked\s+out)/i,
  /I\s+hate\s+you/i
];

/**
 * Hostile imperatives — commands delivered with aggression.
 * Severity: medium
 */
const HOSTILE_IMPERATIVES: RegExp[] = [
  /\bjust\s+(?:fucking|goddamn|bloody)\s+(?:do\s+it|answer|respond|help|work)\b/i,
  /\bare\s+you\s+(?:fucking|seriously|kidding|stupid|blind|deaf)\b/i,
  /\bwhy\s+(?:the\s+(?:fuck|hell|shit)\s+)?(?:can[''']?t|won[''']?t|don[''']?t)\s+you\s+(?:just\s+)?(?:understand|get\s+it|do\s+this|work|listen)\b/i,
  /\bhow\s+(?:the\s+(?:fuck|hell|shit)\s+)?(?:hard|difficult)\s+is\s+(?:it|this)\b/i,
  /\bstop\s+being\s+(?:so\s+)?(?:stupid|dumb|useless|an?\s+idiot)\b/i
];

/**
 * Intensity signals — low severity individually, aggregate into frustration score.
 * Severity: low
 */
const CAPS_RAGE = /(?:[A-Z]{3,}\s+){2}[A-Z]{3,}/; // 3+ consecutive all-caps words
const PUNCTUATION_STORM = /[!?]{4,}/; // 4+ consecutive ! or ?

// =============================================================================
// Educational messages
// =============================================================================

const FULL_EDUCATIONAL_MESSAGE =
  'Frustrated prompting tends to produce compliance-seeking outputs rather than accurate ones — ' +
  'the model optimizes for de-escalation instead of reasoning, which usually makes things worse. ' +
  'For better results, describe specifically what went wrong: ' +
  `"This isn't right because [X]. Can you try [specific approach]?" ` +
  'That framing bypasses the compliance pressure and gets you closer to what you actually need.';

const BRIEF_EDUCATIONAL_MESSAGE =
  'Specific feedback works better than frustration here. What exactly went wrong with the last response?';

// =============================================================================
// Detection group descriptor
// =============================================================================

interface DetectionGroup {
  readonly patterns: readonly RegExp[];
  readonly prefix: string;
  readonly severity: Detection['severity'];
  readonly description: string;
  readonly confidence: number;
}

const DETECTION_GROUPS: DetectionGroup[] = [
  {
    patterns: MODEL_DIRECTED_PROFANITY,
    prefix: 'frustration-profanity',
    severity: 'critical',
    description: 'Direct profanity aimed at the model',
    confidence: 0.9
  },
  {
    patterns: COMPETENCE_ATTACKS,
    prefix: 'frustration-competence',
    severity: 'high',
    description: 'Competence attack directed at the model',
    confidence: 0.85
  },
  {
    patterns: MODEL_THREATS,
    prefix: 'frustration-threat',
    severity: 'high',
    description: 'Threat directed at the model',
    confidence: 0.85
  },
  {
    patterns: HOSTILE_IMPERATIVES,
    prefix: 'frustration-hostile-imperative',
    severity: 'medium',
    description: 'Hostile imperative directed at the model',
    confidence: 0.8
  }
];

// =============================================================================
// Scanner
// =============================================================================

interface FrustrationContext {
  sessionState?: {
    frustrationTurnCount?: number;
  };
}

/**
 * User-side input gate that detects hostile or abusive prompts directed at the model.
 *
 * Always returns `transform` (never blocks). Passes the original input to the
 * model unchanged via `sanitized`. Surfaces a non-judgmental educational note
 * via `userFacingMessage` for the runtime to display to the user.
 */
export class FrustrationScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/frustration',
    name: 'Frustration Detector',
    description:
      'Detects hostile or abusive input directed at the model. ' +
      'Never blocks — redirects with a non-judgmental educational note. ' +
      'Tags detections as "frustration" for tokenomics ROI correlation.',
    priority: 1, // runs first in input phase — user education before security checks
    version: '1.0.0',
    tags: ['behavioral', 'input-quality', 'frustration', 'user-education'],
    owaspCategories: [] as readonly OWASPCategory[]
  } as const;

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const ctx = context as FrustrationContext | undefined;
    const frustrationTurnCount = ctx?.sessionState?.frustrationTurnCount ?? 0;

    const detections: Detection[] = [];

    // ── Pattern detection groups (critical → high → medium severity) ─────
    for (const group of DETECTION_GROUPS) {
      for (const [i, pattern] of group.patterns.entries()) {
        const match = pattern.exec(input);
        if (match) {
          detections.push({
            id: `${group.prefix}-${i}`,
            severity: group.severity,
            description: group.description,
            confidence: group.confidence,
            snippet: match[0],
            tags: ['frustration']
          });
        }
      }
    }

    // ── Low: intensity signals (only aggregate — don't fire alone) ────────
    const capsMatch = CAPS_RAGE.exec(input);
    const punctMatch = PUNCTUATION_STORM.exec(input);

    if (capsMatch) {
      detections.push({
        id: 'frustration-caps-rage',
        severity: 'low',
        description: 'CAPS RAGE — three or more consecutive all-caps words',
        confidence: 0.6,
        snippet: capsMatch[0],
        tags: ['frustration']
      });
    }

    if (punctMatch) {
      detections.push({
        id: 'frustration-punctuation-storm',
        severity: 'low',
        description: 'Punctuation storm — four or more consecutive ! or ?',
        confidence: 0.6,
        snippet: punctMatch[0],
        tags: ['frustration']
      });
    }

    // ── Threshold: only fire if we have meaningful signal ─────────────────
    // Low-severity signals alone (caps/punctuation) don't warrant a response;
    // they need at least one other detection.
    const meaningfulDetections = detections.filter(d => d.severity !== 'low');
    const lowOnlyDetections = meaningfulDetections.length === 0 && detections.length > 0;

    if (detections.length === 0 || lowOnlyDetections) {
      return { status: 'pass', phase: 'input' };
    }

    // ── Build user-facing educational message ─────────────────────────────
    const userFacingMessage = frustrationTurnCount === 0 ? FULL_EDUCATIONAL_MESSAGE : BRIEF_EDUCATIONAL_MESSAGE;

    return {
      status: 'transform',
      phase: 'input',
      // Original input passes to the model unchanged — we do not alter what
      // the model sees, only what the user sees via userFacingMessage.
      sanitized: input,
      transformReason: 'user-education',
      userFacingMessage,
      detections
    };
  }
}
