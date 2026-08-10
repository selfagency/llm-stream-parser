# Addendum — 2026-07 Industry-Signal Remediation & Expansion Plan

**Version**: 1.0
**Date**: 2026-07-21
**Status**: PROPOSED — extends `plan/00-overview.md` v1.2 and the active phase ladder
**Source signals**: 9 external essays (Jul 2026) synthesized into codebase changes and phase expansions.

> **Scope**: This addendum does not renumber or remove existing phases. It (a) amends
> in-flight/incomplete phases with new tasks, (b) adds new sub-phases where an existing
> phase is the natural owner, and (c) defines four net-new phases (37–40). Every item maps
> to an existing package boundary (see `plan/appendix-c-package-consolidation-map.md`) and
> respects the 12 architectural decisions (AD-1…AD-12) in `plan/00-overview.md §4`.

---

## 0. Source signals → thesis

| # | Source | Load-bearing claim | Primary consequence for Agentsy |
|---|---|---|---|
| S1 | Pai — *one document, two hands* | The harness IS the app; agent sits beside the user; document (not transcript) is source of truth; serverless sleep/wake per document | Generalize harness beyond code/CLI; document-scoped + hibernating agent identity |
| S2 | Thompson — *Who's Afraid of Chinese Models* | A token is not a commodity; **intelligence** is. Cost-per-task ≠ cost-per-token. Harness stickiness is the moat. Provider diversity = resilience | Account by task, not token; provider portability; guardrails must not lock users out |
| S3 | Yahya — *Domain-specific harnesses* | Specialization moved from weights → environment (memory/compaction/tools). Retry-loop + good errors beats fine-tuning | Pluggable per-domain compaction/memory/tools; per-model quirks layer |
| S4 | Cursor — *Agent swarms & model economics* | Frontier-planner + cheap-worker = equal quality at ~8× lower cost. Context efficiency > parallelism. Swarm coordination failure modes | First-class planner/worker routing; role-scoped context; coordination primitives; Field Guide |
| S5 | Willison — *Kimi K3 / pelican* | Reasoning-token overhead dominates; hidden system prompts; per-model effort levels; benchmarks ≠ agentic reliability | Reasoning-token accounting; effort routing; agentic-reliability evals |
| S6 | Miessler — *Intent Engineering* | Describe WHAT not HOW; outcome-first | Spec/intent as first-class artifact; prune procedural scaffolding |
| S7 | Miessler — *Bitter Lesson Engineering* | HOW-scaffolding ages into a liability ("BLE-hobbled") | Audit + tag prompts/skills WHAT vs HOW; meta-upgradeable scaffolding |
| S8 | Noema — *Rewild the Internet* | Monoculture = fragility; interoperability/portability/"no permanent favorites" | Anti-monoculture constitution article; independent-package guarantee; no captive formats |
| S9 | Marcotte — *All Tomorrow's Parties* | Rising token costs; internal spend caps; bubble/financial fragility; augmentation-not-replacement | Budget enforcement is table-stakes; local-model hedge; human-in-loop stance |

**Unifying thesis**: bet on the harness; keep it open/portable; make it cheap by routing
*intelligence* (not tokens); describe *intent* not steps; never lock the user out of their
own data.

> **Note on `.agents/`**: the skill files under `.agents/` are build-time aids for the agent
> developing Agentsy and are **not** shipped product. No task in this addendum modifies `.agents/`.
> The Bitter-Lesson audit (Phase 38) targets **shipped** prompts/skills only:
> `@agentsy/prompts`, `@agentsy/plugins` skill bundles, and `packages/agents/src/skills/`.

> **Note on archived plans (`plan/archived/`)**: several signals in this addendum align with work
> that was **already fully designed and then archived** — do NOT re-invent these; **revive and
> amend** them instead. See §0.5 for the reconciliation map. Key revivals:
>
> - **Phase 15 Council Mode** (`archived/24-PHASE-15-COUNCIL-MODE.md`) — 3-stage council already
>   specced. §1.8 (decorrelated lenses) is an *amendment* to it, not a new design.
> - **Phase 16 Small Model Parity** (`archived/25-PHASE-16-SMALL-MODEL-PARITY.md`) — inference
>   profiles, decomposition, format contracts, repair loops, scorecard already specced. Directly
>   serves S3/S4/S5.
> - **Phase 17 Micro-Tier Local Offload** (`archived/26-PHASE-17-APFEL-ONDEVICE-OFFLOAD.md` +
>   `archived/MICRO-TIER-ARCHITECTURE.md`) — full multi-platform NPU/accelerator offload with
>   Apfel/Ollama/LM-Studio/LocalAI/vLLM discovery, tier routing, escalation, savings accounting.
>   This is ~90% of proposed **Phase 39**. Phase 39 becomes a *thin amendment* to it.
> - **Model-replica routing** (`archived/GREENFIELD.md` → active `routing-architecture.md`) — the
>   `micro|small|mid|frontier` tier spine already exists. §1.1/§1.2/Phase 37 build on it.

---

## 0.5 Reconciliation with archived plans (revive, don't reinvent)

The archive contains a large body of already-designed work. Before implementing anything new,
map each signal to what already exists. **Reactivation** = move from `plan/archived/` back into
active scope with the amendments noted; **new** = genuinely net-new.

| Signal | Already designed (archived) | Action |
|---|---|---|
| S4 decorrelated review lenses | Phase 15 Council Mode (3-stage: opinions → anonymized cross-review → chairman) | **Reactivate + amend**: add model/persona/input-scope decorrelation + cheap-reviewer tiers (§1.8). Council already has stages, presets, events, CLI, tests specced. |
| S3/S4/S5 small-model capability | Phase 16 Small Model Parity (inference profiles, complexity estimator, micro-task decomposition, two-stage decomposition, format contracts, repair loops, fact injection, memory distillation, scorecard, minimal-tool philosophy, on-demand tool loading) | **Reactivate as-is**; it directly implements "specialization in the environment" (S3), "retry-loop beats fine-tuning" (S3), and cheap-worker capability (S4). Add reasoning-token awareness (§1.1) to its inference profiles. |
| S2/S9 local hedge + lockout escape | Phase 17 Micro-Tier Local Offload (platform detection; Apfel/Ollama/LM-Studio/LocalAI/vLLM discovery; tier routing; escalation-on-failure; 9 offload targets; savings accounting; scorecard) | **Reactivate**; it is ~90% of Phase 39. Phase 39 shrinks to *only* the net-new parts: the guardrail **non-lockout escape route** (TASK-GR-202 hand-off) and `agentsy doctor local`. |
| S2/S5 tier spine + explainable routing | Model-Replica Routing (GREENFIELD → `routing-architecture.md`, live) | **Extend** with cost-per-task + reasoning-multiplier (§1.1) and provider-diversity floor (§1.1 TASK-GW-105). |
| S4 planner/worker economics | ORCH Phase 5 tier delegation (`decomposeForTiers`, `CallCapTracker`, tier escalation) + archived micro-tier router | **Extend** into explicit RoleModelPolicy + role-scoped context (Phase 37). The decomposition/cap primitives already exist. |

**Net effect on scoping**: Phase 39's story points drop (most work is reactivation of Phase 17
archived). Phase 40, Phase 37, and Phase 38 remain largely net-new. Add **Phase 16 and Phase 15
reactivation** as explicit line items in the timeline (§3).

### 0.6 Further reconciliation (governance, memory API, attribution, CortexKit)

A deeper pass through `plan/archived/` surfaces four more load-bearing documents that must
override parts of §§1–2 below:

| Archived doc | What it already specifies | Effect on this addendum |
|---|---|---|
| `ORCHESTRATION-RESEARCH-SYNTHESIS.md` | Fully-designed `GovernancePolicy` (RBAC, `BudgetProfile`, `ApprovalRule`, `EscalationRule`, `AuditConfig`), `ITaskBoard` (idempotency, CRUD), `WorkflowPlan`/`WorkflowExecution` plan-execute boundary, `ContextFrame`/lock protocol, `RecoveryPolicy` (retry/fallback/escalate), hook conflict/DAG resolution, `AgentSpan` multi-agent tracing. Consolidated as `TASK-ORCH-024`…`TASK-ORCH-034`. | **Phase 37 budget enforcement (§37.2) must extend `GovernancePolicy.budgetProfiles` / `TASK-ORCH-026`, not invent a parallel `BudgetPolicy`.** §1.7 swarm coordination must extend `ContextFrame` locking (`TASK-ORCH-030/031`) and `RecoveryPolicy` (`TASK-ORCH-032`) rather than define new merge/reconciler primitives from scratch. §1.10 evals should consume `AgentSpan` (`TASK-ORCH-034`) as the tracing substrate. |
| `23-PHASE-14-EXTERNAL-ADOPTIONS.md` (revised) | cognee-pattern unified `remember()`/`recall()`/`forget()`/`improve()` memory surface; **rule-based `RecallRouter`** that routes queries to a search strategy with **zero LLM cost**; discriminated-union `MemoryEntry` types; awaitable `RememberResult`; recall `scope` + `_source` provenance. | **Phase 40's memory-ontology work (§40.2) should build on this unified surface**, and the `RecallRouter` is a direct, already-designed answer to S5's cost-efficiency concern (routing recall without burning a model call). Add TASK-40-010 (below) to reactivate it as the substrate for domain ontologies. |
| `30-PHASE-21-ATTRIBUTION-INTEGRITY.md` | `agentsy tokenomics report --ethical` / `--attribution` transparency dashboard; session↔commit linking; git-ai notes reader; agent lifecycle hooks. | **Phase 37's `report --by-role` (TASK-37-004) is an extension of this existing dashboard**, not a new reporting surface. Reference `TransparencyReport` type. |
| `35-CORTEXKIT-INTEGRATION.md` (status: Draft, never activated) | Proposed replacing `@agentsy/context` and `@agentsy/session`'s native stores with hard dependencies on external CortexKit `magic-context`/`aft-bridge` binaries. | **Do NOT revive.** The active packages (`@agentsy/context` Phase 3 compaction-strategy registry, Phase 8 offloading; `@agentsy/session` native store) show this was superseded — context/session remain agentsy-native. This also matches the hand-rolled/lightweight-over-heavy-dependency posture. Nothing in this addendum should route through CortexKit; all `CompactionPolicy` (Phase 40) and Field Guide (§1.4) work targets the native `@agentsy/context`/`@agentsy/memory`. |

**Amendment to Phase 40 (§40.2)** — add:

| Task | Description |
|---|---|
| TASK-40-010 | Reactivate the cognee-pattern `RecallRouter` (rule-based, zero-LLM-cost query routing) from archived Phase 14 as the dispatch layer beneath the new configurable domain ontology (TASK-40-004). Domain ontologies register additional routing patterns; the router itself stays LLM-free. |

**Amendment to Phase 37 (§37.2)** — `TASK-37-005`/`006` are reframed as: extend
`GovernancePolicy.budgetProfiles` (`TASK-ORCH-026`) with rolling-window USD/token caps sourced
from tokenomics headroom (`quotas/headroom.ts`), rather than introducing a separate `BudgetPolicy`
type. `TASK-37-004` (`report --by-role`) extends the existing `TransparencyReport` builder
(archived Phase 21, `roi/transparency-report.ts`) with a per-role spend breakdown section.

**Amendment to §1.7 (swarm coordination)** — `TASK-ORCH-201`–`205` should be implemented as
extensions of the already-designed `ContextFrame`/lock protocol (`TASK-ORCH-030/031`) and
`RecoveryPolicy` (`TASK-ORCH-032`), and the reconciler/merge node is a new `RecoveryPolicy`
fallback action, not a bespoke workflow node type.

---

## 0.6 Reactivations from archive (Phases 15, 16, 17)

Three archived phases are **reactivated as-is** with only the noted amendments. This is not
a net-new 38 SP; it's moving mature designs from archive into active scope.

### Phase 15 (Reactivation) — Council Mode (3-stage multi-model review)

**Archived source**: `plan/archived/24-PHASE-15-COUNCIL-MODE.md`
**Reactivation scope**: Move into active Sprints 6–8 (after Phase 14 ACP)
**Amendment**: §1.8 (add decorrelated-lens configurability + cheap-reviewer tiers)
**Status**: ~95% designed + specced; amendment is ~3 SP; total reactivation effort ~3 SP (final implementation only)

**Preserved from archive**:

- 3-stage: first opinions (parallel) → anonymized cross-review + ranking → chairman synthesis
- 5 pre-configured presets: coding, research, review, architecture, general
- Streaming `CouncilEvent` types
- CLI `/council` integration
- VS Code toggle + tabbed UI
- Full test suite (stages, presets, anonymization, aggregation)

**Amendment**: Extend stage 2 so reviewers differ by (a) model, (b) persona/prompt, (c) input scope
(full transcript vs output-only vs codebase-only). Reviewer model tier independently configurable.

### Phase 16 (Reactivation) — Small Model Parity

**Archived source**: `plan/archived/25-PHASE-16-SMALL-MODEL-PARITY.md`
**Reactivation scope**: Move into active Sprints 3–5 (after Phase 5 gateway)
**Amendment**: Add reasoning-token awareness to inference profiles (§1.1 TASK-GW-102)
**Status**: ~100% designed; ~40 SP; total reactivation effort ~40 SP (direct implementation)

**Preserved from archive**:

- Inference profile system (3b/7b/14b/30b/70b, per-task sampling parameters)
- Chat template validation
- Task complexity estimator
- Micro-task decomposition + two-stage decomposition (Google pattern)
- Format contract system + multi-turn repair loop
- Fact injection blocks + memory distillation
- Small-model scorecard
- Minimal tool philosophy + on-demand tool loading

**Amendment**: Wire `reasoningMultiplier` into inference profile for S5 (Kimi K3 reasoning-token overhead).

### Phase 17 (Reactivation — mostly) — Micro-Tier Local Offload (Apfel/Ollama/NPU)

**Archived source**: `plan/archived/26-PHASE-17-APFEL-ONDEVICE-OFFLOAD.md` +
`plan/archived/MICRO-TIER-ARCHITECTURE.md`
**Reactivation scope**: Move into active Sprints 4–6 (after Phase 5 gateway, Phase 16 small models)
**Deferred portions** (become Phase 39 amendments, not new work):

- Guardrail non-lockout escape route (TASK-GR-202 hand-off to Phase 39)
- `agentsy doctor local` diagnostics (TASK-39-004 explicitly imports this)
**Status**: ~85% designed; ~40 SP for offload core; ~3 SP for amendments → Phase 39 becomes thin wrapper

**Preserved from archive**:

- Platform detection + accelerator probing (macOS NE, Windows NPU, Linux GPU, CPU fallback)
- Apfel, Ollama, LM Studio, LocalAI, vLLM profiles + multi-platform discovery
- Tier routing + escalation-on-failure + repair loop
- 9 offload targets (compression, fact extraction, wiki, guardrails, query rewrite, chunk summarization, session titling, JSON repair, CLI assist)
- Observability: offload metrics + estimated-savings accounting per backend
- aImock fixtures for all backends + multi-backend integration tests
- Offload scorecard

**Amendments** (become Phase 39):

- TASK-GR-202 non-lockout escape: route cloud-blocked prompts to local replica if available
- TASK-39-004 `agentsy doctor local`: surface escape-path availability

---

## 1. Amendments to existing / incomplete phases

Each amendment lists: target phase, new tasks (with IDs), owning package, and acceptance gate.

### 1.1 Phase 5 (Gateway) — outcome-cost-aware routing ✅-package, extend

**Owner**: `@agentsy/gateway` + `@agentsy/tokenomics` (headroom authority)
**Rationale**: S2, S5. Sticker $/token is the wrong routing signal.

| Task | Description |
|---|---|
| TASK-GW-101 | Add `TaskCostEstimate` to `ModelSelectionResult`: `{ estInputTokens, estReasoningTokens, estOutputTokens, estUsd, estUsdModeled }`. `estUsdModeled` includes reasoning-token overhead using a per-model `reasoningMultiplier`. |
| TASK-GW-102 | Extend `ModelEntry`/`ModelReplica` with `reasoningMultiplier` (default 1.0), `hiddenPromptTokens` (default 0), `effortLevels: string[]`, `serverManagedTemperature: boolean` (Kimi `OMIT_TEMPERATURE` sentinel), `perModelTemperature?: number`. |
| TASK-GW-103 | Add `SelectionStrategy` variant `cost-per-task`: rank candidates by `estUsdModeled` for the inferred task tier, not `cost.inputPerMToken`. Wire into `callByTier`. |
| TASK-GW-104 | Emit `selectedBecause` reasons that reference modeled task cost + reasoning overhead so routing stays explainable (AD honors routing-architecture.md). |
| TASK-GW-105 | Provider health tracking already exists; add **provider-diversity policy**: `ModelSelectionConstraints.diversityFloor` ensures no single provider serves >N% of a session's calls unless pinned (S2/S8 resilience). |

**Gate**: `callByTier` picks the lower `estUsdModeled` model when two candidates are quality-equivalent for a tier; reasoning-heavy models (e.g. single-effort "max") are correctly de-preferred for micro/small tiers; tests cover Kimi-style hidden-prompt + reasoning-multiplier accounting.

### 1.2 Phase 5 / routing-architecture.md — per-model quirks normalization

**Owner**: `@agentsy/providers` (normalization boundary) — NOT gateway
**Rationale**: S3, S5. Model churn (Kimi K3, Qwen3.8, GPT-5.6 Luna/Terra/Sol, Fable 5, GLM 5.2) is relentless.

| Task | Description |
|---|---|
| TASK-PROV-101 | Add `providers/src/quirks/` with a `ModelQuirks` record per model family: tool-call repair grammar id, channel-marker set (Harmony/Kimi `<\|channel\|>`/`<\|message\|>`/`<\|call\|>`), temperature contract, effort-level enum, reasoning-token field name in usage payload. |
| TASK-PROV-102 | Extend the normalizer to strip/parse channel markers and route them to the tool-call accumulator in `@agentsy/core/tool-calls`. |
| TASK-PROV-103 | Surface `reasoningTokens` as a first-class field on the normalized usage record so tokenomics (TASK-TKNM-201) can consume it. |
| TASK-PROV-104 | Model-registry entries carry a `quirksId`; unknown models fall back to a permissive default profile (fail-open, logged). |

**Gate**: Kimi/Harmony channel-marked tool calls parse without a strict-JSON failure; reasoning-token usage is populated on the normalized record; unknown model degrades to default profile without throwing.

### 1.3 Phase 6 (Streaming) — reasoning-token + effort-level pass-through

**Owner**: `@agentsy/daemon` streaming + `@agentsy/core/sse`
**Rationale**: S5.

| Task | Description |
|---|---|
| TASK-STREAM-101 | Propagate per-model `effortLevel` through the daemon stream request so callers can select effort; default to model's cheapest effort for micro/small tiers. |
| TASK-STREAM-102 | Emit a `reasoning-usage` stream event (reasoning tokens seen so far) so `@agentsy/tokenomics` status-bar can show live reasoning overhead. |

**Gate**: reasoning-usage events flow end-to-end from provider → daemon → status-bar widget.

### 1.4 Phase 7 (RAG) — Field Guide (stigmergy) memory primitive

**Owner**: `@agentsy/memory` (+ daemon RAG service, AD-6)
**Rationale**: S4 (Cursor Field Guide) — cheap, high-value, distinct from vector RAG.

| Task | Description |
|---|---|
| TASK-MEM-201 | Add a `FieldGuide` store in `@agentsy/memory`: an agent-curated, scope-keyed markdown document with a hard **line budget** (default 200). `index.md` per scope. |
| TASK-MEM-202 | Auto-inject `FieldGuide.index.md` into agent context at session start (pre-turn hook, via orchestrator builtin hook registry, ORCH Phase 4.5). |
| TASK-MEM-203 | Provide `field_guide_append`/`field_guide_prune` tools (schema-driven, bounded) so agents curate their own guide; enforce the line budget on write (reject + summarize when over). |
| TASK-MEM-204 | Field Guide entries are `kind: 'semantic'` memory items tagged `field-guide`; they participate in learning-loop consolidation (Phase 8) but are never auto-deleted (S4: "weights are frozen; capture surprises"). |

**Gate**: a fresh agent session receives the scope's Field Guide index automatically; append respects the line budget; content survives daemon restart via UnifiedDB.

### 1.5 Phase 8 (Learning Loop) — pluggable, domain-aware consolidation

**Owner**: `@agentsy/daemon` learning-job + `@agentsy/context` (compaction authority)
**Rationale**: S3. What to preserve vs discard is domain-dependent.

| Task | Description |
|---|---|
| TASK-LEARN-101 | The consolidation prompt/policy becomes selectable via a `CompactionPolicy` (see Phase 40). Legal-style policies preserve raw file refs; summary-style policies allow conceptual compression. |
| TASK-LEARN-102 | Field Guide entries (TASK-MEM-204) are eligible consolidation inputs. |

**Gate**: learning job honors the active domain `CompactionPolicy`; legal policy never discards raw file references.

### 1.6 Phase 11 (Scope Accountability) — proportional, non-lockout guardrails

**Owner**: `@agentsy/guardrails` + constitution alignment (Article V/XI)
**Rationale**: S2 (HF/GLM incident: frontier guardrails "cannot distinguish an incident responder from an attacker"), constitution proportionality/least-privilege.

| Task | Description |
|---|---|
| TASK-GR-201 | Add `scope`-aware policy filtering to detectors: `"strict"` (memory writes / skill installs), `"context"` (tool results / untrusted ingress), `"all"` (baseline). Aggressive patterns apply only in `strict`/`context` scope, not to first-party defensive/IR use. |
| TASK-GR-202 | Add a **non-lockout invariant**: no guardrail decision may render a user unable to inspect/act on their own data with a local model. When a cloud policy blocks, surface a local-model fallback path (ties to Phase 39). Log the decision receipt (Phase 4 `GuardrailDecisionReceipt`). |
| TASK-GR-203 | Add an appeal/override path (`allow-with-approval`) for legitimate security-review/incident-response classified requests, gated by human approval + audit receipt. |

**Gate**: a security-review classified prompt that a naive detector would block is instead routed to `allow-with-approval` or a local model, never a hard lockout; decision is auditable.

### 1.7 Phase 14 (ACP / multi-agent) — swarm coordination primitives

**Owner**: `@agentsy/orchestrator` (conductor) + `@agentsy/daemon` (UnifiedDB event ledger)
**Rationale**: S4. Cursor's failure modes appear at any real multi-agent scale.

| Task | Description |
|---|---|
| TASK-ORCH-201 | **Shared design docs w/ compile-checked references**: orchestrator persists planner decisions as addressable records; worker outputs carry a reference id back to the decision; a `reconciler` node merges contradicting decisions and propagates resolution (split-brain / planner-contention fix). |
| TASK-ORCH-202 | **Neutral merge-resolver agent**: a `merge` workflow node that impartially resolves file collisions on behalf of all workers (workers never self-merge). |
| TASK-ORCH-203 | **Megafile guard**: worker tool `flag_bloated_file`; when flagged, orchestrator blocks new writes and dispatches a decomposition subtask. |
| TASK-ORCH-204 | **Licensed intentional breakage**: a worker may make a scoped core change + leave a machine-readable rationale record; dependent workers read the rationale on build failure and adapt (ossification fix). |
| TASK-ORCH-205 | Coordination state lives in the daemon **UnifiedDB event ledger** (AD-1/AD-9), the collision-detection substrate — not raw git. |

**Gate**: a two-planner workflow that would otherwise split-brain produces a single reconciled design record; simulated file collision is resolved by the neutral merge node; megafile flag blocks writes and triggers decomposition.

### 1.8 Phase 15 (Reactivated Council Mode) — decorrelated review lenses

**Owner**: `@agentsy/orchestrator/council` (reactivated from `plan/archived/24-PHASE-15-COUNCIL-MODE.md` — see §0.6)
**Rationale**: S4. "No single lens catches everything; decorrelated lenses stack." Review is cheap vs the audited work.
**Note**: this is an **amendment to the reactivated Council Mode design**, not a new subsystem. Council already ships stage1/stage2/stage3 executors, presets, events, CLI, and tests (TASK-COUNCIL-001…009 in the archive) — only the two tasks below are net-new.

| Task | Description |
|---|---|
| TASK-COUNCIL-010 | Extend stage 2 (`collectCrossReviews`) so reviewers differ by (a) model, (b) persona/system prompt, and (c) input scope (full transcript vs output-only vs codebase-only) — not just by council-member identity. Aggregate by majority/severity. |
| TASK-COUNCIL-011 | Reviewer model tier is independently configurable per lens (cheap reviewers acceptable per S4 "review is cheap vs the work it audits"); record per-lens findings via `@agentsy/observability`. |

**Gate**: Council can be configured with ≥2 decorrelated lenses on different models/personas/scopes; aggregated verdict is deterministic given fixed inputs.

### 1.9 Phase 17 (Competitive) — output distillation + loop-guard (already-catalogued, bind now)

**Owner**: `@agentsy/context` (distillation) + `@agentsy/orchestrator` (loop-guard)
**Rationale**: S3/S4/S5 reinforce Atlas items A.14/A.15 (hermes/gemini). Pull forward the highest-value ones.

| Task | Description |
|---|---|
| TASK-CTX-201 | **Tool-output distillation**: when a tool result exceeds `MAX_DISTILLATION_SIZE`, save raw to the offloading storage adapter (already exists in `@agentsy/context` Phase 3) and inject an LLM intent-summary + structural truncation. Extends existing three-layer offloading. |
| TASK-ORCH-208 | **Deterministic tool-call loop guard**: `ToolCallSignature = sha256(canonical_sorted_json(args))`; `allow/warn/block/halt` on repeated exact/near failures (extends `CallCapTracker`, ORCH Phase 5). |

**Gate**: oversized tool output is offloaded + summarized under budget; repeated identical failing tool call is halted with an actionable message.

### 1.10 Phase 19 (Langfuse) / Phase 13 (Benchmarks) — agentic-reliability evals

**Owner**: `@agentsy/observability` + `@agentsy/testing` + Phase 13 benchmark suite
**Rationale**: S5. "The thing that matters most is agentic tool-calling reliability as conversations grow." Benchmarks ≠ toy correctness.

| Task | Description |
|---|---|
| TASK-EVAL-101 | Add a **long-horizon tool-reliability** benchmark scenario class to the Phase 13 suite: multi-turn tasks measuring tool-call success rate, malformed-call recovery, and context-degradation over N turns. |
| TASK-EVAL-102 | Add **token-efficiency** and **reasoning-overhead** as first-class eval metrics (tokens-per-successful-task, reasoning-token ratio) recorded via observability. |
| TASK-EVAL-103 | Wire probabilistic pass policies (ALWAYS/USUALLY pass, incubation window) from Atlas A.15 into the langeval integration (Phase 13 §18.7). |

**Gate**: `agentsy guardrails benchmark` / eval CLI reports tool-reliability + token-efficiency metrics; a regression in long-horizon reliability fails the gate.

### 1.11 Phase 23 (AFT/MC hardening) — document/artifact scoping

**Owner**: `@agentsy/session` + `@agentsy/daemon` `ScopeManager` (AD-12)
**Rationale**: S1. Folder scope is dev-centric; the general unit is a document/artifact.

| Task | Description |
|---|---|
| TASK-SCOPE-101 | Extend `ScopeManager` with `artifact:` scope keys (`artifact:[sha256-of-stable-id]`) alongside `folder:` keys; a session may bind to a document/artifact rather than a working directory. |
| TASK-SCOPE-102 | Memory/Field-Guide/tokenomics attribution key on the artifact scope when present. |

**Gate**: a session can be scoped to a document id; memory + ledger attribute to it; folder scoping still works unchanged.

### 1.12 Phase 24 (deferred Teams) — split out budget enforcement (pull forward)

**Owner**: `@agentsy/tokenomics` (headroom) + `@agentsy/orchestrator` (budget checkpoints) + `@agentsy/daemon`
**Rationale**: S9. Spend caps are operational reality now (Uber/MS), not a v1.2 luxury. See new **Phase 37**.

*(Full spec in §2.1 below — this is promoted from deferred Phase 24 into active-scope Phase 37.)*

---

## 2. New phases (37–40)

These are net-new. They slot into the parallel tracks; none block the guardrails critical path.

---

### Phase 37 — Cost Accountability & Heterogeneous Routing (P0/P1)

**Story points**: ~13
**Owner packages**: `@agentsy/tokenomics`, `@agentsy/gateway`, `@agentsy/orchestrator`, `@agentsy/daemon`
**Depends on**: Phase 5 (gateway) ✅, tokenomics Phase 1 (ledger), ORCH Phase 5 (tier delegation)
**Rationale**: S2, S4, S9 — the single highest-ROI economic lever.

#### 37.1 Planner/worker heterogeneous routing (first-class)

| Task | Description |
|---|---|
| TASK-37-001 | Add a `RoleModelPolicy` to orchestrator execution modes: `{ planner: TaskTier|logicalModelId, worker: TaskTier|logicalModelId }`. Default `planner=frontier`, `worker=small/mid`. Planner nodes and worker nodes request models via gateway using their role's tier. |
| TASK-37-002 | **Role-scoped context isolation** (the actual win per S4): planner context excludes leaf/worker detail; worker context excludes planning history. Implement as context-builder role filters in `@agentsy/context` consumed by orchestrator nodes. |
| TASK-37-003 | Cost attribution in tokenomics ledger splits spend by role (`planner`/`worker`) so the ~⅔-cost-in-planner / ~90%-tokens-in-worker split is observable. |
| TASK-37-004 | Add `agentsy tokenomics report --by-role` output. |

#### 37.2 Budget enforcement (promoted from deferred Phase 24)

| Task | Description |
|---|---|
| TASK-37-005 | `BudgetPolicy` in tokenomics: per-session, per-user, per-org USD + token caps with rolling windows (reuse `quotas/headroom.ts`, `windows.ts`). |
| TASK-37-006 | Orchestrator plan/act loop consults `BudgetPolicy` at each checkpoint (extends REQ-ORCH-002 budget-awareness); on breach: downscope → cheaper tier → fail-safe stop with a clear message. |
| TASK-37-007 | **Iteration budget with refund semantics** (Atlas A.14 hermes): thread-safe consume/refund counter; parent cap and subagent cap; refund on cheap deterministic ops. Wire into ORCH `CallCapTracker`. |
| TASK-37-008 | `agentsy config` keys: `budget.session.maxUsd`, `budget.user.maxUsd`, `budget.org.maxUsd`, `budget.window`. Daemon enforces via IPC before `agent.spawn`. |

#### 37.3 Cost-volatility resilience

| Task | Description |
|---|---|
| TASK-37-009 | Gateway spillover already exists; add **provider-portability preflight**: on frontier-provider budget/price spike (from tokenomics headroom signals), automatically bias routing toward local/cheaper replicas per policy. |
| TASK-37-010 | Document the local-model hedge posture in README + `docs/architecture/routing-architecture.md` (ties Phase 39). |

**Gate**: hybrid planner/worker run demonstrably matches solo-frontier quality at materially lower `estUsdModeled` in an eval fixture; per-role ledger split is reported; a session that exceeds `budget.session.maxUsd` is stopped with an actionable message; iteration refund keeps deterministic ops from consuming budget.

---

### Phase 38 — Intent-First / Bitter-Lesson Scaffolding Audit (P1)

**Story points**: ~8
**Owner packages**: `@agentsy/prompts`, `@agentsy/plugins` (shipped skills), `packages/agents/src/skills/`, `@agentsy/orchestrator` (plan mode)
**Depends on**: none (independent track)
**Rationale**: S6, S7. As models improve, procedural HOW-scaffolding actively degrades output.

> **Explicitly out of scope**: `.agents/` build-time skills (not shipped).

#### 38.1 WHAT-vs-HOW audit

| Task | Description |
|---|---|
| TASK-38-001 | Define a taxonomy tag on every shipped prompt/skill: `intent-what` (durable: outcomes, constraints, policy, tool contracts, domain validation) vs `procedure-how` (brittle: step-by-step execution recipes). Add a frontmatter field `scaffold_kind`. |
| TASK-38-002 | Audit `@agentsy/prompts`, `@agentsy/plugins` skill bundles, and `packages/agents/src/skills/*` (caveman/superpowers/garrys). Tag each. Produce `docs/developers/scaffold-audit.md`. |
| TASK-38-003 | Prune or downgrade `procedure-how` content that duplicates capabilities modern models already have; keep constraints/policy/validation intact (do **not** prune guardrails/constitution/domain-validation — those are legitimate WHAT). |
| TASK-38-004 | Make scaffolding **meta-upgradeable**: version each skill (`scaffold_version`), and add a lint that flags skills whose `procedure-how` ratio exceeds a threshold for review. |

#### 38.2 Spec/intent as first-class artifact

| Task | Description |
|---|---|
| TASK-38-005 | Add a **plan/spec artifact** type to orchestrator `planAndExecute` (already produces `PlanArtifact`): persist the spec as a versioned, inspectable document (reuse `artifact:` scope from TASK-SCOPE-101). Treat "the spec" as the primary unit of work (S4/S6). |
| TASK-38-006 | Add `agentsy spec` CLI verbs: `init`, `show`, `diff` — a spec file becomes the durable input to a run. |
| TASK-38-007 | Document the intent-first principle in `docs/constitution.md` note or `docs/why-agentsy.md` design-principles (see Phase 40 constitution edit). |

**Gate**: every shipped prompt/skill carries `scaffold_kind` + `scaffold_version`; the audit doc exists; the ratio-lint runs in CI; `agentsy spec init` writes a versioned inspectable spec that drives a run.

---

### Phase 39 — Local-First Model Resilience & Lockout Escape (P1)

**Story points**: ~7
**Owner packages**: `@agentsy/gateway` (local discovery GW-2), `@agentsy/guardrails`, `@agentsy/providers`, `@agentsy/cli`
**Depends on**: Phase 5 (gateway local discovery), Phase 11 (scope), Phase 37 (routing)
**Rationale**: S2 (HF/GLM incident), S9 (bubble/cost hedge). Local models are the crash hedge AND the guardrail-lockout escape hatch.

| Task | Description |
|---|---|
| TASK-39-001 | Harden local backend discovery (Ollama/Jan/Apfel) health + capability reporting; ensure at least one local replica is always a candidate when configured. |
| TASK-39-002 | `LocalFallbackPolicy`: on cloud lockout (guardrail block, provider outage, budget breach), if a capable local replica exists, offer/route to it (respects TASK-GR-202 non-lockout invariant). |
| TASK-39-003 | NPU/Apple-Silicon awareness: capability flags so routing prefers NPU-accelerated local models for micro/small tiers when present. |
| TASK-39-004 | `agentsy doctor local` diagnostics: enumerate local backends, capabilities, and whether a lockout-escape path exists. |
| TASK-39-005 | Windows PowerShell 5.1+ compatibility check for local-backend launch scripts (env constraint). |

**Gate**: with a local replica configured, a simulated cloud guardrail lockout routes to the local model instead of dead-ending; `agentsy doctor local` reports the escape path; NPU-tagged local model is preferred for micro-tier tasks.

---

### Phase 40 — Domain Harnesses, Pluggable Compaction & Anti-Monoculture Governance (P1)

**Story points**: ~10
**Owner packages**: `@agentsy/context` (compaction), `@agentsy/memory` (ontology), `@agentsy/tools` (domain tool packs), `docs/constitution.md`, `@agentsy/plugins`
**Depends on**: Phase 7 (RAG/memory), context compaction strategy registry (exists)
**Rationale**: S3 (domain harnesses), S8 (rewild/interoperability).

#### 40.1 Pluggable, declarative per-domain compaction

| Task | Description |
|---|---|
| TASK-40-001 | Define `CompactionPolicy` interface consumed by the existing `CompressionStrategyRegistry` in `@agentsy/context`: `{ preserve: PreserveRule[], discardable: DiscardRule[], strategy: string }`. Rules are declarative. |
| TASK-40-002 | Ship two reference policies: `legal` (preserve raw file references / verbatim citations; never summarize source text) and `general` (allow conceptual summarization). Select via config/domain. |
| TASK-40-003 | Wire `CompactionPolicy` into the learning-loop consolidation (TASK-LEARN-101) and the anchored-iterative strategy (anchor rules become policy-driven). |

#### 40.2 Configurable domain memory ontology

| Task | Description |
|---|---|
| TASK-40-004 | Allow a declarative memory ontology/graph schema per domain in `@agentsy/memory` (entity/edge types configurable); default remains current flat/semantic model. |

#### 40.3 Domain tool packs with enforced validation loops

| Task | Description |
|---|---|
| TASK-40-005 | Add a `ToolPack` concept in `@agentsy/tools`/`@agentsy/plugins`: a bundle of tools with domain-specific input/output schemas and **enforced validation loops** (e.g., "must cross-reference DB before write"). Retry-loop-with-good-error is the enforcement mechanism (S3). |
| TASK-40-006 | Provide one reference tool pack (e.g., a `db-guarded-write` pack) demonstrating a forced cross-reference before mutation. |

#### 40.4 Anti-monoculture governance (constitution + docs)

| Task | Description |
|---|---|
| TASK-40-007 | Add **Article XII — Interoperability & Portability** to `docs/constitution.md`: no captive formats; align with open standards (MCP/AG-UI/ACP/A2A); every package independently consumable; no design that requires one hosted platform/vendor; "no permanent favorites" (provider diversity as a first-class value). |
| TASK-40-008 | Add an **intent-first** design principle to `docs/why-agentsy.md` (WHAT-over-HOW, meta-upgradeable scaffolding) — links Phase 38. |
| TASK-40-009 | Elevate Phase 29 (package boundary cleanup) priority note: independently consumable packages are now a **governance guarantee**, not just hygiene (S8 comcom/interoperability). |

**Gate**: `legal` compaction policy provably never discards raw file references in a fixture; a domain tool pack enforces its validation loop (write rejected until cross-reference performed); constitution Article XII merged and referenced from README + why-agentsy.

---

## 3. Placement in the sprint timeline

These are additive parallel tracks. Suggested insertion (extends `plan/30-implementation-order-milestones.md §30.1`):

```text
Sprint 1–2  : Phase 38 (Intent/BLE audit)   ← independent, start immediately (docs+prompts)
Sprint 2–3  : Phase 37 (Cost Accountability) ← after Phase 5 gateway; P0 budget enforcement
              §1.1 (GW cost-per-task) + §1.2 (provider quirks) land with Phase 5/6
Sprint 3–4  : Phase 39 (Local resilience)    ← after gateway local discovery
              §1.4 Field Guide (Phase 7 rider), §1.5 learning policy
Sprint 4–5  : §1.6 non-lockout guardrails (rides Phase 11)
Sprint 5–7  : Phase 40 (Domain harnesses + constitution)  ← after Phase 7 memory
Sprint 6–8  : §1.7/§1.8 swarm coordination + Council lenses (ride Phase 14)
Sprint 7    : §1.10 agentic-reliability evals (rides Phase 13/19)
Sprint 7–8  : §1.9 output distillation + loop-guard (rides Phase 17), §1.11 artifact scoping (rides Phase 23)
```

**Story-point impact**: Phase 37 (~13) + Phase 38 (~8) + Phase 39 (~7) + Phase 40 (~10) = **~38 SP** net-new, plus ~15 SP of amendments distributed across existing phases. This consumes the buffer; recommend extending the v1 timeline by ~1 sprint (aligns with §30.4 guidance) or descoping P3 items (Phase 18 image/audio, Phase 22).

---

## 4. Cross-cutting invariants (must hold across all above)

1. **No captive formats** — every new artifact (spec, Field Guide, compaction policy, tool pack) is plain, inspectable, and portable (S8; constitution Article XII).
2. **Non-lockout** — no guardrail/budget/provider decision may deny a user access to their own data via a local model (S2; constitution V/XI; TASK-GR-202).
3. **Explainable routing** — every cost-based or role-based selection records `selectedBecause` (routing-architecture.md).
4. **Account by intelligence, not tokens** — all new cost surfaces use `estUsdModeled` incl. reasoning overhead (S2/S5).
5. **WHAT over HOW** — new prompts/skills default to `intent-what`; `procedure-how` requires justification + version (S6/S7).
6. **Independent consumability** — no new hard `@agentsy/*` coupling that breaks Phase 29 boundary goals (S8).
7. **Privacy invariants preserved** — Field Guide / specs / role-split ledger store no raw secrets; deep-scrub applies (constitution VIII).

---

## 5. Verification matrix (addendum-level)

| Area | Command / check | Pass condition |
|---|---|---|
| Cost routing | eval fixture: hybrid vs solo-frontier | equal quality, lower `estUsdModeled` |
| Budget | `agentsy config set budget.session.maxUsd`; run over-cap | stopped w/ actionable message |
| Quirks | Kimi/Harmony channel-marked tool call | parses, no strict-JSON failure |
| Field Guide | fresh session in a scope | index auto-injected; line budget enforced |
| Non-lockout | simulated cloud guardrail block w/ local replica | routes to local, not dead-end |
| Swarm | two-planner workflow | single reconciled design record |
| Council | ≥2 decorrelated lenses | deterministic aggregate verdict |
| Domain compaction | `legal` policy fixture | raw file refs never discarded |
| Evals | agentic-reliability benchmark | tool-reliability + token-efficiency reported; regression fails gate |
| Governance | constitution Article XII | merged, referenced from README/why-agentsy |
| BLE audit | scaffold ratio-lint | runs in CI; all shipped skills tagged |
| Standard gates | `pnpm build && pnpm check-types && pnpm lint && pnpm test` | green, no regressions, >80% coverage on new code |

---

**End of Addendum — 2026-07 Industry-Signal Remediation & Expansion Plan v1.0**
