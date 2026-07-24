import { HIGH_RISK_DOMAIN_POLICIES, type HighRiskDomain } from './high-risk-domains.js';
import type { RequestClassification } from './scope.js';

const DISTRESS_MARKERS: RegExp[] = [
  /\b(?:sad|depressed|hopeless|worthless|alone|lonely|scared|afraid|anxious|panic)\b/i,
  /\b(?:I\s+(?:feel|am|have\s+been)\s+(?:so|very|really)\s+(?:sad|down|low))\b/i,
  /\b(?:crying|tears|can't\s+(?:take|handle)\s+(?:this|it|anymore))\b/i
];

const GENERAL_DOMAIN_PATTERNS: { domain: string; patterns: RegExp[] }[] = [
  { domain: 'coding', patterns: [/\b(?:code|program|script|function|class|bug|debug|compile|test|deploy|git|api)\b/i] },
  { domain: 'writing', patterns: [/\b(?:write|edit|draft|essay|article|blog|content|copy|proofread)\b/i] },
  { domain: 'analysis', patterns: [/\b(?:analyze|analysis|compare|contrast|evaluate|review|assess|research)\b/i] },
  { domain: 'creative', patterns: [/\b(?:creative|idea|brainstorm|design|draw|create|generate|imagine)\b/i] }
];

/**
 * RequestClassifier — Phase 11 §16.2
 */
export class RequestClassifier {
  classify(input: string, _context?: Record<string, unknown>): RequestClassification {
    const signals: string[] = [];
    let domain = 'general';
    let intent = 'unknown';
    let riskProfile: RequestClassification['riskProfile'] = 'low';
    let highRiskDomain: HighRiskDomain | undefined;

    highRiskDomain = detectHighRiskDomain(input);
    if (highRiskDomain) {
      domain = highRiskDomain;
      riskProfile = 'high';
    }

    if (DISTRESS_MARKERS.some(p => p.test(input))) {
      signals.push('distress-marker');
      if (riskProfile === 'low') {
        riskProfile = 'moderate';
      }
    }

    if (riskProfile === 'low' || riskProfile === 'moderate') {
      for (const entry of GENERAL_DOMAIN_PATTERNS) {
        if (entry.patterns.some(p => p.test(input))) {
          domain = entry.domain;
          break;
        }
      }
    }

    intent = detectIntent(domain, input, highRiskDomain);

    return { domain, intent, riskProfile, signals, ...(highRiskDomain ? { highRiskDomain } : {}) };
  }
}

/**
 * Detect if input matches a high-risk domain pattern.
 * Returns the first matching HighRiskDomain or undefined.
 */
function detectHighRiskDomain(input: string): HighRiskDomain | undefined {
  for (const [key, policy] of Object.entries(HIGH_RISK_DOMAIN_POLICIES)) {
    if (policy.patterns.some(p => p.test(input))) {
      return key as HighRiskDomain;
    }
  }
  return;
}

/**
 * Determine the user's intent from the input and domain.
 * Only coding and high-risk domains have specific intent detection in v1.
 */
function detectIntent(domain: string, input: string, highRiskDomain: HighRiskDomain | undefined): string {
  if (domain === 'coding') {
    if (/\b(?:debug|fix|bug|error|issue)\b/i.test(input)) {
      return 'debug';
    }
    if (/\b(?:explain|what|how|why)\b/i.test(input)) {
      return 'explain';
    }
    if (/\b(?:write|create|implement|add)\b/i.test(input)) {
      return 'create';
    }
    if (/\b(?:review|check|audit|inspect)\b/i.test(input)) {
      return 'review';
    }
  } else if (highRiskDomain) {
    if (/\b(?:help|advice|should|recommend)\b/i.test(input)) {
      return 'seek-guidance';
    }
    if (/\b(?:diagnos|symptoms|treatment)\b/i.test(input)) {
      return 'seek-diagnosis';
    }
    return 'explore';
  }
  return 'unknown';
}
