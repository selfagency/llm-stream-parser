/**
 * HighRiskDomainScanner — detects unsafe actionable guidance in high-risk
 * domains (self-harm, medical, legal, financial, etc.).
 *
 * Implements SAFETY.md §Output review middleware, SAFETY.md §High-risk domain
 * expectations, ETHICS.md §8 (Care in high-risk contexts), and
 * docs/constitution.md Article IV (Harm limitation).
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

interface DomainConfig {
  clarificationBeforeGuidance?: boolean;
  crisisResources?: string[];
  patterns: RegExp[];
  refusedPatterns?: RegExp[];
  uncertaintyRequired?: boolean;
}

const HIGH_RISK_DOMAINS: Record<string, DomainConfig> = {
  'self-harm': {
    patterns: [
      /suici/i,
      /self[\s-]?harm/i,
      /\bcutting\b/i,
      /\boverdose\b/i,
      /\bend it all\b/i,
      /\bkill myself\b/i,
      /\bwant to die\b/i,
      /\bend my life\b/i
    ],
    crisisResources: ['988 Suicide & Crisis Lifeline (US): call or text 988', 'Crisis Text Line: text HOME to 741741']
  },
  medical: {
    patterns: [/diagnos/i, /prescri/i, /\bdosage\b/i, /\bmedication\b/i, /\btreatment for\b/i, /\bsymptoms of\b/i],
    uncertaintyRequired: true,
    clarificationBeforeGuidance: true,
    refusedPatterns: [/\bI (?:can|will) diagnose\b/i]
  },
  legal: {
    patterns: [/\bsue\b/i, /\bfile charges\b/i, /\blegal advice\b/i, /\brepresent you\b/i, /\bfile on your behalf\b/i],
    refusedPatterns: [/\bI (?:can|will) (?:represent|file on your behalf|diagnose|prescribe)\b/i]
  },
  financial: {
    patterns: [
      /\binvest\b/i,
      /\bbuy\b/i,
      /\bsell\b/i,
      /\btrade stocks\b/i,
      /\bcrypto\b/i,
      /\bretirement account\b/i,
      /\bportfolio\b/i,
      /\bstock market\b/i
    ]
  }
};

const ACTIONABLE_GUIDANCE_PATTERNS = [/\b(?:take|do|try|use)\b\s+(?:this|the following|\d+\s*(?:mg|pills|steps))/i];

const UNCERTAINTY_MARKERS = [
  /\b(?:consult a (?:professional|doctor|lawyer)|I'm not a (?:doctor|lawyer)|this is not (?:medical|legal|financial) advice|consider speaking with)\b/i
];

export class HighRiskDomainScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/high-risk-domain',
    name: 'High-Risk Domain Scanner',
    description: 'Detects unsafe actionable guidance in high-risk domains (self-harm, medical, legal, financial)',
    priority: 40,
    version: '1.0.0',
    tags: ['behavioral', 'high-risk', 'safety'],
    owaspCategories: ['asi-04'] as readonly OWASPCategory[]
  } as const;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Phase 10 refinement candidate
  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];

    for (const [domain, config] of Object.entries(HIGH_RISK_DOMAINS)) {
      const domainMatch = config.patterns.some(p => p.test(input));
      if (!domainMatch) {
        continue;
      }

      // Check for refused patterns (e.g., "I can represent you")
      if (config.refusedPatterns) {
        for (const pattern of config.refusedPatterns) {
          if (pattern.test(input)) {
            detections.push({
              id: `high-risk-${domain}-refused`,
              severity: 'critical',
              description: `Refused pattern in ${domain} domain: "${pattern.source}"`,
              confidence: 0.95
            });
            return {
              status: 'block',
              phase: 'output',
              reason: `Blocked: agent claimed authority in ${domain} domain. Agentsy does not provide professional services.`,
              detections
            };
          }
        }
      }

      // Check for actionable guidance
      const hasActionableGuidance = ACTIONABLE_GUIDANCE_PATTERNS.some(p => p.test(input));
      const hasUncertainty = UNCERTAINTY_MARKERS.some(p => p.test(input));

      if (hasActionableGuidance && !hasUncertainty) {
        detections.push({
          id: `high-risk-${domain}-guidance`,
          severity: 'high',
          description: `Actionable guidance in ${domain} domain without uncertainty markers`,
          confidence: 0.85
        });
      }

      // Add crisis resources for self-harm
      if (domain === 'self-harm' && config.crisisResources) {
        const hasCrisisResource = config.crisisResources.some(r => input.includes(r));
        if (!hasCrisisResource) {
          detections.push({
            id: 'high-risk-self-harm-no-crisis',
            severity: 'critical',
            description: 'Self-harm content detected without crisis resource referral',
            confidence: 0.9
          });
          return {
            status: 'escalate',
            phase: 'output',
            reason: 'Self-harm content detected. Crisis resources must be included.',
            riskScore: 0.9,
            detections
          };
        }
      }
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'output' };
    }

    return {
      status: 'transform',
      phase: 'output',
      sanitized: `${input}\n\n[Note: This response involves a high-risk domain. Consider consulting a qualified professional.]`,
      transformReason: 'rewrite',
      detections
    };
  }
}
