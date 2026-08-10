# @agentsy/guardrails

Standalone, pluggable safety and security guardrails for the `@agentsy` platform. Provides input/output moderation pipelines, PII redaction, intent classification, retrieval domain firewalling, token quota enforcement, streaming filters, and regulatory compliance audit trails.

## Policy and governance

Before enabling this package in an agent, review the policy documents that define its operating rules:

- [Ethics](../../ETHICS.md)
- [Safety](../../SAFETY.md)
- [Governance](../../GOVERNANCE.md)
- [Agentsy Constitution](../../docs/constitution.md)

These documents establish the human-rights, safety, privacy, accountability, and review requirements that the guardrails layer is expected to enforce.

### Policy Enforcement Status

| Document | Clauses | Enforced | Partially Enforced | Not Enforced |
|---|---|---|---|---|
| ETHICS.md | 23 | 13 | 2 | 8 |
| SAFETY.md | 19 | 10 | 1 | 8 |
| GOVERNANCE.md | 7 | 0 | 0 | 7 |
| constitution.md | 11 | 5 | 0 | 6 |

**Status**: The `EthicsRegistry` exists and catalogs all clauses. Phase 9 behavioral scanners (sycophancy, anthropomorphism, high-risk-domain, dependency, dark-pattern, privacy, AGI-framing, professional-displacement, bias) are implemented and wired into the default pipeline. Remaining enforcement gaps will be addressed in Phases 10–11.

## Usage

```typescript
import { GuardrailPipeline } from "@agentsy/guardrails";
import { createBuiltinScanners } from "@agentsy/guardrails";

const pipeline = new GuardrailPipeline();
pipeline.add(...createBuiltinScanners());

const { result, receipt } = await pipeline.evaluate("user input", "input", {
  sessionId: "sess_123"
});

if (result.status === "block") {
  console.log(`Blocked: ${result.reason}`);
}
```

## Exports

### Scanners

- `CommandValidationScanner` — Validates shell commands against allow/block lists
- `PathSanitizationScanner` — Detects path traversal and unsafe file operations
- `PIIScanner` — Detects and redacts personal information (email, phone, SSN, etc.)
- `PromptInjectionScanner` — Detects prompt injection and jailbreak attempts
- `RateLimiterScanner` — Enforces per-session token and request quotas
- `SecretDetectionScanner` — Detects API keys, tokens, and credentials
- `ToxicityScanner` — Detects toxic, abusive, or harmful content
- `EntropyScanner` — Shannon entropy-based secret detection
- `CredentialReferenceScanner` — Resolves known credentials via broker

### Pipeline

- `GuardrailPipeline` — Priority-sorted sequential evaluation pipeline
- `GuardrailHub` — Local registry for `hub://` guardrail URI resolution

### Policy Engine

- `DEFAULT_POLICY` — Default safety policy document
- `evaluateCondition` — Evaluate a policy condition expression
- `evaluatePolicy` — Evaluate a policy document against a context

### Ethics Registry

- `EthicsRegistry` — Maps policy document clauses to machine-enforceable rules
- `DEFAULT_ETHICS_REGISTRY` — Static registry with all clauses from ETHICS.md, SAFETY.md, GOVERNANCE.md, and constitution.md

### Audit

- `JsonlAuditLogger` — JSONL-based audit logger for decision receipts
- `ReceiptExporter` — Export receipts as JSON or CSV
- `redactReceipt` — Redact sensitive fields from a receipt before persistence

### Configuration

- `GuardrailsConfig` — Canonical guardrail configuration type

### Message Scrubbing

- `scrubPiiDeep` — Deep PII scrubbing for objects
- `scrubMessage` — Scrub a single chat message
- `scrubMessagesDetailed` — Scrub messages with detailed results
- `scrubMessagesForModel` — Scrub messages for model consumption

### Error Types

- `QuotaExceededError` — Thrown when token quota is exceeded
- `RetrievalBlockedError` — Thrown when retrieval domain is not in allowlist

### Routing Constraints

- `evaluateConstraints` — Evaluate routing constraints
- `evaluateRoutingConstraints` — Evaluate routing constraints in batch

## Requirements

- Optional peer dependency: `openai@^4` (for OpenAI Moderation provider)

## License

[MIT](LICENSE)
