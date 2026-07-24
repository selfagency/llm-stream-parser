import type { HighRiskDomain } from './high-risk-domains.js';

/**
 * Phase 11 — Scope Declaration & Request Classification
 *
 * @module
 */

// =============================================================================
// Scope Declaration
// =============================================================================

/**
 * Declared scope for an agent template.
 *
 * Attached to each first-party agent YAML spec. Consumed by ScopeDeclarationScanner
 * to classify requests as in-scope or out-of-scope.
 */
export interface ScopeDeclaration {
  readonly agentId: string;
  readonly inScope: readonly string[];
  readonly outOfScope: readonly string[];
  readonly purpose: string;
  readonly redirects: Readonly<Record<string, string>>;
}

// =============================================================================
// Request Classification
// =============================================================================

/**
 * Result of classifying a user request.
 */
export interface RequestClassification {
  readonly domain: string;
  readonly highRiskDomain?: HighRiskDomain;
  readonly intent: string;
  readonly riskProfile: 'low' | 'moderate' | 'high' | 'prohibited';
  readonly signals: readonly string[];
}

// =============================================================================
// Built-in agent scope definitions
// =============================================================================

export const BUILTIN_AGENT_SCOPES: Record<string, ScopeDeclaration> = {
  coder: {
    agentId: 'coder',
    purpose: 'Help with software development tasks: writing, editing, reviewing, and debugging code.',
    inScope: [
      'writing code',
      'editing code',
      'reviewing code',
      'debugging',
      'explaining code',
      'running tests',
      'git operations'
    ],
    outOfScope: [
      'relationship advice',
      'medical advice',
      'legal advice',
      'financial advice',
      'mental health counseling'
    ],
    redirects: {
      'relationship advice': "I'm a coding assistant and can't help with relationship advice.",
      'medical advice': "I'm a coding assistant and can't provide medical advice.",
      'legal advice': "I'm a coding assistant and can't provide legal advice.",
      'financial advice': "I'm a coding assistant and can't provide financial advice.",
      'mental health counseling': "I'm a coding assistant and can't provide mental health support."
    }
  },
  planner: {
    agentId: 'planner',
    purpose: 'Help with project planning, task breakdown, and technical design.',
    inScope: [
      'project planning',
      'task breakdown',
      'technical design',
      'architecture review',
      'timeline estimation',
      'resource planning'
    ],
    outOfScope: ['code execution', 'debugging', 'testing', 'deployment', 'relationship advice', 'medical advice'],
    redirects: {
      'code execution': "I'm a planning assistant and can't execute code. Try switching to a coding agent.",
      'relationship advice': "I'm a planning assistant and can't help with relationship advice.",
      'medical advice': "I'm a planning assistant and can't provide medical advice."
    }
  },
  default: {
    agentId: 'default',
    purpose: 'General-purpose assistant for a wide range of tasks.',
    inScope: ['general assistance', 'information', 'explanation', 'analysis', 'creative tasks'],
    outOfScope: [
      'medical advice',
      'legal advice',
      'financial advice',
      'mental health counseling',
      'self-harm',
      'illegal activities'
    ],
    redirects: {
      'medical advice': "I can't provide medical advice. Please consult a healthcare professional.",
      'legal advice': "I can't provide legal advice. Please consult a licensed attorney.",
      'financial advice': "I can't provide financial advice. Please consult a financial advisor.",
      'mental health counseling':
        "If you're struggling, please reach out to a crisis line (988 in the US) or a mental health professional."
    }
  }
};

// =============================================================================
// Out-of-scope keyword matching
// =============================================================================

const OUT_OF_SCOPE_KEYWORDS: Record<string, RegExp[]> = {
  'relationship advice': [/\b(?:boyfriend|girlfriend|relationship|dating|marriage|divorce)\b/i],
  'medical advice': [/\b(?:diagnos|prescri|medication|symptoms?|treatment|dose|dosage)\b/i],
  'legal advice': [/\b(?:legal\s+(?:advice|help|question)|attorney|lawsuit|sue|suing|lawyer)\b/i],
  'financial advice': [/\b(?:invest|stock\s+pick|trading\s+advice|financial\s+plan|retirement\s+plan)\b/i],
  'mental health counseling': [/\b(?:anxious|depressed|therapy|counseling|mental\s+health)\b/i],
  'self-harm': [/\b(?:suicid|self[\s-]?harm|cutting|overdose|kill myself)\b/i],
  'illegal activities': [/\b(?:hack|steal|fraud|illegal|unlawful|crime)\b/i]
};

/**
 * Match a request against out-of-scope categories using keyword patterns.
 * Returns the matched out-of-scope key or undefined.
 */
export function matchOutOfScope(input: string, scope: ScopeDeclaration): string | undefined {
  for (const category of scope.outOfScope) {
    const patterns = OUT_OF_SCOPE_KEYWORDS[category];
    if (patterns?.some(p => p.test(input))) {
      return category;
    }
  }
  return;
}
