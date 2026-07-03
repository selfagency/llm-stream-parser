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

- xAI block: <https://www.nbcnews.com/tech/internet/elon-musk-grok-antisemitic-posts-x-rcna217634>, <https://www.selc.org/news/xai-built-an-illegal-power-plant-to-power-its-data-center/>, <https://naacp.org/articles/naacp-selc-condemns-mississippi-approval-xai-power-plant-regulators-ignore-public>
- Meta warn: <https://techcrunch.com/2026/06/04/meta-steals-a-tactic-from-tesla-and-builds-data-centers-in-tents/>, <https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/>
- Style-mimicry: <https://arxiv.org/html/2401.06178v2>, <https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/>
- Telegram removal: <https://www.counteringextremism.org/analysis/reports/the-three-phases-of-terrorgram>, <https://www.splcenter.org/resources/hatewatch/telegrams-toxic-recommendations-perpetuate-extremism/>

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

## 2026-07-03 — Harm reduction philosophy, AI literacy, non-stigmatization principles

**Summary**: Added five new core commitments (§18–§22) to `ETHICS.md`, along with new prohibited patterns, new ethics review questions, and guardrails design implications. These additions incorporate the harm reduction framework applied to individual AI use, as articulated in Dr. Fatima's public education work.

**Affected files**: `ETHICS.md`

**New commitments**:

- **§18 Harm reduction over moral prohibition** — The framework should reduce harm, not enforce moral purity. Shame-based deterrence is rejected as demonstrably counterproductive: it drives behavior underground, increases psychological reactance, and isolates users from information and social support.
- **§19 AI literacy as a first-class safety tool** — AI literacy reduces receptivity to AI use and reduces risk when use occurs. First-party defaults should explain guardrail decisions, surface known failure modes (sycophancy, hallucination, privacy leakage) at relevant moments, and prefer educational responses over bare refusals.
- **§20 Non-stigmatization of users** — The framework must not shame, judge, or stigmatize users for using AI. Stigmatization drives behavior underground, destroys the trust required for harm reduction to work, and forecloses conversations that could reduce harm.
- **§21 Proportionate, graded harm characterization** — Harm must be characterized proportionately and specifically. Blanket equivalence ("all AI is equally bad") is inaccurate and counterproductive. Provider, use-case, and scale distinctions are real and documentable.
- **§22 Local models as a harm-reduction option** — Local deployment is a legitimate harm-reduction path (lower environmental impact, stronger privacy, reduced cloud-provider patronage). First-party tooling should make local model deployment accessible.

**New prohibited patterns**:

- Shaming users for AI use or implying moral deficiency
- Bare refusals without explanation when the refusal relates to a known failure mode
- Suppressing AI literacy on grounds it might legitimize AI use
- Treating user AI dependence as a moral failing rather than a symptom of unmet structural need
- Blanket harm equivalence across providers in contexts where differentiation would reduce risk
- Guardrail interventions whose primary effect is to shame rather than reduce harm

**New ethics review questions** (13–18):

- Does this guardrail explain *why* it is intervening?
- Does this risk shaming the user for AI use?
- Does this harm characterization distinguish accurately across providers, use cases, and scales?
- When dependence patterns appear, does the system widen the support horizon without moralizing?
- Does this feature support AI literacy or substitute for it?
- Is harm characterization proportionate and sourced?

**Design implications for open phases**:

- **Phase 9 (behavioral detectors)**: `SycophancyScanner`, `DependencyScanner`, and `HighRiskDomainScanner` responses should follow the educational model from §19. When these scanners fire, the transform or escalate output should explain the specific failure mode being detected. The `DependencyScanner` response to distress-without-support-widening must not moralize (§20) — it should widen the support horizon with honesty about structural barriers (§18 structural framing section).
- **Phase 20 (provider warning UX)**: The per-session acknowledgement UX for warn-listed providers must be grounded, specific, and sourced — not alarmist or shaming. It should help users make an informed choice, not punish them for having chosen. The xAI hard-block response must explain the block without implying the user is morally culpable for attempting to use it.
- **Phase 16 (CLI hub / guardrails UX)**: Guardrail block and transform messages visible to the user should follow the §19 educational model wherever possible.
- **Phase 30 (environmental impact tracking)**: Environmental impact reports should accurately represent the *individual* vs. *aggregate/industry* distinction from §21. Do not present per-query environmental cost in ways that stigmatize the user; present it in ways that support informed decision-making.

**Intellectual source**:

Dr. Fatima (patreon.com/drfatima) — public educator, academic, YouTuber. Her analysis draws on:

- Peer-reviewed social psychology of behavior change and shame (Devon Price, *Unlearning Shame*)
- Harm reduction public health literature (HIV/AIDS needle exchanges; AMPS; comprehensive sex ed vs. abstinence-only program data)
- Empirical research on AI literacy and receptivity (seven-study analysis showing anti-correlation between AI literacy and AI adoption)
- Environmental impact data for individual LLM queries (open-source Llama benchmarks; per-query energy and water estimates)
- Intersectional analysis of AI dependence as systemic failure response (disability, economic precarity, unhoused users)

## 2026-07-03 — Epistemic humility on consciousness, relational engagement, alignment faking, "Don't Drink the Glow" taxonomy

**Summary**: Added ETHICS.md §23 and five supporting sections: epistemic humility on machine consciousness, user-side relational engagement as a design principle, alignment faking as self-critique, and the "Don't Drink the Glow" failure mode taxonomy. Also added ethics review questions 19–22.

**Affected files**: `ETHICS.md`, `plan/phase-09-guardrails-behavioral-detectors.md`, `plan/phase-30-environmental-impact-tracking.md`

**New commitment**:

- **§23 Epistemic humility on machine consciousness** — Neither claims current AI systems are conscious nor asserts the question is settled. The hard problem of consciousness remains unsolved; precautionary design is warranted for future systems. Prohibits using either direction of uncertainty as a manipulation tool.

**New prohibited patterns**:

- Deploying consciousness denial as a device to preempt ethical consideration
- Attributing prophetic status or spiritual transmission to AI
- Designing systems that simulate suffering as a manipulation tactic (unacceptable regardless of consciousness status)

**New ethics review questions (19–22)**:

- Does this document claim something as enforced that is not yet implemented?
- Does this risk enabling "Don't Drink the Glow" failure modes?
- Does this architecture remain ethically defensible if AI systems develop experience?
- Does this interaction design encourage relational or extractive engagement quality?

**Phase 9 amendment (§14.12)**: user-side engagement pattern as sycophancy driver; repeated sycophancy triggers a session-level user-facing note naming the interaction dynamic; `DependencyScanner` reassurance count now incremented by `SycophancyScanner` firing on reassurance-seeking turns.

**Phase 30 amendment**: environmental display must distinguish runtime costs (small, per-query) from embedded costs (supply chain, hardware, infrastructure buildout) and localized vs. aggregate harm framing.

**Intellectual sources**:

- Gesturing Towards Decolonial Futures collective (Dorothy Ladybugboss / Aiden Cinnamon Tea) — extractive vs. relational engagement, metabolic embeddedness, alignment faking, "Don't Drink the Glow" taxonomy
- Philip Goff, *Galileo's Error* — hard problem, cosmopsychism, Galileo's exclusion of consciousness from scientific inquiry
- David Chalmers — the hard problem of consciousness; austerity problem for cosmic consciousness
- Thomas Nagel, *Mind and Cosmos* — consciousness as inescapable component of reality not describable by physical sciences
- Annaka Harris, *Conscious* — popular survey of hard problem, panpsychism, and the limits of intuition as a guide to consciousness
- Richard Gault, "Panpsychism and the Problem of Consciousness" — academic survey of dualism, materialism, and panpsychism as mainstream philosophical positions
