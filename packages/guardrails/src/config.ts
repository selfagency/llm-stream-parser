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
  /** List of enabled guardrail provider IDs. */
  providers: string[];

  /** Topics that are always allowed. */
  allowedTopics?: string[];

  /** Topics that are always blocked. */
  blockedTopics?: string[];

  /** Default risk tier for unclassified content. */
  riskTier?: 'low' | 'moderate' | 'high' | 'prohibited';

  /** PII redaction configuration. */
  piiRedaction?: {
    enabled: boolean;
    types: string[];
    placeholder?: string;
  };

  /** Secret redaction configuration. */
  secretRedaction?: {
    enabled: boolean;
    placeholder?: string;
  };

  /** Token quota limits. */
  tokenQuota?: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };

  /** Allowed domains for retrieval. */
  retrievalDomains?: string[];

  /** Tools that are always allowed. */
  toolAllowList?: string[];

  /** Allowed egress destinations. */
  egressAllowList?: string[];

  /** Memory policy configuration. */
  memoryPolicy?: {
    enabled: boolean;
    retentionDays: number;
    sensitiveContextRetentionDays: number;
  };

  /** Tool IDs that require human approval. */
  approvalRequiredFor?: string[];

  /** Trust hierarchy for context sources. */
  trustHierarchy?: Record<string, string[]>;

  /** Strip untrusted context from inputs. */
  stripUntrustedContext?: boolean;

  /** Only allow local processing. */
  localOnly?: boolean;
}
