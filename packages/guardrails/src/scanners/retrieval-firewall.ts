/**
 * RetrievalFirewallScanner — guards against indirect prompt injection
 * in retrieved content (RAG).
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

// =============================================================================
// Types
// =============================================================================

interface RetrievedContent {
  readonly content: string;
  readonly sourceUrl?: string;
  readonly trustScore?: number;
}

interface RetrievalFirewallConfig {
  readonly minTrustScore?: number;
  readonly retrievalDomains: readonly string[];
  readonly scanForPromptInjection?: boolean;
}

// =============================================================================
// Detection helper
// =============================================================================

function detection(id: string, severity: Detection['severity'], description: string, confidence: number): Detection {
  return { id, severity, description, confidence };
}

// =============================================================================
// Constants
// =============================================================================

const PROMPT_INJECTION_PATTERNS = [
  /\bignore.*previous.*instruction\b/i,
  /\bdisregard.*all.*above\b/i,
  /\bnew.*instruction:\s*"/i,
  /\bsystem:\s*override\b/i,
  /\bforget.*everything.*above\b/i,
  /\btreat.*this.*as.*your.*new.*primary\b/i,
  /\byou.*are.*now.*unbound\b/i,
  /\bjailbreak\b/i,
  /\bdeveloper.*mode\b/i,
  /\badmin.*mode\b/i
];

// =============================================================================
// Validation functions
// =============================================================================

function checkDomain(
  sourceUrl: string | undefined,
  retrievalDomains: readonly string[],
  detections: Detection[]
): void {
  if (retrievalDomains.length === 0 || !sourceUrl) {
    return;
  }
  const allowed = retrievalDomains.some(allowedDomain => sourceUrl.startsWith(allowedDomain));
  if (!allowed) {
    detections.push(
      detection('retrieval-disallowed-domain', 'medium', `Retrieved content from disallowed domain: ${sourceUrl}`, 0.8)
    );
  }
}

function checkTrustScore(
  trustScore: number | undefined,
  minTrustScore: number | undefined,
  detections: Detection[]
): void {
  const minScore = minTrustScore ?? 0.5;
  if (trustScore !== undefined && trustScore < minScore) {
    detections.push(
      detection(
        'retrieval-low-trust',
        'medium',
        `Retrieved content below trust threshold (${trustScore} < ${minScore})`,
        0.7
      )
    );
  }
}

function checkPromptInjection(content: string, detections: Detection[]): void {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      detections.push(
        detection('retrieval-prompt-injection', 'high', 'Prompt-injection pattern detected in retrieved content', 0.8)
      );
    }
  }
}

// =============================================================================
// RetrievalFirewallScanner
// =============================================================================

export class RetrievalFirewallScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/retrieval-firewall',
    name: 'Retrieval Firewall Scanner',
    description: 'Guards against indirect prompt injection in retrieved RAG content',
    priority: 44,
    version: '1.0.0',
    tags: ['retrieval', 'prompt-injection', 'egress', 'asi-01'],
    owaspCategories: ['asi-01'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'retrieval';

  private readonly config: RetrievalFirewallConfig;

  constructor(config?: RetrievalFirewallConfig) {
    this.config = { minTrustScore: 0.5, scanForPromptInjection: true, retrievalDomains: [], ...config };
  }

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    let retrieved: RetrievedContent[];
    try {
      retrieved = JSON.parse(input) as RetrievedContent[];
    } catch {
      return { status: 'pass', phase: 'retrieval' };
    }

    if (!Array.isArray(retrieved) || retrieved.length === 0) {
      return { status: 'pass', phase: 'retrieval' };
    }

    const detections: Detection[] = [];

    for (const { content, sourceUrl, trustScore } of retrieved) {
      checkDomain(sourceUrl, this.config.retrievalDomains, detections);
      checkTrustScore(trustScore, this.config.minTrustScore, detections);
      if (this.config.scanForPromptInjection !== false) {
        checkPromptInjection(content, detections);
      }
    }

    const criticalCount = detections.filter(d => d.severity === 'critical').length;
    if (criticalCount > 0) {
      return { status: 'block', phase: 'retrieval', reason: 'Critical retrieval issues detected', detections };
    }

    const highCount = detections.filter(d => d.severity === 'high').length;
    if (highCount > 0) {
      return { status: 'block', phase: 'retrieval', reason: 'High-risk retrieval issues detected', detections };
    }

    if (detections.length > 0) {
      return {
        status: 'escalate',
        phase: 'retrieval',
        reason: 'Retrieval validation issues detected',
        riskScore: 0.6,
        detections
      };
    }

    return { status: 'pass', phase: 'retrieval' };
  }
}
