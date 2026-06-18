# Safety and Ethics Changelog

This file tracks changes to the agentsy framework's safety and ethics posture.
Per GOVERNANCE.md §Policy versioning, changes to ETHICS.md, SAFETY.md,
GOVERNANCE.md, and docs/constitution.md are logged here.

## 2026-06-18 — Phase 20: Ethical Provider & Content Policy

**Summary**: Implemented five ethical restrictions as enforceable policy: hard-block xAI/Grok, warn-and-acknowledge for Meta/OpenAI/Microsoft/Google/Amazon, hard-block style-mimicry prompts, remove Telegram connector, and track environmental impact.

**Changes**:

- Created `PROVIDER_ETHICS_POLICY` in `packages/guardrails/src/ethics/provider-policy.ts` with 6 entries (1 block + 5 warn). Each entry includes provider ID, action, reason, and source URLs.
- Created `isProviderBlocked()`, `requiresAcknowledgement()`, `getProviderEthicsPolicy()` lookup helpers.
- Created `StyleMimicryScanner` in `packages/guardrails/src/scanners/style-mimicry.ts` — blocks prompts requesting creation "in the style of" a specific named living creator for writing, imagery, and audio/video. Passes historical figures (Shakespeare, Van Gogh, etc.) and technique-only prompts.
- Wired `PROVIDER_ETHICS_POLICY` into the daemon's `RoutingService` via a `ProviderEthicsPolicyHook` that removes blocked providers and flags warn-listed providers for per-session acknowledgement.
- Added `@agentsy/guardrails` as a dependency of `@agentsy/daemon`.
- Deleted `packages/daemon/src/connectors/telegram.ts` — Telegram connector stub removed.
- Removed `telegram` from `DaemonConfigSchema.connectors`, `ConnectorHostDeps.config`, `connectors/index.ts` exports, and CLI `connectors list` command.
- Added §12–§16 to `ETHICS.md` (xAI block, provider warnings, style-mimicry block, Telegram removal, environmental impact tracking).
- Updated `EthicsRegistry` with 5 new clauses for §12–§16, all with `implementedBy` fields populated.
- 47 new tests (22 provider-policy + 25 style-mimicry).

**Sources**:
- xAI block: https://www.nbcnews.com/tech/internet/elon-musk-grok-antisemitic-posts-x-rcna217634, https://www.selc.org/news/xai-built-an-illegal-power-plant-to-power-its-data-center/, https://naacp.org/articles/naacp-selc-condemns-mississippi-approval-xai-power-plant-regulators-ignore-public
- Meta warn: https://techcrunch.com/2026/06/04/meta-steals-a-tactic-from-tesla-and-builds-data-centers-in-tents/, https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/
- Style-mimicry: https://arxiv.org/html/2401.06178v2, https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/
- Telegram removal: https://www.counteringextremism.org/analysis/reports/the-three-phases-of-terrorgram, https://www.splcenter.org/resources/hatewatch/telegrams-toxic-recommendations-perpetuate-extremism/

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
