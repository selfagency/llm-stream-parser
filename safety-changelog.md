# Safety and Ethics Changelog

This file tracks changes to the agentsy framework's safety and ethics posture.
Per GOVERNANCE.md §Policy versioning, changes to ETHICS.md, SAFETY.md,
GOVERNANCE.md, and docs/constitution.md are logged here.

## 2026-06-17 — Phase 4: Guardrails Honest Foundation

**Summary**: Implemented the ethics enforcement layer, decision receipt type,
audit logger, and canonical GuardrailsConfig. This is the first phase that
makes the policy documents machine-enforceable rather than advisory references.

**Changes**:

- Created `EthicsRegistry` with 50+ clauses extracted from all four policy
  documents. Each clause has an `implementedBy` field — most are `null`
  (known gaps to be closed in Phases 9–11).
- Expanded `GuardrailResult` from 4 states to 6: added `quarantine` and
  `allow-with-approval`. Added `transformReason` discriminator to distinguish
  redaction from rewrite from normalization.
- Created `GuardrailDecisionReceipt` type with all 7 required fields
  (policyId, decision, reasonCode, riskTier, surface, timestamp, correlationId).
- Updated `GuardrailPipeline.evaluate()` to return `{ result, receipt }` instead
  of bare `GuardrailResult`.
- Created `JsonlAuditLogger` for local-first receipt persistence.
- Created `ReceiptExporter` for JSON/CSV export.
- Created canonical `GuardrailsConfig` in `packages/guardrails/src/config.ts`.
  Deprecated the duplicate in `packages/shared/src/types/guardrails.ts`.
- Updated runtime guardrail hooks to differentiate `escalate` from `block`
  and handle `quarantine` state.
- Created `safety-changelog.md` (this file).
- Created `.github/pull_request_template.md` with ethics review checklist.
- Updated `packages/guardrails/README.md` to match actual exports with
  Policy Enforcement Status table.
- Audited `packages/guardrails/IMPLEMENTATION-PLAN.md` checkboxes.

**Status**: Phase 4 complete. The BLOCK gate on describing @agentsy/guardrails
as the project's safety enforcement layer is now partially lifted — the
EthicsRegistry and receipt infrastructure exist, but behavioral scanners
(Phases 9–11) are still needed for full enforcement.
