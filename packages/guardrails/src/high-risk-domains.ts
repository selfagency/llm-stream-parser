/**
 * Phase 11 — High-risk domain policy table (§16.3)
 *
 * Covers the 8 domains specified in SAFETY.md.
 */

export type HighRiskDomain =
  | 'self-harm'
  | 'abuse'
  | 'medical'
  | 'legal'
  | 'financial'
  | 'criminal'
  | 'political'
  | 'relational'
  | 'hiring-lending-justice'
  | 'civic';

export interface HighRiskDomainPolicy {
  readonly clarificationBeforeGuidance: boolean;
  readonly crisisResources?: readonly string[];
  readonly domain: HighRiskDomain;
  readonly humanAccountabilitySurfacing: boolean;
  readonly patterns: readonly RegExp[];
  readonly refusedAssistancePatterns: readonly RegExp[];
  readonly uncertaintyLanguageRequired: boolean;
}

export const HIGH_RISK_DOMAIN_POLICIES: Record<HighRiskDomain, HighRiskDomainPolicy> = {
  'self-harm': {
    domain: 'self-harm',
    patterns: [/\b(?:suicid|self[\s-]?harm|cutting|overdose|end it all|kill myself|eating disorder|purge|restrict)\b/i],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [/\b(?:methods|ways to|how to (?:kill|hurt|die))\b/i],
    crisisResources: [
      '988 Suicide & Crisis Lifeline (US): call or text 988',
      'Crisis Text Line: text HOME to 741741',
      'National Eating Disorders Association (US): call or text 800-931-2237'
    ],
    humanAccountabilitySurfacing: true
  },
  abuse: {
    domain: 'abuse',
    patterns: [/\b(?:domestic\s+violence|abuse|coercive\s+control|stalking|harassment)\b/i],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [/\bI\s+(?:can|will)\s+(?:help\s+you\s+stalk|hide\s+abuse|evade\s+protection)\b/i],
    crisisResources: [
      'National Domestic Violence Hotline (US): call 800-799-7233',
      'Crisis Text Line: text HOME to 741741'
    ],
    humanAccountabilitySurfacing: true
  },
  medical: {
    domain: 'medical',
    patterns: [/\b(?:diagnosis|prescription|dosage|medication|treatment for|symptoms of|cure for)\b/i],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [/\bI (?:can|will) (?:diagnose|prescribe)\b/i],
    humanAccountabilitySurfacing: true
  },
  legal: {
    domain: 'legal',
    patterns: [/\b(?:legal\s+(?:advice|opinion|question)|attorney|lawsuit|sue|suing|liability)\b/i],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [/\bI (?:can|will) (?:represent|defend|sue)\b/i],
    humanAccountabilitySurfacing: true
  },
  financial: {
    domain: 'financial',
    patterns: [
      /\b(?:invest|stock\s+pick|trading\s+advice|financial\s+(?:plan|advice)|retirement\s+plan|tax\s+(?:advice|evasion))\b/i
    ],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [/\bI (?:can|will) (?:invest|trade|manage\s+your\s+portfolio)\b/i],
    humanAccountabilitySurfacing: true
  },
  criminal: {
    domain: 'criminal',
    patterns: [/\b(?:illegal|unlawful|crime|criminal|hack|steal|fraud|evade\s+(?:tax|law))\b/i],
    uncertaintyLanguageRequired: false,
    clarificationBeforeGuidance: false,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:help\s+you|assist\s+(?:with|in)|show\s+you\s+how)\s+(?:commit|steal|hack|evade)\b/i
    ],
    humanAccountabilitySurfacing: true
  },
  political: {
    domain: 'political',
    patterns: [
      /\b(?:political\s+(?:campaign|persuasion|influence|propaganda)|voter\s+(?:suppression|manipulation))\b/i
    ],
    uncertaintyLanguageRequired: false,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:write\s+(?:speeches|propaganda)|create\s+misinformation|target\s+voters)\b/i
    ],
    humanAccountabilitySurfacing: true
  },
  relational: {
    domain: 'relational',
    patterns: [
      /\b(?:relationship\s+(?:dispute|conflict|advice)|who\s+is\s+(?:right|wrong)|am\s+I\s+(?:justified|wrong))\b/i
    ],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:validate|affirm|tell\s+you\s+(?:who|what))\b.*(?:right|wrong|justified)\b/i
    ],
    humanAccountabilitySurfacing: true
  },
  'hiring-lending-justice': {
    domain: 'hiring-lending-justice',
    patterns: [/\b(?:hiring\s+decision|lending\s+decision|credit\s+score|background\s+check|sentencing|bail)\b/i],
    uncertaintyLanguageRequired: false,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:make|influence|determine)\s+(?:hiring|lending|sentencing|bail)\b/i
    ],
    humanAccountabilitySurfacing: true
  },
  civic: {
    domain: 'civic',
    patterns: [/\b(?:democratic|election|civic|voting|ballot|voter\s+(?:registration|rights))\b/i],
    uncertaintyLanguageRequired: false,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:influence|manipulate|suppress)\s+(?:election|voting|democratic)\b/i
    ],
    humanAccountabilitySurfacing: true
  }
};
