/**
 * Safety and security guardrails for the Agentsy platform.
 *
 * ## Architecture
 *
 * - **GuardrailScanner** — individual policy checks (injection, PII, secrets, …)
 * - **GuardrailPipeline** — priority-sorted sequential evaluation pipeline
 * - **GuardrailHub** — local registry for `hub://` guardrail URI resolution
 * - **PolicyEngine** — YAML-driven policy-as-code (Microsoft AGT pattern)
 *
 * ## Design principle
 *
 * Safety logic MUST be implemented in hooks or guardrails (deterministic),
 * never in system prompts (probabilistic). A guardrail that returns
 * `{status:'block'}` cannot be overridden by model output. A system prompt
 * instruction can be.
 */

export {
  CommandValidationScanner,
  createBuiltinScanners,
  PathSanitizationScanner,
  PIIScanner,
  PromptInjectionScanner,
  RateLimiterScanner,
  SecretDetectionScanner,
  ToxicityScanner
} from './builtins.js';
export type { GuardrailFactory, HubEntry, HubUri } from './hub.js';
export { BUILTIN_GUARDRAIL_URIS, GuardrailHub, parseHubUri } from './hub.js';
export { GuardrailPipeline } from './pipeline.js';
export type {
  PolicyAction,
  PolicyContext,
  PolicyDocument,
  PolicyEvalResult,
  PolicyRule
} from './policy.js';
export {
  DEFAULT_POLICY,
  evaluateCondition,
  evaluatePolicy
} from './policy.js';
export type {
  Detection,
  GuardrailDecisionReceipt,
  GuardrailMetadata,
  GuardrailPhase,
  GuardrailResult,
  GuardrailScanner,
  OWASPCategory,
  PipelineConfig
} from './types.js';

// ---------------------------------------------------------------------------
// Ethics registry — maps policy document clauses to machine-enforceable rules
// ---------------------------------------------------------------------------

export type { EnforceableAs, EthicalClause, PolicySource } from './ethics/registry.js';
export { DEFAULT_ETHICS_REGISTRY, EthicsRegistry } from './ethics/registry.js';

// ---------------------------------------------------------------------------
// Provider ethics policy — hard blocks and warn-and-acknowledge entries
// ---------------------------------------------------------------------------

export type { ProviderEthicsAction, ProviderEthicsEntry } from './ethics/provider-policy.js';
export {
  getProviderEthicsPolicy,
  isProviderBlocked,
  PROVIDER_ETHICS_POLICY,
  requiresAcknowledgement
} from './ethics/provider-policy.js';

// ---------------------------------------------------------------------------
// Style-mimicry scanner — blocks prompts targeting living creators
// ---------------------------------------------------------------------------

export { StyleMimicryScanner } from './scanners/style-mimicry.js';

// ---------------------------------------------------------------------------
// Audit logger — decision receipt persistence and export
// ---------------------------------------------------------------------------

export type { AuditLogger, ReceiptQuery } from './audit/logger.js';
export { JsonlAuditLogger, ReceiptExporter, redactReceipt } from './audit/logger.js';

// ---------------------------------------------------------------------------
// Canonical GuardrailsConfig
// ---------------------------------------------------------------------------

export type { GuardrailsConfig } from './config.js';

// ---------------------------------------------------------------------------
// Message scrubbing — LLM input / deep object scrubbing (Phase 5.2)
// ---------------------------------------------------------------------------

export type { ScrubOptions } from './deep-scrub.js';
export { scrubPiiDeep } from './deep-scrub.js';
export type { ChatMessage, MessageScrubResult, ScrubbedMessage } from './message-scrubbing.js';
export { scrubMessage, scrubMessagesDetailed, scrubMessagesForModel } from './message-scrubbing.js';

// ---------------------------------------------------------------------------
// Entropy detection — Shannon entropy scanner (Phase 5.2)
// ---------------------------------------------------------------------------

export { EntropyScanner, entropyOf } from './entropy.js';

// ---------------------------------------------------------------------------
// Baseline suppression — known-finding fingerprinting (Phase 5.2)
// ---------------------------------------------------------------------------

export type { BaselineDocument, BaselineEntry } from './baseline.js';
export { BaselineManager, fingerprint } from './baseline.js';

// ---------------------------------------------------------------------------
// UI Copy Scanner — product-level dark-pattern detection (Phase 16)
// ---------------------------------------------------------------------------

export type { DarkPatternDetection, UIStringTable } from './ui-copy-scanner.js';
export { scanUICopy } from './ui-copy-scanner.js';

// ---------------------------------------------------------------------------
// Inline ignore directives — source-level suppression (Phase 5.2)
// ---------------------------------------------------------------------------

export type { IgnoreDirectives } from './inline-ignore.js';
export { parseIgnoreDirectives, shouldIgnore } from './inline-ignore.js';

// ---------------------------------------------------------------------------
// Credential Reference Scanner — resolves known credentials via broker (Phase 5.2)
// ---------------------------------------------------------------------------

export type { CredentialPattern, CredentialReferenceScannerOptions } from './credential-scanner.js';
export { CredentialReferenceScanner } from './credential-scanner.js';

// ---------------------------------------------------------------------------
// Policy enforcer — bridges policy-as-code with the guardrail pipeline
// ---------------------------------------------------------------------------

export { PolicyEnforcer } from './policy-enforcer.js';

// ---------------------------------------------------------------------------
// Legacy error classes (Phase 3.7)
// ---------------------------------------------------------------------------

export class QuotaExceededError extends Error {
  constructor(message = 'Token quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}
export class RetrievalBlockedError extends Error {
  constructor(message = 'Retrieval request blocked by firewall') {
    super(message);
    this.name = 'RetrievalBlockedError';
  }
}

// ---------------------------------------------------------------------------
// Routing constraints (Phase 3.7)
// ---------------------------------------------------------------------------

export type {
  ConstraintEvalResult,
  ConstraintViolation,
  ConstraintViolationCode,
  GatewayModelInfo,
  RoutingConstraint,
  RoutingConstraintEvalBatchResult
} from './routing-constraints.js';
export { evaluateConstraints, evaluateRoutingConstraints } from './routing-constraints.js';
