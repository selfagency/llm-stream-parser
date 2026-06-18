# Agentsy: Unified Remediation & Implementation Plan

**Version**: 1.2 (synthesized — Phases 0–5 marked COMPLETE; audit applied 2026-06-17)
**Date**: 2026-06-17
**Repository**: `selfagency/agentsy`
**Branch reviewed**: `develop`
**Status**: ACTIVE — Phases 0–5 complete; Phase 6 onward is the active scope
**Code reference**: <https://github.com/selfagency/agentsy> (develop branch)

> **Update from v1.0**: Phases 0 (Critical Bug Fixes), 1 (Daemon Foundation), and 2 (Package Consolidation) from the v2.3 source plan are now COMPLETE on `develop`. Their deliverables (UnifiedDB, daemon IPC, Piscina pool, Honker queues, Bree scheduler, SubprocessManager, 25-package layout) are treated as existing infrastructure in all downstream phases. The active scope of this plan is Phases 3–18: ~100 story points over ~11 sprints.
>
> **2026-06-17 Plan Audit**: A line-by-line code review against the 28-package codebase identified 20 gaps,
> corrections, and security findings. Key outcomes:
>
> - Phase 2 status qualified: `mcp/` and `connectors/` root packages still contain live code alongside daemon copies.
> - Phase 3 API shape divergence documented: factory function pattern vs. class pattern in plan examples.
> - AG-UI adapter (`runtime/src/ag-ui/`) is an unplanned production addition — retroactively documented in new **Phase 31**.
> - Shell tool (`shell_exec`) uses `execSync` without sandbox routing — tracked in new **Phase 32** (Security Hardening).
> - IPC server has no authentication layer — tracked in Phase 32.
> - `LangfuseExporter` already implemented; Phase 19 scope reduced to daemon wiring only.
> - `ApprovalManager` exists but has no IPC surface — tracked in Phase 32.
> - `VirtualSandbox` `WORKER_PATH` is fragile (process.cwd() relative) — tracked in Phase 32.
> - Dead absolute path reference (`/home/z/my-project/…`) corrected.
> - Version bumped to v1.2.

**Source documents synthesized**:

1. `agentsy-guardrails-gap-analysis.md` — 43 findings (E-1 to E-43), 8-phase guardrails remediation, 812 lines
2. `agentsy-remediation-plan-v2 (8).md` — v2.3, 9 critical bugs + 10 architectural phases, ~435h, 6650 lines
3. `agentsy-competitive-comparison.md` — 12 competitors analyzed across 12 dimensions, P0–P3 gap matrix, Top 15 actions, 751 lines

**Merge rules**:

- **Guardrails findings** (E-1 to E-43) are reproduced **inline** in the phase that closes them, preserving severity, files, policy requirement, and recommended fix.
- **Competitor analysis** is condensed into **Appendix A — 12-Competitor Pattern Atlas** (one section per competitor with top 3 patterns to borrow and target phase). Actionable competitive gaps are threaded inline into the relevant phase as "Port X from Y" notes.
- **Effort** is expressed in **story points** (1 SP ≈ 8 hours of focused engineering work) and allocated across **2-week sprints**. Sprint capacity assumes a 3-person team at ~60 SP/sprint after overhead.
- **Code snippets** are preserved for the load-bearing types and fixes (GuardrailDecisionReceipt, hook composition, UnifiedDB schema, fake-streaming fix, etc.); routine code is summarized in prose.

---

## 1. Executive Summary

This plan merges three independent audits of the `selfagency/agentsy` codebase into a single executable roadmap. The three audits converge on three structural conclusions that, taken together, define the work:

**Conclusion 1 — The guardrails package is security-shaped, not ethics-shaped.** `@agentsy/guardrails` ships 7 working security scanners (prompt injection, PII, secrets, paths, commands, rate limiting, toxicity), a clean discriminated-union result model, a priority-sorted pipeline, and 208 passing tests. But it implements **0 of 9** behavioral detector categories mandated by `SAFETY.md`, **0 of 12** required safety metrics, **0 of 12** required benchmark scenarios, and **0 of 9** enforceable release criteria. No code path loads, parses, or enforces `ETHICS.md`, `SAFETY.md`, `GOVERNANCE.md`, or `docs/constitution.md`. The policy documents claim enforceable commitments the package does not honor — this is itself a safety failure because it means incident response will be met with "but we had guardrails!" defenses that don't hold up under scrutiny.

**Conclusion 2 — The daemon has zero guardrails integration.** `@agentsy/daemon` (shipped in PR #122) is the central long-lived process owning all agent execution. Its IPC handlers (`agent.spawn`, `agent.send`, `process.spawn`, `jobs.enqueue`, `stream.start`) accept unvalidated `Record<string, unknown>` params, cast them with `as string` / `as unknown as SubprocessSpec`, and execute. No `HookRegistry` is wired in. No `GuardrailPipeline` runs. As shipped, an agent running in the daemon bypasses every guardrail commitment in `SAFETY.md`. This must be closed before any first-party agent template ships.

**Conclusion 3 — The agent core lags competitors on the dimensions that determine daily agent quality.** Across 15 competitors (aider, agent-zero, pi, oh-my-pi, codebuff, ante, codex, Qwen3-Coder, Claude-Code ×3, opencode, openclaw, hermes-agent, gemini-cli), agentsy is best-in-class on infrastructure (guardrails breadth, gateway, tokenomics, secrets, daemon IPC, governance docs, ACP alignment) and behind on agent core (hooks unimplemented, tool type thin, no skills system, no subagent system, no MCP server mode, no steering/follow-up queues, no session branching, no plan mode, no persistent shell, no tool result bounding, no output minimization). The 3 new competitors (openclaw, hermes-agent, gemini-cli) surfaced 32 additional findings, including ACP depth, A2A protocol, behavioral evals, credential pool lifecycle, self-improvement, Conseca, and graph-based context — driving Phases 26–28. The Top 20 competitive actions are threaded through Phases 3, 6, 14, 17, 26, 27, and 28.

**Scope of this plan**: 31 phases total (Phases 0–30). **Phases 0–5 are COMPLETE** on `develop` on `develop`. The **active scope is Phases 6–23 + Phases 29–30**: ~166.5 story points over ~11–12 sprints (~22–24 weeks) for a 3-person team. Each phase is independently shippable. Phase 29 (Package Boundary Cleanup) addresses the cross-dependency problem: 12 packages that should be independently consumable currently have hard `@agentsy/*` dependencies. Phase 30 (Environmental Impact Tracking) adds CO2 emissions and water consumption tracking to `@agentsy/tokenomics` — per-request and cumulative, with optimization savings reporting. 6 packages are already published to npm. Phase 5 keeps `@agentsy/gateway` as an **independent reusable package**. Phase 20 (Ethical Provider & Content Policy) now hard-blocks xAI on both content safety AND environmental racism grounds (illegal gas-turbine power plant polluting Black communities in Memphis), and warns against Meta (tent data centers with jet-engine gas turbines + LibGen training-data theft). **Phases 24–28 are DEFERRED** — designs complete (~93 SP combined, ~8 sprints). Buffer is 0 SP — recommend extending to Sprint 12 or descoping P3 items. See Phase 19 (`phase-19-langfuse-observability.md`) for Langfuse integration detail for full detail.

**Three non-negotiable gates** (all in force):

1. **✅ Gate 1 LIFTED** — Phase 4 (Guardrails Honest Foundation) is COMPLETE. The `@agentsy/guardrails` package now has the `EthicsRegistry`, `GuardrailDecisionReceipt` type, expanded `GuardrailResult` union, audit logger, canonical `GuardrailsConfig`, and honest documentation.
2. **BLOCK** any first-party agent template from shipping until **Phase 12** (Guardrails Daemon Integration) is complete and the **Phase 13** release-gate script passes in CI.
3. **BLOCK** any first-party agent template from shipping until **Phase 20** (Ethical Provider & Content Policy) is complete — agentsy will not route to xAI/Grok, will not ship a Telegram connector, and will block style-mimicry prompts. These are hard ethical commitments, not configurable preferences.

---

## 2. Source Documents Synthesized

| # | Document | Lines | Scope | Contribution to unified plan |
|---|---|---|---|---|
| 1 | `agentsy-guardrails-gap-analysis.md` | 812 | `packages/guardrails/**` (3854 LOC source, 2347 LOC tests, 19 files, 208 tests) + integration points in runtime, daemon, cli, types, gateway. Policy docs reviewed: ETHICS.md (194 lines), SAFETY.md (308 lines), GOVERNANCE.md (185 lines), constitution.md (98 lines), IMPLEMENTATION-PLAN.md (473 lines), IMPLEMENTATION-PLAN-REVISIONS.md (141 lines). | 43 findings (E-1 to E-43), 8 remediation phases, verification checklist, BLOCK recommendation. Findings reproduced inline in Phases 4, 9, 10, 11, 12, 13, 16. |
| 2 | `agentsy-remediation-plan-v2 (8).md` | 6650 | 9 critical bugs + 10 architectural phases (v2.3 with bootstrap addendum). Branches: `feature/model-tier-routing`, `fix/phase0-critical-bugs`, `feat/daemon-foundation`, `refactor/package-consolidation`, `feat/hook-pipeline-redesign`, `feat/gateway-daemon-migration`, `feat/project-bootstrap`. | 12 architectural decisions, Phases 0–10 with code, Appendices A–D (code quality deep-dive, package map, IPC spec, ACP mapping). Mapped to Phases 0, 1, 2, 3, 5, 6, 7, 8, 14, 15, 18. |
| 3 | `agentsy-competitive-comparison.md` | 751 | 12 competitor repos cloned and source-read (not just READMEs). Three parallel research agents produced reports synthesized here. | Architecture comparison matrix, 12 pattern deep dives, P0/P1/P2/P3 gap tables, Top 15 prioritized actions, "what agentsy does better" list. Actionable gaps threaded inline; condensed atlas in Appendix A. |

**Synthesis decisions**:

- The guardrails gap analysis Phases 1–8 are distributed across the unified ladder (Phases 4, 9, 10, 11, 12, 13, 16) rather than kept as a contiguous block, because several guardrails phases have hard dependencies on the daemon (Phase 1), hook redesign (Phase 3), and streaming (Phase 6).
- The v2.3 phases keep their relative ordering and dependencies, with the guardrails phases inserted at the earliest point they can ship without blocking architectural work.
- Competitive items are absorbed into the phase that naturally owns them (e.g. Claude-Code hook schema → Phase 3, HeadTailBuffer → Phase 17) rather than batched into a single "competitive" phase. Phase 17 closes the remaining competitive gaps that don't have a natural architectural home.

---

## 3. Unified Phase Ladder (Master Table)

| Phase | Name | Source | Story Points | Sprint | Priority | Dependencies | Closes Findings | Status |
|---|---|---|---|---|---|---|---|---|
| 0 | Critical Bug Fixes | v2.3 §3 | 3 | — | P0 | none | — | ✅ COMPLETE |
| 1 | Daemon Foundation | v2.3 §4 | 13 | — | P0 | Phase 0 | — | ✅ COMPLETE |
| 2 | Package Consolidation | v2.3 §5 | 2 | — | P1 | Phase 0 | — | ✅ COMPLETE |
| 3 | Hook Pipeline Redesign + Claude-Code Hook Schema | v2.3 §6 + comp #1, #4 | 5 | — | P1 | Phase 0 | — | ✅ COMPLETE |
| 4 | Guardrails Honest Foundation (Ethics, Receipts, Audit) | gap §Phase 1+2 | 6 | — | P0 | Phase 3 | E-1, E-2, E-3, E-4, E-5, E-22(partial), E-23, E-38, E-39, E-40, E-41, E-42 | ✅ COMPLETE |
| 5 | Gateway Daemon Hosting & Independent Package (reusable library + UnifiedDB persistence + ethics hook) | v2.3 §7 (revised) | 6 | 2 | P1 | Phase 1 ✅ | — | ✅ COMPLETE |
| 6 | Streaming Architecture | v2.3 §8 + comp #12 | 5 | 3 | P1 | Phase 5 ✅ | — | ✅ COMPLETE |
| 7 | RAG as Daemon Service | v2.3 §9 | 4 | 3 | P2 | Phase 1 ✅ | (supports E-20, E-35) | ✅ COMPLETE |
| 8 | Learning Loop & Background Jobs | v2.3 §10 | 3 | 4 | P2 | Phase 7 | — | ✅ COMPLETE |
| 9 | Guardrails Behavioral Detectors (9 of 9) | gap §Phase 3 | 10 | 4–5 | P0 | Phase 4, Phase 10(SessionState) | E-6, E-7, E-8, E-9, E-10, E-11, E-12, E-13, E-14 | Pending |
| 10 | Guardrails Missing Surfaces & Interaction Safeguards + Ingress Scanning | gap §Phase 4 + §15.7 extension | 9 | 5 | P0 | Phase 4 | E-16, E-20, E-35, E-22(full) + ingress/MCP network-policy plumbing | Pending |
| 11 | Scope Accountability, Request Classification & High-Risk Domains | gap §Phase 5 | 5 | 6 | P1 | Phase 10 | E-15, E-19, E-28 | Pending |
| 12 | Guardrails Daemon Integration | gap §Phase 6 | 5 | 6 | P0 | Phase 1 ✅, Phase 4 | E-21 | Pending |
| 13 | Guardrails Metrics, Benchmark Suite, Release Gate + langeval Integration | gap §Phase 7 + §18.7 (langeval) | 11.5 | 7 | P0 | Phase 9, Phase 12, Phase 19, Phase 21 | E-25, E-26, E-27, E-14(full) + behavioral evals via langeval | Pending |
| 14 | ACP Agent, Multi-Agent + Event Ledger/Translators | v2.3 §11 + comp #2,#6,#8 + §19.10 (openclaw) | 12 | 7–8 | P1 (elevated) | Phase 5 ✅, Phase 6 | — + ACP depth | Pending |
| 15 | Project Auto-Detection & Bootstrap | v2.3 §13 | 7 | 8–9 | P2 | Phase 1 ✅, Phase 8 | — | Pending |
| 16 | Guardrails CLI, Hub & Polish | gap §Phase 8 | 5 | 9 | P1 | Phase 4 | E-17, E-24, E-29, E-30, E-31, E-32, E-33, E-34, E-36, E-37, E-43 | Pending |
| 17 | Competitive Gap-Closing Sprint | comp Top 15 (residual) | 12 | 9–10 | P2 | Phases 3, 6, 14 | — | Pending |
| 18 | Missing Capabilities (incl. Council CLI) | v2.3 §12 + audit | 9 | 10–11 | P3 | Phase 14 | — | Pending |
| 19 | Langfuse Observability Integration | standalone plan | 6 | 1 (parallel) | P2 | Phase 1 ✅ | (observability gap) | ✅ COMPLETE |
| 20 | Ethical Provider & Content Policy (block xAI, warn OpenAI/MS/Google/Amazon, style-mimicry block, Telegram removal) | ethical stance | 8 | 2–3 | P0 | Phase 4, Phase 5 | extends E-1; adds ETHICS.md §12–§15 | ✅ COMPLETE |
| 21 | Docker-Based Optional Tooling (super-linter, presidio) | user request | 8 | 4–5 | P2 | Phase 1 ✅, Phase 12 | (PII + lint capability) | Pending |
| 22 | Web Fetcher HTML-to-Markdown (turndown) | user request | 2 | 6 | P3 | none | — | ✅ COMPLETE |
| 23 | AFT, Magic Context & Task Board Integration Hardening | §25 audit | 10 | 7–8 | P1 | Phase 1 ✅, Phase 15 | (5 integration gaps) | Pending |
| 24 | Teams & Remote Daemon Deployment (Docker, OAuth, spend, audit, shared memory, Turso) | user request | ~40 | 13–16 (deferred) | P4 | All of Phases 3–23 + v1 stabilization | (server mode) | DEFERRED |
| 25 | MITM Egress Proxy for Subprocess Network Interception | §39 + Phase 10 §15.7 | ~12 | 17–18 (deferred) | P4 | Phase 10 §15.7, Phase 21, Phase 24.1 | (network inspection) | DEFERRED |
| 26 | A2A Protocol Support (federated agents, remote delegation) | §A.15 gemini-cli | ~15 | 19–20 (deferred) | P4 | Phase 14, Phase 23, Phase 24 | (A2A server + client) | DEFERRED |
| 27 | Self-Improvement & Skill Curation (curator, post-turn review, AST audit) | §A.14 hermes-agent | ~12 | 19–20 (deferred) | P4 | Phase 8, Phase 15, Phase 23 | (self-curating skills) | DEFERRED |
| 28 | Supply-Chain Security & Policy Attestation (OSV, Conseca, pinned deps, doctor, JSON Schema) | §A.13–A.15 | ~14 | 19–20 (deferred) | P4 | Phase 4, Phase 12, Phase 15, Phase 21 | (compliance posture) | DEFERRED |
| 29 | Package Boundary Cleanup & Composability (DI, peer deps, eliminate renderers/types, publish independent packages) | audit | 8 | 1–2 | P0 | Phase 2 ✅, Phase 4 ✅ | (cross-dependency problem) | Pending |
| 33 | AIMock Full Integration (LLMock wiring, MCPMock, VectorMock, AGUIMock, chaos, drift CI) | code audit | 5 | 5 (parallel) | P1 | Phase 7, Phase 31 | (test harness completeness, drift detection) | Pending |
| 34 | Local Trust Sanitization Workflow (ZipTyPrompt parity) | code audit | 4 | 3 (parallel) | P1 | Phase 4 ✅, Phase 16 | (sanitize-first workflow, custom rules, infra preset) | ✅ COMPLETE |
| 35 | Skill Discovery, Registry Install & Scope Management (autoskills + skillsor parity) | code audit | 5 | 4 (parallel) | P1 | plugins skill system | (registry install, scope, shadowing, lockfile) | Pending |
| 36 | Agent Governance Toolkit Pattern Adoption (policy engine, trust mesh, audit) | code audit | 6 | 5 (parallel) | P1 | Phase 4 ✅, Phase 12, Phase 32 | (policy engine, trust mesh, tamper-evident audit, kill switch) | Pending |
| 31 | AG-UI Adapter Integration (retroactive documentation + daemon wiring) | code audit | 3 | 6 (parallel) | P1 | Phase 6 | (AG-UI/CopilotKit frontend protocol) | Pending |
| 32 | Security Hardening: Shell Sandbox, IPC Auth, Approval IPC, Worker Path Fix | code audit | 6 | 4–5 | P0 | Phase 1 ✅, Phase 3 ✅ | (shell sandbox, IPC auth gap, approval IPC surface) | Pending |
| 30 | Environmental Impact Tracking (CO2 + Water per request and cumulative) | research | 6 | 3–4 | P1 | Phase 4 ✅, Phase 5, Phase 29 | (extends tokenomics) | Pending |
| | **Active total (Phases 5–23 + 29–30)** | | **~195.5 SP** | 11–12 sprints | | | 43 of 43 findings + ethical commitments + ingress scanning + langeval eval + ACP depth + independent gateway + package composability + CO2/water tracking | |
| | **Deferred total (Phases 24–28)** | | **~93 SP** | ~8 sprints (post-v1) | | | server mode + network proxy + A2A + self-improvement + supply-chain | DEFERRED |

**Sprint capacity assumption**: 3-person team, 2-week sprints, ~20 SP/person/sprint after meetings/review/oncall = ~60 SP/sprint. Active scope (~166.5 SP) ≈ 2.8 sprints of pure capacity, spread across 11–12 calendar sprints. Buffer is 0 SP — see §30.4 burndown for descope guidance (recommend extending to Sprint 12 or descoping P3 items).

**Critical path (active)**: Phase 3 → Phase 4 → Phase 9 → Phase 13 (guardrails enforcement closure, ~7 sprints end-to-end). Secondary critical path: Phase 5 → Phase 6 → Phase 14 → Phase 18 (architecture completion, ~7 sprints end-to-end). Phase 19 (Langfuse) is off both critical paths — it's a 6 SP independent track that can start in Sprint 1 and finish by Sprint 2.

**Parallelism opportunities** (now unlocked by Phases 0–5 being done):

- Phase 7 (RAG), Phase 19 (Langfuse), Phase 29 (package boundary cleanup), and **Phase 32 (Security Hardening)** can all start in parallel in Sprint 1 — they have no interdependencies.
- Phase 31 (AG-UI wiring) can run in parallel with Phase 6 (Streaming), as both operate on daemon streaming infrastructure.
- Phase 8 (learning loop) can run in parallel with Phase 9 (detectors) once Phase 7 is done.
- Phase 11 (scope/classification) can run in parallel with Phase 12 (daemon integration).
- Phase 15 (bootstrap) can run in parallel with Phases 16 and 17.

**Deliverables from completed phases** (referenced by downstream work):

- **Phase 0**: 9 bug fixes landed (`UniversalClient` true streaming, tool-call history preservation, hook short-circuit patch, gateway cost units, retry quota map, daemon restart, tool-call ID dedup, retry jitter, error classification).
- **Phase 1**: `@agentsy/daemon` package with `UnifiedDB` (~/.agentsy/agentsy.db via Honker), Piscina `AgentPool`, Honker durable queues, Bree scheduler, sqlite-worker, `SubprocessManager` (Pup pattern, stall detection), REST control API, JSON-RPC 2.0 over Unix sockets IPC server, ACP server stub, `TerminalBridge`, `ServiceHost` with sleep/wake, `AgentHost`, `ScopeManager` (folder-based), `Supervisor`, `DaemonConfig` schema, CLI integration.
- **Phase 2**: 25-package layout (workflows→orchestrator, types→shared, renderers→ui, scripts→root, mcp→daemon, connectors→daemon; vscode preserved). `pnpm install && pnpm build && pnpm test` green.
- **Phase 3**: Hook pipeline redesigned — middleware-style composition (transforms compose left-to-right), Claude-Code hook schema (command/prompt/http/agent with `if` filter), `failUnsettledTools` on provider error. `RuntimeHookRegistry.fire()` composes transforms; `stop` short-circuits with `stoppedBy`.
- **Phase 4**: Guardrails Honest Foundation — `EthicsRegistry` with all clauses from ETHICS.md/SAFETY.md/GOVERNANCE.md/constitution.md, `GuardrailDecisionReceipt` type (7 fields), expanded `GuardrailResult` union (6 states including `quarantine` and `allow-with-approval`), `JsonlAuditLogger` with PII/secret redaction, canonical `GuardrailsConfig`, honest README with Policy Enforcement Status table, `safety-changelog.md`, PR template with ethics review checklist. **Gate 1 LIFTED.**
- **Phase 5** ✅: Gateway Daemon Hosting & Independent Package — `createGateway()` factory + `Gateway` class with `selectModel()`, `spillover()`, `registerProvider()`, `healthReport()`, `flush()`. `PersistenceAdapter` interface + `InMemoryPersistenceAdapter` default. `ProviderEthicsPolicyHook` for pluggable ethics filtering. `GatewayClientShim` IPC shim for daemon-connected consumers. `UnifiedDBPersistenceAdapter` (7 methods backed by SQLite with 4 migration tables). `RoutingService` in daemon hosting the gateway with circuit-breaker state restore on startup. 30+ new tests across both packages. All 11 CI checks passing (SonarCloud, Codacy, Fallow, Semgrep, Socket, Codecov, CLI E2E).

---

## 4. Architectural Decisions (AD-1 to AD-12)

These twelve architectural decisions, inherited from v2.3 §2, govern the entire plan. Each phase must respect them.

### AD-1: Daemon as the Central Process

The daemon (`@agentsy/daemon`) is the single long-lived process that owns all stateful subsystems. CLI and TUI are thin IPC clients over Unix domain sockets. Editors connect via ACP. Currently every CLI invocation spins up its own runtime, memory engine, gateway, and provider connections — wasteful, prevents cross-session memory, and makes background jobs impossible. A persistent daemon solves all three. The daemon must be crash-resilient (supervisor pattern), support sleep/wake lifecycle for all subsystems, and expose both an internal IPC interface and an external ACP interface.

### AD-2: Hook Transform Composition

Hook transforms compose left-to-right like Koa/Express middleware. Each hook receives the output of the previous transform. Priority determines execution order. The current short-circuit design (return on first transform) silently drops transformations when both a guardrail hook and a memory hook transform the same event. This is the subject of Phase 0.3 (minimal patch) and Phase 3 (full redesign).

### AD-3: Daemon-Centric Streaming

The daemon owns all LLM provider connections. Clients request streams via IPC; the daemon pipes events back as JSON-RPC notifications. For ACP clients, the same events map to ACP `session/update` notifications. Centralizing streaming enables daemon-level prompt caching, cost tracking, retry orchestration, and circuit breaking. It also eliminates the fake-streaming bug (Phase 0.1) by removing per-CLI provider connections.

### AD-4: Merge Small Packages, Keep Big Separate

Packages with <20 source files and no independent deployment boundary merge into a related package. Packages with substantial code stay separate. Everything currently stubbed gets implemented. This drives Phase 2: 27 → 25 packages.

### AD-5: Gateway as Independent Reusable Package, Hosted by Daemon

The `@agentsy/gateway` package remains a **standalone, reusable library** that any agentic platform can consume directly — it is not gutted into a thin IPC client. All routing logic (`ModelRegistry`, `ReplicaSelector`, `HealthRegistry`, `QuotaRegistry`, `CircuitBreaker`, `SelectionStrategy`) stays in the gateway package. The daemon *hosts* the gateway: it instantiates the gateway's classes, manages their lifecycle via `ServiceHost`, and adds `UnifiedDB`-backed persistence adapters that external consumers don't need. External consumers can use `@agentsy/gateway` as a programmatic library with in-memory defaults, or plug in their own persistence. An optional `GatewayClient` IPC shim is provided for daemon-connected consumers (CLI, TUI) but is not the only way to use the gateway. The gateway package also exposes a `ProviderEthicsPolicy` hook so external consumers can plug in their own ethics filtering (or use agentsy's `PROVIDER_ETHICS_POLICY` from Phase 20).

### AD-6: Daemon-Internal RAG

RAG becomes a daemon-internal service. The daemon runs background indexing, maintains the vector store, and serves retrieval requests via MCP. RAG requires persistent state (vector indices, embedding caches). Running it in the daemon enables background indexing without CLI startup, cross-session index reuse, and the wiki invariant (index synthesized pages, not raw events).

### AD-7: Background + Event-Driven Learning

The learning loop runs as a daemon background job on a configurable schedule AND is triggered by specific events (canary detection, observation threshold). Pure timer-based learning wastes resources when there's nothing to learn. Pure event-driven learning misses patterns that emerge over time. Combining both gives the best of both worlds.

### AD-8: Multi-Agent with Isolated Scopes → Server Mode

The daemon starts as a local multi-agent system with memory scope isolation. It evolves to support server deployment with authentication, rate limiting, and multi-tenancy. Multi-agent is needed immediately (coder + researcher + planner running simultaneously). Server deployment is a future goal that should inform architectural decisions but not block v1.

### AD-9: JSON-RPC 2.0 over Unix Sockets (NOT gRPC)

Internal daemon IPC uses JSON-RPC 2.0 over Unix domain sockets with newline-delimited JSON. gRPC with protobuf was evaluated and explicitly rejected. Both processes are local Node.js (no cross-language interop requirement), JSON-RPC is human-readable and debuggable with `socat`, requires no build step, supports streaming via notifications, gets type safety via Zod (runtime + compile-time, superior to protobuf's compile-time-only), aligns with ACP (same wire format internally and externally), and supports future remote access by serving the same method signatures over HTTP/WebSocket.

### AD-10: ACP (Agent Client Protocol) Agent

The Agentsy daemon becomes an ACP Agent. This replaces the planned custom VS Code extension. ACP is the emerging standard for editor-agent communication — Zed has native support, VS Code has the ACP Client extension, JetBrains is adding support. The daemon already speaks JSON-RPC; ACP is just another transport. The `@agentclientprotocol/sdk` `AgentSideConnection` class is ~500 lines versus ~5000 lines of custom extension code. Note: `@agentsy/vscode` is preserved as a published npm library consumed by third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat — ACP and `@agentsy/vscode` are complementary, not overlapping.

### AD-11: Subprocess Management with Stall Detection

The daemon manages child processes (tool executors, MCP servers, build runners) and forcefully terminates them when they stall or exceed resource limits. Stalled processes are a real operational problem — a hung MCP server blocks the agent indefinitely with no recovery path. MCP servers are long-lived children that need restart-on-stall. Tool execution needs resource limits. ACP terminal integration maps directly to subprocess management.

### AD-12: Folder-Based Scoping

Session scope is determined by the folder (working directory), not agent-specified. This aligns with ACP's `session/new` `cwd` parameter and the user's mental model of "I'm working in this project folder." Scope key format: `folder:[sha256-hash-of-absolute-path]`. ACP `additionalDirectories` supports multi-root workspaces. This drives Phase 10's multi-root workspace design and Phase 15's project auto-detection.

---

---
