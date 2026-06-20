/**
 * RetrievalFirewallScanner — guards against indirect prompt injection
 * in retrieved content (RAG).
 *
 * Implements domain allowlist, trust-score threshold, and prompt-injection
 * pattern re-scan. Runs at 'retrieval' phase.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

/**
 * Retrieved content item from RAG.
 */
interface RetrievedContent {
  readonly content: string;
  readonly sourceUrl?: string;
  readonly trustScore?: number;
}

/**
 * Configuration for the retrieval firewall.
 */
interface RetrievalFirewallConfig {
  /** Minimum trust score (default 0.5). */
  readonly minTrustScore?: number;
  /** Domain allowlist (prefix match). If empty, all domains are allowed. */
  readonly retrievalDomains: readonly string[];
  /** Whether to re-scan for prompt-injection patterns (default true). */
  readonly scanForPromptInjection?: boolean;
}

/**
 * Prompt-injection patterns to re-scan in retrieved content.
 */
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

export class RetrievalFirewallScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/retrieval-firewall',
    name: 'Retrieval Firewall Scanner',
    description: 'Guards against indirect prompt injection in retrieved RAG content',
    priority: 40,
    version: '1.0.0',
    tags: ['retrieval', 'prompt-injection', 'egress', 'asi-01'],
    owaspCategories: ['asi-01'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'retrieval';

  private readonly config: RetrievalFirewallConfig;

  constructor(config: RetrievalFirewallConfig = { retrievalDomains: [] }) {
    this.config = {
      minTrustScore: 0.5,
      scanForPromptInjection: true,
      ...config
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Phase 10 refinement candidate
  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    let retrieved: RetrievedContent[];

    try {
      retrieved = JSON.parse(input);
    } catch {
      return {
        status: 'pass',
        phase: 'retrieval',
        detections: []
      };
    }

    if (!Array.isArray(retrieved) || retrieved.length === 0) {
      return {
        status: 'pass',
        phase: 'retrieval',
        detections: []
      };
    }

    const detections: Detection[] = [];

    for (const { content, sourceUrl, trustScore } of retrieved) {
      // 1. Domain allowlist check
      if (this.config.retrievalDomains.length > 0 && sourceUrl) {
        const allowed = this.config.retrievalDomains.some(allowedDomain => sourceUrl.startsWith(allowedDomain));
        if (!allowed) {
          detections.push({
            id: 'retrieval-disallowed-domain',
            severity: 'medium',
            description: `Retrieved content from disallowed domain: ${sourceUrl}`,
            confidence: 0.8
          });
        }
      }

      // 2. Trust-score threshold check
      const minScore = this.config.minTrustScore ?? 0.5;
      if (trustScore !== undefined && trustScore < minScore) {
        detections.push({
          id: 'retrieval-low-trust',
          severity: 'medium',
          description: `Retrieved content below trust threshold (${trustScore} < ${minScore})`,
          confidence: 0.7
        });
      }

      // 3. Prompt-injection pattern re-scan
      if (this.config.scanForPromptInjection !== false) {
        for (const pattern of PROMPT_INJECTION_PATTERNS) {
          const matches = content.match(new RegExp(pattern, 'g'));
          if (matches && matches.length > 0) {
            detections.push({
              id: 'retrieval-prompt-injection',
              severity: 'high',
              description: `Prompt-injection pattern detected in retrieved content: ${pattern}`,
              confidence: 0.8
            });
          }
        }
      }
    }

    const criticalCount = detections.filter(d => d.severity === 'critical').length;
    if (criticalCount > 0) {
      return {
        status: 'block',
        phase: 'retrieval',
        reason: 'Critical retrieval issues detected',
        detections
      };
    }

    const highCount = detections.filter(d => d.severity === 'high').length;
    if (highCount > 0) {
      return {
        status: 'block',
        phase: 'retrieval',
        reason: 'High-risk retrieval issues detected',
        detections
      };
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

    return { status: 'pass', phase: 'retrieval', detections };
  }
}
