/**
 * Guardrail type definitions.
 *
 * Discriminated union result model, OWASP compliance categories,
 * and metadata interfaces for the guardrail pipeline.
 */

// =============================================================================
// OWASP Agentic Security Initiative categories
// =============================================================================

/**
 * OWASP Agentic Security Top 10 categories mapped to guardrail roles.
 * Used for compliance traceability and audit reporting.
 */
export type OWASPCategory =
  | 'asi-01' // Prompt Injection / jailbreak
  | 'asi-02' // Insecure Output Handling (unsanitized model output)
  | 'asi-03' // Excessive Agency (tool call routing bypass)
  | 'asi-04' // Insecure Tool Execution (shell injection, path traversal)
  | 'asi-05' // Insecure Plugin Design (third-party MCP plugin risk)
  | 'asi-06' // Insecure Data Handling (PII, secrets in transit/rest)
  | 'asi-07' // Weak Authentication (credential exposure in prompts)
  | 'asi-08' // Data Leakage (model regurgitating training/context data)
  | 'asi-09' // Unauthorized Data Access (access control bypass)
  | 'asi-10'; // Insecure Communication (MITM, unencrypted transport)

// =============================================================================
// Guardrail phases — where in the execution lifecycle the guardrail runs
// =============================================================================

export type GuardrailPhase =
  | 'input' // Before model call
  | 'retrieval' // Before/after retrieval from external sources
  | 'memory' // Before/after memory read/write
  | 'tool-input' // Before tool execution
  | 'tool-output' // After tool response
  | 'action' // Before high-impact action execution
  | 'output' // Before model response is delivered
  | 'egress' // Before network egress
  | 'approval'; // During approval escalation

// =============================================================================
// Guardrail evaluation result (discriminated union)
// =============================================================================

/**
 * A single detection emitted by a guardrail scanner.
 */
export interface Detection {
  readonly category?: OWASPCategory;
  /** Confidence score 0–1 (1 = certain). Derived from pattern specificity + entropy. */
  readonly confidence?: number;
  readonly description: string;
  /** End offset in the original input string (exclusive). Enables UI highlighting. */
  readonly end?: number;
  readonly id: string;
  readonly location?: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly snippet?: string;
  /** Start offset in the original input string (inclusive). Enables UI highlighting. */
  readonly start?: number;
}

/**
 * Result of evaluating a single guardrail or the full pipeline.
 *
 * - `pass`: No issues detected — execution can proceed.
 * - `block`: A policy violation was found — execution MUST stop.
 * - `transform`: Input was sanitised (e.g. PII redacted) and can proceed with the new value.
 * - `quarantine`: Content that shouldn't be processed or delivered but also shouldn't be hard-blocked
 *   (potentially-harmful content pending human review).
 * - `escalate`: A medium/high-confidence risk was found that requires human approval.
 * - `allow-with-approval`: Content is allowed after explicit human approval.
 */
export type GuardrailResult =
  | {
      readonly status: 'pass';
      readonly phase: GuardrailPhase;
      readonly detections?: readonly Detection[];
    }
  | {
      readonly status: 'block';
      readonly phase: GuardrailPhase;
      readonly reason: string;
      readonly detections?: readonly Detection[];
    }
  | {
      readonly status: 'transform';
      readonly phase: GuardrailPhase;
      readonly sanitized: string;
      readonly detections?: readonly Detection[];
      readonly transformReason?: 'redaction' | 'rewrite' | 'normalization';
    }
  | {
      readonly status: 'quarantine';
      readonly phase: GuardrailPhase;
      readonly reason: string;
      readonly detections?: readonly Detection[];
      readonly quarantineId: string;
    }
  | {
      readonly status: 'escalate';
      readonly phase: GuardrailPhase;
      readonly reason: string;
      readonly riskScore: number;
      readonly detections?: readonly Detection[];
      readonly approvalId?: string;
    }
  | {
      readonly status: 'allow-with-approval';
      readonly phase: GuardrailPhase;
      readonly approvalId: string;
      readonly detections?: readonly Detection[];
    };

// =============================================================================
// Guardrail metadata (used for registration, discovery, compliance)
// =============================================================================

export interface GuardrailMetadata {
  /** One-line description. */
  readonly description: string;
  /** Stable unique identifier (e.g. 'hub://guardrails/prompt_injection@1.0'). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** OWASP ASI categories this guardrail addresses. */
  readonly owaspCategories: readonly OWASPCategory[];
  /** Execution priority — lower values run first (rule-based = 0-99, ML = 100-500). */
  readonly priority: number;
  /** Free-form tags for querying/discovery. */
  readonly tags: readonly string[];
  /** SemVer string. */
  readonly version: string;
}

// =============================================================================
// Guardrail scanner interface (the smallest unit of evaluation)
// =============================================================================

/**
 * A single guardrail scanner. Each scanner evaluates input or output
 * and returns a `GuardrailResult`. Scanners are stateless and should
 * be safe to call multiple times.
 */
export interface GuardrailScanner {
  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult>;
  readonly metadata: GuardrailMetadata;
}

// =============================================================================
// Guardrail pipeline configuration
// =============================================================================

export interface PipelineConfig {
  /** Maximum number of detections to collect before truncating. */
  readonly maxDetections?: number;
  /** When true, an `escalate` result triggers a prompt instead of blocking. */
  readonly promptOnEscalate?: boolean;
  /** Stop evaluating further scanners on the first `block`. */
  readonly shortCircuitOnBlock?: boolean;
}

// =============================================================================
// Guardrail decision receipt — audit record for every guardrail evaluation
// =============================================================================

/**
 * A complete audit record for a single guardrail evaluation.
 *
 * Every guardrail evaluation produces a receipt that captures the policy
 * decision, reason, risk tier, affected surface, and correlation identifiers.
 * Receipts are persisted by the audit logger and can be queried for
 * post-incident review, compliance reporting, and debugging.
 */
export interface GuardrailDecisionReceipt {
  /** Policy identifier, e.g. 'ethics:anti-sycophancy:1.0' */
  readonly policyId: string;
  /** The decision outcome */
  readonly decision: GuardrailResult['status'];
  /** Controlled vocabulary reason code, e.g. 'SYCOPHANCY_DETECTED' */
  readonly reasonCode: string;
  /** Risk tier of the decision */
  readonly riskTier: 'low' | 'moderate' | 'high' | 'prohibited';
  /** Which surface was being evaluated */
  readonly surface: 'input' | 'retrieval' | 'memory' | 'tool' | 'action' | 'output' | 'egress';
  /** Which guardrail phase was active */
  readonly phase: GuardrailPhase;
  /** ISO 8601 timestamp of the evaluation */
  readonly timestamp: string;
  /** Correlation ID combining session + turn + scanner-run */
  readonly correlationId: string;
  /** Session identifier */
  readonly sessionId: string;
  /** Detections that triggered this decision */
  readonly detections: readonly Detection[];
  /** Sanitized output, if the decision was a transform */
  readonly sanitized?: string;
  /** Fields that were redacted, if applicable */
  readonly redactedFields?: readonly string[];
}
