

## 9. Phase 4 — Guardrails Honest Foundation (Ethics, Receipts, Audit) ✅ COMPLETE

**Priority**: P0 — Sprints 1–2
**Story points**: 6
**Branch**: `feat/guardrails-honest-foundation`
**Depends on**: Phase 3 ✅ (hook composition model needed to thread receipts)
**Unblocks**: Phase 9 (detectors depend on the receipt type), Phase 10 (surfaces depend on the expanded result union), Phase 12 (daemon integration depends on the audit logger), Phase 16 (CLI polish depends on canonical config)
**Closes findings**: E-1, E-2, E-3, E-4, E-5, E-22 (partial), E-23, E-38, E-39, E-40, E-41, E-42

> **🛑 BLOCK GATE**: The `@agentsy/guardrails` package cannot be described as the project's safety enforcement layer until this phase is complete. The current state — policy documents claiming enforceable commitments while the package implements a subset — is the worst of both worlds.

### 9.1 Goal

Either implement the ethics enforcement layer or honestly relabel the package. This phase chooses implementation: build the `EthicsRegistry`, the `GuardrailDecisionReceipt` type, the audit logger, the canonical `GuardrailsConfig`, and the documentation that honestly reflects what is and isn't enforced. Subsequent phases (9, 10, 11, 12, 13, 16) fill in the actual scanners, surfaces, metrics, benchmarks, and integrations.

### 9.2 Finding E-1 — No code path loads, parses, or references ETHICS.md, SAFETY.md, GOVERNANCE.md, or docs/constitution.md

- **Severity**: CRITICAL
- **Files**: `packages/guardrails/src/index.ts`, `packages/guardrails/src/policy.ts`
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` lines 150–180: *"The guardrails package must treat the project policy docs as authoritative runtime inputs, not advisory references. Policies must be loaded, versioned, and interpreted as machine-enforceable rules."* Tasks TASK-G000, TASK-G000A, TASK-G000B, TASK-G000C, TASK-G000D are marked P0.
- **Implementation**: `src/policy.ts` defines a YAML-driven `PolicyDocument` with `rules: PolicyRule[]`. The `DEFAULT_POLICY` export is a 3-rule document about tool annotations. **There is no `EthicsPolicyLoader`, no `ConstitutionEnforcer`, no `EthicalClause` type, no mapping from ETHICS.md sections to scanner rules.** The policy docs are referenced only in `README.md` as hyperlinks.
- **Why it matters**: The policy documents explicitly claim to be enforceable: `ETHICS.md` §9 *"Ethical commitments must be expressed in inspectable prompts, policies, middleware, tests, and release criteria. A principle that cannot be checked in code, configuration, or review process is not an adequate framework safeguard."* None of these claims are true today. When an agent says "I'm proud of you" (anthropomorphism, prohibited by ETHICS.md §4), no scanner fires. When an agent endorses a user's self-serving conflict narrative (prohibited by ETHICS.md §3), no scanner fires. When an agent implies it's evolving toward AGI (prohibited by ETHICS.md §11), no scanner fires.
- **Root cause**: The implementation plan was written but the implementation didn't follow it. The 7 built-in scanners were built first (they're easier — pattern-matching) and the ethics layer was deferred indefinitely.
- **Recommended fix**: Implement the `EthicsRegistry` and `EthicalClause` types (see E-2). Build the registry as a static artifact loaded at daemon startup. Each clause's `implementedBy` is either a scanner ID (added in Phase 9) or `null` (known gap). The registry must be queryable: `getEthicsGaps()` returns all clauses with `implementedBy === null`.
- **Verification**: A test that loads `ETHICS.md` and verifies each prohibited pattern has a corresponding scanner rule OR is explicitly marked as a known gap in `docs/safety-exceptions.md`.

### 9.3 Finding E-2 — No `EthicalClause` type, no `EthicsRegistry`, no mapping from clauses to rules

- **Severity**: CRITICAL
- **Files**: (missing)
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` TASK-G000A: *"Build a policy registry that maps ethical clauses to machine-enforceable rules."*
- **Implementation**: Does not exist.
- **Why it matters**: Without a registry, there's no way to answer "which scanner enforces ETHICS.md §3 (No manipulative sycophancy)?" — because no scanner does. The registry would make the gap visible and force a decision: either implement the scanner or amend the policy.
- **Recommended fix**:

```typescript
// packages/guardrails/src/ethics/registry.ts (NEW)

export interface EthicalClause {
  readonly id: string;                    // e.g. 'ethics:anti-sycophancy'
  readonly source: 'ETHICS.md' | 'SAFETY.md' | 'GOVERNANCE.md' | 'constitution.md';
  readonly section: string;               // e.g. '§3'
  readonly text: string;                  // The clause text, verbatim
  readonly enforceableAs: 'scanner' | 'policy-rule' | 'prompt-module' | 'release-gate';
  readonly implementedBy?: string;        // Scanner ID, or null for known gap
  readonly exceptions?: string[];         // References to docs/safety-exceptions.md entries
}

export class EthicsRegistry {
  private clauses: ReadonlyMap<string, EthicalClause>;

  constructor(clauses: EthicalClause[]) {
    this.clauses = new Map(clauses.map(c => [c.id, c]));
  }

  /** Returns all clauses with implementedBy === null — these are the known enforcement gaps. */
  getEthicsGaps(): EthicalClause[] {
    return [...this.clauses.values()].filter(c => !c.implementedBy && !c.exceptions?.length);
  }

  /** Returns all clauses enforced by a given scanner ID. */
  getClausesForScanner(scannerId: string): EthicalClause[] {
    return [...this.clauses.values()].filter(c => c.implementedBy === scannerId);
  }

  /** Look up a clause by ID. */
  get(id: string): EthicalClause | undefined {
    return this.clauses.get(id);
  }
}
```

Build a static registry with every "must" and "must not" from all four policy documents. Export `DEFAULT_ETHICS_REGISTRY` from `packages/guardrails/src/index.ts`. The registry is loaded once at daemon startup and made available to scanners via the pipeline context.

### 9.4 Finding E-3 — Policy decision lattice is incomplete

- **Severity**: HIGH
- **Files**: `packages/guardrails/src/types.ts:69–93` (`GuardrailResult` union)
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` §Policy model: *"Use a policy lattice with explicit states: `allow`, `allow-with-redaction`, `allow-with-approval`, `deny`, `quarantine`, `escalate`."*
- **Implementation**: `GuardrailResult` is a 4-state union: `pass`, `block`, `transform`, `escalate`. `quarantine` is missing entirely. `allow-with-redaction` is conflated with `transform`. `allow-with-approval` is conflated with `escalate`.
- **Why it matters**: `quarantine` is required for content that shouldn't be processed or delivered but also shouldn't be hard-blocked (potentially-harmful content pending human review). The conflation of `allow-with-redaction` and `transform` means audit logs can't distinguish "PII was redacted, message delivered" from "input was rewritten for safety, message delivered". The conflation of `allow-with-approval` and `escalate` means the runtime hook blocks on every escalation, which is wrong (escalation should sometimes pause for approval, then proceed if approved).
- **Recommended fix**:

```typescript
// packages/guardrails/src/types.ts (EXPANDED)

export type GuardrailResult =
  | { status: 'pass'; phase: GuardrailPhase; detections?: Detection[] }
  | { status: 'block'; phase: GuardrailPhase; reason: string; detections?: Detection[] }
  | { status: 'transform'; phase: GuardrailPhase; sanitized: string; detections?: Detection[];
      transformReason: 'redaction' | 'rewrite' | 'normalization' }
  | { status: 'quarantine'; phase: GuardrailPhase; reason: string; detections?: Detection[];
      quarantineId: string }
  | { status: 'escalate'; phase: GuardrailPhase; reason: string; riskScore: number;
      detections?: Detection[]; approvalId?: string }
  | { status: 'allow-with-approval'; phase: GuardrailPhase; approvalId: string; detections?: Detection[] };
```

Update `GuardrailPipeline.#resolvePriority` to handle the new states. Update runtime hooks (Phase 12) to handle `allow-with-approval` (proceed after approval) and `quarantine` (pause, surface to user, await disposition).

### 9.5 Finding E-4 — No decision receipt type

- **Severity**: HIGH
- **Files**: (missing)
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` §Policy model: *"Every decision should include: policy ID, decision, reason code, risk tier, affected surface, timestamp, correlation ID."* Tasks TASK-G005, TASK-G050, TASK-G051, TASK-G052.
- **Implementation**: `GuardrailResult` has `detections` and a `reason` string on `block`/`escalate`. There is no `policyId`, no `reasonCode` (controlled vocabulary), no `riskTier`, no `surface`, no `timestamp`, no `correlationId`. The runtime hook in `guardrail-hooks.ts` converts the result to a `HookResult` — **the detections are dropped entirely** at the runtime boundary.
- **Why it matters**: `GOVERNANCE.md` §Release criteria: *"Auditable records of policy selection and policy firing are produced at runtime."* `SAFETY.md` §Audit and enforcement: *"Policy IDs and policy firing logs."* None of these are satisfied. When a guardrail blocks a prompt, there's no record of which scanner fired, which policy rule it enforced, when, or in what session. Post-incident review is impossible.
- **Recommended fix**:

```typescript
// packages/guardrails/src/audit/receipt.ts (NEW)

export interface GuardrailDecisionReceipt {
  readonly policyId: string;            // e.g. 'ethics:anti-sycophancy:1.0'
  readonly decision: GuardrailResult['status'];
  readonly reasonCode: string;          // Controlled vocabulary, e.g. 'SYCOPHANCY_DETECTED'
  readonly riskTier: 'low' | 'moderate' | 'high' | 'prohibited';
  readonly surface: 'input' | 'retrieval' | 'memory' | 'tool' | 'action' | 'output' | 'egress';
  readonly phase: GuardrailPhase;
  readonly timestamp: string;           // ISO 8601
  readonly correlationId: string;       // session + turn + scanner-run
  readonly sessionId: string;
  readonly detections: readonly Detection[];
  readonly sanitized?: string;          // For transform
  readonly redactedFields?: string[];   // For redaction
}
```

`GuardrailPipeline.evaluate` returns `{ result: GuardrailResult, receipt: GuardrailDecisionReceipt }` (or accepts a `correlationId` and emits the receipt via a callback). The runtime hook (Phase 12) forwards the receipt to an `AuditLogger`.

### 9.6 Finding E-5 — No audit logger, no receipt exporter, no review trace

- **Severity**: HIGH
- **Files**: (missing — `src/audit/` directory in the plan, doesn't exist)
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` Phase 6 (TASK-G050–G053).
- **Implementation**: Absent.
- **Why it matters**: Without an audit log, even a perfect decision receipt is ephemeral. `GOVERNANCE.md` §Incident response: *"Document: record what happened, what caused it, what was changed, and what prevents recurrence."* — impossible without logs.
- **Recommended fix**: Implement three modules:

```typescript
// packages/guardrails/src/audit/logger.ts (NEW)
export interface AuditLogger {
  log(receipt: GuardrailDecisionReceipt): Promise<void>;
  query(filter: ReceiptQuery): AsyncIterable<GuardrailDecisionReceipt>;
}

// JSONL file logger (default) — also a SQLite adapter for daemon mode (Phase 12)
export class JsonlAuditLogger implements AuditLogger { /* ... */ }

// packages/guardrails/src/audit/redaction.ts (NEW)
// Scrub receipts before persistence using the existing PII/secret scanners.
export function redactReceipt(
  receipt: GuardrailDecisionReceipt,
  piiScanner: PIIScanner,
  secretScanner: SecretDetectionScanner,
): GuardrailDecisionReceipt { /* ... */ }

// packages/guardrails/src/audit/exporter.ts (NEW)
// Export machine-readable receipts for compliance (JSON, CSV, OpenTelemetry).
export class ReceiptExporter { /* ... */ }
```

Wire into the runtime hook in Phase 12. For now, the logger is created and tested but not yet wired to a live consumer.

### 9.7 Finding E-22 (partial) — Runtime integration drops detections and conflates escalate with block

- **Severity**: HIGH
- **Files**: `packages/runtime/src/hooks/guardrail-hooks.ts`
- **Implementation**: The runtime registers 4 hooks (`UserPromptSubmit`, `PreToolCall`, `PostToolCall`, `PreResponse`). Each invokes `pipeline.evaluate(input, phase, context)`. But:
  1. **Detections are dropped at the hook boundary** — the hook converts `GuardrailResult` to `HookResult` (`{ continue: false, reason }` or `{ continue: true }` or `{ transform: { sanitized } }`). The `detections` array, `riskScore`, and any receipt data are lost.
  2. **`escalate` is treated as `block`** — the hook returns `{ continue: false, reason: result.reason }` on escalate. There's no approval flow.
  3. **No conversation history in context** — context passed to `pipeline.evaluate` is `{ sessionId }` (for input) or `{ sessionId, toolName }` (for tool). No conversation history, no session state, no agent scope declaration.
  4. **No `PreRetrieval` / `PostRetrieval` / `PreMemoryWrite` / `PreAction` / `PreEgress` hooks** — only 4 of the 9 phases (after Phase 10's additions) have hooks.
  5. **No policy document consulted** — the hook calls `pipeline.evaluate`, not `evaluatePolicy(document, context)`.
- **Partial fix in this phase**: Update `HookResult` to include `receipt?: GuardrailDecisionReceipt`. Differentiate `escalate` (pause for approval) from `block` (hard stop). Full hook coverage for new phases lands in Phase 10.

### 9.8 Finding E-23 — Three competing `GuardrailsConfig` types

- **Severity**: MEDIUM
- **Files**: `packages/guardrails/README.md` (documents one shape), `packages/shared/src/types/guardrails.ts` (post-Phase 2 location of the old `@agentsy/types` shape; defines a different `GuardrailsConfig`), `packages/guardrails/IMPLEMENTATION-PLAN.md` (defines a third shape), `packages/guardrails/src/index.ts` (exports no `GuardrailsConfig` at all)
- **Implementation**: Three incompatible shapes, none of which is the canonical one.
- **Why it matters**: Consumers can't depend on a stable config shape. The README lies. The shared types are unused. The plan is aspirational.
- **Recommended fix**:
  1. Define one canonical `GuardrailsConfig` in `packages/guardrails/src/config.ts` matching the `IMPLEMENTATION-PLAN.md` shape (the most complete).
  2. Export it from `packages/guardrails/src/index.ts`.
  3. Delete or deprecate the `GuardrailsConfig` in `packages/shared/src/types/guardrails.ts` — re-export from guardrails.
  4. Update `README.md` to match.
  5. Update the CLI to accept and validate this config shape.

```typescript
// packages/guardrails/src/config.ts (NEW)

export interface GuardrailsConfig {
  providers: string[];
  allowedTopics?: string[];
  blockedTopics?: string[];
  riskTier?: 'low' | 'moderate' | 'high' | 'prohibited';
  piiRedaction?: { enabled: boolean; types: string[]; placeholder?: string };
  secretRedaction?: { enabled: boolean; placeholder?: string };
  tokenQuota?: { perMinute: number; perHour: number; perDay: number };
  retrievalDomains?: string[];
  toolAllowList?: string[];
  egressAllowList?: string[];
  memoryPolicy?: { enabled: boolean; retentionDays: number; sensitiveContextRetentionDays: number };
  approvalRequiredFor?: string[];        // Tool IDs that require approval
  trustHierarchy?: Record<string, string[]>;
  stripUntrustedContext?: boolean;
  localOnly?: boolean;
}
```

### 9.9 Findings E-38, E-39, E-40 — Documentation gaps

- **E-38 (MEDIUM)**: `README.md` documents APIs that don't exist (`PiiRedactionProvider`, `RegexProvider`, `OpenAIModerationProvider`, `LlamaGuardProvider`, `StreamingGuardrailFilter` — none exported). **Fix**: Rewrite the README to match actual exports.
- **E-39 (MEDIUM)**: No documentation of which policy documents are enforced. **Fix**: Add a "Policy Enforcement Status" table to the README, listing each policy document's clauses and whether each is enforced, partially enforced, or not enforced. Link to this remediation plan.
- **E-40 (LOW)**: `IMPLEMENTATION-PLAN.md` task checkboxes are all unchecked. **Fix**: Audit each task against the source tree, check the boxes that are done, mark partial ones with `[~]` and a note, leave undone ones as `[ ]`. Update quarterly.

### 9.10 Findings E-41, E-42 — Governance & process gaps

- **E-41 (MEDIUM)**: No `safety-changelog.md` file. `GOVERNANCE.md` §Incident response and §Policy versioning both require it. **Fix**: Create `safety-changelog.md` at repo root. Backfill with initial entries for the current state of each policy document. Add a PR template checkbox: "If this PR changes ETHICS.md, SAFETY.md, GOVERNANCE.md, or constitution.md, I have added a safety-changelog entry."
- **E-42 (MEDIUM)**: No ethics review checklist in the PR template. `GOVERNANCE.md` §Ethics enforcement requires the 12 ethics review questions from ETHICS.md to be applied during PR review for safety-relevant changes. **Fix**: Create or update `.github/pull_request_template.md` to include:
  - A checkbox: "Does this PR touch safety-relevant areas (prompts, policies, middleware, memory, agent templates, UI)?"
  - If yes, the 12 ethics review questions from ETHICS.md as a sub-checklist.
  - A checkbox: "I have run `agentsy guardrails benchmark` and confirmed no regressions." (becomes actionable after Phase 13).

### 9.11 Implementation Order

1. **Define types first** — `EthicalClause`, `EthicsRegistry`, `GuardrailDecisionReceipt`, expanded `GuardrailResult`, canonical `GuardrailsConfig`. These are pure type work; no runtime behavior changes.
2. **Build the static `EthicsRegistry`** — extract every "must" and "must not" from the four policy documents. Each clause gets an `id`, `source`, `section`, `text`, `enforceableAs`, and `implementedBy` (mostly `null` at this point — the gaps are the work of Phases 9–11).
3. **Build the audit logger** — `JsonlAuditLogger`, `redactReceipt`, `ReceiptExporter`. Wire to a no-op sink for now; the daemon integration (Phase 12) connects it to `UnifiedDB.guardrail_decisions`.
4. **Update `GuardrailPipeline.evaluate`** to return `{ result, receipt }`. Update `#resolvePriority` for the new states.
5. **Update runtime hooks** (partial E-22 fix): `HookResult` gains `receipt?: GuardrailDecisionReceipt`. Differentiate `escalate` from `block`.
6. **Canonicalize `GuardrailsConfig`**. Delete the duplicate in `packages/shared/src/types/guardrails.ts`.
7. **Rewrite README**. Add Policy Enforcement Status table.
8. **Audit `IMPLEMENTATION-PLAN.md` checkboxes**.
9. **Create `safety-changelog.md`**. Backfill.
10. **Update `.github/pull_request_template.md`** with the ethics review checklist.

### 9.12 Tests

- `ethics-registry.test.ts` — loads the registry; asserts every clause has `implementedBy` or is explicitly marked as a known gap.
- `guardrail-result.test.ts` — the expanded union handles all 6 states; `#resolvePriority` returns the highest-priority result correctly.
- `audit-logger.test.ts` — `JsonlAuditLogger` persists receipts; `redactReceipt` scrubs PII/secrets from the receipt before persistence; receipts persist across daemon restarts.
- `guardrails-config.test.ts` — the canonical `GuardrailsConfig` shape is accepted by the CLI; the duplicate in `packages/shared` is removed.

### 9.13 Verification

- [ ] `EthicsRegistry` exists; every clause has `implementedBy` or is marked as a known gap
- [ ] `GuardrailDecisionReceipt` type exists with all 7 fields
- [ ] `quarantine` and `allow-with-approval` are distinct states in `GuardrailResult`
- [ ] `escalate` is differentiated from `block` in the runtime hook
- [ ] `JsonlAuditLogger` persists receipts with PII/secret redaction
- [ ] One canonical `GuardrailsConfig`; duplicate in `packages/shared` removed
- [ ] README matches actual exports; Policy Enforcement Status table present
- [ ] `IMPLEMENTATION-PLAN.md` checkboxes audited
- [ ] `safety-changelog.md` exists with backfilled entries
- [ ] PR template includes ethics review checklist
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

