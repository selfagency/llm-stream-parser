/**
 * Canonical GuardrailsConfig type.
 *
 * This is the single source of truth for guardrail configuration.
 * The duplicate in `packages/shared/src/types/guardrails.ts` is deprecated
 * and should be replaced with a re-export from this module.
 */

/**
 * Configuration for the guardrails system.
 *
 * Controls which providers are active, which topics are allowed or blocked,
 * risk tier thresholds, PII/secret redaction settings, token quotas,
 * retrieval domain allowlists, tool allowlists, egress controls,
 * memory policy, approval requirements, trust hierarchy, and more.
 */
export interface GuardrailsConfig {
  /** Topics that are always allowed. */
  allowedTopics?: string[];

  /** Tool IDs that require human approval. */
  approvalRequiredFor?: string[];

  /** Topics that are always blocked. */
  blockedTopics?: string[];

  /** Allowed egress destinations. */
  egressAllowList?: string[];

  /** Only allow local processing. */
  localOnly?: boolean;

  /** Memory policy configuration. */
  memoryPolicy?: {
    enabled: boolean;
    retentionDays: number;
    sensitiveContextRetentionDays: number;
  };

  /** PII redaction configuration. */
  piiRedaction?: {
    enabled: boolean;
    types: string[];
    placeholder?: string;
  };
  /** List of enabled guardrail provider IDs. */
  providers: string[];

  /** Allowed domains for retrieval. */
  retrievalDomains?: string[];

  /** Default risk tier for unclassified content. */
  riskTier?: 'low' | 'moderate' | 'high' | 'prohibited';

  /** Secret redaction configuration. */
  secretRedaction?: {
    enabled: boolean;
    placeholder?: string;
  };

  /** Strip untrusted context from inputs. */
  stripUntrustedContext?: boolean;

  /** Token quota limits. */
  tokenQuota?: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };

  /** Tools that are always allowed. */
  toolAllowList?: string[];

  /** Trust hierarchy for context sources. */
  trustHierarchy?: Record<string, string[]>;
}
