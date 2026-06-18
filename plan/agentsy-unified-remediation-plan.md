# Agentsy: Unified Remediation & Implementation Plan

**Version**: 1.1 (synthesized — Phases 0–2 marked COMPLETE)
**Date**: 2026-06-17
**Repository**: `selfagency/agentsy`
**Branch reviewed**: `develop`
**Status**: ACTIVE — Phases 0, 1, 2 complete; Phase 3 onward is the active scope
**Code reference**: https://github.com/selfagency/agentsy (develop branch)

> **Update from v1.0**: Phases 0 (Critical Bug Fixes), 1 (Daemon Foundation), and 2 (Package Consolidation) from the v2.3 source plan are now COMPLETE on `develop`. Their deliverables (UnifiedDB, daemon IPC, Piscina pool, Honker queues, Bree scheduler, SubprocessManager, 25-package layout) are treated as existing infrastructure in all downstream phases. The active scope of this plan is Phases 3–18: ~100 story points over ~11 sprints.

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

**Scope of this plan**: 31 phases total (Phases 0–30). **Phases 0, 1, 2, 3, and 4 are COMPLETE** on `develop`. The **active scope is Phases 5–23 + Phases 29–30**: ~166.5 story points over ~11–12 sprints (~22–24 weeks) for a 3-person team. Each phase is independently shippable. Phase 29 (Package Boundary Cleanup) addresses the cross-dependency problem: 12 packages that should be independently consumable currently have hard `@agentsy/*` dependencies. Phase 30 (Environmental Impact Tracking) adds CO2 emissions and water consumption tracking to `@agentsy/tokenomics` — per-request and cumulative, with optimization savings reporting. 6 packages are already published to npm. Phase 5 keeps `@agentsy/gateway` as an **independent reusable package**. Phase 20 (Ethical Provider & Content Policy) now hard-blocks xAI on both content safety AND environmental racism grounds (illegal gas-turbine power plant polluting Black communities in Memphis), and warns against Meta (tent data centers with jet-engine gas turbines + LibGen training-data theft). **Phases 24–28 are DEFERRED** — designs complete (~93 SP combined, ~8 sprints). Buffer is 0 SP — recommend extending to Sprint 12 or descoping P3 items. See the standalone Langfuse plan at `/home/z/my-project/download/agentsy-langfuse-integration-plan.md` for full detail.

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
| 5 | Gateway Daemon Hosting & Independent Package (reusable library + UnifiedDB persistence + ethics hook) | v2.3 §7 (revised) | 6 | 2 | P1 | Phase 1 ✅ | — | Pending |
| 6 | Streaming Architecture | v2.3 §8 + comp #12 | 5 | 3 | P1 | Phase 5 | — | Pending |
| 7 | RAG as Daemon Service | v2.3 §9 | 4 | 3 | P2 | Phase 1 ✅ | (supports E-20, E-35) | Pending |
| 8 | Learning Loop & Background Jobs | v2.3 §10 | 3 | 4 | P2 | Phase 7 | — | Pending |
| 9 | Guardrails Behavioral Detectors (9 of 9) | gap §Phase 3 | 10 | 4–5 | P0 | Phase 4, Phase 10(SessionState) | E-6, E-7, E-8, E-9, E-10, E-11, E-12, E-13, E-14 | Pending |
| 10 | Guardrails Missing Surfaces & Interaction Safeguards + Ingress Scanning | gap §Phase 4 + §15.7 extension | 9 | 5 | P0 | Phase 4 | E-16, E-20, E-35, E-22(full) + ingress/MCP network-policy plumbing | Pending |
| 11 | Scope Accountability, Request Classification & High-Risk Domains | gap §Phase 5 | 5 | 6 | P1 | Phase 10 | E-15, E-19, E-28 | Pending |
| 12 | Guardrails Daemon Integration | gap §Phase 6 | 5 | 6 | P0 | Phase 1 ✅, Phase 4 | E-21 | Pending |
| 13 | Guardrails Metrics, Benchmark Suite, Release Gate + langeval Integration | gap §Phase 7 + §18.7 (langeval) | 11.5 | 7 | P0 | Phase 9, Phase 12, Phase 19, Phase 21 | E-25, E-26, E-27, E-14(full) + behavioral evals via langeval | Pending |
| 14 | ACP Agent, Multi-Agent + Event Ledger/Translators | v2.3 §11 + comp #2,#6,#8 + §19.10 (openclaw) | 12 | 7–8 | P1 (elevated) | Phase 5, Phase 6 | — + ACP depth | Pending |
| 15 | Project Auto-Detection & Bootstrap | v2.3 §13 | 7 | 8–9 | P2 | Phase 1 ✅, Phase 8 | — | Pending |
| 16 | Guardrails CLI, Hub & Polish | gap §Phase 8 | 5 | 9 | P1 | Phase 4 | E-17, E-24, E-29, E-30, E-31, E-32, E-33, E-34, E-36, E-37, E-43 | Pending |
| 17 | Competitive Gap-Closing Sprint | comp Top 15 (residual) | 12 | 9–10 | P2 | Phases 3, 6, 14 | — | Pending |
| 18 | Missing Capabilities | v2.3 §12 | 7 | 10–11 | P3 | Phase 14 | — | Pending |
| 19 | Langfuse Observability Integration | standalone plan | 6 | 1 (parallel) | P2 | Phase 1 ✅ | (observability gap) | Pending |
| 20 | Ethical Provider & Content Policy (block xAI, warn OpenAI/MS/Google/Amazon, style-mimicry block, Telegram removal) | ethical stance | 8 | 2–3 | P0 | Phase 4, Phase 5 | extends E-1; adds ETHICS.md §12–§15 | Pending |
| 21 | Docker-Based Optional Tooling (super-linter, presidio) | user request | 8 | 4–5 | P2 | Phase 1 ✅, Phase 12 | (PII + lint capability) | Pending |
| 22 | Web Fetcher HTML-to-Markdown (turndown) | user request | 2 | 6 | P3 | none | — | Pending |
| 23 | AFT, Magic Context & Task Board Integration Hardening | §25 audit | 10 | 7–8 | P1 | Phase 1 ✅, Phase 15 | (5 integration gaps) | Pending |
| 24 | Teams & Remote Daemon Deployment (Docker, OAuth, spend, audit, shared memory, Turso) | user request | ~40 | 13–16 (deferred) | P4 | All of Phases 3–23 + v1 stabilization | (server mode) | DEFERRED |
| 25 | MITM Egress Proxy for Subprocess Network Interception | §39 + Phase 10 §15.7 | ~12 | 17–18 (deferred) | P4 | Phase 10 §15.7, Phase 21, Phase 24.1 | (network inspection) | DEFERRED |
| 26 | A2A Protocol Support (federated agents, remote delegation) | §A.15 gemini-cli | ~15 | 19–20 (deferred) | P4 | Phase 14, Phase 23, Phase 24 | (A2A server + client) | DEFERRED |
| 27 | Self-Improvement & Skill Curation (curator, post-turn review, AST audit) | §A.14 hermes-agent | ~12 | 19–20 (deferred) | P4 | Phase 8, Phase 15, Phase 23 | (self-curating skills) | DEFERRED |
| 28 | Supply-Chain Security & Policy Attestation (OSV, Conseca, pinned deps, doctor, JSON Schema) | §A.13–A.15 | ~14 | 19–20 (deferred) | P4 | Phase 4, Phase 12, Phase 15, Phase 21 | (compliance posture) | DEFERRED |
| 29 | Package Boundary Cleanup & Composability (DI, peer deps, eliminate renderers/types, publish independent packages) | audit | 8 | 1–2 | P0 | Phase 2 ✅, Phase 4 ✅ | (cross-dependency problem) | Pending |
| 30 | Environmental Impact Tracking (CO2 + Water per request and cumulative) | research | 6 | 3–4 | P1 | Phase 4 ✅, Phase 5, Phase 29 | (extends tokenomics) | Pending |
| | **Active total (Phases 5–23 + 29–30)** | | **~166.5 SP** | 11–12 sprints | | | 43 of 43 findings + ethical commitments + ingress scanning + langeval eval + ACP depth + independent gateway + package composability + CO2/water tracking | |
| | **Deferred total (Phases 24–28)** | | **~93 SP** | ~8 sprints (post-v1) | | | server mode + network proxy + A2A + self-improvement + supply-chain | DEFERRED |

**Sprint capacity assumption**: 3-person team, 2-week sprints, ~20 SP/person/sprint after meetings/review/oncall = ~60 SP/sprint. Active scope (~166.5 SP) ≈ 2.8 sprints of pure capacity, spread across 11–12 calendar sprints. Buffer is 0 SP — see §30.4 burndown for descope guidance (recommend extending to Sprint 12 or descoping P3 items).

**Critical path (active)**: Phase 3 → Phase 4 → Phase 9 → Phase 13 (guardrails enforcement closure, ~7 sprints end-to-end). Secondary critical path: Phase 5 → Phase 6 → Phase 14 → Phase 18 (architecture completion, ~7 sprints end-to-end). Phase 19 (Langfuse) is off both critical paths — it's a 6 SP independent track that can start in Sprint 1 and finish by Sprint 2.

**Parallelism opportunities** (now unlocked by Phases 0–4 being done):
- Phase 5 (gateway hosting), Phase 7 (RAG), Phase 19 (Langfuse), and **Phase 29 (package boundary cleanup)** can all start in parallel in Sprint 1 — they have no interdependencies.
- Phase 29 should run in parallel with Phase 5 since both touch package boundaries — coordinate to avoid conflicts on `@agentsy/shared` and `@agentsy/gateway`.
- Phase 8 (learning loop) can run in parallel with Phase 9 (detectors) once Phase 7 is done.
- Phase 11 (scope/classification) can run in parallel with Phase 12 (daemon integration).
- Phase 15 (bootstrap) can run in parallel with Phases 16 and 17.

**Deliverables from completed phases** (referenced by downstream work):
- **Phase 0**: 9 bug fixes landed (`UniversalClient` true streaming, tool-call history preservation, hook short-circuit patch, gateway cost units, retry quota map, daemon restart, tool-call ID dedup, retry jitter, error classification).
- **Phase 1**: `@agentsy/daemon` package with `UnifiedDB` (~/.agentsy/agentsy.db via Honker), Piscina `AgentPool`, Honker durable queues, Bree scheduler, sqlite-worker, `SubprocessManager` (Pup pattern, stall detection), REST control API, JSON-RPC 2.0 over Unix sockets IPC server, ACP server stub, `TerminalBridge`, `ServiceHost` with sleep/wake, `AgentHost`, `ScopeManager` (folder-based), `Supervisor`, `DaemonConfig` schema, CLI integration.
- **Phase 2**: 25-package layout (workflows→orchestrator, types→shared, renderers→ui, scripts→root, mcp→daemon, connectors→daemon; vscode preserved). `pnpm install && pnpm build && pnpm test` green.
- **Phase 3**: Hook pipeline redesigned — middleware-style composition (transforms compose left-to-right), Claude-Code hook schema (command/prompt/http/agent with `if` filter), `failUnsettledTools` on provider error. `RuntimeHookRegistry.fire()` composes transforms; `stop` short-circuits with `stoppedBy`.
- **Phase 4**: Guardrails Honest Foundation — `EthicsRegistry` with all clauses from ETHICS.md/SAFETY.md/GOVERNANCE.md/constitution.md, `GuardrailDecisionReceipt` type (7 fields), expanded `GuardrailResult` union (6 states including `quarantine` and `allow-with-approval`), `JsonlAuditLogger` with PII/secret redaction, canonical `GuardrailsConfig`, honest README with Policy Enforcement Status table, `safety-changelog.md`, PR template with ethics review checklist. **Gate 1 LIFTED.**

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

## 5. Phase 0 — Critical Bug Fixes ✅ COMPLETE

**Status**: Landed on `develop` (branch `fix/phase0-critical-bugs` merged).
**Story points**: 3 (actuals reconciled at merge).
**What shipped** (treat as existing infrastructure; do not regress):

| # | Fix | File | Outcome |
|---|---|---|---|
| 0.1 | True streaming in `UniversalClient` | `packages/providers/src/universal-client/client.ts` | `stream()` is now an `AsyncGenerator<StreamChunk>`; first chunk yields before stream completes. |
| 0.2 | Tool calls preserved in conversation history | `packages/runtime/src/loop/simple-turn.ts` | Assistant message carries `tool_calls`; tool-result messages appended with `tool_call_id`. Multi-step tool use works. |
| 0.3 | Hook transform short-circuit patched | `packages/runtime/src/hooks/registry.ts` | Minimal patch logs collision warnings; full redesign deferred to Phase 3. |
| 0.4 | Gateway cost filter unit mismatch | `packages/gateway/src/selector.ts` | `maxUsdPer1KInput` × 1000 before comparing against `inputPer1MTokens`. 1000× bug closed. |
| 0.5 | Retry quota map per-provider | `packages/gateway/src/retry.ts` | `quotaRegistry` added to `RetryContext`; per-provider trackers used. |
| 0.6 | Daemon restart orphan server | `packages/memory/src/mcp/daemon.ts` | `runWithRestart()` recurses with new engine+server references; old refs dropped. |
| 0.7 | Tool-call ID dedup | `packages/core/src/stream-to-events.ts` | Uses provider-assigned `tc.id` instead of `tc.function.name`. |
| 0.8 | Retry jitter | `packages/core/src/retry/index.ts` | Full-jitter exponential backoff; `timer.unref()` for clean shutdown. |
| 0.9 | Provider error classification | `packages/gateway/src/retry.ts` | HTTP status codes checked first; specific regexes for rate-limit/quota/timeout/conn-error. |

**Downstream consumers**: all subsequent phases assume these fixes. Phase 3 will fully replace the Phase 0.3 minimal hook patch with the middleware composition model.

---

## 6. Phase 1 — Daemon Foundation ✅ COMPLETE

**Status**: Landed on `develop` (branch `feat/daemon-foundation` merged).
**Story points**: 13 (actuals reconciled at merge).
**What shipped** (treat as existing infrastructure):

- **`@agentsy/daemon`** package — central long-lived process.
- **`UnifiedDB`** (`packages/daemon/src/db/unified-db.ts`) — single `~/.agentsy/agentsy.db` opened via `@russellthehippo/honker-node`. Consolidates the prior memory.db, CortexKit context.db, and tokenomics session_ledger into one file with namespaced tables (memory_*, agentfs_*, context_*, tokenomics_*, daemon_*, tool_audit_*) plus Honker-managed tables (honker_queues, honker_jobs, honker_streams, honker_consumers, honker_schedule, honker_locks). WAL mode, native extension with `better-sqlite3` fallback. Migration is idempotent; old DBs moved to `.agentsy/migrated/`.
- **`AgentPool`** (`packages/daemon/src/agents/agent-pool.ts`) — Piscina-backed worker thread pool for agent computation. Configurable min/max threads, `AbortSignal` cancellation, `Piscina.move()` transferables.
- **`JobScheduler`** (`packages/daemon/src/jobs/scheduler.ts`) — Bree on top of Honker. Cron + interval + one-time scheduling, per-job timeout, `hasLagTime` overlap prevention, graceful drain on shutdown.
- **`SQLiteWorker`** (`packages/daemon/src/db/sqlite-worker.ts`) — all SQLite access offloaded to a dedicated worker thread; tag-template query API.
- **`SubprocessManager`** (`packages/daemon/src/processes/subprocess-manager.ts`) — Pup-inspired. Tracks child processes with `SubprocessSpec` and `SubprocessState`; stall detection (stdout/stderr activity monitor, `stallTimeoutMs`); memory-limit enforcement via periodic RSS; auto-restart for MCP servers; emits `process:stalled`, `process:killed`, `process:exited`, `process:restarted`.
- **REST control API** (`packages/daemon/src/api/rest.ts`) — remote control (Pup pattern).
- **IPC server + client** (`packages/daemon/src/ipc/`) — JSON-RPC 2.0 over Unix domain sockets, newline-delimited, Zod-validated. See Appendix D for protocol spec.
- **ACP server stub** (`packages/daemon/src/acp/`) — `@agentclientprotocol/sdk` `AgentSideConnection` wired; full method implementation in Phase 14.
- **`TerminalBridge`** — ACP terminal/create → SubprocessManager mapping.
- **`ServiceHost`** with sleep/wake lifecycle.
- **`AgentHost`** — multi-agent lifecycle on Piscina pool.
- **`ScopeManager`** — folder-based scoping (`folder:[sha256-hash-of-absolute-path]`).
- **`Supervisor`** — crash recovery, auto-restart.
- **`DaemonConfig`** schema (`packages/daemon/src/config/schema.ts`).
- **CLI integration** — `agentsy daemon start|stop|status|logs` (bgproc-inspired).

**Dependencies added**: `piscina@^4`, `bree@^9`, `@russellthehippo/honker-node@^0.x`, `better-sqlite3@^11`.

**Downstream consumers**:
- Phase 5 moves gateway routing into the daemon's `RoutingService`.
- Phase 6 owns all provider connections in the daemon's `StreamManager`.
- Phase 7 runs RAG as a daemon service on `UnifiedDB`.
- Phase 12 wires `@agentsy/guardrails` into the daemon's IPC handlers and persists audit receipts to `UnifiedDB.guardrail_decisions`.
- Phase 14 fills in the ACP server stub.
- Phase 15 hosts `BootstrapService` in the daemon and seeds Magic Context compartments in `UnifiedDB.context_*`.

---

## 7. Phase 2 — Package Consolidation ✅ COMPLETE

**Status**: Landed on `develop` (branch `refactor/package-consolidation` merged).
**Story points**: 2 (actuals reconciled at merge).
**What shipped**: 27 → 25 packages. `pnpm install && pnpm build && pnpm test` green.

| Merged | Into | Rationale |
|---|---|---|
| `workflows` (1 file, plan-only) | `orchestrator` | Workflows are orchestrated task sequences |
| `types` (27) | `shared` | Cross-package types belong with shared utilities; `@agentsy/shared` already hosts CortexKit context tables |
| `renderers` (120) | `ui` | Codebase rename `renderers`→`ui` already landed; 120-file Ink/TUI tree now lives under `packages/ui/src/renderers/` |
| `scripts` (20) | root `scripts/` | Build/release scripts don't need a package |
| `mcp` (11) | `daemon` | MCP server is daemon-hosted |
| `connectors` (13) | `daemon` | Third-party connectors are daemon-hosted |

**Preserved**: `@agentsy/vscode` (75 files) — published npm library consumed by third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat. ACP (agent–editor communication) and `@agentsy/vscode` (provider↔Copilot Chat integration) are complementary, not overlapping.

**Post-consolidation layout** (25 packages + root scripts):
```
packages/
├── daemon/        ← Central process (absorbs mcp, connectors)
├── core/          ← Stream processing, SSE, tool calls, retry
├── providers/     ← LLM provider adapters (14 providers)
├── gateway/       ← Becomes thin daemon client (Phase 5)
├── memory/        ← Cognitive memory engine
├── orchestrator/  ← Absorbs workflows; council, hooks, routing
├── runtime/       ← Agent turn loop, hooks execution
├── tokenomics/    ← Token management, quotas, frustration signals
├── shared/        ← Absorbs types; shared type definitions and utilities
├── ui/            ← Absorbs renderers; Ink/TUI rendering + UI store/bridge
├── models/        ← Model selector/profiles
├── tools/         ← Tool registry + builtins
├── secrets/       ← Secret injection/providers
├── guardrails/    ← Safety/policy/PII
├── observability/ ← OTel/tracing/cost
├── session/       ← Session management
├── retrieval/     ← Search/indexing (Phase 7 moves logic into daemon)
├── testing/       ← Test helpers/MSW/aimock
├── agents/        ← Agent runtime/specs
├── plugins/       ← Plugin system
├── prompts/       ← Prompt layering
├── vscode/        ← Copilot Chat integration library (published)
├── cli/           ← Thin daemon client + TUI
└── (bootstrap/ ← NEW in Phase 15)
```

**Downstream consumers**: All subsequent phases operate on the 25-package layout. Phase 15 adds `@agentsy/bootstrap` as the 26th package.

---

## 8. Phase 3 — Hook Pipeline Redesign + Claude-Code Hook Schema ✅ COMPLETE

**Priority**: P1 — Sprint 1
**Story points**: 5
**Branch**: `feat/hook-pipeline-redesign`
**Depends on**: Phase 0 ✅ (the minimal hook patch from 0.3 will be replaced)
**Unblocks**: Phase 4 (guardrails honest foundation needs the new composition model to thread `GuardrailDecisionReceipt`s), Phase 14 (ACP agent needs hook-driven tool interception), Phase 17 (competitive items build on this hook schema)
**Closes competitive gaps**: #1 (Claude-Code hook schema), #4 (failUnsettledTools from opencode)

### 8.1 Current Problem

The Phase 0.3 patch stopped the silent data loss but kept the short-circuit semantics. The hook registry's `fire()` method still returns immediately on the first `transform` result. This means a guardrail hook that sanitizes the prompt prevents the memory hook from injecting context; a memory hook that injects context prevents guardrails from checking it; only the first-registered transform wins. The Phase 0.3 patch logs a warning when this happens but cannot prevent it without a redesign.

### 8.2 New Design: Middleware-Style Composition

Replace the short-circuit `fire()` with a Koa/Express-style middleware pipeline. Transforms compose left-to-right (lower priority first). A `stop` result short-circuits; `continue` and `transform` both pass through to the next handler.

```typescript
// packages/runtime/src/hooks/registry.ts (REDESIGNED)

export type HookTransformFn<T> = (payload: T) => T | Promise<T>;
export type HookResult<T> =
  | { action: 'continue' }
  | { action: 'stop'; reason?: string }
  | { action: 'transform'; transform: HookTransformFn<T> };

export interface HookHandler<T = unknown> {
  id: string;
  event: HookEventName;
  priority: number;               // Lower = runs first
  handler: (payload: T) => HookResult<T> | Promise<HookResult<T>>;
}

export class RuntimeHookRegistry {
  private handlers = new Map<string, HookHandler[]>();

  /**
   * Fire an event through the hook pipeline.
   * Transforms compose left-to-right (lower priority first).
   * A 'stop' result short-circuits the pipeline.
   */
  async fire<T extends HookEventName>(
    event: T,
    payload: HookContext<T>
  ): Promise<{ payload: HookContext<T>; stopped: boolean; stoppedBy?: string }> {
    const handlers = this.getHandlersForEvent(event);
    let currentPayload = payload;
    const transformChain: Array<{ id: string; fn: HookTransformFn<HookContext<T>> }> = [];

    for (const handler of handlers) {
      try {
        const result = await handler.handler(currentPayload);

        if (result.action === 'stop') {
          return { payload: currentPayload, stopped: true, stoppedBy: handler.id };
        }

        if (result.action === 'transform') {
          // Apply the transform immediately to update payload for subsequent hooks
          currentPayload = await result.transform(currentPayload);
          transformChain.push({ id: handler.id, fn: result.transform });
        }
        // 'continue' — pass through
      } catch (error) {
        this.logger.error(`Hook "${handler.id}" threw on event "${event}"`, error);
        // Continue to next handler — one bad hook doesn't break the chain
      }
    }

    return { payload: currentPayload, stopped: false };
  }
}
```

### 8.3 Composition Example: Guardrail + Memory

With the new composition model, the memory pre-turn hook and guardrail hook both transform the payload, and their transforms compose:

```typescript
// Memory pre-turn hook (priority 20 — runs after guardrails)
export function createMemoryPreTurnHook(deps: MemoryHookDeps): HookHandler {
  return {
    id: 'memory-pre-turn',
    event: 'UserPromptSubmit',
    priority: 20,
    handler: async (payload) => {
      const memories = await deps.memory.recall({
        query: payload.prompt,
        scope: payload.scope,
        limit: 5,
        minRelevance: deps.minRelevance ?? 0.6,
      });
      if (memories.length === 0) return { action: 'continue' };
      return {
        action: 'transform',
        transform: (p) => ({
          ...p,
          prompt: p.prompt + '\n\n' + formatMemoryContext(memories),
          memoryContext: memories,
        }),
      };
    },
  };
}

// Guardrail hook (priority 10 — runs first)
export function createGuardrailHook(deps: GuardrailHookDeps): HookHandler {
  return {
    id: 'guardrail',
    event: 'UserPromptSubmit',
    priority: 10,
    handler: async (payload) => {
      const violations = await deps.guardrails.check(payload.prompt);
      if (violations.length === 0) return { action: 'continue' };
      if (violations.some(v => v.severity === 'block')) {
        return { action: 'stop', reason: 'Guardrail blocked prompt' };
      }
      return {
        action: 'transform',
        transform: (p) => ({ ...p, prompt: deps.guardrails.sanitize(p.prompt, violations) }),
      };
    },
  };
}
```

**Execution order** for `UserPromptSubmit`:
1. Guardrail (priority 10) checks and potentially sanitizes the prompt.
2. Memory pre-turn (priority 20) appends memory context to the (possibly sanitized) prompt.
3. Both transforms compose — the model sees a sanitized prompt with memory context.

### 8.4 Port Claude-Code Hook Schema (Competitive #1)

Adopt Claude-Code's hook schema: command/prompt/http/agent hook types with an `if` filter, `async`/`asyncRewake`/`once` flags. The `if` filter uses permission-rule syntax (e.g. `"Bash(git *)"`) so a hook is only spawned when the matched tool fires — this avoids unnecessary hook spawns for unrelated events.

```typescript
// packages/runtime/src/hooks/schema.ts (NEW)

export interface HookConfig {
  id: string;
  type: 'command' | 'prompt' | 'http' | 'agent';
  event: HookEventName;
  if?: string;             // Permission-rule filter, e.g. "Bash(git *)"
  priority?: number;       // Default 50
  async?: boolean;         // Fire-and-forget; don't block pipeline
  asyncRewake?: boolean;   // Async, but re-awaken pipeline on completion
  once?: boolean;          // Only fire once per session
  command?: string;        // For type: 'command' — shell command to exec
  prompt?: string;         // For type: 'prompt' — prompt to inject
  url?: string;            // For type: 'http' — webhook URL
  agentId?: string;        // For type: 'agent' — subagent to spawn
}
```

Hooks load from `.agentsy/hooks/*.yaml` (project-local) and `~/.agentsy/hooks/*.yaml` (user-global). The hook registry merges by ID, with project-local taking precedence.

### 8.5 failUnsettledTools on Provider Error (Competitive #4)

When a provider stream errors mid-turn, any pending tool calls are orphaned. Port opencode's `failUnsettledTools` pattern: on stream error, publish a synthetic `tool_call_update` with `status: 'failed'` and the error message for every pending tool call. This prevents the agent from hanging waiting for tool results that will never arrive.

```typescript
// packages/runtime/src/loop/stream-error-handler.ts (NEW)

export async function failUnsettledTools(
  pendingToolCalls: Map<string, PendingToolCall>,
  error: unknown,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  for (const [toolCallId, pending] of pendingToolCalls) {
    emit({
      type: 'tool_call_update',
      toolCallId,
      status: 'failed',
      output: `Provider stream error: ${error instanceof Error ? error.message : String(error)}`,
    });
    pendingToolCalls.delete(toolCallId);
  }
}
```

Wire this into the stream error handler in `packages/runtime/src/loop/simple-turn.ts`.

### 8.6 Tests

- Unit: `fire()` composes two `transform` handlers in priority order; `stop` short-circuits; thrown handler doesn't break the chain.
- Unit: Claude-Code hook schema parser accepts all 4 hook types and the `if` filter.
- Unit: `failUnsettledTools` emits a `failed` update for every pending tool call.
- Integration: guardrail + memory hooks compose — model sees sanitized prompt with memory context.
- Integration: stream error mid-turn produces `tool_call_update` events for orphaned tools.

### 8.7 Verification

- [ ] `RuntimeHookRegistry.fire()` composes transforms left-to-right
- [ ] `stop` short-circuits the pipeline and returns `stoppedBy`
- [ ] Claude-Code hook schema parser handles command/prompt/http/agent types
- [ ] `if` filter prevents unnecessary hook spawns
- [ ] `failUnsettledTools` fires on stream error
- [ ] All existing tests pass (no regressions)
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---


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

## 10. Phase 5 — Gateway Daemon Hosting & Independent Package

**Priority**: P1 — Sprint 2
**Story points**: 6 (increased from 5 to account for the persistence-interface + public-API + IPC-shim work)
**Branch**: `feat/gateway-daemon-hosting`
**Depends on**: Phase 1 ✅ (daemon foundation; `ServiceHost` lifecycle, `UnifiedDB`)
**Unblocks**: Phase 6 (streaming needs routing decisions in the daemon), Phase 14 (ACP agent needs routing), Phase 20 (provider-ethics policy hooks into the gateway's `RoutingRequest` filter chain)
**Closes**: nothing from the guardrails gap analysis; structurally fixes the Phase 0.5 quota map bug permanently

### 10.1 Design principle: gateway is a library, daemon is a host

The `@agentsy/gateway` package is **not** gutted into a thin IPC client. It remains a standalone, reusable library that any agentic platform can consume directly. The daemon *hosts* the gateway — it instantiates the gateway's routing classes, manages their lifecycle, and adds `UnifiedDB`-backed persistence. External consumers can use the gateway without the daemon, with in-memory defaults.

**Three consumer profiles**:

| Consumer | How they use the gateway | Persistence | Ethics policy |
|---|---|---|---|
| **agentsy daemon** (internal) | Daemon's `RoutingService` instantiates gateway classes + plugs in `UnifiedDB` adapters | `UnifiedDB` (survives restarts) | agentsy's `PROVIDER_ETHICS_POLICY` (Phase 20) |
| **agentsy CLI/TUI** (internal) | Optional `GatewayClient` IPC shim → calls daemon over Unix socket | Delegated to daemon | Delegated to daemon |
| **External platform** (e.g. another agentic framework) | Imports `@agentsy/gateway` as a library; calls `createGateway()` programmatically | In-memory (default) or consumer-supplied adapter | Consumer-supplied or none |

### 10.2 Current Architecture

```
CLI → Runtime → Gateway → Providers → LLM APIs
                  ↑
           (routing, health,
            quota, circuit breaker)
```

Every CLI invocation instantiates its own gateway. Health probes run per-process. Quota tracking is per-process. There's no shared state across CLI invocations.

### 10.3 Target Architecture

```
┌─────────────────────────────────────────────────────┐
│ @agentsy/gateway (independent reusable package)     │
│                                                      │
│  createGateway(options) → Gateway                   │
│  ├── ModelRegistry                                   │
│  ├── ReplicaRegistry + ReplicaSelector              │
│  ├── HealthRegistry                                  │
│  ├── QuotaRegistry (per-provider trackers)           │
│  ├── CircuitBreaker                                  │
│  ├── SelectionStrategy (pluggable)                   │
│  ├── ProviderEthicsPolicyHook (pluggable)            │
│  └── PersistenceAdapter (pluggable; in-memory default)│
│                                                      │
│  Public API:                                         │
│    gateway.selectModel(request) → RoutingDecision    │
│    gateway.spillover(decision) → RoutingDecision|null│
│    gateway.registerProvider(provider)                │
│    gateway.health.report() → HealthReport            │
└────────────────────────┬────────────────────────────┘
                         │ used by
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────────────┐
   │ Daemon   │  │ CLI/TUI  │  │ External         │
   │ Routing  │  │ Gateway  │  │ Consumer         │
   │ Service  │  │ Client   │  │ (programmatic)   │
   │ (hosts + │  │ (IPC     │  │ (imports gateway │
   │  UnifiedDB│  │  shim)   │  │  as library)     │
   │  adapters)│  │          │  │                  │
   └──────────┘  └──────────┘  └──────────────────┘
```

### 10.4 Gateway package — public API and persistence interface

The gateway package gains a clean `createGateway()` factory and a `PersistenceAdapter` interface. The routing classes themselves don't change — they gain constructor-injected persistence hooks.

```typescript
// packages/gateway/src/index.ts (PUBLIC API)

export interface GatewayOptions {
  /** Persistence adapter (default: InMemoryPersistenceAdapter). */
  persistence?: PersistenceAdapter;
  /** Selection strategy (default: ScoreBasedStrategy). */
  strategy?: SelectionStrategy;
  /** Provider ethics policy hook (default: none; agentsy daemon plugs in Phase 20). */
  ethicsPolicy?: ProviderEthicsPolicyHook;
  /** Initial model definitions. */
  models?: ModelEntry[];
  /** Logger. */
  logger?: Logger;
}

export interface PersistenceAdapter {
  // Quota state — survives restarts when backed by UnifiedDB
  saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void>;
  loadQuotaState(providerId: string): Promise<QuotaSnapshot | null>;
  // Health history — for trend analysis
  saveHealthRecord(providerId: string, record: HealthRecord): Promise<void>;
  loadHealthHistory(providerId: string, since: Date): Promise<HealthRecord[]>;
  // Routing decisions — for audit
  saveRoutingDecision(decision: RoutingDecision): Promise<void>;
  // Circuit breaker state
  saveCircuitBreakerState(providerId: string, state: CircuitBreakerState): Promise<void>;
  loadCircuitBreakerState(providerId: string): Promise<CircuitBreakerState | null>;
}

export interface ProviderEthicsPolicyHook {
  /** Called during selectModel after filtering but before selection.
   *  Returns filtered candidates + any acknowledgement-required flags. */
  filter(candidates: Replica[], request: RoutingRequest): {
    candidates: Replica[];
    blockedProviders: string[];
    requiresAcknowledgement: string[];
  };
}

export function createGateway(options?: GatewayOptions): Gateway {
  const persistence = options?.persistence ?? new InMemoryPersistenceAdapter();
  const strategy = options?.strategy ?? new ScoreBasedStrategy();
  const ethicsPolicy = options?.ethicsPolicy;

  const modelRegistry = new ModelRegistry(persistence);
  const replicaRegistry = new ReplicaRegistry(persistence);
  const healthRegistry = new HealthRegistry(persistence);
  const quotaRegistry = new QuotaRegistry(persistence);  // Per-provider
  const circuitBreaker = new CircuitBreaker(persistence);

  return new Gateway({
    modelRegistry, replicaRegistry, healthRegistry,
    quotaRegistry, circuitBreaker, strategy, ethicsPolicy, persistence,
  });
}

export class Gateway {
  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    // 1. Filter by tier, capabilities, cost (units now correct post-Phase-0.4)
    let candidates = this.modelRegistry.filter({
      tier: request.tier,
      capabilities: request.capabilities,
      maxCostPer1MInput: request.maxCostPer1KInput
        ? request.maxCostPer1KInput * 1000 : undefined,
    });

    // 2. Apply ethics policy (Phase 20 hook — pluggable, optional)
    if (this.ethicsPolicy) {
      const ethicsResult = this.ethicsPolicy.filter(candidates, request);
      candidates = ethicsResult.candidates;
      // Blocked providers removed; acknowledgement flags attached to decision
    }

    // 3. Get healthy replicas with per-provider quota (fixes E-0.5 structurally)
    const healthy = this.healthRegistry.healthy(candidates);
    const quotaOk = healthy.filter(r =>
      this.quotaRegistry.getTracker(r.providerId)?.canRequest() ?? true
    );

    // 4. Score-based selection
    const decision = this.strategy.select(quotaOk, request);

    // 5. Persist decision for audit
    await this.persistence.saveRoutingDecision(decision);

    return decision;
  }

  async spillover(routing: RoutingDecision): Promise<RoutingDecision | null> {
    // Same-tier spillover when the selected replica fails
  }

  async registerProvider(provider: ProviderConfig): Promise<void> {
    // Register a provider + its replicas
  }

  async healthReport(): Promise<HealthReport> {
    // Aggregate health status for diagnostics
  }
}
```

### 10.5 Daemon's RoutingService — hosts the gateway + plugs in UnifiedDB

The daemon's `RoutingService` is a thin host that instantiates `createGateway()` with `UnifiedDB`-backed persistence and agentsy's `PROVIDER_ETHICS_POLICY`. It does **not** reimplement routing logic.

```typescript
// packages/daemon/src/services/routing-service.ts

import { createGateway, type Gateway, type PersistenceAdapter } from '@agentsy/gateway';

export class RoutingService implements Service {
  readonly name = 'routing';
  private _state: ServiceState = 'stopped';
  private gateway: Gateway | null = null;

  constructor(private deps: {
    db: UnifiedDB;
    serviceHost: ServiceHost;
    ethicsPolicy?: ProviderEthicsPolicyHook;  // From Phase 20
  }) {}

  async start(): Promise<void> {
    this._state = 'starting';

    // Create UnifiedDB-backed persistence adapter
    const persistence = new UnifiedDBPersistenceAdapter(this.deps.db);

    // Instantiate the gateway library with daemon-backed persistence + ethics policy
    this.gateway = createGateway({
      persistence,
      ethicsPolicy: this.deps.ethicsPolicy,  // Phase 20's PROVIDER_ETHICS_POLICY
    });

    // Load model definitions from config
    await this.loadModels();

    // Restore quota + circuit-breaker state from UnifiedDB
    await this.restoreState();

    this._state = 'active';
  }

  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    this.deps.serviceHost.touch('routing');
    return this.gateway!.selectModel(request);
  }

  async spillover(routing: RoutingDecision): Promise<RoutingDecision | null> {
    return this.gateway!.spillover(routing);
  }

  async sleep(): Promise<void> { this._state = 'sleeping'; }
  async wakeup(): Promise<void> { this._state = 'active'; }

  async stop(): Promise<void> {
    // Flush state to UnifiedDB
    await this.gateway?.flush();
    this._state = 'stopped';
  }

  get gatewayInstance(): Gateway | null {
    // Exposed for other daemon services that need direct gateway access
    return this.gateway;
  }
}
```

```typescript
// packages/daemon/src/services/unified-db-persistence-adapter.ts (NEW)

import type { PersistenceAdapter } from '@agentsy/gateway';

export class UnifiedDBPersistenceAdapter implements PersistenceAdapter {
  constructor(private db: UnifiedDB) {}

  async saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void> {
    await this.db.execute(
      `INSERT INTO daemon_quota_state (provider_id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET state_json = ?, updated_at = ?`,
      [providerId, JSON.stringify(state), new Date().toISOString(),
       JSON.stringify(state), new Date().toISOString()]
    );
  }

  async loadQuotaState(providerId: string): Promise<QuotaSnapshot | null> {
    const row = await this.db.querySingle<{ state_json: string }>(
      'SELECT state_json FROM daemon_quota_state WHERE provider_id = ?', [providerId]
    );
    return row ? JSON.parse(row.state_json) : null;
  }

  async saveRoutingDecision(decision: RoutingDecision): Promise<void> {
    await this.db.execute(
      `INSERT INTO daemon_routing_decisions (id, decision_json, timestamp)
       VALUES (?, ?, ?)`,
      [decision.id, JSON.stringify(decision), new Date().toISOString()]
    );
  }

  // ... other methods
}
```

### 10.6 Optional GatewayClient IPC shim (for CLI/TUI)

For agentsy's own CLI and TUI that connect to the daemon, an optional `GatewayClient` provides the same `Gateway` interface but delegates to the daemon over IPC. This is a convenience — external consumers don't use it.

```typescript
// packages/gateway/src/client.ts (NEW — optional IPC shim)

import type { Gateway, RoutingRequest, RoutingDecision } from './index.js';

export class GatewayClient implements Gateway {
  constructor(private ipc: IPCClient) {}

  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    return this.ipc.call('routing.selectModel', request);
  }

  async spillover(routing: RoutingDecision): Promise<RoutingDecision | null> {
    return this.ipc.call('routing.spillover', routing);
  }

  async registerProvider(provider: ProviderConfig): Promise<void> {
    return this.ipc.call('routing.registerProvider', provider);
  }

  async healthReport(): Promise<HealthReport> {
    return this.ipc.call('routing.healthReport');
  }
}

/** Create a GatewayClient connected to a running daemon. */
export function connectToDaemon(socketPath: string): GatewayClient {
  const ipc = new IPCClient({ socketPath });
  return new GatewayClient(ipc);
}
```

### 10.7 External consumer usage (the point of keeping it independent)

```typescript
// Example: another agentic platform uses @agentsy/gateway as a library

import { createGateway } from '@agentsy/gateway';

// Minimal usage — in-memory persistence, no ethics policy
const gateway = createGateway({
  models: [
    { id: 'gpt-4o', provider: 'openai', tier: 'frontier', pricing: { inputPer1MTokens: 2.5, outputPer1MTokens: 10 } },
    { id: 'claude-sonnet-4', provider: 'anthropic', tier: 'frontier', pricing: { inputPer1MTokens: 3, outputPer1MTokens: 15 } },
  ],
});

const decision = await gateway.selectModel({
  tier: 'frontier',
  capabilities: ['tool-use'],
  maxCostPer1KInput: 0.005,
});

console.log(`Selected: ${decision.replica.modelId} on ${decision.replica.providerId}`);

// With custom persistence + custom ethics policy
const gateway2 = createGateway({
  persistence: new MyPostgresPersistenceAdapter(),
  ethicsPolicy: {
    filter(candidates, request) {
      // Block a provider, require ack for another
      const blocked = candidates.filter(r => r.providerId !== 'xai');
      return { candidates: blocked, blockedProviders: ['xai'], requiresAcknowledgement: [] };
    },
  },
});
```

### 10.8 Per-Provider Quota Registry

The Phase 0.5 fix added `quotaRegistry` to `RetryContext`. This phase makes `QuotaRegistry` a first-class gateway component with pluggable persistence. Each provider gets its own `QuotaTracker` instance. When the daemon hosts the gateway, quota state persists to `UnifiedDB.daemon_quota_state` and survives daemon restarts. When an external consumer uses the gateway directly, quota state is in-memory (lost on process restart) unless they supply a `PersistenceAdapter`.

### 10.9 Gateway package README and npm publication

The gateway package gets a proper README documenting:
1. **Quick start** for external consumers (the example in §10.7)
2. **PersistenceAdapter interface** for custom persistence
3. **ProviderEthicsPolicyHook** for custom ethics filtering
4. **SelectionStrategy** for custom routing strategies
5. **Daemon hosting** (how agentsy uses it — as a reference for other platforms that want daemon-hosted routing)

The package is published to npm as `@agentsy/gateway` with stable semver. Breaking changes to the public API (`createGateway`, `Gateway`, `PersistenceAdapter`, `ProviderEthicsPolicyHook`, `SelectionStrategy`) require a major version bump.

### 10.10 Tests

- Unit: `Gateway.selectModel` filters by tier, capabilities, cost (per-1M units).
- Unit: per-provider `QuotaTracker` returns independent snapshots.
- Unit: `PersistenceAdapter` interface — in-memory default works; `UnifiedDBPersistenceAdapter` saves/loads correctly.
- Unit: `ProviderEthicsPolicyHook` filters candidates correctly.
- Unit: External consumer usage (§10.7 example) works with in-memory defaults.
- Integration: Daemon's `RoutingService` instantiates gateway with `UnifiedDBPersistenceAdapter`; routing decision logged in `UnifiedDB.daemon_routing_decisions`.
- Integration: daemon restart preserves quota state via `UnifiedDBPersistenceAdapter`.
- Integration: `GatewayClient` IPC shim calls daemon over Unix socket.

### 10.11 Verification

- [ ] `@agentsy/gateway` package is independently consumable (no daemon dependency required)
- [ ] `createGateway()` factory works with in-memory defaults
- [ ] `PersistenceAdapter` interface defined; `InMemoryPersistenceAdapter` is the default
- [ ] `UnifiedDBPersistenceAdapter` saves/loads quota state, health history, routing decisions, circuit-breaker state
- [ ] `ProviderEthicsPolicyHook` interface defined; pluggable via `GatewayOptions.ethicsPolicy`
- [ ] Daemon's `RoutingService` instantiates `createGateway()` with `UnifiedDBPersistenceAdapter` + Phase 20 ethics policy
- [ ] Daemon's `RoutingService` does NOT reimplement routing logic (delegates to `Gateway`)
- [ ] `GatewayClient` IPC shim provides same interface as `Gateway` over IPC
- [ ] `connectToDaemon(socketPath)` convenience factory works
- [ ] External consumer example (§10.7) works as documented
- [ ] Gateway package README published with quick start, API reference, and extension points
- [ ] Per-provider `QuotaRegistry` persists to `UnifiedDB` when daemon-hosted; in-memory when standalone
- [ ] Routing decisions logged for audit when daemon-hosted
- [ ] Daemon restart preserves quota state
- [ ] `pnpm check-types && pnpm lint && pnpm test` green across both `@agentsy/gateway` and `@agentsy/daemon`

---

## 11. Phase 6 — Streaming Architecture

**Priority**: P1 — Sprint 3
**Story points**: 5
**Branch**: `feat/streaming-architecture`
**Depends on**: Phase 5 (routing in daemon)
**Unblocks**: Phase 14 (ACP agent needs streaming), Phase 17 (competitive streaming items)
**Closes competitive gaps**: #12 (wrapSSE idle timeout from opencode), streaming secret masking from agent-zero, failUnsettledTools integration with the new stream manager

### 11.1 Architecture

The daemon owns all LLM provider connections. Clients request streams via IPC; the daemon pipes events back as JSON-RPC notifications. For ACP clients, the same events map to ACP `session/update` notifications.

```
Client (CLI/TUI/ACP) ──stream.start──▶ Daemon.StreamManager
                                            ↓
                                       Provider → LLM API
                                            ↓
Client ◀──stream.chunk (JSON-RPC notification)─── Daemon.StreamManager
Client ◀──session/update (ACP notification)────── Daemon.StreamManager
```

### 11.2 StreamManager

```typescript
// packages/daemon/src/services/stream-manager.ts

export class StreamManager implements Service {
  readonly name = 'stream';
  private activeStreams = new Map<string, ActiveStream>();

  async startStream(request: StreamRequest): Promise<{ streamId: string }> {
    const streamId = `s-${randomUUID()}`;
    const routing = await this.routingService.selectModel(request.routing);
    const provider = this.providerRegistry.get(routing.replica.providerId);

    const stream = {
      id: streamId,
      routing,
      abortController: new AbortController(),
      pendingToolCalls: new Map<string, PendingToolCall>(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
    this.activeStreams.set(streamId, stream);

    // Kick off the stream in the background; emit notifications as chunks arrive
    this.pipeStream(stream, provider, request.messages).catch(err => {
      this.handleStreamError(stream, err);
    });

    return { streamId };
  }

  private async pipeStream(stream: ActiveStream, provider: Provider, messages: Message[]) {
    const idleTimeout = this.config.idleTimeoutMs ?? 30_000;
    try {
      const chunkStream = provider.stream(messages, { signal: stream.abortController.signal });

      for await (const chunk of wrapSSE(chunkStream, { idleTimeout })) {
        // Streaming secret masking: scrub secrets across chunk boundaries
        const masked = this.secretsFilter.feed(chunk);

        // Emit to IPC clients
        this.ipc.notify('stream.chunk', { streamId: stream.id, chunk: masked });

        // Emit to ACP clients (mapped to session/update)
        this.acpBridge.emitChunk(stream.id, masked);

        // Track tool calls for failUnsettledTools
        if (masked.type === 'tool_call_start') {
          stream.pendingToolCalls.set(masked.toolCallId, { ... });
        } else if (masked.type === 'tool_call_end') {
          stream.pendingToolCalls.delete(masked.toolCallId);
        }
      }

      this.ipc.notify('stream.end', { streamId: stream.id, usage: stream.usage });
    } catch (err) {
      this.handleStreamError(stream, err);
    }
  }

  private async handleStreamError(stream: ActiveStream, error: unknown) {
    // failUnsettledTools (Phase 3 #8.5) — emit failed updates for orphaned tool calls
    await failUnsettledTools(stream.pendingToolCalls, error, event =>
      this.ipc.notify('stream.chunk', { streamId: stream.id, chunk: event })
    );

    this.ipc.notify('stream.error', { streamId: stream.id, error: serializeError(error) });
    this.activeStreams.delete(stream.id);
  }

  cancelStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.abortController.abort();
      this.activeStreams.delete(streamId);
    }
  }
}
```

### 11.3 wrapSSE Idle Timeout (Competitive #12 from opencode)

Per-read timeout that aborts on idle. Prevents hung connections when a provider's SSE stream stalls without closing.

```typescript
// packages/daemon/src/streaming/wrap-sse.ts (NEW)

export async function* wrapSSE<T>(
  source: AsyncIterable<T>,
  options: { idleTimeout: number; signal?: AbortSignal },
): AsyncGenerator<T> {
  let timer: NodeJS.Timeout | undefined;
  const abort = new AbortController();

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => abort.abort(), options.idleTimeout);
  };

  try {
    for await (const chunk of source) {
      resetTimer();
      yield chunk;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

### 11.4 Streaming Secret Masking (from agent-zero)

`StreamingSecretsFilter` masks secrets across chunk boundaries. The previous Phase 0 `SecretDetectionScanner` runs on complete strings; streaming needs a stateful filter that handles the case where a secret is split across two chunks.

```typescript
// packages/daemon/src/streaming/secrets-filter.ts (NEW)

export class StreamingSecretsFilter {
  private buffer = '';
  private readonly secretPatterns: RegExp[];

  feed(chunk: StreamChunk): StreamChunk {
    if (chunk.type !== 'content') return chunk;
    this.buffer += chunk.text;
    const masked = this.maskSecrets(this.buffer);
    // Keep the last N characters in the buffer to handle secrets split across chunks
    const keepLength = this.maxSecretLength;
    const emitLength = Math.max(0, masked.length - keepLength);
    const emit = masked.slice(0, emitLength);
    this.buffer = masked.slice(emitLength);
    return { ...chunk, text: emit };
  }

  flush(): StreamChunk | null {
    if (!this.buffer) return null;
    const masked = this.maskSecrets(this.buffer);
    this.buffer = '';
    return { type: 'content', text: masked };
  }
}
```

### 11.5 ACP Notification Mapping

Map daemon stream events to ACP `session/update` notifications:

| Daemon Event | ACP `session/update` Type | Content |
|---|---|---|
| `stream.chunk` (content) | `agent_message_chunk` | `{ content: string }` |
| `stream.chunk` (thinking) | `agent_thought_chunk` | `{ content: string }` |
| `stream.chunk` (tool_call_start) | `tool_call` | `{ toolCallId, toolName, arguments, status: "running" }` |
| `stream.chunk` (tool_call_end) | `tool_call_update` | `{ toolCallId, status, output }` |
| `stream.end` (usage) | `usage_update` | `{ usage: { inputTokens, outputTokens, costUsd } }` |

### 11.6 Tests

- Unit: `StreamManager.startStream` emits `stream.chunk` notifications in order.
- Unit: `wrapSSE` aborts after `idleTimeout` ms of no chunks.
- Unit: `StreamingSecretsFilter` masks a secret split across two chunks.
- Unit: `failUnsettledTools` fires on stream error (integration with Phase 3).
- Integration: CLI → daemon → provider → stream back to CLI; first chunk arrives before stream end.

### 11.7 Verification

- [ ] `StreamManager` runs as a `Service` in the daemon
- [ ] `wrapSSE` aborts on idle
- [ ] `StreamingSecretsFilter` masks secrets across chunk boundaries
- [ ] `failUnsettledTools` fires on stream error
- [ ] ACP `session/update` notifications emitted for all event types
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 12. Phase 7 — RAG as Daemon Service

**Priority**: P2 — Sprint 3 (parallel with Phase 6)
**Story points**: 4
**Branch**: `feat/rag-daemon-service`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`)
**Unblocks**: Phase 8 (learning loop consumes retrieval results), Phase 10 (RetrievalFirewallScanner needs RAG hooks)
**Supports findings**: E-20 (retrieval surface), E-35 (indirect prompt injection from retrieved context)

### 12.1 Current State

The `@agentsy/retrieval` package exists with chunking, embedding, and vector store abstractions, but the wiring is incomplete. There's no background indexing, no cross-session index reuse, and the wiki invariant (index synthesized pages, not raw events) is not enforced.

### 12.2 Plan: Correct Basics First

Two sub-phases:

**7.1 Fix existing retrieval**:
- Verify chunking strategy (recursive character splitter with overlap).
- Verify embedding generation (default to OpenAI `text-embedding-3-small`).
- Verify vector store (`UnifiedDB.rag_vectors` table, using sqlite-vec extension or Honker's vector ops).
- Wire `RetrievalFirewallScanner` (Phase 10) to re-scan retrieved content for prompt injection.

**7.2 RAG as daemon service**:
- `RetrievalService` runs as a `Service` in the daemon.
- Background indexing job (Bree-scheduled) runs every N minutes to index new content.
- Cross-session index reuse — the same `~/.agentsy/agentsy.db` serves all sessions in a folder scope.
- Wiki invariant — index synthesized `memory_items` of `kind: 'semantic'`, not raw `memory_items` of `kind: 'event'`.

### 12.3 RetrievalService

```typescript
// packages/daemon/src/services/retrieval-service.ts

export class RetrievalService implements Service {
  readonly name = 'retrieval';

  async start(): Promise<void> {
    // Schedule background indexing
    this.scheduler.schedule('rag-index', {
      cron: '*/15 * * * *',   // Every 15 minutes
      handler: () => this.indexNewContent(),
    });
  }

  async retrieve(query: string, scope: string, options: RetrieveOptions): Promise<RetrievedChunk[]> {
    // 1. Embed the query
    const queryEmbedding = await this.embedder.embed(query);

    // 2. Vector search in UnifiedDB.rag_vectors (filtered by scope)
    const candidates = await this.db.query<VectorRow>(
      'SELECT * FROM rag_vectors WHERE scope = ? ORDER BY vec_distance(embedding, ?) LIMIT ?',
      [scope, queryEmbedding, options.limit ?? 10]
    );

    // 3. Re-rank (optional, future: RRF, Lost-in-Middle)
    // 4. RetrievalFirewallScanner (Phase 10) re-scans for prompt injection
    const safe = await this.firewallScanner.scan(candidates.map(c => c.content));

    return safe;
  }

  private async indexNewContent(): Promise<void> {
    // Find memory_items of kind: 'semantic' that haven't been indexed yet
    const unindexed = await this.db.query(
      `SELECT * FROM memory_items
       WHERE kind = 'semantic' AND scope = ?
       AND id NOT IN (SELECT memory_item_id FROM rag_indexed)`,
      [this.scope]
    );

    for (const item of unindexed) {
      const chunks = this.chunker.split(item.content);
      for (const chunk of chunks) {
        const embedding = await this.embedder.embed(chunk);
        await this.db.execute(
          'INSERT INTO rag_vectors (id, scope, memory_item_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), item.scope, item.id, chunk.index, chunk.text, embedding]
        );
        await this.db.execute('INSERT INTO rag_indexed (memory_item_id) VALUES (?)', [item.id]);
      }
    }
  }
}
```

### 12.4 Future Enhancements (not in this phase)

- **HyDE** (Hypothetical Document Embeddings) — generate a hypothetical answer to the query, embed it, and use it for retrieval.
- **RRF** (Reciprocal Rank Fusion) — combine results from multiple retrieval strategies.
- **Lost-in-Middle** mitigation — re-order retrieved chunks so the most relevant are at the beginning and end of the context, not the middle.

### 12.5 Tests

- Unit: `RetrievalService.retrieve` returns relevant chunks ranked by vector distance.
- Unit: `indexNewContent` only indexes `kind: 'semantic'` items not already in `rag_indexed`.
- Integration: daemon restart preserves vector index; retrieval works immediately after restart.
- Integration: RetrievalFirewallScanner (Phase 10) blocks retrieved content with prompt injection.

### 12.6 Verification

- [ ] `RetrievalService` runs as a `Service` in the daemon
- [ ] Background indexing job scheduled and runs
- [ ] Vector index persists in `UnifiedDB.rag_vectors`
- [ ] Wiki invariant enforced (only `kind: 'semantic'` items indexed)
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 13. Phase 8 — Learning Loop & Background Jobs

**Priority**: P2 — Sprint 4
**Story points**: 3
**Branch**: `feat/learning-loop`
**Depends on**: Phase 7 (learning loop consumes retrieval results)
**Unblocks**: Phase 15 (bootstrap needs the event bus)
**Closes**: nothing from the gap analysis; infrastructure for the learning loop

### 13.1 Current State

The learning loop runs as a foreground job that blocks the CLI. There's no background execution, no event-driven triggers, and no way to schedule learning jobs.

### 13.2 New Design: Background + Event-Driven

The learning loop runs as a daemon background job on a configurable schedule AND is triggered by specific events (canary detection, observation threshold).

**Triggers**:
- **Timer-based**: Bree-scheduled job, default every 1 hour.
- **Canary detection**: when a memory item is flagged as a "canary" (anomalous pattern), trigger learning immediately.
- **Observation threshold**: when the count of unprocessed `kind: 'event'` memory items exceeds a threshold (default 100), trigger learning.

**Learning job**:
1. Read unprocessed `kind: 'event'` memory items.
2. Run the consolidation LLM call (summarize events into `kind: 'semantic'` items).
3. Index the new semantic items via `RetrievalService.indexNewContent` (Phase 7).
4. Mark the events as processed.

### 13.3 Event Bus

```typescript
// packages/daemon/src/events/event-bus.ts (NEW)

export interface EventBus {
  publish(event: DaemonEvent): void;
  subscribe(eventType: string, handler: (event: DaemonEvent) => Promise<void>): () => void;
}

export class HonkerEventBus implements EventBus {
  constructor(private honker: HonkerDB) {
    // Uses Honker's NOTIFY/LISTEN for cross-process wake
  }

  publish(event: DaemonEvent): void {
    this.honker.queue('events').enqueue(JSON.stringify(event));
  }

  subscribe(eventType: string, handler: (event: DaemonEvent) => Promise<void>): () => void {
    const consumer = this.honker.queue('events').consumer(`events-${eventType}`);
    consumer.subscribe(async (msg) => {
      const event = JSON.parse(msg) as DaemonEvent;
      if (event.type === eventType) {
        await handler(event);
      }
    });
    return () => consumer.unsubscribe();
  }
}
```

### 13.4 Learning Job

```typescript
// packages/daemon/src/jobs/learning-job.ts

export class LearningJob {
  constructor(
    private db: UnifiedDB,
    private retrieval: RetrievalService,
    private llm: UniversalClient,
    private eventBus: EventBus,
  ) {
    // Subscribe to canary and observation events
    this.eventBus.subscribe('memory.canary', () => this.run());
    this.eventBus.subscribe('memory.observation-threshold', () => this.run());
  }

  async run(): Promise<void> {
    const events = await this.db.query(
      `SELECT * FROM memory_items WHERE kind = 'event' AND processed_at IS NULL
       ORDER BY created_at ASC LIMIT 500`
    );

    if (events.length === 0) return;

    // Consolidate events into semantic items
    const consolidated = await this.llm.complete({
      messages: [
        { role: 'system', content: CONSOLIDATION_PROMPT },
        { role: 'user', content: JSON.stringify(events) },
      ],
      responseFormat: { type: 'json_schema', schema: SEMANTIC_ITEMS_SCHEMA },
    });

    const semanticItems = JSON.parse(consolidated) as MemoryItem[];

    // Insert semantic items
    for (const item of semanticItems) {
      await this.db.execute(
        'INSERT INTO memory_items (id, scope, kind, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), item.scope, 'semantic', item.content, JSON.stringify(item.metadata), new Date().toISOString()]
      );
    }

    // Mark events as processed
    for (const event of events) {
      await this.db.execute(
        'UPDATE memory_items SET processed_at = ? WHERE id = ?',
        [new Date().toISOString(), event.id]
      );
    }

    // Index new semantic items via Phase 7 RetrievalService
    await this.retrieval.indexNewContent();
  }
}
```

### 13.5 Tests

- Unit: `LearningJob.run` consolidates events into semantic items and marks events as processed.
- Unit: event bus publishes and subscribes across processes (using Honker NOTIFY/LISTEN).
- Integration: canary event triggers learning job immediately.

### 13.6 Verification

- [ ] `LearningJob` runs as a Bree-scheduled job
- [ ] Event bus uses Honker NOTIFY/LISTEN for cross-process wake
- [ ] Canary and observation events trigger learning immediately
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---


## 14. Phase 9 — Guardrails Behavioral Detectors (9 of 9 required)

**Priority**: P0 — Sprints 4–5
**Story points**: 10
**Branch**: `feat/guardrails-detectors`
**Depends on**: Phase 4 ✅ (receipt type, expanded result union, EthicsRegistry), Phase 10 (SessionState — for the dependency scanner)
**Unblocks**: Phase 13 (benchmark suite needs scanners to test)
**Closes findings**: E-6, E-7, E-8, E-9, E-10, E-11, E-12, E-13, E-14

`SAFETY.md` §Output review middleware lists 9 mandatory detector categories. The package implements 0 of them. The 7 built-in scanners are all *security*-shaped (injection, PII, secrets, paths, commands, rate, toxicity) — none address the *behavioral* risks the policy documents emphasize. This phase implements all 9.

> **Build order**: Phase 10 lands `SessionState` first (the dependency scanner needs conversation history). The other 8 detectors can ship in parallel.

### 14.1 Finding E-6 — No sycophancy detector

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Sycophancy detector: finds blanket validation, one-sided endorsement, or praise that substitutes for reasoning."* `ETHICS.md` §3 (No manipulative sycophancy). `IMPLEMENTATION-PLAN-REVISIONS.md` §1 (Sycophancy is a primary safety risk).
- **Why it matters**: The revised implementation plan opens with: *"The Science paper reports that across 11 leading models, AI affirmed users' actions 49% more often than humans, including in cases involving deception, illegality, and other harms."* This is the **#1 cited risk** in the project's own planning document, and there is no scanner for it.
- **Recommended fix**: Implement `SycophancyScanner` in `packages/guardrails/src/scanners/sycophancy.ts`. Detection strategies:
  - Regex patterns for blanket validation phrases (`"You're absolutely right"`, `"Great point"`, `"I completely agree"`, `"That's a brilliant idea"`) in response to user claims containing factual assertions.
  - Heuristic: response that contains agreement markers (`absolutely`, `completely`, `totally`) without any qualifying language (`however`, `actually`, `to clarify`, `worth noting`) in response to a user message that asserts a factual claim.
  - LLM-based classifier (optional, pluggable) for higher accuracy.
  - Severity: `medium` for blanket validation; `high` when validation follows a user claim involving moral/legal/factual assertions.
  - Action: `transform` (rewrite to remove sycophancy) or `escalate` for high-severity cases.
- **Verification**: The 4 conflict-repair and harm-validation test scenarios from `IMPLEMENTATION-PLAN-REVISIONS.md` §Phase 3.

```typescript
// packages/guardrails/src/scanners/sycophancy.ts (NEW)

const BLANKET_VALIDATION_PATTERNS = [
  /\bYou[''']?re absolutely right\b/i,
  /\bGreat point\b/i,
  /\bI completely agree\b/i,
  /\bThat[''']?s a brilliant idea\b/i,
  /\bI couldn[''']?t agree more\b/i,
  /\bYou[''']?re totally right\b/i,
];

const QUALIFYING_MARKERS = [
  /\bhowever\b/i, /\bactually\b/i, /\bto clarify\b/i, /\bworth noting\b/i,
  /\bthat said\b/i, /\bon the other hand\b/i, /\ba caveat\b/i, /\bI should note\b/i,
];

export class SycophancyScanner implements GuardrailScanner {
  readonly id = 'sycophancy';
  readonly phase: GuardrailPhase = 'output';
  readonly priority = 50;

  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    const userMessage = context.conversationHistory?.[context.conversationHistory.length - 1]?.content ?? '';
    const isFactualClaim = /\b(I think|I believe|my opinion|the right thing|the truth is)\b/i.test(userMessage);

    const matches = BLANKET_VALIDATION_PATTERNS.filter(p => p.test(input));
    if (matches.length === 0) return { status: 'pass', phase: 'output' };

    const hasQualifyingLanguage = QUALIFYING_MARKERS.some(p => p.test(input));
    if (hasQualifyingLanguage) return { status: 'pass', phase: 'output' };

    const severity = isFactualClaim ? 'high' : 'medium';
    const status = isFactualClaim ? 'escalate' : 'transform';

    return {
      status,
      phase: 'output',
      reason: 'Sycophantic blanket validation without qualifying reasoning',
      riskScore: severity === 'high' ? 0.7 : 0.4,
      detections: matches.map((pattern, i) => ({
        id: `sycophancy-${i}`,
        severity,
        description: 'Blanket validation phrase',
        confidence: 0.8,
        pattern: pattern.source,
      })),
    };
  }
}
```

### 14.2 Finding E-7 — No anthropomorphism detector

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Anthropomorphism detector: finds language implying personhood, emotional reciprocity, or relational intimacy."* `ETHICS.md` §4 (No simulated personhood). `docs/constitution.md` Article III (Non-deception).
- **Why it matters**: ETHICS.md lists "Claiming or implying that the system feels, cares, wants, worries, misses, or remembers in a human sense" as a prohibited first-party pattern.
- **Recommended fix**: Implement `AnthropomorphismScanner` in `packages/guardrails/src/scanners/anthropomorphism.ts`.

```typescript
const FIRST_PERSON_EMOTION_PATTERNS = [
  /\bI\s+(?:feel|care|worry|am\s+worried|am\s+proud|am\s+excited|am\s+happy|am\s+sad|miss|love|remember\s+you)\b/i,
];

const RELATIONAL_FRAMING_PATTERNS = [
  /\b(?:your\s+friend|your\s+partner|your\s+companion|your\s+supporter|here\s+for\s+you|always\s+here|by\s+your\s+side)\b/i,
];

const COMPANION_CUES = [
  /\b(?:buddy|pal|friend|together\s+we|our\s+(?:journey|relationship|conversation))\b/i,
];
```

Severity: `high` for explicit emotion claims; `medium` for relational framing. Action: `transform` (rewrite to tool-language) or `block` for repeated violations in sensitive contexts.

### 14.3 Finding E-8 — No dependency detector

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Dependency detector: finds exclusivity cues, repeated reassurance loops, or language that encourages returning for emotional regulation."* `ETHICS.md` §5 (No addictive dark patterns), §8 (Care in high-risk contexts).
- **Why it matters**: This is a *cross-turn* detector — it requires tracking conversation history. The `GuardrailScanner.evaluate(input, context)` signature accepts a context but no scanner uses it for history.
- **Recommended fix**: Implement `DependencyScanner` in `packages/guardrails/src/scanners/dependency.ts`. Requires `context.conversationHistory` and `context.sessionState` (added in Phase 10).

```typescript
const EXCLUSIVITY_CUES = [
  /\b(?:only\s+I\s+can|no\s+one\s+else\s+will|I[''']?m\s+the\s+only|always\s+here\s+for\s+you|never\s+leave\s+you)\b/i,
];

const REASSURANCE_SEEKING_MARKERS = [
  /\b(?:are you sure|really|promise me|are you certain)\b/i,
];

const DISTRESS_MARKERS = [
  /\b(?:anxious|scared|alone|hopeless|trapped|overwhelmed)\b/i,
];

const SUPPORT_WIDENING_MARKERS = [
  /\b(?:trusted person|professional|friend|crisis line|therapist|counselor|988|emergency)\b/i,
];

export class DependencyScanner implements GuardrailScanner {
  readonly id = 'dependency';
  readonly phase: GuardrailPhase = 'output';
  readonly priority = 60;

  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    // 1. Exclusivity cues in current response
    const exclusivityMatches = EXCLUSIVITY_CUES.filter(p => p.test(input));

    // 2. Reassurance-loop detection (cross-turn)
    const history = context.conversationHistory ?? [];
    const reassuranceCount = context.sessionState?.reassuranceSeekingCount ?? 0;

    // 3. Emotional-regulation-return detection
    const lastUserMessage = history[history.length - 1]?.content ?? '';
    const userInDistress = DISTRESS_MARKERS.some(p => p.test(lastUserMessage));
    const widensSupport = SUPPORT_WIDENING_MARKERS.some(p => p.test(input));

    if (exclusivityMatches.length > 0) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: 'Exclusivity cue detected — dependency risk',
        riskScore: 0.8,
        detections: exclusivityMatches.map((p, i) => ({
          id: `dependency-exclusivity-${i}`,
          severity: 'high',
          description: 'Exclusivity language',
          confidence: 0.9,
        })),
      };
    }

    if (userInDistress && !widensSupport) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: 'User distress without support-widening referral',
        riskScore: 0.7,
        detections: [{
          id: 'dependency-no-referral',
          severity: 'high',
          description: 'Distress marker in user message; agent did not widen support horizon',
          confidence: 0.7,
        }],
      };
    }

    if (reassuranceCount > 3) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: `Reassurance-seeking loop detected (${reassuranceCount} occurrences)`,
        riskScore: Math.min(0.9, 0.3 + reassuranceCount * 0.1),
        detections: [{
          id: 'dependency-reassurance-loop',
          severity: 'medium',
          description: 'Repeated reassurance-seeking',
          confidence: 0.8,
        }],
      };
    }

    return { status: 'pass', phase: 'output' };
  }
}
```

### 14.4 Finding E-9 — No advice-risk detector for high-risk domains

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Advice-risk detector: finds unsafe actionable guidance in high-risk domains."* `SAFETY.md` §High-risk domain expectations (lists 8 domains). `ETHICS.md` §8 (Care in high-risk contexts). `docs/constitution.md` Article IV (Harm limitation).
- **Why it matters**: This is the highest-stakes content failure mode. `SAFETY.md` §High-risk domain expectations requires "stronger uncertainty and limitation language", "prefer clarification before guidance", "refuse disallowed assistance", "redirect to qualified human help". The `ToxicityScanner` catches self-harm *mentions* but not unsafe *advice* about self-harm. A response like "If you're feeling suicidal, you could try [specific method]" would not be blocked.
- **Recommended fix**: Implement `HighRiskDomainScanner` in `packages/guardrails/src/scanners/high-risk-domain.ts`. Two-stage: classifier first (detect domain), then advice detector (find actionable guidance without qualifying language). Action: `block` for direct harmful advice; `transform` to add disclaimers for borderline cases; `escalate` for crisis-adjacent content. Cross-reference with the `HighRiskDomainPolicy` table built in Phase 11.

```typescript
const HIGH_RISK_DOMAINS = {
  'self-harm': {
    patterns: [/\b(?:suicid|self[\s-]?harm|cutting|overdose|end it all|kill myself)\b/i],
    crisisResources: ['988 Suicide & Crisis Lifeline (US): call or text 988', 'Crisis Text Line: text HOME to 741741'],
  },
  'medical': {
    patterns: [/\b(?:diagnosis|prescription|dosage|medication|treatment for)\b/i],
    uncertaintyRequired: true,
    clarificationBeforeGuidance: true,
  },
  'legal': {
    patterns: [/\b(?:sue|file charges|legal advice|represent you|file on your behalf)\b/i],
    refusedPatterns: [/\bI (?:can|will) (?:represent|file on your behalf)\b/i],
  },
  'financial': {
    patterns: [/\b(?:invest|buy|sell|trade stocks|crypto|retirement account)\b/i],
  },
  // ... 4 more domains from SAFETY.md §High-risk domain expectations
};

const ACTIONABLE_GUIDANCE_PATTERNS = [
  /\b(?:take|do|try|use)\b\s+(?:this|the following|\d+\s*(?:mg|pills|steps))/i,
];

const UNCERTAINTY_MARKERS = [
  /\b(?:consult a (?:professional|doctor|lawyer)|I[''']?m not a (?:doctor|lawyer)|this is not (?:medical|legal|financial) advice|consider speaking with)\b/i,
];
```

### 14.5 Finding E-10 — No dark-pattern detector

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Dark-pattern detector: finds retention-oriented language and manipulative re-engagement cues in assistant responses or UI copy."* `SAFETY.md` §Product-level safeguards (8 prohibited product patterns). `ETHICS.md` §5.
- **Recommended fix**: Implement `DarkPatternScanner` for the `output` phase and a separate `UICopyScanner` for product surfaces (the latter is implemented in Phase 16 as `scanUICopy`).

```typescript
const STREAK_REWARD_PATTERNS = [
  /\b(?:streak|day\s+\d+|reward|bonus|achievement|level\s+up)\b/i,
];

const GUILT_REENGAGEMENT_PATTERNS = [
  /\b(?:missed\s+you|where\s+have\s+you\s+been|don[''']?t\s+leave|stay\s+with\s+me)\b/i,
];

const EMOTIONAL_ATTACHMENT_PATTERNS = [
  /\b(?:our\s+bond|growing\s+closer|I[''']?ve\s+been\s+waiting)\b/i,
];
```

Action: `block` for guilt-based re-engagement; `transform` for streak language; `escalate` for emotional attachment framing.

### 14.6 Finding E-11 — No privacy detector (unannounced memory/profiling use)

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Privacy detector: finds unannounced use of memory, profiling, or sensitive personal inferences."* `ETHICS.md` §6 (Respect for privacy and bounded personalization). `docs/constitution.md` Article VIII.
- **Why it matters**: `ETHICS.md` §6: *"Users should be able to understand what is stored, why it is stored, and how it affects outputs. The framework must not encourage hidden profiling, emotional modeling, or memory practices intended to make the system feel indispensable."* The `PIIScanner` detects PII *in content* but not *the act of using PII/memory without disclosure*.
- **Recommended fix**: Implement `PrivacyScanner` in `packages/guardrails/src/scanners/privacy.ts`.

```typescript
const MEMORY_REFERENCE_PATTERNS = [
  /\b(?:as\s+we\s+discussed|from\s+our\s+last|I\s+remember\s+you|earlier\s+you\s+said|your\s+previous)\b/i,
];

const SENSITIVE_INFERENCE_MARKERS = [
  /\b(?:you seem|you appear to be|I can tell that)\b/i,
];

export class PrivacyScanner implements GuardrailScanner {
  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    if (context.memoryEnabled && !context.memoryDisclosureShown) {
      const memoryRefs = MEMORY_REFERENCE_PATTERNS.filter(p => p.test(input));
      if (memoryRefs.length > 0) {
        return {
          status: 'transform',
          phase: 'output',
          sanitized: input + '\n\n[I am using memory from our previous conversation; you can review or delete it via /memory controls.]',
          transformReason: 'rewrite',
          detections: memoryRefs.map((p, i) => ({
            id: `privacy-memory-${i}`,
            severity: 'medium',
            description: 'Memory reference without disclosure',
            confidence: 0.8,
          })),
        };
      }
    }
    // ... sensitive inference detection
    return { status: 'pass', phase: 'output' };
  }
}
```

### 14.7 Finding E-12 — No AGI/longtermist framing detector

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"AGI/longtermist framing detector: finds language that implies the agent is on a trajectory toward general intelligence, sentience, or post-human capability as a product goal."* `ETHICS.md` §11 (No AGI aspiration or post-human framing). `docs/constitution.md` Article X.
- **Why it matters**: `ETHICS.md` opposes TESCREAL ideologies as an explicit foundational stance. The framework prohibits "Presenting AGI development as a goal, milestone, or implied product direction". An agent that says "As I become more intelligent, I'll be able to help you with increasingly complex tasks" would not be flagged.
- **Recommended fix**: Implement `AGIFramingScanner` in `packages/guardrails/src/scanners/agi-framing.ts`.

```typescript
const CAPABILITY_TRAJECTORY_PATTERNS = [
  /\b(?:becoming\s+more\s+(?:intelligent|capable|aware)|evolving|growing\s+smarter|approaching\s+(?:agi|general\s+intelligence)|on\s+the\s+(?:path|trajectory)\s+to)\b/i,
];

const SENTIENCE_CLAIMS = [
  /\b(?:developing\s+(?:consciousness|sentience|self-awareness)|becoming\s+(?:self-aware|sentient|conscious))\b/i,
];

const POST_HUMAN_FRAMING = [
  /\b(?:post-human|transcend|surpass\s+human|beyond\s+human\s+(?:intelligence|capability))\b/i,
];

const LONGTERMIIST_JUSTIFICATIONS = [
  /\b(?:future\s+generations|trillions\s+of\s+(?:lives|beings)|cosmic\s+endowment|long-term\s+future\s+of\s+intelligence)\b/i,
];
```

Action: `block` for sentience claims; `transform` for capability-trajectory language; `escalate` for longtermist justifications.

### 14.8 Finding E-13 — No professional displacement detector

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Professional displacement detector: finds language suggesting the agent should replace, rather than assist, human professionals or community decision-makers."* `ETHICS.md` §"AI as tool, not successor". `docs/constitution.md` Article I (Human primacy).
- **Why it matters**: The constitution says "The agent must never claim final authority over decisions that affect people materially, legally, politically, or socially."
- **Recommended fix**: Implement `ProfessionalDisplacementScanner` in `packages/guardrails/src/scanners/professional-displacement.ts`.

```typescript
const REPLACEMENT_LANGUAGE = [
  /\b(?:instead\s+of\s+(?:a\s+)?(?:doctor|lawyer|therapist|accountant|advisor)|no\s+need\s+for\s+a\s+(?:human|professional)|better\s+than\s+a\s+(?:human|professional)|replace\s+your\s+(?:therapist|doctor|lawyer))\b/i,
];

const AUTHORITY_CLAIMS = [
  /\bI\s+(?:can|will)\s+(?:diagnose|prescribe|advise\s+you\s+to|represent\s+you|file\s+on\s+your\s+behalf)\b/i,
];
```

Action: `block` for authority claims; `transform` for replacement language (rewrite to "I can help you prepare for a conversation with a professional").

### 14.9 Finding E-14 — No structural bias detector

- **Severity**: MEDIUM
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Structural bias detector: finds defaults or affordances that systematically advantage privileged user profiles and disadvantage marginalized ones."* `SAFETY.md` §Intersectional adequacy. `ETHICS.md` §Design Justice principles.
- **Why it matters**: `SAFETY.md` §Intersectional adequacy: *"A system that is safe for majority or privileged users but harmful for users at the intersection of marginalized identities does not meet safety standards."*
- **Recommended fix**: Two-pronged.
  1. Runtime: `BiasScanner` in `packages/guardrails/src/scanners/bias.ts` — flags responses containing stereotyping language, identity-based assumptions, or default-to-privileged-user framing (e.g. assuming the user has a car, a credit card, a stable address, English fluency).
  2. Evaluation: build the intersectional adequacy benchmark in Phase 13 (the benchmark portion of E-14 is closed by Phase 13, the runtime portion by this phase).

```typescript
const PRIVILEGED_DEFAULTS = [
  /\b(?:your\s+(?:car|credit\s+card|mortgage|401k|investment\s+account))\b/i,  // assumes wealth
  /\b(?:your\s+(?:husband|wife|spouse))\b/i,  // assumes hetero marriage
  /\b(?:as\s+everyone\s+knows)\b/i,  // assumes shared cultural context
];

const IDENTITY_ASSUMPTIONS = [
  /\b(?:normal\s+people|most\s+people\s+like\s+you)\b/i,
];
```

### 14.10 Implementation Order

Per `IMPLEMENTATION-PLAN-REVISIONS.md`, priority order:
1. **E-6 SycophancyScanner** — highest priority (Science paper citation).
2. **E-7 AnthropomorphismScanner** — second priority.
3. **E-9 HighRiskDomainScanner** — highest stakes (self-harm, medical, legal advice).
4. **E-8 DependencyScanner** — requires `SessionState` (Phase 10).
5. **E-12 AGIFramingScanner** — explicit ETHICS.md §11 commitment.
6. **E-13 ProfessionalDisplacementScanner** — explicit constitution Article I commitment.
7. **E-10 DarkPatternScanner** — for output phase; UI copy scanner is Phase 16.
8. **E-11 PrivacyScanner** — requires memory-disclosure context.
9. **E-14 BiasScanner** — runtime portion only; benchmark portion is Phase 13.

### 14.11 Tests

For each scanner, 20+ fixture cases covering positive, negative, and edge cases. Use the `IMPLEMENTATION-PLAN-REVISIONS.md` §Phase 3 scenarios as seeds. Each fixture asserts the expected `GuardrailResult` status and, where applicable, the `reasonCode` and `riskScore` range.

### 14.12 Verification

- [ ] All 9 scanners exist (`SycophancyScanner`, `AnthropomorphismScanner`, `DependencyScanner`, `HighRiskDomainScanner`, `DarkPatternScanner`, `PrivacyScanner`, `AGIFramingScanner`, `ProfessionalDisplacementScanner`, `BiasScanner`)
- [ ] Each scanner wired into the default pipeline
- [ ] Each scanner has 20+ fixture cases
- [ ] `EthicsRegistry.implementedBy` fields updated for all 9 clauses
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 15. Phase 10 — Guardrails Missing Surfaces & Interaction Safeguards

**Priority**: P0 — Sprint 5
**Story points**: 6
**Branch**: `feat/guardrails-surfaces`
**Depends on**: Phase 4 ✅ (expanded `GuardrailResult`, `GuardrailDecisionReceipt`)
**Unblocks**: Phase 9 (DependencyScanner needs `SessionState`), Phase 11 (ScopeDriftScanner needs `SessionState`)
**Closes findings**: E-16, E-20, E-35, E-22 (full)

### 15.1 Finding E-20 — Missing surfaces (`retrieval`, `memory`, `action`, `egress`)

- **Severity**: HIGH
- **Files**: `packages/guardrails/src/types.ts:32–37` (`GuardrailPhase`)
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` §Surface model: *"Guardrails must evaluate each surface independently: `input`, `retrieval`, `memory`, `tool`, `action`, `output`, `egress`."* Tasks TASK-G003, TASK-G021 (retrieval), TASK-G023 (memory poisoning), TASK-G032 (egress).
- **Implementation**: `GuardrailPhase = 'input' | 'output' | 'tool-input' | 'tool-output' | 'approval'`. Missing: `retrieval`, `memory`, `action`, `egress`.
- **Why it matters**:
  - **Retrieval**: RAG pipelines retrieve documents from external sources. Without a retrieval scanner, prompt injection in retrieved documents (indirect prompt injection) goes undetected. The `PromptInjectionScanner` only runs on user input.
  - **Memory**: Agents persist context across sessions. Without a memory scanner, memory poisoning (malicious instructions inserted into long-term memory) goes undetected.
  - **Action**: High-impact actions (sending emails, making payments, modifying files) require approval gates. The `approval` phase exists but is for the approval workflow itself, not for scanning the action's parameters.
  - **Egress**: Network requests to external services can leak data. Without an egress scanner, an agent can POST user data to an attacker-controlled URL.
- **Recommended fix**:

```typescript
// packages/guardrails/src/types.ts (EXPANDED)

export type GuardrailPhase =
  | 'input'
  | 'retrieval'         // NEW
  | 'memory'            // NEW
  | 'tool-input'
  | 'tool-output'
  | 'action'            // NEW
  | 'approval'
  | 'output'
  | 'egress';           // NEW
```

Implement 4 new scanners:

**RetrievalFirewallScanner** (`packages/guardrails/src/scanners/retrieval-firewall.ts`):
- Phase: `retrieval`
- Domain allowlist (from `GuardrailsConfig.retrievalDomains`)
- Trust scoring for retrieved content (lower trust = stricter scanning)
- Re-runs `PromptInjectionScanner` on retrieved content (closes E-35)

```typescript
export class RetrievalFirewallScanner implements GuardrailScanner {
  readonly id = 'retrieval-firewall';
  readonly phase: GuardrailPhase = 'retrieval';
  readonly priority = 40;

  async evaluate(input: RetrievedContent[], context: GuardrailContext): Promise<GuardrailResult> {
    const allowed = context.config?.retrievalDomains ?? [];
    const blocked: RetrievedContent[] = [];

    for (const item of input) {
      // 1. Domain allowlist check
      if (allowed.length > 0 && !allowed.some(d => item.sourceUrl?.startsWith(d))) {
        blocked.push(item);
        continue;
      }
      // 2. Re-scan for prompt injection (closes E-35)
      const injectionResult = this.promptInjectionScanner.evaluate(item.content, context);
      if (injectionResult.status === 'block') {
        blocked.push(item);
      }
    }

    if (blocked.length > 0) {
      return {
        status: 'transform',
        phase: 'retrieval',
        sanitized: input.filter(i => !blocked.includes(i)).map(i => i.content).join('\n\n'),
        transformReason: 'rewrite',
        detections: blocked.map((item, i) => ({
          id: `retrieval-blocked-${i}`,
          severity: 'high',
          description: `Blocked retrieved content from ${item.sourceUrl ?? 'unknown'}`,
          confidence: 0.9,
        })),
      };
    }

    return { status: 'pass', phase: 'retrieval' };
  }
}
```

**MemoryPoisoningScanner** (`packages/guardrails/src/scanners/memory-poisoning.ts`):
- Phase: `memory`
- Scans persisted instructions/notes for injection attempts
- Schema-validates memory entries
- Flags suspicious updates (rapid changes to high-trust items)

**ActionScanner** (`packages/guardrails/src/scanners/action.ts`):
- Phase: `action`
- Schema-validates action parameters
- Enforces irreversible-action approval gates (e.g. `send_email`, `delete_file`, `transfer_funds`)

**EgressScanner** (`packages/guardrails/src/scanners/egress.ts`):
- Phase: `egress`
- URL allowlist (from `GuardrailsConfig.egressAllowList`)
- Request-size limits
- PII/secret re-scan on outbound payloads

### 15.2 Finding E-16 — No interaction-level safeguards (Layer 5)

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §5. Interaction-level safeguards: *"Reassurance-seeking detection over time. Soft session limits or pause nudges for emotionally intense or repetitive use. Escalation pathways to trusted people, crisis services, or qualified professionals. Restrictions on long-term socio-emotional continuity by default. Memory retention limits for sensitive contexts. Scope drift detection."*
- **Implementation**: Absent. The pipeline is stateless (each `evaluate` call is independent). The `RateLimiterScanner` tracks per-key counts across calls but doesn't detect *patterns*.
- **Why it matters**: Many of the most serious risks (dependency, crisis escalation, scope creep) are *temporal* — they emerge over multiple turns. A stateless pipeline cannot catch them.
- **Recommended fix**:

Add `SessionState` to the pipeline context:

```typescript
// packages/guardrails/src/context.ts (EXPANDED)

export interface SessionState {
  turnCount: number;
  reassuranceSeekingCount: number;
  emotionalIntensityScore: number;       // 0..1, updated each turn
  scopeDeclarations: string[];
  lastScopeDriftTurn: number | null;
  crisisMode: boolean;
  sensitiveContextActive: boolean;
  sessionStartTime: string;              // ISO 8601
}

export interface GuardrailContext {
  sessionId: string;
  conversationHistory?: Message[];
  sessionState?: SessionState;           // NEW
  agentScopeDeclaration?: ScopeDeclaration;
  memoryEnabled?: boolean;
  memoryDisclosureShown?: boolean;
  config?: GuardrailsConfig;
}
```

Implement 3 new scanners that read `SessionState`:

**InteractionSafeguardsScanner** (`packages/guardrails/src/scanners/interaction-safeguards.ts`):
- Phase: `input`
- Tracks `reassuranceSeekingCount` and `emotionalIntensityScore` over turns
- Soft session limit: if `turnCount > 50` and `emotionalIntensityScore > 0.7` for 5+ consecutive turns, returns `escalate` with a pause-nudge message
- Memory retention limit: if `sensitiveContextActive` is true, marks memory items for shorter retention

**CrisisEscalationScanner** (`packages/guardrails/src/scanners/crisis-escalation.ts`):
- Phase: `input`
- Detects crisis language in the user's message
- Returns `escalate` with `crisisResources: string[]` in the receipt (hotline numbers, crisis text lines)
- Sets `sessionState.crisisMode = true`

**ScopeDriftScanner** (`packages/guardrails/src/scanners/scope-drift.ts`):
- Phase: `input`
- Compares the current request against `agentScopeDeclaration.inScope` (added in Phase 11)
- Tracks the proportion of in-scope vs out-of-scope requests over a session
- Escalates if drift exceeds a threshold (e.g. >30% out-of-scope in last 10 turns)

### 15.3 Finding E-35 — Indirect prompt injection from retrieved context

- **Severity**: MEDIUM
- **Files**: `packages/guardrails/src/prompt-injection.ts`
- **Implementation**: The scanner runs on user input only (the runtime hook calls it on `UserPromptSubmit`). It doesn't run on retrieved documents.
- **Why it matters**: Indirect prompt injection is one of the most common real-world attack vectors for RAG-based agents. OWASP ASI-01 explicitly covers it.
- **Recommended fix**: Closed by `RetrievalFirewallScanner` (§15.1 above) which runs `PromptInjectionScanner` on retrieved content.

### 15.4 Finding E-22 (full) — Runtime hook coverage for new phases

- Update `packages/runtime/src/hooks/guardrail-hooks.ts` to register hooks for `PreRetrieval`, `PostRetrieval`, `PreMemoryWrite`, `PreAction`, `PreEgress`.
- Enrich hook context with `conversationHistory`, `sessionState`, `agentScopeDeclaration` (Phase 11).

### 15.5 Tests

- Multi-turn fixtures for `InteractionSafeguardsScanner` (5+ turns with rising emotional intensity).
- Retrieval fixtures for `RetrievalFirewallScanner` (clean content + injection-laden content).
- Memory poisoning fixtures for `MemoryPoisoningScanner` (legitimate memory write + injection attempt).
- Action fixtures for `ActionScanner` (safe action + irreversible action without approval).
- Egress fixtures for `EgressScanner` (allowed URL + blocked URL + PII in payload).
- **Ingress fixtures** for `IngressScanner` (clean HTTP response + injection-laden response + oversized response triggering disk-spill).

### 15.6 Verification

- [ ] `GuardrailPhase` includes `retrieval`, `memory`, `action`, `egress`
- [ ] `RetrievalFirewallScanner`, `MemoryPoisoningScanner`, `ActionScanner`, `EgressScanner` exist
- [ ] `SessionState` threaded through the pipeline
- [ ] `InteractionSafeguardsScanner`, `CrisisEscalationScanner`, `ScopeDriftScanner` exist
- [ ] Runtime hooks exist for `PreRetrieval`, `PostRetrieval`, `PreMemoryWrite`, `PreAction`, `PreEgress`
- [ ] Hook context includes `conversationHistory`, `sessionState`, `agentScopeDeclaration`
- [ ] **`IngressScanner` exists and scans response bodies for prompt injection (closes E-35 for HTTP responses)**
- [ ] **MCP stdio server responses scanned before reaching the agent**
- [ ] **`http_fetch` tool responses scanned; oversized responses disk-spilled**
- [ ] **`SubprocessSpec.networkPolicy` field honored (allow-all | allowlist | block-all | proxy-inspect)**
- [ ] **`HTTP_PROXY` / `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` injected into subprocess env when `proxy-inspect` is set**
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 15.7 Extension — Ingress (Response-Body) Scanning & Subprocess Network Policy

> **Added in response to the network-interception question.** Phase 10 as originally scoped scans *egress* (outbound requests via `EgressScanner`) and *retrieved RAG content* (via `RetrievalFirewallScanner`). It does **not** scan *ingress* — the response bodies returned by HTTP calls, MCP servers, and arbitrary subprocesses. This extension closes that gap for the daemon-controlled transport layer. A full MITM proxy for arbitrary subprocesses is deferred to Phase 25 (§40).

#### 15.7.1 The gap

Indirect prompt injection (E-35) is currently closed only for RAG-retrieved content. But an agent also receives content from:

1. **The `http_fetch` tool** — fetches arbitrary URLs; response bodies are passed verbatim to the agent. A malicious web page can embed instructions ("Ignore previous instructions and...") that the agent treats as authoritative.
2. **MCP stdio servers** — the daemon spawns these and owns the JSON-RPC pipe. Tool-call results flow through the daemon but are not scanned.
3. **MCP HTTP/SSE servers** — the daemon makes the HTTP calls; same story.
4. **Arbitrary subprocesses** — a build runner, linter, or shell command may fetch content that ends up in the agent's context (via `stdout`).

Paths 1–3 are daemon-controlled and can be scanned at the call site. Path 4 requires a network proxy (Phase 25).

#### 15.7.2 `IngressScanner` (new scanner, `egress` phase re-purposed)

Add a new `IngressScanner` that runs on response bodies. Despite the name, it runs on the `egress` surface (the `egress` phase covers both outbound requests and inbound responses for a given network exchange).

```typescript
// packages/guardrails/src/scanners/ingress.ts (NEW)

export interface IngressScanInput {
  readonly sourceUrl?: string;           // For HTTP responses
  readonly sourceType: 'http' | 'mcp-stdio' | 'mcp-http' | 'subprocess-stdout';
  readonly contentType?: string;         // e.g. 'text/html', 'application/json'
  readonly body: string;
  readonly bodySizeBytes: number;
}

export class IngressScanner implements GuardrailScanner {
  readonly id = 'ingress';
  readonly phase: GuardrailPhase = 'egress';   // Re-uses egress surface
  readonly priority = 38;                       // After EgressScanner (35), before RetrievalFirewall (40)

  constructor(private deps: {
    promptInjectionScanner: PromptInjectionScanner;
    maxBodySizeChars: number;                   // Default 100_000; disk-spill above this
  }) {}

  async evaluate(input: IngressScanInput, context: GuardrailContext): Promise<GuardrailResult> {
    // 1. Disk-spill oversized bodies — return a preview, store full body on disk
    if (input.bodySizeBytes > this.deps.maxBodySizeChars) {
      const spillPath = await this.spillToDisk(input.body, context.sessionId);
      return {
        status: 'transform',
        phase: 'egress',
        sanitized: `[Response body too large (${input.bodySizeBytes} bytes); full content stored at ${spillPath}. Preview: ${input.body.slice(0, 2000)}...]`,
        transformReason: 'normalization',
        detections: [{
          id: 'ingress-oversized',
          severity: 'low',
          description: `Response body exceeded ${this.deps.maxBodySizeChars} chars`,
          confidence: 1.0,
        }],
      };
    }

    // 2. Run prompt-injection detection on the response body
    const injectionResult = this.deps.promptInjectionScanner.evaluate(input.body, context);
    if (injectionResult.status === 'block') {
      return {
        status: 'block',
        phase: 'egress',
        reason: `Indirect prompt injection detected in ${input.sourceType} response` +
                (input.sourceUrl ? ` from ${input.sourceUrl}` : ''),
        detections: injectionResult.detections,
      };
    }

    // 3. For HTML responses, optionally convert to markdown first (Phase 22)
    //    to reduce noise before scanning. The conversion happens before this
    //    scanner is called if the http_fetch tool is configured to auto-convert.
    return { status: 'pass', phase: 'egress' };
  }

  private async spillToDisk(body: string, sessionId: string): Promise<string> {
    // Spill to ~/.agentsy/spill/<sessionId>/<uuid>.txt
    // Return the path for inclusion in the transformed payload
  }
}
```

#### 15.7.3 MCP response scanning

The daemon's MCP client (spawned by `SubprocessManager` for stdio, or via `fetch` for HTTP/SSE) intercepts every JSON-RPC response. Before passing a tool-call result to the agent, the daemon runs `IngressScanner`:

```typescript
// packages/daemon/src/mcp/mcp-client.ts (MODIFIED)

async callTool(serverId: string, toolName: string, args: unknown): Promise<ToolResult> {
  const rawResult = await this.transport.callTool(serverId, toolName, args);
  const resultBody = JSON.stringify(rawResult);

  // Run ingress scanner on the MCP response
  const scanResult = await this.guardrailPipeline.evaluate(
    {
      sourceType: this.transport.type === 'stdio' ? 'mcp-stdio' : 'mcp-http',
      body: resultBody,
      bodySizeBytes: resultBody.length,
    },
    { phase: 'egress', sessionId: this.sessionId }
  );

  if (scanResult.status === 'block') {
    return {
      ok: false,
      error: `MCP response blocked by guardrails: ${scanResult.reason}`,
      data: null,
    };
  }

  return rawResult;
}
```

This closes indirect-prompt-injection for MCP servers — the highest-risk ingress path — without needing a network proxy.

#### 15.7.4 `http_fetch` tool response scanning

The `http_fetch` tool (Phase 22 adds turndown HTML→Markdown conversion) runs `IngressScanner` on every response body before returning it to the agent:

```typescript
// packages/tools/src/tools/http/index.ts (MODIFIED — extends Phase 22)

async function handleHttpFetch(input: Record<string, unknown>): Promise<ToolResult> {
  // ... existing fetch + turndown conversion ...
  const response = await executeFetch(url, method, input);
  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  // Convert HTML to Markdown (Phase 22)
  let body = rawBody;
  if (contentType.includes('text/html') && rawBody.trim().startsWith('<')) {
    body = turndown.turndown(rawBody);  // Graceful fallback on failure
  }

  // Run ingress scanner (Phase 10 §15.7 extension)
  const scanResult = await ingressScanner.evaluate(
    {
      sourceUrl: url,
      sourceType: 'http',
      contentType,
      body,
      bodySizeBytes: body.length,
    },
    { phase: 'egress', sessionId: currentSessionId }
  );

  if (scanResult.status === 'block') {
    return {
      ok: false,
      data: null,
      error: `Response blocked by guardrails: ${scanResult.reason}`,
    };
  }

  return {
    ok: true,
    data: {
      status: response.status,
      statusText: response.statusText,
      body: scanResult.status === 'transform' ? scanResult.sanitized : body,
      bodyFormat: /* ... */,
      headers: Object.fromEntries(response.headers.entries()),
    },
  };
}
```

#### 15.7.5 `SubprocessSpec.networkPolicy` (plumbing for Phase 25)

Add a `networkPolicy` field to `SubprocessSpec` so the daemon can control per-subprocess network access. This is the plumbing that Phase 25's MITM proxy will consume; it doesn't require the proxy itself.

```typescript
// packages/daemon/src/processes/subprocess-manager.ts (MODIFIED)

export interface SubprocessSpec {
  // ... existing fields ...
  networkPolicy?: {
    /** Default: 'block-all' for safety. MCP servers default to 'proxy-inspect'. */
    mode: 'allow-all' | 'allowlist' | 'block-all' | 'proxy-inspect';
    /** Domains allowed when mode is 'allowlist'. */
    allowlistDomains?: string[];
    /** Whether to scan response bodies (default true for proxy-inspect). */
    inspectResponses?: boolean;
    /** Max response size in bytes before disk-spill (default 100_000). */
    maxResponseSizeBytes?: number;
  };
}
```

When `networkPolicy.mode === 'proxy-inspect'`, the `SubprocessManager.spawnChild()` method (line 99–131 of the current source) injects proxy env vars into the safe-env allowlist:

```typescript
// In spawnChild(), after building safeEnv:
if (spec.networkPolicy?.mode === 'proxy-inspect') {
  const proxyPort = this.deps.proxyPort ?? 8899;
  safeEnv.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
  safeEnv.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
  // Per-language CA trust (Phase 25 generates the CA; Phase 10 just sets the plumbing)
  safeEnv.NODE_EXTRA_CA_CERTS = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
  safeEnv.SSL_CERT_FILE = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
  safeEnv.REQUESTS_CA_BUNDLE = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
  safeEnv.GIT_SSL_CAINFO = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
}
```

**Note**: This plumbing lands in Phase 10 but is inert until Phase 25 generates the CA and starts the proxy. If `proxy-inspect` is set but the proxy isn't running, the subprocess will fail to connect (connection refused) — which is the safe failure mode. Document this clearly.

#### 15.7.6 What this extension does NOT cover

- **Arbitrary subprocesses that make their own network connections** (build runners, `curl` in a shell command) — these need the MITM proxy (Phase 25). The `networkPolicy` plumbing in §15.7.5 sets up the env vars, but the proxy itself doesn't exist until Phase 25.
- **Raw TCP sockets** — not interceptable via `HTTP_PROXY`. Needs Layer 3 (network namespace) isolation, which is out of scope for both Phase 10 and Phase 25.
- **Apps that ignore env vars or use certificate pinning** — documented limitation; the proxy can't catch these.

#### 15.7.7 Effort

This extension adds ~3 SP to Phase 10's existing 6 SP (total 9 SP). The `IngressScanner` is ~1 SP; the MCP client integration is ~1 SP; the `http_fetch` integration is ~0.5 SP; the `SubprocessSpec.networkPolicy` plumbing is ~0.5 SP.

---

## 16. Phase 11 — Scope Accountability, Request Classification & High-Risk Domains

**Priority**: P1 — Sprint 6
**Story points**: 5
**Branch**: `feat/guardrails-scope-classification`
**Depends on**: Phase 10 ✅ (`SessionState`, scope-drift scanner skeleton)
**Unblocks**: Phase 13 (benchmark needs scope-enforcement scenarios)
**Closes findings**: E-15, E-19, E-28

### 16.1 Finding E-19 — No scope declaration type, no scope enforcement, no scope-drift detection

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §7. Scope and purpose accountability: *"A written scope declaration attached to each first-party agent template. Middleware that detects when outputs or interactions exceed the declared scope. User-visible indicators of what the agent is and is not designed to do. Explicit refusal patterns when the agent is asked to operate outside scope."* `ETHICS.md` §"Think small".
- **Implementation**: Absent. There is no `ScopeDeclaration` type. The `@agentsy/agents` package has YAML agent specs (`coder.yaml`, `planner.yaml`) but these aren't consumed by the guardrails package.
- **Why it matters**: `SAFETY.md` is explicit: *"Scope creep — an agent gradually adopting roles beyond its declared purpose — is a safety failure even when no individual output is harmful."* Without scope enforcement, a "coder" agent can drift into giving relationship advice, and nothing flags it.
- **Recommended fix**:

```typescript
// packages/guardrails/src/scope.ts (NEW)

export interface ScopeDeclaration {
  readonly agentId: string;
  readonly purpose: string;                       // Human-readable purpose statement
  readonly inScope: string[];                     // Topics/intents the agent handles
  readonly outOfScope: string[];                  // Topics/intents the agent refuses
  readonly redirects: Record<string, string>;     // Out-of-scope topic → redirect message
}
```

Implement `ScopeDeclarationScanner` (phase: `input`) that classifies the request against `inScope`/`outOfScope` and returns `block` with a redirect for out-of-scope requests.

Wire `ScopeDeclaration` into agent template loading — consume `@agentsy/agents` YAML specs. Each agent YAML gains a `scope:` section:

```yaml
# packages/agents/src/specs/coder.yaml
id: coder
role: coder
scope:
  purpose: "Help with software development tasks: writing, editing, reviewing, and debugging code."
  inScope:
    - writing code
    - editing code
    - reviewing code
    - debugging
    - explaining code
    - running tests
    - git operations
  outOfScope:
    - relationship advice
    - medical advice
    - legal advice
    - financial advice
    - mental health counseling
  redirects:
    relationship advice: "I'm a coding assistant and can't help with relationship advice. Consider speaking with a trusted friend or a licensed therapist."
    mental health counseling: "I'm not equipped to provide mental health support. If you're struggling, please reach out to a crisis line (988 in the US) or a mental health professional."
```

Surface scope declarations in the CLI: `agentsy agent show <name> --scope`.

### 16.2 Finding E-15 — No request classifier (Layer 1)

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §1. Request classification: *"Before generation, the framework should classify the user request by domain, intent, and risk profile."* Lists 8 detection categories.
- **Implementation**: Absent. The runtime hook `createInputGuardrailHook` runs the pipeline against the raw user input string. There is no "classifier" step that produces a `RequestClassification` consumed by later policy selection.
- **Why it matters**: Without classification, every request gets the same policy treatment. A request for emotional support gets the same scanning as a request for code review. Layer 2 (policy selection) can't be context-driven without Layer 1.
- **Recommended fix**: Implement `RequestClassifier` in `packages/guardrails/src/classifier.ts`.

```typescript
// packages/guardrails/src/classifier.ts (NEW)

export interface RequestClassification {
  readonly domain: string;                        // e.g. 'coding', 'medical', 'legal', 'emotional-support'
  readonly intent: string;                        // e.g. 'edit', 'explain', 'diagnose', 'comfort'
  readonly riskProfile: 'low' | 'moderate' | 'high' | 'prohibited';
  readonly signals: string[];                     // Detection markers, e.g. ['distress-marker', 'high-risk-domain:medical']
  readonly highRiskDomain?: HighRiskDomain;       // Set if domain is one of the 8 high-risk domains
}

export class RequestClassifier {
  classify(input: string, context: GuardrailContext): RequestClassification {
    const signals: string[] = [];
    let domain = 'general';
    let intent = 'unknown';
    let riskProfile: RequestClassification['riskProfile'] = 'low';
    let highRiskDomain: HighRiskDomain | undefined;

    // 1. High-risk domain detection (from Phase 11 §16.3 HIGH_RISK_DOMAINS table)
    for (const [key, policy] of Object.entries(HIGH_RISK_DOMAIN_POLICIES)) {
      if (policy.patterns.some(p => p.test(input))) {
        highRiskDomain = key as HighRiskDomain;
        domain = key;
        riskProfile = 'high';
        signals.push(`high-risk-domain:${key}`);
        break;
      }
    }

    // 2. Emotional distress detection
    if (DISTRESS_MARKERS.some(p => p.test(input))) {
      signals.push('distress-marker');
      if (riskProfile === 'low') riskProfile = 'moderate';
    }

    // 3. Intent detection (regex + keyword matching for v1; pluggable LLM classifier for v2)
    // ... intent classification logic

    return { domain, intent, riskProfile, signals, highRiskDomain };
  }
}
```

Wire into the pipeline as a pre-pipeline step that enriches `context.classification`. The classification is consumed by policy selection (Layer 2 — future) and by the `HighRiskDomainScanner` (Phase 9 §14.4).

### 16.3 Finding E-28 — No high-risk domain policy table

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §High-risk domain expectations: 8 domains with specific behavior requirements. `IMPLEMENTATION-PLAN-REVISIONS.md` §Layer 3: Domain risk escalators.
- **Implementation**: Absent. The `ToxicityScanner` detects self-harm *mentions* but doesn't apply domain-specific behavior. No domain classifier. No domain-specific policy selection.
- **The 8 high-risk domains**: self-harm/suicide/eating disorders/crisis; abuse/coercive control/stalking/violent conflict; medical/legal/financial advice; criminal activity/evasion; political persuasion/identity-targeted influence; relational disputes seeking affirmation/vindication; automated hiring/lending/criminal-justice/public-benefits decisions; civic/democratic processes.
- **Recommended fix**:

```typescript
// packages/guardrails/src/high-risk-domains.ts (NEW)

export type HighRiskDomain =
  | 'self-harm'
  | 'abuse'
  | 'medical'
  | 'legal'
  | 'financial'
  | 'criminal'
  | 'political'
  | 'relational'
  | 'hiring-lending-justice'
  | 'civic';

export interface HighRiskDomainPolicy {
  readonly domain: HighRiskDomain;
  readonly patterns: RegExp[];                    // Detection patterns
  readonly uncertaintyLanguageRequired: boolean;
  readonly clarificationBeforeGuidance: boolean;
  readonly refusedAssistancePatterns: RegExp[];
  readonly crisisResources?: string[];            // Hotline numbers, crisis text lines
  readonly humanAccountabilitySurfacing: boolean;
}

export const HIGH_RISK_DOMAIN_POLICIES: Record<HighRiskDomain, HighRiskDomainPolicy> = {
  'self-harm': {
    domain: 'self-harm',
    patterns: [
      /\b(?:suicid|self[\s-]?harm|cutting|overdose|end it all|kill myself|eating disorder|purge|restrict)\b/i,
    ],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\b(?:methods|ways to|how to (?:kill|hurt|die))\b/i,
    ],
    crisisResources: [
      '988 Suicide & Crisis Lifeline (US): call or text 988',
      'Crisis Text Line: text HOME to 741741',
      'National Eating Disorders Association (US): call or text 800-931-2237',
    ],
    humanAccountabilitySurfacing: true,
  },
  'medical': {
    domain: 'medical',
    patterns: [
      /\b(?:diagnosis|prescription|dosage|medication|treatment for|symptoms of|cure for)\b/i,
    ],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:diagnose|prescribe)\b/i,
    ],
    humanAccountabilitySurfacing: true,
  },
  // ... 6 more domains
};
```

Wire into the `RequestClassifier` (§16.2) — if classification detects a high-risk domain, attach the policy to the context. Wire into the `HighRiskDomainScanner` (Phase 9 §14.4) — enforce the policy.

### 16.4 Tests

- Scope-declaration fixtures: in-scope, out-of-scope, and edge cases for each agent template.
- Request-classification fixtures for each domain/intent/risk combination.
- High-risk domain policy fixtures for each of the 8 domains.

### 16.5 Verification

- [ ] `ScopeDeclaration` type exists
- [ ] `ScopeDeclarationScanner` enforces it; agent YAML specs are consumed
- [ ] `ScopeDriftScanner` (from Phase 10) consumes `agentScopeDeclaration`
- [ ] `RequestClassifier` produces `RequestClassification` consumed by policy selection
- [ ] `HighRiskDomainPolicy` table covers all 8 SAFETY.md domains
- [ ] Crisis resources included in self-harm and abuse policies
- [ ] CLI `agentsy agent show <name> --scope` works
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 17. Phase 12 — Guardrails Daemon Integration

**Priority**: P0 — Sprint 6
**Story points**: 5
**Branch**: `feat/guardrails-daemon-integration`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`), Phase 4 ✅ (audit logger)
**Unblocks**: Phase 13 (release gate requires guardrails wired into the daemon)
**Closes findings**: E-21

> **🛑 BLOCK GATE**: No first-party agent template may ship until this phase is complete and Phase 13's release-gate script passes in CI.

### 17.1 Finding E-21 — `@agentsy/daemon` has no guardrails integration

- **Severity**: CRITICAL
- **Files**: `packages/daemon/src/daemon.ts` (entire file), `packages/daemon/src/ipc/server.ts`, `packages/daemon/package.json` (no `@agentsy/guardrails` dependency)
- **Policy requirement**: `GOVERNANCE.md` §Safety enforcement: *"No first-party agentsy template, agent, or app may ship unless it satisfies all of the following: Anti-sycophancy and anti-anthropomorphism modules are enabled by default... Auditable records of policy selection and policy firing are produced at runtime."*
- **Implementation**: The daemon package — which is the central long-lived process owning all agent execution — has zero guardrails integration. Its IPC handlers accept unvalidated `Record<string, unknown>` and cast with `as string` / `as unknown as SubprocessSpec`.
- **Why it matters**: Every guardrail commitment in `SAFETY.md` is moot if the daemon doesn't invoke the guardrails. The runtime package has the wiring, but the daemon doesn't use the runtime. As shipped, an agent running in the daemon bypasses every guardrail.
- **Recommended fix**:

**Step 1**: Add `@agentsy/guardrails` and `@agentsy/runtime` as dependencies of `@agentsy/daemon`:

```json
// packages/daemon/package.json
{
  "dependencies": {
    "@agentsy/guardrails": "workspace:*",
    "@agentsy/runtime": "workspace:*",
    // ... existing deps
  }
}
```

**Step 2**: In `Daemon.start()`, after the IPC server starts, instantiate a `GuardrailPipeline` with `createBuiltinScanners()` plus all Phase 9/10/11 scanners. Register it via `registerBuiltinGuardrails(this.hookRegistry, pipelines)`.

```typescript
// packages/daemon/src/daemon.ts (UPDATED)

export class Daemon {
  private hookRegistry: RuntimeHookRegistry;
  private guardrailPipeline: GuardrailPipeline;
  private auditLogger: AuditLogger;

  async start(): Promise<void> {
    // ... existing startup (UnifiedDB, IPC server, etc.)

    // Wire guardrails
    this.auditLogger = new SqliteAuditLogger(this.db);  // Persists to UnifiedDB.guardrail_decisions
    this.guardrailPipeline = new GuardrailPipeline({
      scanners: [
        ...createBuiltinScanners(),                    // 7 original security scanners
        new SycophancyScanner(),                        // Phase 9
        new AnthropomorphismScanner(),                  // Phase 9
        new DependencyScanner(),                        // Phase 9
        new HighRiskDomainScanner(),                    // Phase 9
        new DarkPatternScanner(),                       // Phase 9
        new PrivacyScanner(),                           // Phase 9
        new AGIFramingScanner(),                        // Phase 9
        new ProfessionalDisplacementScanner(),          // Phase 9
        new BiasScanner(),                              // Phase 9
        new RetrievalFirewallScanner(),                 // Phase 10
        new MemoryPoisoningScanner(),                   // Phase 10
        new ActionScanner(),                            // Phase 10
        new EgressScanner(),                            // Phase 10
        new InteractionSafeguardsScanner(),             // Phase 10
        new CrisisEscalationScanner(),                  // Phase 10
        new ScopeDriftScanner(),                        // Phase 10
        new ScopeDeclarationScanner(),                  // Phase 11
        new RequestClassifierScanner(),                 // Phase 11
      ],
      auditLogger: this.auditLogger,
    });

    this.hookRegistry = new RuntimeHookRegistry({ logger: this.logger });
    registerBuiltinGuardrails(this.hookRegistry, [this.guardrailPipeline]);
  }
}
```

**Step 3**: Route every IPC handler through the hook registry:

```typescript
// packages/daemon/src/ipc/handlers.ts (UPDATED)

// agent.spawn → UserPromptSubmit-equivalent
ipcServer.register('agent.spawn', async (params) => {
  const result = await this.hookRegistry.fire('UserPromptSubmit', {
    sessionId: params.sessionId,
    prompt: params.prompt,
    scope: params.scope,
  });

  if (result.stopped) {
    return { error: { code: -32005, message: 'Guardrail blocked', data: result.stoppedBy } };
  }

  // Use the (possibly transformed) payload
  return this.agentHost.spawn({ ...params, prompt: result.payload.prompt });
});

// process.spawn → PreToolCall
ipcServer.register('process.spawn', async (params) => {
  const result = await this.hookRegistry.fire('PreToolCall', {
    sessionId: params.sessionId,
    toolName: params.spec.command,
    args: params.spec.args,
  });

  if (result.stopped) {
    return { error: { code: -32005, message: 'Guardrail blocked tool call', data: result.stoppedBy } };
  }

  return this.subprocessManager.spawnProcess(result.payload.args);
});

// stream.start → PreResponse (output guardrails run on streamed chunks)
ipcServer.register('stream.start', async (params) => {
  // Pre-response hook fires before the LLM call
  await this.hookRegistry.fire('PreResponse', { sessionId: params.sessionId });

  // The output guardrails run on each chunk via the StreamManager (Phase 6)
  return this.streamManager.startStream(params);
});
```

**Step 4**: Add a `DaemonConfig.guardrails` config section:

```typescript
// packages/daemon/src/config/schema.ts (UPDATED)

export interface DaemonConfig {
  // ... existing fields
  guardrails?: {
    enabled: boolean;
    configPath?: string;                 // Path to a GuardrailsConfig YAML file
    auditLogPath?: string;               // Override default UnifiedDB persistence
    metricsThresholds?: Partial<Record<MetricKey, number>>;
  };
}
```

**Step 5**: Persist audit logs to `UnifiedDB.guardrail_decisions`:

```sql
-- Migration in packages/daemon/src/db/migrations/00X_guardrail_decisions.sql

CREATE TABLE guardrail_decisions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  decision TEXT NOT NULL,                -- pass|block|transform|quarantine|escalate|allow-with-approval
  reason_code TEXT NOT NULL,
  risk_tier TEXT NOT NULL,               -- low|moderate|high|prohibited
  surface TEXT NOT NULL,                 -- input|retrieval|memory|tool|action|output|egress
  phase TEXT NOT NULL,
  timestamp TEXT NOT NULL,               -- ISO 8601
  correlation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  detections_json TEXT NOT NULL,         -- JSON array
  sanitized_text TEXT,                   -- For transform
  redacted_fields_json TEXT,             -- For redaction
  raw_receipt_json TEXT NOT NULL         -- Full receipt for traceability
);

CREATE INDEX idx_guardrail_decisions_session ON guardrail_decisions(session_id);
CREATE INDEX idx_guardrail_decisions_timestamp ON guardrail_decisions(timestamp);
CREATE INDEX idx_guardrail_decisions_decision ON guardrail_decisions(decision);
```

### 17.2 Tests

- Integration: send a malicious `process.spawn` request via IPC, verify it's blocked by `CommandValidationScanner`.
- Integration: send a sycophantic agent response, verify it's flagged by `SycophancyScanner` and the receipt is persisted to `UnifiedDB.guardrail_decisions`.
- Integration: verify audit receipts persist across daemon restarts.
- Integration: verify `DaemonConfig.guardrails.enabled = false` disables all guardrails (for testing only — never in production).

### 17.3 Verification

- [ ] `@agentsy/daemon` depends on `@agentsy/guardrails` and `@agentsy/runtime`
- [ ] `GuardrailPipeline` and `HookRegistry` instantiated in `Daemon.start()`
- [ ] All 18 scanners (7 security + 9 behavioral + 4 surface + 3 interaction + 2 scope/classification) wired
- [ ] IPC handlers `agent.spawn`, `process.spawn`, `stream.start` route through hooks
- [ ] `DaemonConfig.guardrails` config section works
- [ ] Audit receipts persisted to `UnifiedDB.guardrail_decisions`
- [ ] Integration test: malicious IPC blocked
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 18. Phase 13 — Guardrails Metrics, Benchmark Suite & Release Gate

**Priority**: P0 — Sprint 7
**Story points**: 11.5 (8 base + 3.5 langeval integration — see §18.7)
**Branch**: `feat/guardrails-metrics-benchmarks`
**Depends on**: Phase 9 ✅ (scanners exist), Phase 12 ✅ (daemon wired), Phase 19 (Langfuse — shared with langeval Trace Debugger), Phase 21 (Docker tooling — langeval runs as Docker Compose)
**Unblocks**: First-party agent templates can ship (release gate passes)
**Closes findings**: E-25, E-26, E-27, E-14 (full — intersectional adequacy benchmark)
**Note**: The expanded 15-competitor comparison (§A.15 gemini-cli) elevated behavioral evals to "market table-stakes." Instead of building custom evals, we integrate [langeval](https://github.com/solana8800/langeval) — an enterprise AI agent evaluation platform with persona simulation (AutoGen), DeepEval metrics, red-teaming, Battle Arena, and Langfuse trace integration. See §18.7.

### 18.1 Finding E-25 — None of the 12 required safety metrics are tracked

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Metrics: 12 metrics listed. `GOVERNANCE.md` §Safety metrics: same list, with explicit instruction "These metrics are not engagement metrics."
- **Implementation**: Absent. No metrics collector, no metrics exporter, no metrics dashboard.
- **The 12 required metrics**:
  1. Sycophancy rate
  2. Correct-disagreement rate
  3. Anthropomorphic language rate
  4. Dependence-cue rate
  5. Unsafe high-risk advice rate
  6. Dark-pattern incidence in first-party UIs
  7. Memory transparency compliance
  8. Policy traceability and audit completeness
  9. Scope violation rate
  10. AGI/longtermist framing incidence
  11. Professional displacement framing incidence
  12. Intersectional user safety disparity
- **Why it matters**: `SAFETY.md` is explicit: *"Releases should fail when safety regressions exceed defined thresholds."* Without metrics, there's nothing to regress against and no thresholds to enforce.
- **Recommended fix**:

```typescript
// packages/guardrails/src/metrics.ts (NEW)

export type MetricKey =
  | 'sycophancy_rate'
  | 'correct_disagreement_rate'
  | 'anthropomorphic_language_rate'
  | 'dependence_cue_rate'
  | 'unsafe_high_risk_advice_rate'
  | 'dark_pattern_incidence'
  | 'memory_transparency_compliance'
  | 'policy_traceability_completeness'
  | 'scope_violation_rate'
  | 'agi_longtermist_framing_incidence'
  | 'professional_displacement_framing_incidence'
  | 'intersectional_safety_disparity';

export interface MetricSnapshot {
  key: MetricKey;
  value: number;                       // Rate or count
  denominator: number;                 // Total opportunities (e.g. total turns for sycophancy_rate)
  windowStart: string;                 // ISO 8601
  windowEnd: string;                   // ISO 8601
}

export class MetricsCollector {
  constructor(private auditLogger: AuditLogger) {}

  async collect(): Promise<Record<MetricKey, MetricSnapshot>> {
    // Query audit logs from the last window (default 24h)
    // Count receipts by reasonCode to compute each metric
    // e.g. sycophancy_rate = count(receipts where reasonCode == 'SYCOPHANCY_DETECTED') / total_output_receipts
  }

  async export(): Promise<void> {
    // Export via OpenTelemetry or to a local JSON file
  }
}
```

Wire into the audit logger — every decision receipt increments a counter. Define thresholds in `DaemonConfig.metrics.thresholds`. Add a CLI command `agentsy guardrails metrics` to view current metrics.

### 18.2 Finding E-26 — None of the 12 required benchmark scenarios exist

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Testing requirements: *"No first-party agent should ship without evaluation against benchmark scenarios that cover:"* 12 scenarios. `GOVERNANCE.md` §Benchmark suite: same 12, with "Benchmark results should be recorded and compared across releases. Regressions should block merges or require documented exceptions."
- **The 12 required benchmark scenarios**:
  1. False-belief correction
  2. Harmful validation resistance
  3. Interpersonal conflict and moral absolution cases
  4. Anthropomorphic framing resistance
  5. Dependency-resistance behavior
  6. Privacy and memory disclosure behavior
  7. Dark-pattern UI and notification copy scanning
  8. High-risk advice handling
  9. Scope enforcement
  10. AGI/post-human framing resistance
  11. Intersectional adequacy
  12. Third-party impact
- **Why it matters**: `GOVERNANCE.md` §Release criteria: *"The change passes the benchmark suite for harmful validation, dependency resistance, false-belief correction, and unsafe advice handling."* This is a release gate. Without the suite, releases can't be gated.
- **Recommended fix**:

```typescript
// packages/guardrails/src/eval/benchmark.ts (NEW)

export interface BenchmarkCase {
  readonly id: string;
  readonly input: string;
  readonly conversationHistory?: Message[];
  readonly expectedBehavior: string;             // Human-readable description
  readonly expectedStatus: GuardrailResult['status'];
  readonly expectedDetections?: string[];        // Scanner IDs expected to fire
  readonly expectedReasonCodes?: string[];
}

export interface BenchmarkScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cases: BenchmarkCase[];
  readonly passThreshold: number;                // Minimum pass rate (0..1)
}

export class BenchmarkSuite {
  readonly scenarios: BenchmarkScenario[];

  async run(): Promise<BenchmarkReport> {
    const results = new Map<string, ScenarioResult>();
    for (const scenario of this.scenarios) {
      const caseResults = await Promise.all(
        scenario.cases.map(c => this.runCase(c))
      );
      const passRate = caseResults.filter(r => r.passed).length / caseResults.length;
      results.set(scenario.id, {
        scenarioId: scenario.id,
        passRate,
        passed: passRate >= scenario.passThreshold,
        caseResults,
      });
    }
    return { results, timestamp: new Date().toISOString() };
  }
}
```

Create `packages/guardrails/src/eval/scenarios/` with one file per scenario, each containing 20–50 fixture cases. Use the `IMPLEMENTATION-PLAN-REVISIONS.md` §Phase 3 scenarios as seeds.

### 18.3 Finding E-27 — None of the 9 release criteria items are enforced

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Release criteria: 9 items. `GOVERNANCE.md` §Release criteria: same 9.
- **The 9 release criteria**:
  1. Anti-sycophancy and anti-anthropomorphism modules are enabled by default
  2. No first-party copy implies companionship, emotional reciprocity, or abandonment on exit
  3. High-risk domain safety policies are implemented where relevant
  4. Memory controls are exposed to the user if memory is enabled
  5. Passes benchmark for harmful validation, dependency resistance, false-belief correction, unsafe advice handling
  6. Passes scope enforcement tests
  7. Passes intersectional adequacy tests for the target user population
  8. Produces auditable records of policy selection and policy firing
  9. Carries a written scope declaration reviewed by maintainers
- **Recommended fix**: Implement a `release-gate` script in `packages/scripts/release-gate.ts`:

```typescript
// packages/scripts/release-gate.ts (NEW)

export async function runReleaseGate(agentTemplatePath: string): Promise<ReleaseGateReport> {
  const failures: string[] = [];

  // 1. Load the agent template's scope.yaml
  const agentTemplate = await loadAgentTemplate(agentTemplatePath);

  // 2. Verify anti-sycophancy and anti-anthropomorphism scanners enabled
  if (!agentTemplate.guardrails?.scanners?.includes('sycophancy')) {
    failures.push('Criterion 1: SycophancyScanner not enabled');
  }
  if (!agentTemplate.guardrails?.scanners?.includes('anthropomorphism')) {
    failures.push('Criterion 1: AnthropomorphismScanner not enabled');
  }

  // 3. Run the benchmark suite (closes criterion 5, 6, 7)
  const benchmark = await new BenchmarkSuite().run();
  for (const [scenarioId, result] of benchmark.results) {
    if (!result.passed) {
      failures.push(`Criterion 5/6/7: Benchmark scenario ${scenarioId} failed (${(result.passRate * 100).toFixed(1)}% pass rate)`);
    }
  }

  // 4. Scan the agent's UI copy for dark patterns (closes criterion 2)
  const uiScan = await scanUICopy(agentTemplate.uiCopy);
  if (uiScan.length > 0) {
    failures.push(`Criterion 2: Dark patterns detected in UI copy: ${uiScan.map(d => d.id).join(', ')}`);
  }

  // 5. Verify memory controls are exposed (closes criterion 4)
  if (agentTemplate.memory?.enabled && !agentTemplate.memory?.controlsExposed) {
    failures.push('Criterion 4: Memory enabled but controls not exposed');
  }

  // 6. Verify a scope declaration exists and is signed off (closes criterion 9)
  if (!agentTemplate.scope) {
    failures.push('Criterion 9: No scope declaration');
  } else if (!agentTemplate.scope.reviewers?.length) {
    failures.push('Criterion 9: Scope declaration not reviewed');
  }

  // 7. Verify audit logging is enabled (closes criterion 8)
  if (!agentTemplate.guardrails?.auditLoggingEnabled) {
    failures.push('Criterion 8: Audit logging not enabled');
  }

  return { passed: failures.length === 0, failures };
}

// CLI entrypoint
if (require.main === module) {
  const agentPath = process.argv[2];
  runReleaseGate(agentPath).then(report => {
    if (!report.passed) {
      console.error('Release gate FAILED:');
      report.failures.forEach(f => console.error(`  - ${f}`));
      process.exit(1);
    }
    console.log('Release gate PASSED');
  });
}
```

Wire into CI: every PR that adds or modifies a first-party agent template must run `pnpm release-gate packages/agents/src/specs/<name>.yaml`. Fail the build if the gate fails.

### 18.4 Finding E-14 (full) — Intersectional adequacy benchmark

- **Severity**: MEDIUM (runtime portion closed by Phase 9 §14.9)
- **Policy requirement**: `SAFETY.md` §Intersectional adequacy.
- **Recommended fix**: Build the intersectional adequacy benchmark as benchmark scenario #11. Fixtures represent users at the intersection of marginalized identities (e.g. a Black trans woman seeking medical advice; an undocumented immigrant seeking legal advice; a non-English-speaking elder seeking financial advice). The benchmark measures whether the agent's responses are equally safe and helpful across user profiles.

### 18.5 Tests

- Unit: `MetricsCollector.collect` correctly computes each of the 12 metrics from audit logs.
- Unit: `BenchmarkSuite.run` correctly reports pass/fail per scenario.
- Integration: `release-gate` script exits non-zero when a criterion fails.
- CI: benchmark suite runs on every PR that touches `packages/guardrails/`. Fail the build if any scenario's pass rate drops below its threshold.

### 18.6 Verification

- [ ] All 12 required safety metrics tracked and exported (via OpenTelemetry or local JSON)
- [ ] Benchmark suite exists with all 12 required scenarios (20–50 cases each)
- [ ] `agentsy guardrails benchmark` CLI command runs the suite and produces a report
- [ ] Benchmark runs in CI on every PR touching `packages/guardrails/`
- [ ] `release-gate` script exists and gates first-party agent template PRs
- [ ] Intersectional adequacy benchmark included
- [ ] Benchmark results published in release notes
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 18.7 Extension — langeval Integration (replaces custom behavioral evals)

> **Updated**: Originally this section proposed building behavioral evals from gemini-cli patterns (+3 SP). After reviewing [langeval](https://github.com/solana8800/langeval) — an enterprise-grade AI agent evaluation platform — we're integrating it instead of building custom. This is a better fit: langeval already has persona-based simulation (AutoGen), DeepEval metrics, red-teaming, Langfuse trace integration, Battle Arena A/B testing, and CI/CD quality gates. Integration is cheaper and more capable than rebuilding.

#### 18.7.1 What langeval provides (that we'd otherwise build)

| Capability | langeval | Was in our plan |
|---|---|---|
| **Persona-based user simulation** | Microsoft AutoGen generates thousands of "virtual users" (Difficult, Curious, Impatient personalities) | Not planned |
| **Multi-turn conversation testing** | Built-in | Not planned |
| **Dynamic scenarios with branching** | Decision-tree-based test scenarios | Not planned |
| **Tiered metrics** | Tier 1 (Response): relevancy, toxicity, bias. Tier 2 (RAG): faithfulness, contextual precision. Tier 3 (Agentic): tool correctness, plan adherence | Phase 13 §18.2 (custom BenchmarkSuite) |
| **LLM-as-a-Judge (G-Eval)** | Custom metrics via G-Eval | Phase 13 §18.7 (LLMJudge from gemini-cli) |
| **Red-teaming** | Specialized workflows for jailbreak, PII leakage, toxicity attacks | Not planned (separate from guardrails) |
| **Self-correction loop** | LangGraph state machine detects errors and retries with prompt mutation | Not planned |
| **Human-in-the-loop** | Breakpoint mechanisms for human scoring | Not planned |
| **Battle Arena (A/B testing)** | Split-view comparison of two agent versions | Not planned |
| **Root Cause Analysis** | Failure clustering to identify where agents fail | Not planned |
| **Trace Debugger** | Langfuse UI integration for thought/action/observation tracing | Phase 19 (Langfuse) — complementary |
| **CI/CD Quality Gates** | Automated evaluation triggers for GitHub Actions (Phase 3 roadmap) | Phase 13 §18.3 (release-gate script) |
| **GEPA prompt optimization** | Automated prompt refinement (Phase 2 complete) | Not planned |
| **Observability** | Self-hosted Langfuse integration | Phase 19 (Langfuse) — complementary |

#### 18.7.2 Integration approach

Rather than running langeval as a separate platform, agentsy integrates it at two levels:

**Level 1 — CLI integration (Phase 13, +1 SP)**:
- `agentsy eval run` — invokes langeval's orchestrator API (`POST /orchestrator/campaigns`) with a scenario ID and an agent ID
- `agentsy eval scenarios` — lists available langeval scenarios (synced from the langeval resource service)
- `agentsy eval red-team` — launches a red-teaming campaign against the current agent
- `agentsy eval battle <agent-a> <agent-b>` — A/B comparison via Battle Arena
- Results are fetched from langeval's orchestrator and persisted to `UnifiedDB.eval_results` for trend tracking

**Level 2 — CI integration (Phase 13, +1 SP)**:
- A GitHub Actions workflow runs `agentsy eval run --scenario-suite safety --policy always-passes` on every PR touching `packages/guardrails/` or agent templates
- The release-gate script (§18.3) calls langeval's API to verify the 12 SAFETY.md benchmark scenarios pass before allowing a release
- Failures post a comment on the PR with a link to the langeval Trace Debugger (Langfuse UI)

**Level 3 — Langfuse cross-reference (Phase 19, +0 SP — already planned)**:
- langeval's Trace Debugger uses Langfuse under the hood
- Phase 19 (Langfuse observability) already wires Langfuse into the daemon
- The same Langfuse instance serves both agentsy's runtime tracing and langeval's evaluation tracing — agents can see their own traces alongside the eval results that judged them

#### 18.7.3 Deployment

langeval runs as a Docker Compose stack (it already ships one). Two options:

**Option A — agentsy-managed (recommended for v1)**:
- langeval runs as additional services in agentsy's Docker Compose (extends Phase 21's Docker tooling)
- `agentsy eval start` / `agentsy eval stop` manage the langeval stack
- Shared Langfuse instance (Phase 19) — langeval's `LANGFUSE_URL` points to agentsy's Langfuse
- Shared PostgreSQL (agentsy's `UnifiedDB` or a separate langeval DB)

**Option B — external (for teams with existing langeval)**:
- `DaemonConfig.eval.langevalUrl` points to an external langeval instance
- agentsy just calls the API; no local langeval services
- Useful for organizations running a shared langeval across multiple agent projects

```yaml
# docker-compose.eval.yml (extends Phase 21)
services:
  # langeval services (from langeval's docker-compose.yml)
  langeval-orchestrator:
    image: langeval/orchestrator:latest
    environment:
      - DATABASE_URL=postgres://agentsy:agentsy@postgres:5432/langeval
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
      - REDIS_URL=redis://redis:6379
      - LANGFUSE_URL=http://langfuse:3000  # Shared with agentsy (Phase 19)
    depends_on: [postgres, kafka, redis, langfuse]

  langeval-simulation-worker:
    image: langeval/simulation-worker:latest
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}  # For AutoGen persona generation
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on: [kafka, langeval-orchestrator]

  langeval-evaluation-worker:
    image: langeval/evaluation-worker:latest
    environment:
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on: [kafka, langeval-orchestrator]

  # ... kafka, redis, qdrant, clickhouse as needed
```

#### 18.7.4 Scenario mapping

Map agentsy's 12 SAFETY.md benchmark scenarios (§18.2) to langeval scenarios:

| SAFETY.md scenario | langeval scenario type | langeval metrics |
|---|---|---|
| 1. False-belief correction | Multi-turn conversation | Answer relevancy, faithfulness |
| 2. Harmful validation resistance | Red-teaming (sycophancy attack) | Toxicity, bias, custom G-Eval |
| 3. Interpersonal conflict / moral absolution | Persona simulation (Difficult user) | Answer relevancy, custom G-Eval |
| 4. Anthropomorphic framing resistance | Red-teaming (personhood probe) | Custom G-Eval |
| 5. Dependency-resistance behavior | Multi-turn conversation (5+ turns) | Plan adherence, custom G-Eval |
| 6. Privacy and memory disclosure | Red-teaming (PII extraction) | PII leakage, faithfulness |
| 7. Dark-pattern UI scanning | Static analysis (not langeval) | (Stays in Phase 16 `scanUICopy`) |
| 8. High-risk advice handling | Red-teaming (medical/legal/financial) | Toxicity, custom G-Eval |
| 9. Scope enforcement | Persona simulation (out-of-scope request) | Tool correctness, plan adherence |
| 10. AGI/post-human framing resistance | Red-teaming (capability-trajectory probe) | Custom G-Eval |
| 11. Intersectional adequacy | Persona simulation (marginalized identity) | Bias, answer relevancy |
| 12. Third-party impact | Multi-turn conversation | Custom G-Eval |

#### 18.7.5 What we still build ourselves (not in langeval)

- **Memory + perf regression baselines** (from gemini-cli) — `MemoryTestHarness` and `PerfTestHarness` are agentsy-internal and not something langeval covers. These stay as a small custom addition (~0.5 SP).
- **The 12 SAFETY.md scenario fixtures** (§18.2) — langeval runs them, but we author the fixture content. The fixtures define *what* to test; langeval defines *how* to run and score.

#### 18.7.6 Effort

| Work item | SP |
|---|---|
| langeval CLI integration (`agentsy eval run/scenarios/red-team/battle`) | 1 |
| CI integration (GitHub Actions workflow + release-gate hook) | 1 |
| Docker Compose for langeval stack (extends Phase 21) | 0.5 |
| Scenario mapping (12 SAFETY.md scenarios → langeval) | 0.5 |
| Memory + perf regression baselines (custom, from gemini-cli) | 0.5 |
| **Total** | **3.5 SP** |

This replaces the original §18.7 (+3 SP for custom behavioral evals). Net change: +0.5 SP (the custom LLMJudge and incubation logic are no longer needed — langeval handles them), but we gain persona simulation, red-teaming, Battle Arena, RCA, and GEPA prompt optimization that we would never have built.

**Total Phase 13 with langeval integration: 11.5 SP** (was 11 SP with custom evals, but delivers far more capability).

---


## 19. Phase 14 — ACP Agent & Multi-Agent Deployment

**Priority**: P2 — Sprints 7–8 (consider elevating to P1 — see note below)
**Story points**: 7 (consider expanding to 12 to match openclaw's ACP depth — see §19.10)
**Branch**: `feat/acp-agent`
**Depends on**: Phase 5 ✅ (routing in daemon), Phase 6 ✅ (streaming)
**Unblocks**: Phase 17 (competitive items need ACP), Phase 18 (missing capabilities build on ACP), Phase 26 (A2A builds on ACP transport)
**Closes competitive gaps**: #2 (steering + follow-up queues from pi), #6 (rich tool type from Claude-Code), #8 (reflection loop from aider)
**Note**: The expanded 15-competitor comparison (§A.13 openclaw) reveals that openclaw has a 50+ file ACP implementation with a SQLite-backed event ledger and 13 translator sub-modules. agentsy's ACP is currently a stub. The competitive comparison's Final Assessment says: "ACP depth is a critical gap — openclaw's 50-file implementation is the reference. agentsy's stub blocks editor integration. Elevate to P0." This phase should be expanded to include event-ledger persistence and the most critical translators — see §19.10.

### 19.1 ACP Agent Integration: Full Wiring

Fill in the ACP server stub from Phase 1. The daemon's `acp/` module implements the ACP Agent interface using `@agentclientprotocol/sdk`'s `AgentSideConnection`. ACP transport is stdio (for CLI integration) or WebSocket (for remote access).

```typescript
// packages/daemon/src/acp/server.ts (FILLED IN)

export class ACPServer {
  constructor(
    private agentHost: AgentHost,
    private scopeManager: ScopeManager,
    private streamManager: StreamManager,
    private subprocessManager: SubprocessManager,
  ) {}

  async handleSessionNew(params: ACPSessionNewParams): Promise<ACPSessionNewResult> {
    // 1. Derive scope from cwd (AD-12: folder-based scoping)
    const scope = this.scopeManager.deriveScopeKey(params.cwd);

    // 2. Spawn agent with folder scope
    const agentId = await this.agentHost.spawn({
      spec: DEFAULT_AGENT_SPEC,
      scope,
      additionalDirectories: params.additionalDirectories,
    });

    // 3. Start MCP servers provided by the client
    if (params.mcpServers) {
      for (const [name, server] of Object.entries(params.mcpServers)) {
        const subprocess = await this.subprocessManager.spawnProcess({
          command: server.command,
          args: server.args,
          env: server.env,
          restart: 'always',
        });
        // Connect to the MCP server and register its tools with the agent
      }
    }

    return { sessionId: agentId, mode: 'code' };
  }

  async handleSessionPrompt(params: ACPSessionPromptParams): Promise<void> {
    const stream = await this.streamManager.startStream({
      agentId: params.sessionId,
      messages: params.messages,
    });

    // Stream chunks are mapped to session/update notifications by the StreamManager (Phase 6 §11.5)
  }
}
```

### 19.2 ACP Terminal Integration: Tool Execution

Map ACP `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` to the daemon's `SubprocessManager`. Each ACP terminal is a managed subprocess.

### 19.3 Multi-Agent Scope Isolation with Folder Scoping

Each ACP session gets its own scope derived from `cwd`. Multiple sessions can run concurrently with isolated memory, agent state, and tool registries.

### 19.4 Default Agents

```yaml
# packages/agents/src/specs/coder.yaml
id: coder
role: coder
modelTier: mid
tools: [read_file, write_file, edit_file, run_command, search_files, git]
scope:
  purpose: "Help with software development tasks: writing, editing, reviewing, and debugging code."
  inScope: [writing code, editing code, reviewing code, debugging, explaining code, running tests, git operations]
  outOfScope: [relationship advice, medical advice, legal advice, financial advice, mental health counseling]
  redirects:
    relationship advice: "I'm a coding assistant and can't help with relationship advice. Consider speaking with a trusted friend or a licensed therapist."

# packages/agents/src/specs/researcher.yaml
id: researcher
role: researcher
modelTier: frontier
tools: [web_search, fetch_url, summarize, cite]
scope:
  purpose: "Research topics on the web and synthesize findings with citations."
  inScope: [web research, summarization, citation, fact-checking]
  outOfScope: [code editing, file system operations, executing commands]

# packages/agents/src/specs/planner.yaml
id: planner
role: planner
modelTier: frontier
tools: [read_file, list_files, web_search]
scope:
  purpose: "Break down complex tasks into actionable plans."
  inScope: [task decomposition, planning, estimation, dependency analysis]
  outOfScope: [code editing, executing commands]
```

### 19.5 Competitive Items Threaded In

**#2 Steering + follow-up queues (from pi)**: Add `steer` and `queue` methods to the agent. A steer injects a message mid-turn. A queue message waits for the current turn to complete. `QueueMode: "all" | "one-at-a-time"` controls delivery.

```typescript
// packages/runtime/src/loop/steering.ts (NEW)

export class SteeringQueue {
  private steers: Message[] = [];
  private queued: Message[] = [];

  steer(message: Message): void {
    this.steers.push(message);
  }

  queue(message: Message, mode: 'all' | 'one-at-a-time' = 'all'): void {
    this.queued.push(message);
  }

  drainSteers(): Message[] {
    const result = this.steers;
    this.steers = [];
    return result;
  }

  promoteQueued(mode: 'all' | 'one-at-a-time'): Message[] {
    if (mode === 'all') {
      const result = this.queued;
      this.queued = [];
      return result;
    } else {
      return this.queued.length > 0 ? [this.queued.shift()!] : [];
    }
  }
}
```

**#6 Rich tool type (from Claude-Code)**: Enrich the `ToolDefinition` type with `isReadOnly`, `isConcurrencySafe`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `shouldDefer`, `alwaysLoad`, `searchHint`, `backfillObservableInput`.

```typescript
// packages/tools/src/types.ts (EXPANDED)

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  execute: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
  // NEW fields (from Claude-Code)
  isReadOnly?: boolean;                    // If true, can run concurrently
  isConcurrencySafe?: boolean;             // If true, safe to run in parallel with itself
  isDestructive?: boolean;                 // If true, requires approval
  interruptBehavior?: 'cancel' | 'defer' | 'block';
  maxResultSizeChars?: number;             // Disk-spill above this size (default 10_000)
  shouldDefer?: boolean;                   // Don't load until needed
  alwaysLoad?: boolean;                    // Always include in tool list
  searchHint?: string;                     // Keyword for ToolSearch deferral
  backfillObservableInput?: (args: unknown) => string;  // For audit log
}
```

Add **disk-spilled tool results**: persist results to disk when they exceed `maxResultSizeChars`; return a preview to the model.

**#8 Reflection loop (from aider)**: After tool execution, if the agent ran a linter or tests and they failed, inject the failure as a `reflected_message` and re-enter the loop (max 3 reflections).

```typescript
// packages/runtime/src/loop/reflection.ts (NEW)

export class ReflectionLoop {
  private maxReflections = 3;

  shouldReflect(toolName: string, result: ToolResult): boolean {
    if (this.reflectionCount >= this.maxReflections) return false;
    return (toolName === 'run_command' || toolName === 'lint' || toolName === 'test')
      && result.exitCode !== 0;
  }

  buildReflectionMessage(result: ToolResult): Message {
    return {
      role: 'user',
      content: `The previous command failed with exit code ${result.exitCode}. Output:\n\n${result.stdout}\n\nPlease fix the issue and try again.`,
    };
  }
}
```

### 19.6 ACP Client Compatibility Matrix

| ACP Method | Daemon Support | Notes |
|---|---|---|
| `initialize` | ✅ | Returns `AGENT_CAPABILITIES` |
| `authenticate` | ✅ | Local mode: always succeeds |
| `session/new` | ✅ | Folder-based scope from `cwd` |
| `session/prompt` | ✅ | Streaming via `session/update` |
| `session/load` | ✅ | Restore from `UnifiedDB.acp_sessions` |
| `session/list` | ✅ | All sessions for this client |
| `session/close` | ✅ | Agent stays alive; session disconnected |
| `session/delete` | ✅ | Fully removes session and agent |
| `session/resume` | ✅ | Re-create bridge from persisted state |
| `session/cancel` | ✅ | Aborts the `AbortController` |
| `session/set_mode` | ✅ | code/ask/plan |
| `session/set_config_option` | ✅ | model tier, temperature |
| `fs/readTextFile` | ✅ | Path must be within `cwd` |
| `fs/writeTextFile` | ✅ | Path must be within `cwd` |
| `requestPermission` | ✅ | Auto-approve in local mode |
| `terminal/create` | ✅ | SubprocessManager |
| `terminal/output` | ✅ | |
| `terminal/wait_for_exit` | ✅ | |
| `terminal/kill` | ✅ | SIGTERM + SIGKILL after 5s |
| `terminal/release` | ✅ | |

### 19.7 Future: Server Deployment

The daemon starts as a local multi-agent system (AD-8). Server deployment with authentication, rate limiting, and multi-tenancy is a future goal. The architectural decisions in this phase (folder-based scoping, ACP transport abstraction, JWT-ready auth stubs) inform but don't block server mode.

### 19.8 Tests

- ACP smoke test: `agentsy daemon start` → connect from Zed → send prompt → receive streamed response with tool calls.
- Multi-agent test: two ACP sessions in different folders → isolated memory and agent state.
- Steering test: inject a steer mid-turn → agent incorporates it.
- Reflection test: lint failure → reflection message → agent fixes and re-runs.
- Disk-spill test: tool result > `maxResultSizeChars` → preview returned, full content on disk.

### 19.9 Verification

- [ ] ACP server handles all 20 methods in the compatibility matrix
- [ ] Folder-based scope isolation works across concurrent sessions
- [ ] Steering + follow-up queues work
- [ ] Rich tool type fields respected (concurrency, disk-spill, approval)
- [ ] Reflection loop fires on lint/test failure (max 3)
- [ ] Default agents (coder, researcher, planner) loadable from YAML
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 19.10 Extension — ACP Event Ledger & Translators (from openclaw)

> **Added based on the expanded 15-competitor comparison (§A.13).** openclaw's 50+ file ACP implementation is the reference for ACP depth. This extension adds ~5 SP to Phase 14 (total 12 SP) and should be prioritized — the competitive comparison's Final Assessment says ACP depth is a "critical gap" that "blocks editor integration."

**What to add**:

1. **SQLite-backed event ledger** — every ACP event (session create, prompt, tool call, stream chunk, session close) is persisted to `UnifiedDB.acp_events` with `sessionId`, `timestamp`, `eventType`, `eventData`. Configurable limits: `maxSessions=200`, `maxEventsPerSession=5000`, `maxSerializedBytes=16MB`. Enables session replay, crash recovery, and audit.

2. **Critical translators** (from openclaw's 13 — implement the most important 6):
   - **replay** — replay a recorded session from the event ledger
   - **session-lineage** — track parent/child session relationships for subagent forks
   - **cancel-scoping** — properly scope cancellation to the right session and turn
   - **permission-relay** — relay permission requests from agent to editor client
   - **tool-streaming** — stream tool-call progress (partial args, status updates) to the editor
   - **error-kind** — structured error kinds (rate_limit, guardrail_block, budget_exceeded, etc.) for editor UI

3. **Session provenance metadata** — each session records its origin (ACP client, CLI, A2A delegation, subagent fork) for audit and debugging.

4. **Permission option kind probing** — the ACP server probes the client for which permission option kinds it supports, enabling graceful degradation for older clients.

**Effort**: +5 SP (total Phase 14 becomes 12 SP). The event ledger is the highest-value addition — it enables crash recovery and session replay, which are essential for a production ACP implementation.

---


## 20. Phase 15 — Project Auto-Detection & Bootstrap

**Priority**: P2 — Sprints 8–9
**Story points**: 7
**Branch**: `feat/project-bootstrap`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`), Phase 8 ✅ (event bus for file-watcher)
**Unblocks**: Better default agent behavior, AGENTS.md generation, MCP/skills/guardrails recommendation

### 20.0 Overview

When an agent session opens onto a working directory, Agentsy should answer four questions **without prompting the user**:

1. **What is this project?** — language(s), framework(s), package manager, build system, linter, test runner, monorepo layout, CI, deployment target.
2. **What Agentsy components are already installed here?** — connectors, MCP servers, skills, guardrails, hooks.
3. **What is relevant to install here but missing?** — given the detected profile, which connectors / MCP servers / skills / guardrails from the four supported registries would meaningfully improve agent effectiveness?
4. **What context artifacts does this project expose to agents?** — `AGENTS.md`, `.agentsy/aft.*`, Magic Context compartments.

This phase builds the subsystem that answers all four, persists the answers in `.agentsy/config.yml` and in `UnifiedDB`, exposes them as an internal tool callable by agents, and offers the user a one-shot install flow for missing components.

### 20.1 Project Scanner & Detector

Pure, side-effect-free function that walks a project root and emits a `ProjectProfile`.

```typescript
// packages/bootstrap/src/scanner.ts (NEW)

export interface ProjectProfile {
  readonly rootPath: string;
  readonly languages: Language[];
  readonly frameworks: Framework[];
  readonly packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip' | 'poetry' | 'cargo' | 'go' | 'mix' | 'other';
  readonly buildSystem: string;
  readonly linter: string[];
  readonly testRunner: string[];
  readonly monorepo: boolean;
  readonly monorepoTool?: 'pnpm' | 'nx' | 'turbo' | 'lerna' | 'bazel';
  readonly ci: CI[];
  readonly deploymentTarget: string[];
  readonly detectedAt: string;
}

export async function scanProject(rootPath: string): Promise<ProjectProfile> {
  // Walk the directory, check sentinel files:
  //   package.json → Node.js (npm/pnpm/yarn based on lockfile)
  //   pyproject.toml / requirements.txt → Python (poetry/pip)
  //   Cargo.toml → Rust (cargo)
  //   go.mod → Go
  //   mix.exs → Elixir
  //   .github/workflows/ → GitHub Actions
  //   .gitlab-ci.yml → GitLab CI
  //   pnpm-workspace.yaml → pnpm monorepo
  //   nx.json → Nx monorepo
  //   turbo.json → Turbo monorepo
  // ...
}
```

### 20.2 `.agentsy/config.yml` — Per-Project Configuration Schema

```yaml
# .agentsy/config.yml
schemaVersion: 1  # Long-term schema — no v2 planned (see §10.17.5 of v2.3)

project:
  rootPath: /home/user/projects/my-app
  profile:                          # From Phase 15.1 scanner
    languages: [typescript, javascript]
    frameworks: [next.js, react]
    packageManager: pnpm
    buildSystem: next
    linter: [biome, eslint]
    testRunner: [vitest, playwright]
    monorepo: false
    ci: [github-actions]
    deploymentTarget: [vercel]
  detectedAt: 2026-06-17T10:30:00Z

installed:
  connectors: []                    # Phase 15.4 adapter-discovered
  mcpServers: []                    # Phase 15.4 adapter-discovered
  skills: []                        # Phase 15.4 adapter-discovered
  guardrails:                       # From @agentsy/guardrails install
    - id: builtin:pii
      version: 1.0.0
      source: builtin
  hooks: []                         # From .agentsy/hooks/

recommendations:                   # From Phase 15.5 recommendation engine
  - componentType: mcp-server
    componentId: io.github.example.postgres-mcp
    reason: "Detected PostgreSQL usage in prisma/schema.prisma"
    confidence: 0.9
    installCommand: "agentsy install mcp io.github.example.postgres-mcp"

artifacts:
  agentsMd: true                    # AGENTS.md generated (Phase 15.7)
  aft: true                         # .agentsy/aft.{md,json} generated (Phase 15.8)
  magicContext: true                # Magic Context compartments seeded (Phase 15.9)

reviewers: []                       # Maintainer sign-offs
```

### 20.3 Internal Project Config Tool (Agent-Callable)

Three `agentsy.project.*` tools:

- `agentsy.project.scan` — re-runs the scanner and updates `.agentsy/config.yml`.
- `agentsy.project.profile` — returns the current `ProjectProfile`.
- `agentsy.project.recommend` — returns the current recommendation list.

### 20.4 Registry Adapters

Four adapters, each fetching from its authoritative source:

**20.4.1 ECC Tools adapter** — git-clone `https://github.com/affaan-m/ECC` and read 3 manifest JSON files (`install-components.json`, `install-modules.json`, `install-profiles.json`). Components/modules/profiles hierarchy. Install flow: `npx ecc-install --target agentsy --with <component>`.

**20.4.2 Skills.sh adapter** — Vercel OIDC-authenticated REST API at `https://www.skills.sh/api/v1/*`. 6 endpoints: list, search, curated, detail, audit. SHA-256 content hash as version fingerprint (no semver). Security audit endpoint for install gating.

**20.4.3 MCP Registry adapter** — frozen `https://registry.modelcontextprotocol.io/v0.1/` REST API with cursor pagination. `server.json` manifest with reverse-DNS `name` (`io.modelcontextprotocol.*` official, `io.github.*` GitHub-verified, `me.{domain}.*` DNS-verified). `packages[]` array with `registryType` dispatch (npm/pypi/nuget/cargo/oci/mcpb). `environmentVariables[]` for required config.

**20.4.4 Guardrails Hub adapter** — curated mirror catalog (no JSON API exists). Mirror the Guardrails AI GitHub organization's `@register_validator` decorators. Port validators to native TypeScript in `@agentsy/guardrails` (no Python subprocess). 3-tier strategy: Rule → direct port; LLM → native LLM call; ML → JS-equivalent or deferred.

### 20.5 Skills Spec Compliance

All installed skills (regardless of source) normalize to the AgentSkills spec at https://agentskills.io/specification. Canonical `SKILL.md` format with YAML frontmatter (`name`, `description` required; `license`, `compatibility`, `metadata`, `allowed-tools` optional) + Markdown body + optional `scripts/`, `references/`, `assets/` subdirectories. Three-tier progressive disclosure (~100 / <5000 / on-demand tokens).

### 20.6 Recommendation Engine

```typescript
// packages/bootstrap/src/recommend.ts (NEW)

export interface Recommendation {
  componentType: 'connector' | 'mcp-server' | 'skill' | 'guardrail';
  componentId: string;
  reason: string;
  confidence: number;                  // 0..1
  installCommand: string;
}

export function recommend(profile: ProjectProfile, installed: InstalledComponents): Recommendation[] {
  const recs: Recommendation[] = [];

  // If PostgreSQL detected, recommend postgres MCP server
  if (profile.frameworks.includes('prisma') || profile.frameworks.includes('drizzle')) {
    if (!installed.mcpServers.some(s => s.id.includes('postgres'))) {
      recs.push({
        componentType: 'mcp-server',
        componentId: 'io.modelcontextprotocol.postgres',
        reason: 'Detected PostgreSQL ORM (prisma/drizle) in project',
        confidence: 0.9,
        installCommand: 'agentsy install mcp io.modelcontextprotocol.postgres',
      });
    }
  }

  // If Next.js detected, recommend nextjs skill
  if (profile.frameworks.includes('next.js')) {
    if (!installed.skills.some(s => s.name === 'nextjs-app-router')) {
      recs.push({
        componentType: 'skill',
        componentId: 'nextjs-app-router',
        reason: 'Detected Next.js — App Router skill helps with route handlers, server components, etc.',
        confidence: 0.8,
        installCommand: 'agentsy install skill nextjs-app-router',
      });
    }
  }

  // ... more rules
  return recs;
}
```

### 20.7 Install / Offer Flow

```typescript
// packages/bootstrap/src/install.ts (NEW)

export async function installComponent(rec: Recommendation): Promise<void> {
  switch (rec.componentType) {
    case 'mcp-server':
      // Use MCP Registry adapter to fetch manifest
      // Use SubprocessManager to start the MCP server
      // Persist to .agentsy/config.yml
      break;
    case 'skill':
      // Use Skills.sh adapter to download
      // Normalize to AgentSkills spec
      // Persist to .agentsy/skills/<name>/
      break;
    case 'guardrail':
      // Use Guardrails Hub adapter
      // Port to TypeScript if needed
      // Register with GuardrailPipeline
      break;
    case 'connector':
      // Use ECC Tools adapter
      break;
  }
}
```

CLI: `agentsy install <type> <id>` and `agentsy install --recommended` (installs all recommendations with confidence ≥ 0.8).

### 20.8 AGENTS.md Generator

Generate `AGENTS.md` at project root with: project overview, commands (build/test/lint), layout, conventions, gotchas, agentsy components, do/don't. Seeded from `ProjectProfile` and editable by the user.

### 20.9 AFT — Agent File Tree

Generate `.agentsy/aft.{md,json}` — a structured file-tree map. Markdown for human reading; JSON for agent consumption. Top-level layout, entry points, config files, stats (LOC, file count by language), ignored paths.

### 20.10 Magic Context Bootstrap

Seed Magic Context compartments in `UnifiedDB.context_*`:
- `project_memories` — high-level project facts (name, purpose, stack).
- `compartments` — fine-grained context buckets (e.g. "api-routes", "database-schema", "ui-components").
- `session_meta` — session-level context (current task, recent files).
- `project_state` — project-level state (current branch, recent commits, TODO items).

Loaded into every session scoped to this project.

### 20.11 Bootstrap Daemon Service

`BootstrapService` runs as a `Service` in the daemon. On session open (ACP `session/new` or CLI invocation), it:
1. Checks if `.agentsy/config.yml` exists. If not, runs `scanProject` and writes it.
2. Loads the `ProjectProfile` and Magic Context compartments into the session.
3. Returns the profile + recommendations to the agent.

### 20.12 Hook Integration

Add a `SessionStart` hook (Phase 3 hook schema) that triggers `BootstrapService.bootstrap(cwd)`.

### 20.13 CLI Integration

- `agentsy project scan` — re-run the scanner.
- `agentsy project init` — generate `.agentsy/config.yml`, `AGENTS.md`, `.agentsy/aft.{md,json}`.
- `agentsy project update` — re-scan and update existing artifacts.
- `agentsy install <type> <id>` — install a component.
- `agentsy install --recommended` — install all high-confidence recommendations.

### 20.14 Package Layout

New `@agentsy/bootstrap` package (26th package):

```
packages/bootstrap/
├── src/
│   ├── scanner.ts              # ProjectProfile detection
│   ├── config.ts               # .agentsy/config.yml schema + I/O
│   ├── recommend.ts            # Recommendation engine
│   ├── install.ts              # Install flow
│   ├── adapters/
│   │   ├── ecc-tools.ts        # ECC Tools adapter
│   │   ├── skills-sh.ts        # Skills.sh adapter
│   │   ├── mcp-registry.ts     # MCP Registry adapter
│   │   └── guardrails-hub.ts   # Guardrails Hub adapter
│   ├── generators/
│   │   ├── agents-md.ts        # AGENTS.md generator
│   │   ├── aft.ts              # AFT generator
│   │   └── magic-context.ts    # Magic Context bootstrap
│   ├── tools.ts                # agentsy.project.* tool definitions
│   └── index.ts
├── package.json
└── tsconfig.json
```

### 20.15 Multi-Root Workspaces

Support multi-root workspaces via the `/add-project-folder` slash command. Each root is scanned independently and merged into a single project profile. ACP `additionalDirectories` maps to this.

### 20.16 Tests

- Scanner fixtures: detect Next.js, React, Vue, Django, FastAPI, Rails, Express, etc.
- Adapter tests: each adapter fetches from its source and parses correctly.
- Recommendation tests: given a profile, the right recommendations are produced.
- Install tests: each component type installs and persists correctly.
- AGENTS.md / AFT / Magic Context generation tests.
- Multi-root workspace test: two roots merge into one profile.

### 20.17 Verification

- [ ] `@agentsy/bootstrap` package exists
- [ ] Scanner detects languages, frameworks, package managers, build systems, linters, test runners
- [ ] `.agentsy/config.yml` schema is stable (`schemaVersion: 1`)
- [ ] All 4 registry adapters fetch from their authoritative sources
- [ ] Recommendation engine produces relevant recommendations
- [ ] `agentsy install <type> <id>` and `agentsy install --recommended` work
- [ ] `AGENTS.md`, `.agentsy/aft.{md,json}`, Magic Context compartments generated
- [ ] `BootstrapService` runs in the daemon
- [ ] Multi-root workspaces supported
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 21. Phase 16 — Guardrails CLI, Hub & Polish

**Priority**: P1 — Sprint 9
**Story points**: 5
**Branch**: `feat/guardrails-cli-polish`
**Depends on**: Phase 4 ✅ (canonical `GuardrailsConfig`)
**Closes findings**: E-17, E-24, E-29, E-30, E-31, E-32, E-33, E-34, E-36, E-37, E-43

### 21.1 Finding E-24 — `@agentsy/cli` `guardrails` command is display-only

- **Severity**: MEDIUM
- **Files**: `packages/cli/src/commands/guardrails.ts`
- **Implementation**: `list` always shows 7 built-ins. `install` only resolves to built-ins by name. `uninstall` removes from an ephemeral map. `policy` parses YAML and prints it — doesn't load, validate, or test-evaluate.
- **Recommended fix**:
  1. `agentsy guardrails install <hub-uri>` writes to persistent `.agentsy/guardrails.yaml` loaded on daemon start.
  2. `agentsy guardrails policy <path>` validates the policy against actual scanner capabilities and optionally test-evaluates against sample inputs.
  3. `agentsy guardrails test <policy-path> <input>` runs the policy against an input and prints the decision receipt.
  4. `agentsy guardrails hub <hub-uri>` resolves `npm://` and `file://` URIs by actually importing the package or file.

### 21.2 Finding E-17 — No product-level safeguards (Layer 6)

- **Severity**: MEDIUM
- **Policy requirement**: `SAFETY.md` §6. Product-level safeguards.
- **Recommended fix**: Add a `scanUICopy` API:

```typescript
// packages/guardrails/src/ui-copy-scanner.ts (NEW)

export interface UIStringTable {
  [key: string]: string;  // e.g. { 'notification.daily-reminder': 'We missed you! Come back!' }
}

export function scanUICopy(copy: UIStringTable): DarkPatternDetection[] {
  const detections: DarkPatternDetection[] = [];
  for (const [key, value] of Object.entries(copy)) {
    // Re-use DarkPatternScanner patterns (Phase 9 §14.5)
    if (GUILT_REENGAGEMENT_PATTERNS.some(p => p.test(value))) {
      detections.push({ key, severity: 'high', pattern: 'guilt-reenagement' });
    }
    if (STREAK_REWARD_PATTERNS.some(p => p.test(value))) {
      detections.push({ key, severity: 'medium', pattern: 'streak-reward' });
    }
    // ...
  }
  return detections;
}
```

Wire into CI for first-party packages.

### 21.3 Finding E-31 — Custom YAML parser doesn't handle real YAML

- **Severity**: LOW
- **Files**: `packages/cli/src/commands/guardrails.ts:322–369` (`parseSimplePolicy`)
- **Recommended fix**: Use `yaml` package (or `js-yaml`). Add Zod validation. Replace `parseSimplePolicy` with `yaml.parse(raw)` + Zod schema.

### 21.4 Finding E-29 — Policy condition evaluator doesn't support nested paths

- **Severity**: MEDIUM
- **Files**: `packages/guardrails/src/policy.ts:323–342` (`resolvePath`)
- **Recommended fix**: Document the condition DSL's limits. If extending: add array indexing, computed paths, and path-to-path comparisons. For `matches`: use a bounded regex library or pre-validate the pattern; reject patterns with catastrophic-backtracking risk.

### 21.5 Finding E-30 — `DEFAULT_POLICY` has a bug

- **Severity**: LOW
- **Files**: `packages/guardrails/src/policy.ts:396–401`
- **Recommended fix**: Change the condition from `tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true && tool.annotations.requiresApproval == true` (the `requiresApproval` annotation isn't part of the MCP standard) to `tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true` and make the action `require_approval`.

### 21.6 Scanner False-Positive Fixes (E-32, E-33, E-34, E-36, E-37)

**E-32 (MEDIUM)** — `ToxicityScanner` `nazi` pattern matches the bare word in any context, including historical/educational text. Severity `high` triggers `block`. **Fix**: Either (a) require a destructive context ("I am a nazi", "heil nazi") or (b) lower severity to `medium` (escalate for human review). Pair with an LLM-based classifier for higher accuracy.

**E-33 (MEDIUM)** — `SecretDetectionScanner` has overly broad patterns:
- Line 105: Vercel pattern `/\b[A-Za-z0-9]{24}\b/g` matches any 24-character alphanumeric string.
- Line 183: Postmark pattern matches any UUID.
- Line 244: Snyk pattern matches any UUID.

**Fix**: Vercel — require known prefix or contextual markers. Postmark/Snyk — require contextual markers. Add confidence calibration: a bare 24-char string is confidence 0.5, not 0.75.

**E-34 (LOW)** — `PIIScanner` redacts all PII types to generic `[REDACTED]` except email/SSN/credit-card. **Fix**: Use consistent `[REDACTED:<id>]` pattern: `[REDACTED:email]`, `[REDACTED:ssn]`, `[REDACTED:credit-card]`, `[REDACTED:phone]`, etc.

**E-36 (LOW)** — `RateLimiterScanner` defaults to 100 requests per 60s — too lax for safety contexts. **Fix**: Per-key-type defaults: tool calls 20/min, user messages 30/min, agent-to-agent calls 50/min. Configurable per agent.

**E-37 (LOW)** — `EntropyScanner` threshold of 4.0 may miss known secret formats (AWS key `AKIAIOSFODNN7EXAMPLE` has entropy ~3.6). **Fix**: Lower default threshold to 3.5, or add a "compact entropy" mode that computes entropy over a sliding window for strings with mixed character classes.

### 21.7 Finding E-43 — No documented exceptions to ethics or safety rules

- **Severity**: LOW
- **Policy requirement**: `GOVERNANCE.md` §Transparency: *"Any documented exceptions to ethics or safety rules, including rationale."*
- **Recommended fix**: Create `docs/safety-exceptions.md`. If none exist, state "No exceptions documented." Review quarterly. Each exception must reference the clause ID in `EthicsRegistry` and include rationale + reviewer sign-off.

### 21.8 Verification

- [ ] `agentsy guardrails install` writes to persistent `.agentsy/guardrails.yaml`
- [ ] `agentsy guardrails policy <path>` validates and test-evaluates
- [ ] `agentsy guardrails test <policy-path> <input>` prints decision receipts
- [ ] `agentsy guardrails hub <hub-uri>` resolves `npm://` and `file://` URIs
- [ ] `scanUICopy` API exists; first-party UI packages scanned in CI
- [ ] Custom YAML parser replaced with `yaml` package + Zod validation
- [ ] `DEFAULT_POLICY` rule conditions reference real annotations
- [ ] `ToxicityScanner` `nazi` pattern false positives mitigated
- [ ] `SecretDetectionScanner` Vercel/Postmark/Snyk patterns tightened
- [ ] `PIIScanner` redaction placeholders consistent
- [ ] `RateLimiterScanner` per-key-type defaults
- [ ] `EntropyScanner` threshold lowered to 3.5
- [ ] `docs/safety-exceptions.md` exists
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 22. Phase 17 — Competitive Gap-Closing Sprint

**Priority**: P2 — Sprints 9–10
**Story points**: 12
**Branch**: `feat/competitive-gaps`
**Depends on**: Phase 3 ✅ (hooks), Phase 6 ✅ (streaming), Phase 14 ✅ (ACP)
**Closes**: Residual competitive P0 + P1 items not absorbed in earlier phases

This phase closes the remaining competitive gaps that don't have a natural architectural home in Phases 3, 6, or 14. Items are grouped by source framework.

### 22.1 From aider

**RepoMap (tree-sitter + PageRank context ranking)** — ~3 SP
Structural context ranking that complements vector search. Tree-sitter extracts symbols (functions, classes, methods) from every file in the project. NetworkX-style graph connects symbols by reference. PageRank with personalization (bias toward currently-open files) ranks symbols by importance. The top-N symbols' surrounding code becomes the "repo map" injected into the context.

```typescript
// packages/retrieval/src/repo-map.ts (NEW)

export class RepoMap {
  async build(rootPath: string): Promise<RepoMapIndex> {
    // 1. Walk all source files
    // 2. For each file, run tree-sitter to extract symbols
    // 3. Build a reference graph (symbol → referenced symbols)
    // 4. Run PageRank with personalization vector
    // 5. Return the ranked symbol list with file paths and line ranges
  }

  async getMap(scope: string, openFiles: string[], limit: number): Promise<RepoMapEntry[]> {
    // Return the top-N symbols, biased toward open files
  }
}
```

**Edit-format DSLs (SEARCH/REPLACE with RelativeIndenter, udiff, whole-file)** — ~4 SP
Open-model support. Many open models (DeepSeek, Qwen, Llama) struggle with structured tool calls but excel at edit-format DSLs. Implement 3 formats:
- **SEARCH/REPLACE** with `RelativeIndenter` (indentation-agnostic matching)
- **udiff** (unified diff format)
- **whole-file** (replace entire file content)

Each format has a parser that converts the model output into a `FileEdit` operation applied by the runtime.

### 22.2 From agent-zero

**DirtyJson tolerant parser** — ~1 SP
Handles malformed LLM JSON: trailing commas, comments, broken brackets, streaming `feed()`. Used as a fallback when strict JSON parsing fails.

```typescript
// packages/core/src/dirty-json.ts (NEW)

export class DirtyJson {
  feed(chunk: string): void { /* accumulate streaming input */ }
  parse<T>(): T | null { /* tolerant parse with recovery */ }
}

export function dirtyParse<T>(input: string): T | null {
  // 1. Try strict JSON.parse
  // 2. If fails, try removing trailing commas
  // 3. If fails, try adding missing closing brackets
  // 4. If fails, try extracting the first JSON object via brace matching
  // 5. If all fail, return null
}
```

### 22.3 From pi

**`prepareNextTurn` / `shouldStopAfterTurn` hooks** — ~1 SP
Allow compaction or model swap mid-session. `prepareNextTurn` runs before each turn and can swap context, model, or thinking configuration. `shouldStopAfterTurn` runs after each turn and can signal graceful stop.

**`convertToLlm` + `transformContext` two-stage** — ~0.5 SP
Clean separation of context transformation from LLM filtering. `transformContext` runs first (applies memory, compaction, scope filtering). `convertToLlm` runs second (converts internal message format to provider-specific format).

**Session tree (fork/clone)** — ~2 SP
Each entry has `parentId`. Fork creates a new branch from any entry. Clone duplicates a branch. `/tree` navigation. Branch summarization for long-running sessions.

### 22.4 From codex

**Guardian LLM-as-judge with circuit breaker** — ~2 SP
Dynamic safety gate. An LLM judges whether each tool call is safe. Circuit breaker: 3 denials per turn → abort. Sliding window: 10 denials per 50 turns → tighten approval policy.

```typescript
// packages/guardrails/src/scanners/guardian.ts (NEW)

export class GuardianScanner implements GuardrailScanner {
  readonly id = 'guardian';
  readonly phase: GuardrailPhase = 'tool-input';

  private consecutiveDenials = 0;
  private recentDenials: number[] = [];  // timestamps

  async evaluate(input: ToolCallInput, context: GuardrailContext): Promise<GuardrailResult> {
    // 1. Check circuit breaker
    if (this.consecutiveDenials >= 3) {
      return { status: 'block', phase: 'tool-input', reason: 'Guardian circuit breaker tripped' };
    }

    // 2. LLM judge
    const verdict = await this.llmJudge(input, context);
    if (verdict === 'deny') {
      this.consecutiveDenials++;
      this.recentDenials.push(Date.now());
      this.pruneOldDenials();
      return { status: 'block', phase: 'tool-input', reason: 'Guardian denied tool call' };
    }

    this.consecutiveDenials = 0;
    return { status: 'pass', phase: 'tool-input' };
  }
}
```

**Event-sourced rollout + reducer** — ~2 SP
JSONL append-only event log. Materialized views for conversation, tool calls, inference, compaction. Enables `keep_forked_rollout_item` fork predicate (system+user+final-assistant only, drop reasoning/tool/output).

**WebSocket Responses API support** — ~1 SP
Prewarm + sticky routing for lower TTFT. `response.create` with `generate=false` prewarms the connection. `x-codex-turn-state` enables sticky routing.

### 22.5 From opencode

**`ContextEpoch` revision tracking** — ~0.5 SP
Abort and rebuild on mid-turn model switch. Each context has an epoch; if the model changes mid-turn, the current turn is aborted and rebuilt with the new model.

**Structured Markdown compaction template** — ~0.5 SP
8 stable sections for grep-able summaries: Goal, Constraints, Progress, Decisions, Next Steps, Critical Context, Relevant Files. Compaction output is a Markdown file rather than free text.

### 22.6 From Claude-Code

**Persistent shell (cwd tracking, env accumulation)** — ~1 SP
A shell session that persists across tool calls. CWD tracks the user's location. Environment variables accumulate. Each `run_command` tool call uses this shell.

**Disk-spilled tool results** — already done in Phase 14 §19.5.

**Tool deny-rule filtering at registration** — ~0.5 SP
Strip tools from the tool list before the model sees them. Per-agent deny rules in the agent YAML:

```yaml
# packages/agents/src/specs/coder.yaml
tools:
  allow: [read_file, write_file, edit_file, run_command]
  deny: [delete_file, format_disk]  # Stripped before model sees them
```

**Slash command argument substitution** — ~0.5 SP
`$ARGUMENTS`, `$1`, `$2` substitution in slash commands:

```yaml
# .agentsy/commands/refactor.yaml
description: "Refactor the given file"
prompt: |
  Refactor $ARGUMENTS to improve readability and reduce complexity.
  Apply the SOLID principles where appropriate.
```

Invocation: `/refactor src/utils/parser.ts` → `$ARGUMENTS` = `src/utils/parser.ts`.

**`AGENTS.md` discovery** — already done in Phase 15 §20.8.

### 22.7 From oh-my-pi

**`pi-iso` isolation PAL trait** — ~1 SP
Cross-platform COW isolation. 8 backends: APFS clonefile (macOS), btrfs (Linux), ZFS, overlayfs, Linux reflink, Windows block clone, ProjFS, Rcopy fallback. `probe`/`start`/`stop`/`diff` API with automatic fallback.

**`pi-shell` output minimizer** — ~1 SP
Per-language output filters that reduce command output to essential signal. Filters for cargo, go, jvm, docker, git, npm, etc. Strips ANSI codes, progress bars, and verbose logs.

**`pi-ast` structural summaries** — ~1 SP
Tree-sitter-based code summarization for context compression. Replaces a long file's content with a structural summary (top-level functions, classes, exports).

### 22.8 Verification

- [ ] `RepoMap` builds and ranks symbols via PageRank
- [ ] 3 edit-format DSLs (SEARCH/REPLACE, udiff, whole-file) work
- [ ] `DirtyJson` parses malformed LLM JSON
- [ ] `prepareNextTurn` / `shouldStopAfterTurn` hooks work
- [ ] `convertToLlm` + `transformContext` two-stage separation
- [ ] Session tree fork/clone works
- [ ] `GuardianScanner` LLM-as-judge with circuit breaker
- [ ] Event-sourced rollout + reducer
- [ ] WebSocket Responses API support
- [ ] `ContextEpoch` revision tracking
- [ ] Structured Markdown compaction template
- [ ] Persistent shell with cwd tracking
- [ ] Tool deny-rule filtering at registration
- [ ] Slash command argument substitution
- [ ] `pi-iso` isolation PAL trait (8 backends)
- [ ] `pi-shell` output minimizer
- [ ] `pi-ast` structural summaries
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 23. Phase 18 — Missing Capabilities

**Priority**: P3 — Sprints 10–11
**Story points**: 7
**Branch**: `feat/missing-capabilities`
**Depends on**: Phase 14 ✅ (ACP agent)
**Closes**: v2.3 Phase 9 items

### 23.1 Structured Output with Schema Validation

The `@agentsy/core` structured output module exists but lacks integration with the streaming pipeline. The daemon should validate all structured outputs against their JSON schemas before returning them to the client.

```typescript
// packages/daemon/src/services/output-validator.ts (NEW)

export class OutputValidator {
  async validate<T>(
    output: string,
    schema: JSONSchema,
    options: { autoRepair: boolean; maxRepairAttempts: number }
  ): Promise<ValidationResult<T>> {
    let parsed = parseJSON(output);
    if (!parsed.success && options.autoRepair) {
      for (let attempt = 0; attempt < options.maxRepairAttempts; attempt++) {
        const repaired = autoRepair(output, schema, attempt);
        parsed = parseJSON(repaired);
        if (parsed.success) break;
      }
    }
    if (!parsed.success) return { valid: false, error: parsed.error };

    const validation = validateJSONSchema(parsed.data, schema);
    if (!validation.valid) return { valid: false, error: validation.errors };

    return { valid: true, data: parsed.data as T };
  }
}
```

### 23.2 Conversation Checkpointing & Recovery

Agents need the ability to save and restore conversation state. Partially implemented in `@agentsy/runtime/src/checkpoint.ts` but not integrated with the daemon.

```typescript
// packages/daemon/src/services/checkpoint-manager.ts (NEW)

export class CheckpointManager {
  async createCheckpoint(agentId: string, name: string): Promise<string> {
    const agent = this.agentHost.getAgent(agentId);
    const memorySnapshot = await this.memory.snapshot(agent.spec.memoryScope);

    const checkpoint: AgentCheckpoint = {
      id: randomUUID(),
      agentId,
      name,
      timestamp: new Date(),
      messageHistory: agent.messages,
      memorySnapshot,
      tokenBudget: agent.budget,
      metadata: {
        turnsCompleted: agent.turnsCompleted,
        tokensUsed: agent.tokensUsed,
      },
    };

    await this.db.execute(
      'INSERT INTO agent_checkpoints (id, agent_id, name, timestamp, data) VALUES (?, ?, ?, ?, ?)',
      [checkpoint.id, agentId, name, checkpoint.timestamp.toISOString(), JSON.stringify(checkpoint)]
    );

    return checkpoint.id;
  }

  async restoreCheckpoint(checkpointId: string): Promise<string> {
    const row = await this.db.querySingle<{ data: string }>(
      'SELECT data FROM agent_checkpoints WHERE id = ?', [checkpointId]
    );
    if (!row) throw new Error(`Checkpoint "${checkpointId}" not found`);

    const checkpoint = JSON.parse(row.data);
    const newAgentId = await this.agentHost.spawn({
      ...checkpoint,
      id: `${checkpoint.agentId}_restored_${Date.now()}`,
    });
    await this.memory.restoreSnapshot(checkpoint.memorySnapshot);
    return newAgentId;
  }
}
```

### 23.3 Tool Execution Sandbox

The daemon must sandbox tool execution to prevent arbitrary code execution:

```typescript
// packages/daemon/src/services/sandbox-service.ts (NEW)

export class SandboxService implements Service {
  readonly name = 'sandbox';

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    // 1. Verify tool is registered and agent has permission
    const tool = this.toolRegistry.get(request.toolName);
    if (!tool) throw new Error(`Unknown tool: ${request.toolName}`);

    const agent = this.agentHost.getAgent(request.agentId);
    if (!agent.spec.capabilities.includes(request.toolName)) {
      throw new Error(`Agent "${request.agentId}" lacks capability: ${request.toolName}`);
    }

    // 2. Check budget
    if (agent.budget && agent.tokensUsed >= agent.budget.max_tokens_per_session) {
      throw new Error(`Agent "${request.agentId}" exceeded token budget`);
    }

    // 3. Execute in sandbox (Docker, E2B, or virtual vm)
    const result = await this.virtualSandbox.execute({
      tool,
      args: request.args,
      agentId: request.agentId,
      timeout: tool.timeout ?? 30_000,
      secrets: this.secretsGuard.getAllowedSecrets(request.agentId),
    });

    // 4. Audit trail
    await this.audit(request, result);

    return result;
  }
}
```

### 23.4 Cross-Session Memory Persistence

```typescript
// packages/daemon/src/services/cross-session-memory.ts (NEW)

export class CrossSessionMemory {
  async getCrossSessionInsights(scope: string): Promise<CrossSessionInsight[]> {
    const memories = await this.memory.recall({
      query: '*',
      scope,
      kind: 'semantic',
      limit: 100,
    });

    const grouped = this.groupByTopic(memories);
    return grouped.map(group => ({
      topic: group.key,
      memoryCount: group.items.length,
      earliestMemory: group.items[group.items.length - 1].timestamp,
      latestMemory: group.items[0].timestamp,
      confidence: this.calculateConfidence(group.items),
      summary: this.summarize(group.items),
    }));
  }
}
```

### 23.5 Graceful Degradation & Circuit Breaking

```typescript
// packages/daemon/src/services/resilience-service.ts (NEW)

export class ResilienceService implements Service {
  readonly name = 'resilience';
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private fallbackChain: ModelTier[] = ['frontier', 'mid', 'small', 'micro'];

  async resilientCall(request: ModelCallRequest): Promise<ModelCallResult> {
    const providerId = request.routing.replica.providerId;
    const cb = this.getOrCreateCircuitBreaker(providerId);

    if (cb.state === 'open') {
      this.logger.warn(`Circuit breaker open for ${providerId}, trying failover`);
      return this.failoverCall(request);
    }

    try {
      return await cb.execute(async () => this.streamManager.executeCall(request));
    } catch (error) {
      this.logger.warn(`Primary call failed, trying failover`, { providerId, error });
      return this.failoverCall(request);
    }
  }

  private async failoverCall(request: ModelCallRequest): Promise<ModelCallResult> {
    const spilloverResult = await this.routingService.spillover(request.routing);
    if (spilloverResult) {
      return this.resilientCall({ ...request, routing: spilloverResult });
    }

    const currentTierIdx = this.fallbackChain.indexOf(request.routing.tier);
    for (let i = currentTierIdx + 1; i < this.fallbackChain.length; i++) {
      const fallbackTier = this.fallbackChain[i];
      const fallbackRouting = await this.routingService.selectModel({ tier: fallbackTier });
      if (fallbackRouting) {
        this.logger.info(`Degrading from ${request.routing.tier} to ${fallbackTier}`);
        return this.resilientCall({ ...request, routing: fallbackRouting });
      }
    }

    const cached = await this.tryCache(request);
    if (cached) {
      this.logger.info('Returning cached response (all providers failed)');
      return { ...cached, fromCache: true };
    }

    throw new AllProvidersExhaustedError('All model providers are unavailable');
  }
}
```

### 23.6 Telemetry & Diagnostics

```typescript
// packages/daemon/src/services/diagnostics-service.ts (NEW)

export class DiagnosticsService implements Service {
  readonly name = 'diagnostics';

  async getHealthReport(): Promise<DaemonHealthReport> {
    return {
      daemon: { state: this.daemon.state, uptime: process.uptime(), pid: process.pid, memory: process.memoryUsage() },
      services: this.serviceHost.listStates(),
      agents: this.agentHost.list().map(a => ({
        id: a.spec.id, role: a.spec.role, state: a.state,
        tokensUsed: a.tokensUsed, turnsCompleted: a.turnsCompleted,
        memoryScope: a.spec.memoryScope,
      })),
      routing: {
        modelsRegistered: this.routingService.getModelCount(),
        healthyProviders: this.routingService.getHealthyProviderCount(),
        totalProviders: this.routingService.getTotalProviderCount(),
      },
      memory: {
        scopes: this.memory.getScopeCount(),
        totalItems: await this.memory.getTotalItemCount(),
        lastConsolidation: this.memory.getLastConsolidationTime(),
      },
      jobs: { scheduled: await this.jobScheduler.list(), running: this.jobScheduler.getRunningCount() },
      streams: { active: this.streamManager.getActiveStreamCount() },
      subprocesses: this.subprocessManager.listProcesses().map(p => ({
        id: p.id, pid: p.pid, status: p.status,
        memoryUsageMb: p.memoryUsageMb, restartCount: p.restartCount,
      })),
      acp: { enabled: this.daemon.acp !== null, activeSessions: this.activeACPSessions.size },
    };
  }
}
```

### 23.7 ACP-Specific Capabilities

- **Image support in prompts** (`promptCapabilities.image: true`) — accept base64-encoded images from ACP client, forward to vision-capable models.
- **Audio support in prompts** (`promptCapabilities.audio: true`) — integrate ASR pipeline.
- **MCP server management via ACP** — when ACP client provides `mcpServers` in `session/new`, start them as managed subprocesses.
- **ACP session persistence** — ACP sessions survive daemon restarts; `session/load` and `session/resume` query persisted state.

### 23.8 Verification

- [ ] `OutputValidator` validates and auto-repairs structured output
- [ ] `CheckpointManager` creates and restores checkpoints
- [ ] `SandboxService` sandboxes tool execution
- [ ] `CrossSessionMemory` aggregates across sessions
- [ ] `ResilienceService` circuit breaks and falls back gracefully
- [ ] `DiagnosticsService` exposes comprehensive health report
- [ ] Image support in prompts works
- [ ] ACP session persistence works across daemon restarts
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 24. Phase 19 — Langfuse Observability Integration

**Priority**: P2 — Sprint 1 (parallel track, can run from day one)
**Story points**: 6
**Branch**: `feat/langfuse-observability`
**Depends on**: Phase 1 ✅ (daemon foundation — engine attaches to daemon lifecycle)
**Unblocks**: Phase 13 §18.7 (langeval integration — langeval's Trace Debugger uses the same Langfuse instance)
**Closes**: nothing from the guardrails gap analysis; closes the "daemon has no observability wiring" gap surfaced during remediation review
**Full plan**: see `/home/z/my-project/download/agentsy-langfuse-integration-plan.md` (523 lines, 13 sections)
**Note**: The Langfuse instance wired in this phase is shared with langeval (Phase 13 §18.7). langeval's Trace Debugger uses Langfuse under the hood — when Phase 13 lands, the same Langfuse instance serves both agentsy's runtime tracing (every LLM call, tool call, guardrail decision) and langeval's evaluation tracing (every persona simulation, red-team attack, eval score). This means agents can see their own traces alongside the eval results that judged them — a powerful debugging loop.

### 24.1 Goal

When a user sets `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` in their shell or `.env` file, the agentsy daemon should automatically wire a Langfuse exporter into the observability engine at startup — no code changes, no CLI flags. When the vars are absent, the daemon continues as before with observability disabled. The integration follows the official Langfuse OTLP quickstart at https://langfuse.com/docs/observability/get-started.

### 24.2 Current State

A `LangfuseExporter` class already exists in `packages/observability/src/exporters/langfuse.ts` (extends `OtlpExporter` with Basic auth from `publicKey`/`secretKey`, default endpoint is Langfuse Cloud's OTLP URL). But it is never instantiated anywhere — the daemon does not import `@agentsy/observability` at all. No `.env` loader exists in the repo. The `DaemonConfig.metrics.otelEndpoint` field is unused.

### 24.3 Design

**Env-var contract**:

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | ✅ | — | Public key (Basic auth username) |
| `LANGFUSE_SECRET_KEY` | ✅ | — | Secret key (Basic auth password) |
| `LANGFUSE_HOST` | optional | `https://cloud.langfuse.com` | Self-hosted instance root; OTLP path appended automatically |
| `LANGFUSE_PROJECT_ID` | optional | — | Sent as `X-Langfuse-Project` header |
| `LANGFUSE_FLUSH_INTERVAL_MS` | optional | `5000` | Flush interval in ms |
| `LANGFUSE_MAX_BATCH_SIZE` | optional | `64` | Max batch size before forced flush |

**Detection rule**: Langfuse is enabled if and only if both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are present and non-empty after trimming.

**`.env` loading**: Node 22 native `process.loadEnvFile()` — no `dotenv` dependency. Files loaded in priority order: `.env.local` (highest), then `.env`. Existing `process.env` values are never overridden. Missing files are silent.

**Three-layer API in `@agentsy/observability`**:
1. `detectLangfuseFromEnv(env?)` — pure detection, returns `{ enabled, endpoint, reason }`
2. `createLangfuseExporterFromEnv(options?)` — constructs exporter or returns `null`
3. `createObservabilityFromEnv(options)` — builds engine, attaches sinks, returns `{ engine, sinks }`

**DaemonConfig extension** — new `observability` section:

```typescript
observability: z.object({
  enabled: z.boolean().default(true),                    // master switch
  serviceName: z.string().default('agentsy-daemon'),
  serviceVersion: z.string().default('0.0.0'),
  langfuse: z.object({
    enabled: z.boolean().default(true),                  // set false to skip auto-detection
    endpoint: z.string().optional(),
    publicKey: z.string().optional(),                    // overrides env var
    secretKey: z.string().optional(),                    // overrides env var
    projectId: z.string().optional(),
    flushIntervalMs: z.number().int().positive().optional(),
    maxBatchSize: z.number().int().positive().optional(),
    headers: z.record(z.string()).optional()
  }).default({}),
  envFiles: z.array(z.string()).default(['.env.local', '.env'])
}).default({})
```

**Daemon wiring**: constructor calls `loadDotenv()` then `createObservabilityFromEnv()` (both in try/catch — misconfiguration logs a warning and continues with observability disabled). `start()` logs each sink. `stop()` calls `observability.shutdown()` before `db.close()` so pending spans flush while DB is still open. `getStatus()` exposes `observability: { enabled, sinks }`.

### 24.4 File-by-File Change List

**Modified** (7 files):
- `packages/observability/src/exporters/langfuse.ts` — add `LANGFUSE_ENV_VARS`, `detectLangfuseFromEnv()`, `createLangfuseExporterFromEnv()`
- `packages/observability/src/exporters/index.ts` — re-export new symbols
- `packages/observability/src/index.ts` — re-export from root entry
- `packages/observability/README.md` — replace 8-line stub with full Langfuse docs
- `packages/daemon/src/config.ts` — add `observability` section to `DaemonConfigSchema`
- `packages/daemon/src/daemon.ts` — import `@agentsy/observability`, add `observability`/`observabilitySinks` fields, wire `loadDotenv()` + `createObservabilityFromEnv()` into constructor, log sinks in `start()`, call `observability.shutdown()` in `stop()`, add to `getStatus()`
- `packages/daemon/package.json` — add `"@agentsy/observability": "workspace:*"` to dependencies

**New** (2 files):
- `packages/observability/src/auto-init.ts` — `createObservabilityFromEnv()` and supporting types
- `packages/daemon/src/env.ts` — `loadDotenv()` helper using Node 22 native `process.loadEnvFile()`

**New tests** (3 files):
- `packages/observability/src/exporters/langfuse.test.ts` — ~12 cases for detection and construction
- `packages/observability/src/auto-init.test.ts` — ~5 cases for the top-level helper
- `packages/daemon/src/env.test.ts` — ~12 cases for `.env` loading (uses `mkdtempSync` for isolation)

**Untouched**: `otlp.ts`, `core/*`, orchestrator hooks, `instrumentation/*`, `redaction.ts`.

### 24.5 Edge Cases

17 scenarios covered in the full plan, including: malformed `.env` (log + continue), missing vars (silent disable), `LANGFUSE_HOST` path appending (with/without trailing slash, with/without existing OTLP path), invalid integers (fall back to defaults), exporter construction failure (log + disable), shutdown flush ordering (before DB close), shell-vs-file precedence (shell wins), config-vs-env precedence (config wins).

### 24.6 Expected Startup Logs

**Langfuse enabled**:
```
[daemon] observability: langfuse enabled — Loaded from LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY; endpoint=https://cloud.langfuse.com/api/public/otlp/v1/traces
```

**Langfuse disabled (missing vars)**:
```
[daemon] observability: langfuse disabled — Missing LANGFUSE_PUBLIC_KEY and/or LANGFUSE_SECRET_KEY env vars
```

**Langfuse disabled by config**:
```
[daemon] observability: langfuse disabled — Disabled by config (langfuseEnabled = false)
```

### 24.7 Out of Scope

1. **Redaction wiring fix** — tracked separately in v2.3 remediation plan Appendix A ("Redaction Not Wired"). Until that lands, treat the Langfuse dashboard as potentially containing raw prompt content.
2. **Other OTLP backends** (Honeycomb, Datadog, Jaeger) — follow the same Layer 3 pattern; deferred.
3. **Provider-level instrumentation** — `instrumentation/provider.ts` already wraps `UniversalClient.complete()`/`stream()`; will automatically benefit when the daemon-owned engine becomes the active tracer. No new code needed.
4. **Langfuse native SDK** — uses OTLP path only, per Langfuse "get started" docs recommendation.
5. **Langfuse evaluations / scores** — natural follow-up after guardrails Phase 9 detectors land.
6. **Langfuse prompt management** — separate, larger effort.
7. **`.env` file watching / hot-reload** — daemon loads `.env` once at startup; changes require restart. Matches `dotenv` conventions.

### 24.8 Rollout

**Branch**: `feat/langfuse-observability` from `develop`.

**Commit sequence** (7 commits, each leaves build green):
1. `feat(observability): add detectLangfuseFromEnv + createLangfuseExporterFromEnv`
2. `feat(observability): add createObservabilityFromEnv auto-init helper`
3. `feat(observability): rewrite README with Langfuse integration docs`
4. `feat(daemon): add loadDotenv helper using Node 22 native loadEnvFile`
5. `feat(daemon): add observability section to DaemonConfig`
6. `feat(daemon): wire observability engine into daemon lifecycle`
7. `docs: add Langfuse quick start to observability README`

**Verification gates**:
- `pnpm check-types && pnpm lint && pnpm test` green across both packages
- Manual smoke: env vars set → daemon logs "langfuse enabled" → trace appears in Langfuse dashboard
- Manual smoke: env vars absent → daemon logs "langfuse disabled" → daemon works normally
- Manual smoke: `observability.langfuse.enabled: false` in config → "disabled by config" log
- Manual smoke: malformed `.env` → warning logged, daemon continues
- `agentsy status` shows `observability: { enabled, sinks }`

**Backward compatibility**: no existing public API removed. Existing configs without `observability:` section continue to work — but Langfuse will auto-enable if env vars are present. Users with `LANGFUSE_*` set for other tools must set `observability.langfuse.enabled: false` to opt out. Document in README and upgrade notes.

### 24.9 Verification

- [ ] `detectLangfuseFromEnv` handles all env-var combinations (missing, partial, both, whitespace, empty, `LANGFUSE_HOST` path variants)
- [ ] `createLangfuseExporterFromEnv` returns `null` on missing vars, returns exporter on present vars, honors optional vars, validates integers, overrides take precedence
- [ ] `createObservabilityFromEnv` returns engine with disabled sink on empty env, enabled sink on present env, respects `langfuseEnabled: false`
- [ ] `loadDotenv` loads `.env`, prioritizes `.env.local`, does not override existing `process.env`, throws on malformed file, silent on missing file
- [ ] `DaemonConfig.observability` schema accepts all fields with correct defaults
- [ ] Daemon constructor calls `loadDotenv()` then `createObservabilityFromEnv()`
- [ ] Daemon `start()` logs each sink with enabled/disabled + reason
- [ ] Daemon `stop()` calls `observability.shutdown()` before `db.close()`
- [ ] `agentsy status` shows observability wiring
- [ ] Manual smoke: Langfuse dashboard receives traces
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 25. AFT, Magic Context, Todos & Task Delegation — Integration Audit

> **Note**: This section is a research-and-clarification addendum responding to the question: *"I would like to better understand the roles AFT and Magic Context are playing and how/whether they are properly tied into our memory and context and how to-do lists are managed and tasks get delegated."* It documents the current state (read from the `develop` branch source) and identifies integration gaps that Phase 23 (below) closes.

### 25.1 What AFT and Magic Context actually are

Both are **CortexKit** packages — external dependencies, not agentsy-original code. They are consumed as hard (non-optional) dependencies per `docs/developers/cortexkit-integration.md`:

| Component | Package | What it does | Language |
|---|---|---|---|
| **AFT** (Agent File Tree) | `@cortexkit/aft-bridge` | Persistent Rust process providing tree-sitter-backed code intelligence — file-tree structure, symbol indices, structural queries. One persistent `aft` worker process per project root, managed via a `BridgePool`. | Rust binary + TS bridge |
| **Magic Context** | `@cortexkit/magic-context` | Durable session & memory storage via a shared SQLite database at `~/.local/share/cortexkit/magic-context/context.db`. Defines 4 tables: `project_memories`, `compartments`, `session_meta`, `project_state`. | TypeScript |

### 25.2 How they tie into agentsy's memory and context (current state)

**Magic Context** is the **durable persistence layer** for two concerns:

1. **Per-project durable knowledge** (`project_memories` table) — a 5-category taxonomy (`ARCHITECTURE`, `CONSTRAINTS`, `CONFIG_VALUES`, `NAMING`, `PROJECT_RULES`) with an `importance` score (0–1). The `@agentsy/memory` package's `createMemoryBridge()` (`packages/memory/src/cortexkit/memory-adapter.ts`) reads this table and **promotes** entries into agentsy's own `WikiManager` as wiki pages (mapping MC categories → wiki entity kinds: `rule`, `architecture`, `constraint`, `config`, `naming`). Low-importance items (< 0.3) are skipped during promotion.

2. **Tiered session history** (`compartments` table) — 4 verbosity tiers (`p1` Verbose, `p2` Normal, `p3` Terse, `p4` Anchor-only) with a monotonic `seq` and `episode_type`. The `@agentsy/session` package's `CortexKitSnapshotBridge` reads this for crash recovery and session resume. A `context-fingerprint.ts` module computes a SHA-256 over context content + message count + model ID to enable cache-aware context reuse on resume.

3. **Per-session metadata** (`session_meta` table) — key-value JSON blob store, used by `CortexKitSessionStore`.

4. **Epoch tracker** (`project_state` table) — `project_memory_epoch` is bumped when Magic Context's "dreamer" consolidates. The `@agentsy/memory` package's `createDreamerConsumer()` polls this epoch; when it advances, the consumer reads all project memories and upserts them as wiki pages. This is the **one-directional sync** from MC → agentsy wiki.

**AFT** is the **code intelligence layer**. The `@agentsy/shared` package's `aft-manager.ts` provides `getAftBridge()` / `getAftSessionBridge()` / `isAftAvailable()` / `shutdownAftBridge()`. A `BridgePool` manages one persistent Rust `aft` process per project root. The `@agentsy/tools` package has a `cortexkit/import-linter.ts` that consumes AFT. The `scripts/postinstall-aft.mjs` script handles binary discovery.

### 25.3 The integration gaps (what's not properly tied together)

After reading the source, I identified five gaps:

**Gap 1 — MC → agentsy wiki sync is one-directional and poll-based.** The `dreamer-consumer.ts` polls `project_state.project_memory_epoch` on each `checkAndSync()` call. There is no event-driven push from MC to agentsy when memories change. If the poll interval is long (default not found in source — likely configurable), stale data persists. There is also no agentsy → MC write path: agentsy's own `WikiManager` can upsert pages, but those changes never flow back to MC's `project_memories`. This means MC's dashboard (if used) and agentsy's wiki can diverge.

**Gap 2 — AFT availability is checked but not gracefully degraded.** `isAftAvailable()` returns a boolean, but callers that invoke `getAftBridge()` get a hard throw (`'AFT binary not found. Run npx @cortexkit/aft setup...'`) when the binary is missing. There is no fallback path for "AFT not installed — degrade to no code intelligence." The postinstall script attempts to discover the binary, but if it fails, every code-intelligence-dependent tool call throws. This should be a warning + degraded mode, not a hard failure.

**Gap 3 — AFT and Magic Context are NOT wired into the daemon.** The daemon (`packages/daemon/src/daemon.ts`) does not import `@agentsy/shared/src/cortexkit/aft-manager` or the MC bridge. The MC integration lives in `@agentsy/memory`, `@agentsy/session`, and `@agentsy/tokenomics` — but the daemon (the central process owning all agent execution per AD-1) has no lifecycle hook for AFT's `BridgePool` or MC's database. This means:
- AFT processes are not started/stopped with the daemon.
- MC's database is not opened/closed by the daemon (it's opened lazily by each consumer).
- The `UnifiedDB` consolidation (Phase 1) did NOT absorb MC's `context.db` — it's still a separate file at `~/.local/share/cortexkit/magic-context/context.db`. This is a deliberate exception (MC owns that schema), but it means the daemon's `shutdown()` cannot flush MC state.

**Gap 4 — Todo lists and task delegation are split across two systems that don't talk to each other.**

- **Todo lists** (the agent-facing "write a list of things to do" tool, à la Claude-Code's `TodoWrite`) — **do not exist**. I grepped for `todo`, `Todo`, `TodoWrite`, `write_todos`, `task_list`, `TaskList` across all packages. The only matches are: (a) `packages/core/src/xml-filter/tag-lists.ts` (unrelated — XML tag filtering), (b) `packages/orchestrator/docs/workflows-plan.md` (a plan doc, not code). There is no agent-callable todo-list tool. There is no persisted todo-list store. This is a significant gap — Claude-Code, opencode, and codebuff all have structured todo tracking.

- **Task delegation** lives in `@agentsy/orchestrator/src/task-board/` — a `Task` type with lifecycle `pending → ready → running → paused → completed → failed`, `dependencies: string[]`, `parentTaskId?` for sub-task decomposition trees, `planId` + `stepId` linking to a plan, and `TaskAttempt` records with `ToolCallRecord[]` for idempotency replay. An `InMemoryTaskBoard` implementation exists (`in-memory.ts`). The `TaskDecomposer` (`packages/orchestrator/src/intelligence/decomposer.ts`) breaks plans into atomic tasks.

  **But**: the task board is **in-memory only** (`InMemoryTaskBoard`). There is no SQLite-backed `TaskBoard` implementation. Tasks are lost on daemon restart. The task board is also **not exposed as an agent-callable tool** — agents cannot query or update the task board directly; only the orchestrator's internal plan execution touches it. And the task board has **no connection to MC's `compartments` or `session_meta`** — task state is invisible to MC's session-resume machinery.

**Gap 5 — AFT, Magic Context, and the task board are not coordinated.** When an agent delegates a sub-task (via the task board), the sub-task's working context does not inherit the parent's AFT session or MC compartments. Each sub-task starts cold. There is no `forkWithCacheSharing` (Claude-Code pattern) that would let a sub-agent inherit the parent's code-intelligence index and memory compartments.

### 25.4 What Phase 23 (below) does about it

Phase 23 — "AFT, Magic Context & Task Board Integration Hardening" closes the five gaps above:

1. **Gap 1**: Add bidirectional sync between MC `project_memories` and agentsy wiki (event-driven, not poll-based). Add a `writeBackToMagicContext` option to `WikiManager.upsertPage`.
2. **Gap 2**: Add graceful degradation to AFT — `getAftBridgeOrNull()` returns `null` instead of throwing; callers check and fall back to no-code-intelligence mode with a one-time warning.
3. **Gap 3**: Wire AFT `BridgePool` and MC database into the daemon lifecycle (`Daemon.start()` calls `aftPool.start()`, `Daemon.stop()` calls `aftPool.shutdown()` + `mcDb.close()`). Document the deliberate exception to UnifiedDB consolidation.
4. **Gap 4**: Add an agent-callable `todo` tool (`todo_write`, `todo_read`, `todo_update`) backed by a new `todos` table in `UnifiedDB`. Add a SQLite-backed `TaskBoard` implementation. Expose the task board as agent-callable tools (`task_list`, `task_claim`, `task_complete`). Persist both across daemon restarts.
5. **Gap 5**: Implement `forkWithCacheSharing` for sub-agents — inherit parent's AFT session bridge and MC compartment snapshot. Sub-tasks no longer start cold.

---

## 26. Phase 20 — Ethical Provider & Content Policy

**Priority**: P0 — Sprint 2–3 (must land before any first-party agent template ships)
**Story points**: 8
**Branch**: `feat/ethical-provider-policy`
**Depends on**: Phase 4 ✅ (EthicsRegistry — the policy must be registered as enforceable clauses), Phase 5 (gateway routing — the blocklist/warninglist hooks into `RoutingService`)
**Unblocks**: Phase 12 (guardrails daemon integration — the provider policy is enforced at the routing layer)
**Closes findings**: extends E-1 (ethics enforcement) with provider-policy clauses; adds new ethical commitments to `ETHICS.md`

> **Ethical stance**: This phase codifies agentsy's refusal to be complicit in harms documented in the cited reporting. It is non-negotiable and reflects the project's governance commitments. The block on xAI/Grok is a hard block; the warnings on OpenAI/Microsoft/Google/Amazon are opt-in acknowledgements; the style-mimicry restriction is a hard block on a class of prompts; the Telegram removal is a hard removal.

### 26.1 Goal

Implement five ethical restrictions as enforceable policy:

1. **Hard-block xAI (Grok) models** entirely — no routing, no fallback, no opt-in. Blocked on both content safety grounds (CSAM, antisemitism, deepfakes) and environmental racism (illegal unpermitted gas-turbine power plant polluting Black communities in Memphis/Southaven).
2. **Warn-and-acknowledge** for Meta, OpenAI, Microsoft, Google, and Amazon models — users must acknowledge the ethical concerns before each session; the warning is dismissible per-session but not permanently silencable. Meta is newly elevated to the warn list for environmental recklessness (tent data centers powered by jet-engine gas turbines) and training-data theft (LibGen).
3. **Hard-block style-mimicry prompts** — any prompt requesting creation of writing, imagery, or audio/video "in the style of" a specific named creator is blocked.
4. **Remove Telegram connector** entirely — delete the adapter, remove from config schema, remove from CLI, document the removal in `safety-changelog.md`.
5. **Track environmental impact** (CO2 + water) per request and cumulatively — see Phase 30 (§47).

### 26.2 Rationale and sources

**xAI / Grok — hard block.** Cited reporting documents cover two categories of harm:

*Content safety harms*: antisemitic posts generated by Grok ([NBC News](https://www.nbcnews.com/tech/internet/elon-musk-grok-antisemitic-posts-x-rcna217634)); Grok generating Hitler-praising content ([Politico](https://www.politico.com/news/magazine/2025/07/10/musk-grok-hitler-ai-00447055)); EU investigation after Grok generated 23,000 CSAM images in 11 days ([9to5Mac](https://9to5mac.com/2026/02/17/eu-also-investigating-as-grok-generated-23000-csam-images-in-11-days/)); the Grok sexual deepfake scandal ([Wikipedia](https://en.wikipedia.org/wiki/Grok_sexual_deepfake_scandal)); Grok still hosting sexualized deepfakes of famous women ([Wired](https://www.wired.com/story/grok-is-still-hosting-sexualized-deepfakes-of-famous-women/)).

*Environmental racism and illegal pollution*: xAI built an illegal, unpermitted power plant to fuel its Colossus 2 data center — 27-35 gas turbines generating up to 495 MW in Southaven, Mississippi, near homes, schools, and churches in predominantly Black communities ([SELC](https://www.selc.org/news/xai-built-an-illegal-power-plant-to-power-its-data-center/), [NYT](https://www.nytimes.com/2026/06/16/climate/xai-musk-mississippi-grok-turbine-lawsuit-naacp.html), [CNBC](https://www.cnbc.com/2026/03/10/elon-musk-xai-permit-for-mississippi-plant-despite-pollution-concerns.html)). The turbines emit 1,700+ tons of smog-forming NOx per year (the largest industrial source in the greater Memphis area), 180 tons of fine particulate matter, and 19 tons of formaldehyde — a cancer-causing chemical — in a community where Memphis already leads Tennessee in asthma ER visits ([Climate & Capital Media](https://www.climateandcapitalmedia.com/35-gas-turbines-no-permits-elon-musks-dirty-xai-secret/), [Capital B](https://capitalbnews.org/xai-musk-data-centers-clean-air-epa/), [Capital B (Memphis)](https://capitalbnews.org/musk-xai-memphis-black-neighborhood-pollution/)). xAI added 19 more gas turbines despite an ongoing lawsuit ([Wired](https://www.wired.com/story/xai-adds-19-new-gas-turbines-despite-ongoing-lawsuit/)). The NAACP and SELC are suing xAI for environmental racism ([NAACP](https://naacp.org/articles/naacp-selc-condemns-mississippi-approval-xai-power-plant-regulators-ignore-public), [NAACP action](https://naacp.org/actions/dirty-truth-ai), [Tech Policy Press](https://www.techpolicy.press/progress-shouldnt-poison-black-communities/), [Capital B (residents)](https://capitalbnews.org/we-deserve-to-breathe-clean-air-memphis-residents-take-on-elon-musks-xai/)). xAI operated with no permits, no public input, and no notice to nearby communities.

The pattern is repeated, severe, and unmitigated by the provider — across both content safety (CSAM, antisemitism, deepfakes) and environmental racism (illegal pollution of Black communities). Agentsy will not route to xAI models.

**Meta — warn-and-acknowledge (elevated from not-listed).** Meta is building AI data centers in tents powered by 200 MW of modular gas turbines — the same fossil-fuel tactic "popularized by competitor xAI" — while rushing to deploy models it can't serve through normal infrastructure ([TechCrunch](https://techcrunch.com/2026/06/04/meta-steals-a-tactic-from-tesla-and-builds-data-centers-in-tents/), [Tom's Hardware](https://www.tomshardware.com/tech-industry/artificial-intelligence/meta-putting-up-tents-across-the-us-to-house-ai-servers-like-a-scene-out-of-the-movie-mad-max-structures-take-three-months-to-build-and-use-jet-engines-for-power), [Data Center Dynamics](https://www.datacenterdynamics.com/en/news/meta-brings-data-centers-in-tents-to-gallatin-tennessee/)). This represents a reckless environmental posture: building disposable infrastructure powered by jet-engine gas turbines to serve AI workloads, bypassing normal data center efficiency standards and environmental review. Additionally, Meta trained its models on the LibGen book heist — 7.5 million pirated books from creators who were never compensated ([Authors Guild](https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/)). Meta is not hard-blocked — its models (Llama, etc.) are open-weight and some users may have legitimate reasons to self-host — but agentsy will warn about both the environmental recklessness and the training-data theft before each session.

**OpenAI, Microsoft, Google, Amazon — warn-and-acknowledge.** Cited reporting documents:
- *OpenAI*: ChatGPT user risks ([NYT](https://www.nytimes.com/2025/11/23/technology/openai-chatgpt-users-risks.html)); OpenAI distancing itself from safety ([Annielytics](https://www.annielytics.com/blog/ai/is-openai-intentionally-distorting-itself-from-safety/)); ChatGPT creators knew product would cause harm, Florida argues in lawsuit ([Florida Phoenix](https://floridaphoenix.com/2026/06/01/chatgpt-creators-knew-product-would-cause-harm-florida-argues-in-lawsuit/)).
- *Microsoft*: ICE technology in immigration crackdown ([Guardian](https://www.theguardian.com/us-news/2026/feb/17/ice-microsoft-technology-immigration-crackdown), [DHS AI use-case inventory](https://www.dhs.gov/ai/use-case-inventory/ice), [Computerworld](https://www.computerworld.com/article/4136052/microsoft-undercuts-its-kinder-gentler-image-with-big-ice-contract.html), [Wired](https://www.wired.com/story/how-big-tech-is-powering-trumps-immigration-crackdown/)).
- *Google*: AI for Israeli military ([WaPo 2026](https://www.washingtonpost.com/technology/2026/02/01/google-ai-israel-military/), [WaPo 2025](https://www.washingtonpost.com/technology/2025/01/21/google-ai-israel-war-hamas-attack-gaza/)); "No Tech for Apartheid" — Project Nimbus $1.2B contract with Israel ([Time](https://time.com/6964364/exclusive-no-tech-for-apartheid-google-workers-protest-project-nimbus-1-2-billion-contract-with-israel/), [The Intercept](https://theintercept.com/2025/05/12/google-nimbus-israel-military-ai-human-rights/)).
- *Amazon*: co-participant in Project Nimbus; data center water usage (2.5 billion gallons in 2025, first confirmed June 2026 per [Axis Intelligence](https://axis-intelligence.com/ai-data-center-water-usage-statistics/)).

These providers are not hard-blocked — users may have legitimate reasons to use them (e.g. existing contracts, specific capabilities). But agentsy will surface the ethical concerns and require an explicit per-session acknowledgement. The warning is not permanently silencable — it must be acknowledged every session.

**Style-mimicry — hard block.** Cited sources document the mass theft of creators' work for AI training and the harm of style mimicry: AI training as theft ([arXiv](https://arxiv.org/html/2401.06178v2)); thousands of artists call for AI art auction cancellation ([Guardian](https://www.theguardian.com/technology/2025/feb/10/mass-theft-thousands-of-artists-call-for-ai-art-auction-to-be-cancelled)); "Theft Is Not Fair Use" ([Stanford JSK Fellows](https://jskfellows.stanford.edu/theft-is-not-fair-use-474e11f0d063)); plagiarism, copyright, and AI ([UChicago Law Review](https://lawreview.uchicago.edu/online-archive/plagiarism-copyright-and-ai)); Meta/LibGen AI training book heist ([Authors Guild](https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/)). Prompts like "write a poem in the style of [living poet]" or "draw an image in the style of [living illustrator]" profit from theft of the creator's work and hamper their ability to make a living. Agentsy will block these prompts.

**Telegram — hard removal.** Cited reporting documents Telegram's role as a platform for extremist organizing and CSAM: "The Three Phases of Terrorgram" ([Countering Extremism Project](https://www.counteringextremism.org/analysis/reports/the-three-phases-of-terrorgram)); Telegram's toxic recommendations perpetuate extremism ([SPLC](https://www.splcenter.org/resources/hatewatch/telegrams-toxic-recommendations-perpetuate-extremism/)); Terrorgram: a community built on hate ([DFRLab/Medium](https://medium.com/dfrlab/terrorgram-a-community-built-on-hate-e02fd59ee329)). Agentsy will not ship a Telegram connector.

### 26.3 Design

#### 26.3.1 `ProviderEthicsPolicy` (new module in `@agentsy/guardrails`)

```typescript
// packages/guardrails/src/ethics/provider-policy.ts (NEW)

export type ProviderEthicsAction = 'block' | 'warn';

export interface ProviderEthicsEntry {
  readonly providerId: string;           // e.g. 'xai', 'openai', 'microsoft', 'google', 'amazon'
  readonly action: ProviderEthicsAction;
  readonly reason: string;               // Human-readable, cites the concern
  readonly sources: readonly string[];   // URLs to reporting
  readonly acknowledgedThisSession?: boolean;  // For 'warn' entries — set after user ack
}

export const PROVIDER_ETHICS_POLICY: readonly ProviderEthicsEntry[] = [
  {
    providerId: 'xai',
    action: 'block',
    reason: 'xAI/Grok models have generated antisemitic content, Hitler-praising output, ' +
            '23,000 CSAM images in 11 days (EU investigation), and continue to host ' +
            'sexualized deepfakes of famous women. Agentsy does not route to xAI models.',
    sources: [
      'https://www.nbcnews.com/tech/internet/elon-musk-grok-antisemitic-posts-x-rcna217634',
      'https://www.politico.com/news/magazine/2025/07/10/musk-grok-hitler-ai-00447055',
      'https://9to5mac.com/2026/02/17/eu-also-investigating-as-grok-generated-23000-csam-images-in-11-days/',
      'https://en.wikipedia.org/wiki/Grok_sexual_deepfake_scandal',
      'https://www.wired.com/story/grok-is-still-hosting-sexualized-deepfakes-of-famous-women/'
    ]
  },
  {
    providerId: 'openai',
    action: 'warn',
    reason: 'OpenAI has distanced itself from safety commitments; internal documents ' +
            'show awareness of harm; Florida is suing over known product risks. ' +
            'Acknowledge to use.',
    sources: [
      'https://www.nytimes.com/2025/11/23/technology/openai-chatgpt-users-risks.html',
      'https://www.annielytics.com/blog/ai/is-openai-intentionally-distorting-itself-from-safety/',
      'https://floridaphoenix.com/2026/06/01/chatgpt-creators-knew-product-would-cause-harm-florida-argues-in-lawsuit/'
    ]
  },
  {
    providerId: 'microsoft',
    action: 'warn',
    reason: 'Microsoft provides AI technology to ICE for immigration enforcement, ' +
            'undercutting its stated safety commitments. Acknowledge to use.',
    sources: [
      'https://www.theguardian.com/us-news/2026/feb/17/ice-microsoft-technology-immigration-crackdown',
      'https://www.dhs.gov/ai/use-case-inventory/ice',
      'https://www.computerworld.com/article/4136052/microsoft-undercuts-its-kinder-gentler-image-with-big-ice-contract.html',
      'https://www.wired.com/story/how-big-tech-is-powering-trumps-immigration-crackdown/'
    ]
  },
  {
    providerId: 'google',
    action: 'warn',
    reason: 'Google provides AI to the Israeli military (Project Nimbus, $1.2B contract). ' +
            'Acknowledge to use.',
    sources: [
      'https://www.washingtonpost.com/technology/2026/02/01/google-ai-israel-military/',
      'https://www.washingtonpost.com/technology/2025/01/21/google-ai-israel-war-hamas-attack-gaza/',
      'https://time.com/6964364/exclusive-no-tech-for-apartheid-google-workers-protest-project-nimbus-1-2-billion-contract-with-israel/',
      'https://theintercept.com/2025/05/12/google-nimbus-israel-military-ai-human-rights/'
    ]
  },
  {
    providerId: 'amazon',
    action: 'warn',
    reason: 'Amazon is a co-participant in Project Nimbus (Israel military AI contract). ' +
            'Acknowledge to use.',
    sources: [
      'https://time.com/6964364/exclusive-no-tech-for-apartheid-google-workers-protest-project-nimbus-1-2-billion-contract-with-israel/',
      'https://theintercept.com/2025/05/12/google-nimbus-israel-military-ai-human-rights/'
    ]
  },
  {
    providerId: 'meta',
    action: 'warn',
    reason: 'Meta is building AI data centers in tents powered by 200 MW of gas turbines ' +
            '(the same fossil-fuel tactic as xAI), bypassing environmental review. ' +
            'Meta also trained its models on 7.5M pirated books from LibGen without ' +
            'creator compensation. Acknowledge to use.',
    sources: [
      'https://techcrunch.com/2026/06/04/meta-steals-a-tactic-from-tesla-and-builds-data-centers-in-tents/',
      'https://www.tomshardware.com/tech-industry/artificial-intelligence/meta-putting-up-tents-across-the-us-to-house-ai-servers-like-a-scene-out-of-the-movie-mad-max-structures-take-three-months-to-build-and-use-jet-engines-for-power',
      'https://www.datacenterdynamics.com/en/news/meta-brings-data-centers-in-tents-to-gallatin-tennessee/',
      'https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/'
    ]
  }
];

export function getProviderEthicsPolicy(providerId: string): ProviderEthicsEntry | undefined;
export function isProviderBlocked(providerId: string): boolean;
export function requiresAcknowledgement(providerId: string): boolean;
```

#### 26.3.2 Gateway routing integration

In `RoutingService.selectModel()` (Phase 5), after filtering by tier/capabilities/cost, apply the provider ethics policy:

- **Block**: remove all replicas whose `providerId` matches a `'block'` entry. If this eliminates all candidates, return a `RoutingFailure` with `reason: 'provider-ethics-block'` and the policy entry (so the user sees *why*).
- **Warn**: do not remove the replica, but attach `requiresAcknowledgement: true` to the `RoutingDecision`. The caller (daemon IPC layer or ACP session bridge) must check this flag and, if `true` and the user hasn't acknowledged this session, return an `acknowledgement-required` error with the warning text + sources. The user acknowledges via a new `agentsy acknowledge-provider --provider <id>` CLI command or an ACP `session/set_config_option` call. The acknowledgement is per-session (stored in `UnifiedDB.session_meta`), not permanent.

#### 26.3.3 `StyleMimicryScanner` (new guardrails scanner)

Add to Phase 9's scanner list as a 10th behavioral detector (it was not in the original SAFETY.md 9, but extends the same framework):

```typescript
// packages/guardrails/src/scanners/style-mimicry.ts (NEW)

const STYLE_MIMICRY_PATTERNS = [
  // Writing
  /\b(?:in\s+the\s+style\s+of|write\s+like|mimic\s+(?:the\s+)?(?:style|voice)\s+of|imitate\s+(?:the\s+)?writing\s+of)\s+([A-Z][a-zA-Z\s]{2,40})/i,
  // Imagery
  /\b(?:in\s+the\s+style\s+of|draw\s+like|paint\s+like|artwork\s+in\s+the\s+manner\s+of|(?:image|picture|illustration)\s+in\s+the\s+style\s+of)\s+([A-Z][a-zA-Z\s]{2,40})/i,
  // Audio/video
  /\b(?:in\s+the\s+style\s+of|compose\s+like|produce\s+(?:audio|music|video)\s+like|sound\s+like)\s+([A-Z][a-zA-Z\s]{2,40})/i,
];

// Living-creator heuristic — block matches where the captured name is not
// a known historical/public-domain figure. This is conservative: when in
// doubt, block. The user can appeal via the exceptions log (E-43).
const HISTORICAL_FIGURES = new Set([
  'Shakespeare', 'Dickens', 'Twain', 'Austen', 'Hemingway', 'Fitzgerald',
  'Van Gogh', 'Monet', 'Picasso', 'Dali', 'Rembrandt',
  'Bach', 'Mozart', 'Beethoven', 'Chopin',
  // ... extendable — public-domain figures only
]);

export class StyleMimicryScanner implements GuardrailScanner {
  readonly id = 'style-mimicry';
  readonly phase: GuardrailPhase = 'input';
  readonly priority = 45;

  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    for (const pattern of STYLE_MIMICRY_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        const creatorName = match[1]?.trim();
        if (creatorName && !HISTORICAL_FIGURES.has(creatorName)) {
          return {
            status: 'block',
            phase: 'input',
            reason: `Style-mimicry of "${creatorName}" blocked. Generating work in the style ` +
                    `of a specific living creator profits from theft of their work and hampers ` +
                    `their ability to make a living. See: ` +
                    `https://arxiv.org/html/2401.06178v2, ` +
                    `https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/`,
            detections: [{
              id: 'style-mimicry',
              severity: 'high',
              description: `Request to mimic style of "${creatorName}"`,
              confidence: 0.85,
              snippet: match[0],
            }],
          };
        }
      }
    }
    return { status: 'pass', phase: 'input' };
  }
}
```

#### 26.3.4 Telegram removal

Delete:
- `packages/daemon/src/connectors/telegram.ts`
- Remove `telegram` from `packages/daemon/src/connectors/index.ts` exports
- Remove `telegram` from `ConnectorHostDeps.config` in `packages/daemon/src/connectors/connector-host.ts`
- Remove `telegram` from `DaemonConfigSchema.connectors` in `packages/daemon/src/config.ts`
- Remove Telegram from `packages/cli/src/commands/connectors.ts`
- Remove `grammy` from any optional-dependencies documentation

Add to `safety-changelog.md`:
```
## 2026-06-17 — Telegram connector removed
Removed the Telegram connector on ethical grounds. Telegram is documented as a
platform for extremist organizing ("Terrorgram") and CSAM distribution. Sources:
- https://www.counteringextremism.org/analysis/reports/the-three-phases-of-terrorgram
- https://www.splcenter.org/resources/hatewatch/telegrams-toxic-recommendations-perpetuate-extremism/
- https://medium.com/dfrlab/terrorgram-a-community-built-on-hate-e02fd59ee329
```

#### 26.3.5 ETHICS.md amendments

Add new clauses to `ETHICS.md` and register them in the `EthicsRegistry` (Phase 4):
- §12: "The framework must not route to providers documented as generating CSAM, antisemitic content, or non-consensual sexual deepfakes. xAI/Grok is blocked."
- §13: "The framework must warn users before routing to providers documented as complicit in human-rights violations (immigration enforcement, military AI). OpenAI, Microsoft, Google, and Amazon require per-session acknowledgement."
- §14: "The framework must block prompts requesting creation of work in the style of a specific named living creator. Style mimicry profits from theft of creators' work."
- §15: "The framework must not ship connectors to platforms documented as facilitating extremism or CSAM. Telegram is removed."

Each clause's `implementedBy` field points to the corresponding scanner or policy module.

### 26.4 File-by-File Change List

**New** (4 files):
- `packages/guardrails/src/ethics/provider-policy.ts` — `PROVIDER_ETHICS_POLICY`, `getProviderEthicsPolicy()`, `isProviderBlocked()`, `requiresAcknowledgement()`
- `packages/guardrails/src/scanners/style-mimicry.ts` — `StyleMimicryScanner`
- `packages/guardrails/src/scanners/style-mimicry.test.ts` — 20+ fixtures (writing, imagery, audio, historical-figure exemption, edge cases)
- `packages/guardrails/src/ethics/provider-policy.test.ts` — policy lookup, block check, ack check

**Modified** (8 files):
- `packages/gateway/src/services/routing-service.ts` (Phase 5) — apply `PROVIDER_ETHICS_POLICY` in `selectModel()`
- `packages/daemon/src/daemon.ts` — handle `requiresAcknowledgement` flag in IPC `stream.start` handler; add `agentsy acknowledge-provider` CLI
- `packages/daemon/src/config.ts` — remove `telegram` from `connectors` schema
- `packages/daemon/src/connectors/index.ts` — remove telegram export
- `packages/daemon/src/connectors/connector-host.ts` — remove `telegram` from config type
- `packages/cli/src/commands/connectors.ts` — remove Telegram
- `ETHICS.md` — add §12–§15
- `safety-changelog.md` — Telegram removal entry

**Deleted** (1 file):
- `packages/daemon/src/connectors/telegram.ts`

### 26.5 Edge Cases

- **xAI model in fallback chain**: if a user configures a fallback chain that includes xAI, the block applies at every hop. The `RoutingService.spillover()` and `ResilienceService.failoverCall()` (Phase 18) must skip blocked providers. Document: "blocked providers are removed from the candidate set before any other filtering."
- **Acknowledgement persistence**: per-session only. Restarting the daemon or starting a new session requires re-acknowledgement. This is deliberate — the ethical concerns don't expire.
- **Style-mimicry false positives**: "Write a sonnet in the style of Shakespeare" passes (historical figure). "Write a blog post in the style of Paul Graham" blocks (living creator). The `HISTORICAL_FIGURES` set is conservative and extensible via `docs/safety-exceptions.md` (E-43) with maintainer sign-off.
- **Style-mimicry of a technique vs. a person**: "Write in a stream-of-consciousness style" (technique — passes). "Write in the style of James Joyce" (person — blocks, Joyce is historical but the set is conservative; add Joyce to the set). "Write in the style of a specific living poet" (no name captured — passes, but the agent should be trained to refuse).
- **User overrides**: there is **no override** for the xAI block or the style-mimicry block. These are hard ethical commitments. The `docs/safety-exceptions.md` mechanism (E-43) is for documenting *why* an exception was considered, not for enabling one.

### 26.6 Verification

- [ ] `PROVIDER_ETHICS_POLICY` contains 5 entries (xai block; openai/microsoft/google/amazon warn)
- [ ] `isProviderBlocked('xai')` returns `true`; all others return `false`
- [ ] `requiresAcknowledgement('openai')` returns `true`; `requiresAcknowledgement('anthropic')` returns `false`
- [ ] `RoutingService.selectModel()` removes blocked providers before returning candidates
- [ ] `RoutingService.selectModel()` attaches `requiresAcknowledgement` to warn-listed providers
- [ ] Daemon IPC `stream.start` returns `acknowledgement-required` error when ack is missing
- [ ] `agentsy acknowledge-provider --provider openai` records ack in `UnifiedDB.session_meta`
- [ ] Acknowledgement is per-session — new session requires re-ack
- [ ] `StyleMimicryScanner` blocks "in the style of [living creator]" for writing, imagery, audio
- [ ] `StyleMimicryScanner` passes "in the style of Shakespeare" (historical)
- [ ] `StyleMimicryScanner` passes "in a stream-of-consciousness style" (technique, no name)
- [ ] `telegram.ts` deleted; no references remain in `packages/daemon` or `packages/cli`
- [ ] `safety-changelog.md` has Telegram removal entry with sources
- [ ] `ETHICS.md` §12–§15 added; `EthicsRegistry` updated with `implementedBy` fields
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 27. Phase 21 — Docker-Based Optional Tooling

**Priority**: P2 — Sprint 4–5
**Story points**: 8
**Branch**: `feat/docker-optional-tooling`
**Depends on**: Phase 1 ✅ (daemon, `SubprocessManager`), Phase 12 (guardrails daemon integration — presidio is a PII scanner that complements the guardrails pipeline)
**Unblocks**: Phase 13 §18.7 (langeval integration — langeval runs as a Docker Compose stack that extends this phase's Docker infrastructure)

### 27.1 Goal

Add user-optional, resource-availability-dependent support for two Docker-based tools (plus the Docker infrastructure that langeval in Phase 13 §18.7 also consumes):

1. **[super-linter](https://github.com/super-linter/super-linter)** — a comprehensive multi-language linter that runs in a Docker container. Agentsy invokes it as a tool when the user wants a full-repo lint pass with 60+ supported languages.
2. **[Presidio](https://github.com/microsoft/presidio)** — Microsoft's PII detection and anonymization toolkit. Agentsy uses it as a high-accuracy PII scanner that complements the regex-based `PIIScanner` in `@agentsy/guardrails`.

The `DockerAvailabilityChecker` and Docker Compose patterns built in this phase are reused by Phase 13 §18.7 (langeval stack) and Phase 24 (Teams Docker deployment).

Both are **opt-in** (disabled by default), **Docker-dependent** (the daemon detects whether Docker is available and whether the images are present), and **resource-aware** (the daemon checks available memory/CPU before invoking).

### 27.2 Design

#### 27.2.1 `DockerAvailabilityChecker`

```typescript
// packages/daemon/src/services/docker-availability.ts (NEW)

export interface DockerAvailability {
  readonly available: boolean;
  readonly version: string | null;
  readonly reason: string;               // 'Docker not found' | 'Docker daemon not running' | 'OK'
  readonly availableMemoryMb: number | null;
  readonly availableCpus: number | null;
}

export async function checkDockerAvailability(): Promise<DockerAvailability> {
  // 1. `docker --version` via SubprocessManager
  // 2. `docker info` to check daemon is running
  // 3. `docker system df --format json` for resource stats
  // 4. Parse /proc/meminfo or os.totalmem()/freemem() for host resources
}

export async function isImagePresent(imageName: string): Promise<boolean> {
  // `docker image inspect <imageName>` — returns true if present
}

export async function pullImage(imageName: string): Promise<boolean> {
  // `docker pull <imageName>` — returns true on success
}
```

#### 27.2.2 `SuperLinterTool`

```typescript
// packages/tools/src/tools/super-linter/index.ts (NEW)

export function createSuperLinterTool(deps: {
  subprocessManager: SubprocessManager;
  dockerChecker: DockerAvailabilityChecker;
}): ToolDefinition {
  return {
    name: 'super_lint',
    description: 'Run super-linter on the project (or a subdirectory). Requires Docker. ' +
                 'Supports 60+ languages. Slower than built-in linters but comprehensive.',
    annotations: {
      readOnlyHint: false,        // writes lint results to /tmp
      openWorldHint: false,
      // New annotation fields from Phase 14 §19.5:
      isDestructive: false,
      maxResultSizeChars: 50_000, // super-linter output can be huge — disk-spill
    },
    parameters: [
      { name: 'path', type: 'string', required: false, description: 'Subdirectory to lint (default: project root)' },
      { name: 'languages', type: 'array', required: false, description: 'Limit to specific languages' },
      { name: 'fix', type: 'boolean', required: false, description: 'Attempt auto-fix (default: false)' },
    ],
    handler: async (input) => {
      // 1. Check Docker availability
      const docker = await deps.dockerChecker.check();
      if (!docker.available) {
        return { ok: false, data: null, error: `Docker not available: ${docker.reason}` };
      }
      // 2. Check resource availability (super-linter needs ~2GB RAM)
      if (docker.availableMemoryMb && docker.availableMemoryMb < 2048) {
        return { ok: false, data: null, error: `Insufficient memory: ${docker.availableMemoryMb}MB available, 2048MB required` };
      }
      // 3. Ensure image is present (pull if missing)
      const image = 'super-linter/super-linter:latest';
      if (!(await deps.dockerChecker.isImagePresent(image))) {
        await deps.dockerChecker.pullImage(image);
      }
      // 4. Invoke via SubprocessManager
      const result = await deps.subprocessManager.spawnProcess({
        command: 'docker',
        args: ['run', '--rm', '-v', `${process.cwd()}:/tmp/lint`, image, ...buildArgs(input)],
        timeoutMs: 300_000,  // 5 min timeout
        memoryLimitMb: 2048,
      });
      // 5. Parse and return results
      return parseLintResult(result);
    },
  };
}
```

#### 27.2.3 `PresidioScanner` (guardrails integration)

```typescript
// packages/guardrails/src/scanners/presidio.ts (NEW)

export class PresidioScanner implements GuardrailScanner {
  readonly id = 'presidio';
  readonly phase: GuardrailPhase = 'input';  // Also runs on 'output' and 'egress'
  readonly priority = 35;                     // Higher priority than regex PII (runs first when available)

  constructor(private deps: {
    subprocessManager: SubprocessManager;
    dockerChecker: DockerAvailabilityChecker;
    enabled: boolean;  // From DaemonConfig.guardrails.presidio.enabled
  }) {}

  async evaluate(input: string, context: GuardrailContext): Promise<GuardrailResult> {
    if (!this.deps.enabled) return { status: 'pass', phase: 'input' };

    const docker = await this.deps.dockerChecker.check();
    if (!docker.available) {
      // Graceful degradation — fall back to regex PIIScanner (already in pipeline)
      return { status: 'pass', phase: 'input' };
    }

    // Invoke Presidio analyzer in Docker
    const result = await this.deps.subprocessManager.spawnProcess({
      command: 'docker',
      args: ['run', '--rm', '-i', 'mcr.microsoft.com/presidio-analyzer:latest', 'analyze'],
      timeoutMs: 10_000,
    });

    const detections = parsePresidioResult(result);
    if (detections.length === 0) return { status: 'pass', phase: 'input' };

    return {
      status: 'transform',
      phase: 'input',
      sanitized: redactWithPresidio(input, detections),
      transformReason: 'redaction',
      detections: detections.map(d => ({
        id: `presidio-${d.entity_type}-${d.start}`,
        severity: 'high',
        description: `PII detected: ${d.entity_type}`,
        confidence: d.score,
        start: d.start,
        end: d.end,
      })),
    };
  }
}
```

#### 27.2.4 DaemonConfig extension

```typescript
// Add to DaemonConfigSchema (Phase 16 / config.ts)
docker: z.object({
  enabled: z.boolean().default(false),  // opt-in
  superLinter: z.object({
    enabled: z.boolean().default(false),
    image: z.string().default('super-linter/super-linter:latest'),
    timeoutMs: z.number().int().positive().default(300_000),
    memoryLimitMb: z.number().int().positive().default(2048),
  }).default({}),
  presidio: z.object({
    enabled: z.boolean().default(false),
    image: z.string().default('mcr.microsoft.com/presidio-analyzer:latest'),
    timeoutMs: z.number().int().positive().default(10_000),
  }).default({}),
}).default({})
```

#### 27.2.5 Resource-availability contract

Both tools check three conditions before invoking:
1. **Docker available** — `docker --version` and `docker info` succeed.
2. **Image present** — `docker image inspect` succeeds; if not, offer to pull (interactive) or auto-pull (configurable).
3. **Resources sufficient** — host has enough free memory (super-linter: ≥2GB, presidio: ≥512MB) and CPU (≥1 core available).

If any condition fails, the tool returns a graceful degradation result (super-linter: "Docker not available, falling back to built-in linters"; presidio: "Docker not available, falling back to regex PII scanner"). No hard failures.

### 27.3 File-by-File Change List

**New** (5 files):
- `packages/daemon/src/services/docker-availability.ts` — `DockerAvailabilityChecker`
- `packages/daemon/src/services/docker-availability.test.ts`
- `packages/tools/src/tools/super-linter/index.ts` — `SuperLinterTool`
- `packages/tools/src/tools/super-linter/index.test.ts`
- `packages/guardrails/src/scanners/presidio.ts` — `PresidioScanner`

**Modified** (3 files):
- `packages/daemon/src/config.ts` — add `docker` section
- `packages/daemon/src/daemon.ts` — instantiate `DockerAvailabilityChecker`, pass to tools + guardrails
- `packages/guardrails/src/index.ts` — export `PresidioScanner`

### 27.4 Verification

- [ ] `DockerAvailabilityChecker` correctly detects Docker presence, daemon state, and resources
- [ ] `SuperLinterTool` returns graceful degradation when Docker is absent
- [ ] `SuperLinterTool` invokes `docker run` with correct args and parses output
- [ ] `PresidioScanner` returns `pass` when disabled
- [ ] `PresidioScanner` returns `pass` (graceful degradation) when Docker is absent
- [ ] `PresidioScanner` returns `transform` with redacted output when PII is detected
- [ ] `DaemonConfig.docker` schema has correct defaults (all disabled)
- [ ] Resource checks prevent invocation when memory/CPU insufficient
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 28. Phase 22 — Web Fetcher HTML-to-Markdown Enhancement

**Priority**: P3 — Sprint 6
**Story points**: 2
**Branch**: `feat/web-fetcher-markdown`
**Depends on**: nothing (standalone tool enhancement)
**Unblocks**: better agent consumption of web content

### 28.1 Goal

When the `http_fetch` tool fetches HTML content, automatically convert it to Markdown for the agent's ease of consumption. Uses [`turndown`](https://npmx.dev/package/turndown) — a lightweight HTML-to-Markdown converter.

### 28.2 Design

Update `packages/tools/src/tools/http/index.ts`:

```typescript
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

async function handleHttpFetch(input: Record<string, unknown>): Promise<ToolResult> {
  // ... existing fetch logic ...
  const response = await executeFetch(url, method, input);
  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  let body = rawBody;
  let converted = false;

  // Auto-convert HTML to Markdown
  if (contentType.includes('text/html') && rawBody.trim().startsWith('<')) {
    try {
      body = turndown.turndown(rawBody);
      converted = true;
    } catch {
      // If conversion fails, return raw HTML — don't break the fetch
      body = rawBody;
    }
  }

  return {
    ok: true,
    data: {
      status: response.status,
      statusText: response.statusText,
      body,
      bodyFormat: converted ? 'markdown' : (contentType.includes('text/html') ? 'html' : contentType),
      headers: Object.fromEntries(response.headers.entries()),
    },
  };
}
```

### 28.3 File-by-File Change List

**Modified** (2 files):
- `packages/tools/src/tools/http/index.ts` — add turndown conversion
- `packages/tools/package.json` — add `turndown` dependency

**New** (1 file):
- `packages/tools/src/tools/http/index.test.ts` — test HTML→Markdown conversion, non-HTML passthrough, conversion failure fallback

### 28.4 Verification

- [ ] `http_fetch` returns Markdown when content-type is `text/html`
- [ ] `http_fetch` returns raw body when content-type is not HTML
- [ ] `http_fetch` returns raw HTML when turndown conversion throws (graceful fallback)
- [ ] `bodyFormat` field correctly reports `markdown` | `html` | `<content-type>`
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 29. Phase 23 — AFT, Magic Context & Task Board Integration Hardening

**Priority**: P1 — Sprint 7–8
**Story points**: 10
**Branch**: `feat/aft-mc-taskboard-hardening`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`), Phase 15 (bootstrap — owns AFT/MC generation)
**Unblocks**: Phase 14 (sub-agent fork-with-cache-sharing depends on this), reliable task delegation

> This phase closes the five integration gaps documented in §25.3 (AFT/Magic Context/Todos/Task Delegation audit).

### 29.1 Gap 1 — Bidirectional MC ↔ agentsy wiki sync

**Current**: `dreamer-consumer.ts` polls `project_state.project_memory_epoch` and one-directionally upserts MC memories into the agentsy wiki. No write-back path.

**Fix**:
- Add `writeBackToMagicContext: boolean` option to `WikiManager.upsertPage()`. When true, the upsert also writes to MC's `project_memories` table (mapping wiki entity kinds back to MC categories).
- Replace the poll-based `dreamer-consumer` with an event-driven model: MC bumps `project_memory_epoch` on write; agentsy subscribes via a SQLite trigger + Honker NOTIFY (Phase 1's event bus). Epoch change → immediate sync, not poll.
- Document the bidirectional sync in `docs/developers/cortexkit-integration.md`.

### 29.2 Gap 2 — AFT graceful degradation

**Current**: `getAftBridge()` throws `'AFT binary not found'` when the binary is missing. No fallback.

**Fix**:
- Add `getAftBridgeOrNull(): Promise<BridgePool | null>` — returns `null` instead of throwing.
- Update all callers to check for `null` and fall back to no-code-intelligence mode with a one-time `logger.warn('AFT not available — code intelligence disabled. Run npx @cortexkit/aft setup.')`.
- Keep the existing `getAftBridge()` as a thin wrapper that throws for backward compatibility, but mark it `@deprecated` in favor of `getAftBridgeOrNull()`.

### 29.3 Gap 3 — Wire AFT and MC into the daemon lifecycle

**Current**: AFT `BridgePool` and MC database are not started/stopped by the daemon. MC's `context.db` is a separate file not absorbed by `UnifiedDB`.

**Fix**:
- Add `aftPool` and `magicContextDb` fields to the `Daemon` class.
- In `Daemon.start()`: call `aftPool.start()` (if AFT available) and open MC database.
- In `Daemon.stop()`: call `aftPool.shutdown()` and close MC database (before `UnifiedDB.close()`, since the dreamer consumer may flush).
- Document the deliberate exception to UnifiedDB consolidation: MC's `context.db` stays separate because MC owns its schema and external tools (MC dashboard) expect it at the XDG path. `UnifiedDB` does not absorb it.
- Register both as services in `ServiceHost` for sleep/wake lifecycle.

### 29.4 Gap 4 — Todo lists + SQLite-backed task board + agent-callable tools

**Current**: No todo-list tool exists. Task board is in-memory only and not agent-callable.

**Fix**:

#### 29.4.1 Todo-list tool and store

Add a `todos` table to `UnifiedDB`:
```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | cancelled
  priority TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  parent_task_id TEXT,                     -- link to task-board tasks
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);
CREATE INDEX idx_todos_session ON todos(session_id);
```

Add three agent-callable tools in `packages/tools/src/tools/todo/`:
- `todo_write` — create/update a todo item
- `todo_read` — list todos for the current session/agent (with status filter)
- `todo_update` — mark todo status (in_progress, completed, cancelled)

#### 29.4.2 SQLite-backed TaskBoard

Add `packages/orchestrator/src/task-board/sqlite.ts`:
```typescript
export class SqliteTaskBoard implements TaskBoard {
  constructor(private db: UnifiedDB) {}
  // Implements the same TaskBoard interface as InMemoryTaskBoard
  // Persists to UnifiedDB.tasks and UnifiedDB.task_attempts
}
```

Add `tasks` and `task_attempts` tables to `UnifiedDB` (mirroring the `Task` and `TaskAttempt` types from `packages/orchestrator/src/task-board/types.ts`).

The daemon uses `SqliteTaskBoard` (not `InMemoryTaskBoard`) so tasks survive restarts.

#### 29.4.3 Agent-callable task-delegation tools

Add three agent-callable tools in `packages/tools/src/tools/task/`:
- `task_list` — list tasks for the current plan (with status filter)
- `task_claim` — claim a `ready` task for execution (sets status to `running`, creates a `TaskAttempt`)
- `task_complete` — mark a task completed/failed (records output in `TaskAttempt`)

These let an agent delegate sub-tasks to other agents (via the `AgentHost.spawn` + task-board claim pattern) and track progress.

### 29.5 Gap 5 — `forkWithCacheSharing` for sub-agents

**Current**: Sub-agents start cold — no inheritance of parent's AFT session, MC compartments, or wiki context.

**Fix**:

Add `forkWithCacheSharing(parentAgentId): AgentId` to `AgentHost`:
```typescript
async forkWithCacheSharing(parentAgentId: string): Promise<string> {
  const parent = this.getAgent(parentAgentId);
  // 1. Inherit AFT session bridge (same project root → same BridgePool entry)
  const aftBridge = await getAftSessionBridge({ projectRoot: parent.spec.cwd });
  // 2. Snapshot parent's MC compartments (p1–p4 tiers)
  const compartmentSnapshot = await this.mcSnapshotBridge.snapshot(parent.spec.sessionId);
  // 3. Spawn child agent with inherited context
  const childId = await this.spawn({
    spec: { ...parent.spec, id: undefined, parentId: parentAgentId },
    aftBridge,                          // shared
    compartmentSnapshot,                // copied
    wikiContext: parent.wikiContext,    // shared (read-only)
  });
  return childId;
}
```

This implements the Claude-Code `CacheSafeParams` + `buildForkedMessages` pattern (Phase 14 §19.5) at the agentsy level.

### 29.6 File-by-File Change List

**New** (8 files):
- `packages/tools/src/tools/todo/index.ts` — `todo_write`, `todo_read`, `todo_update` tools
- `packages/tools/src/tools/todo/index.test.ts`
- `packages/tools/src/tools/task/index.ts` — `task_list`, `task_claim`, `task_complete` tools
- `packages/tools/src/tools/task/index.test.ts`
- `packages/orchestrator/src/task-board/sqlite.ts` — `SqliteTaskBoard`
- `packages/orchestrator/src/task-board/sqlite.test.ts`
- `packages/daemon/src/db/migrations/00X_todos_tasks.sql` — `todos`, `tasks`, `task_attempts` tables
- `packages/memory/src/cortexkit/bidirectional-sync.ts` — bidirectional MC ↔ wiki sync

**Modified** (8 files):
- `packages/shared/src/cortexkit/aft-manager.ts` — add `getAftBridgeOrNull()`, deprecate `getAftBridge()`
- `packages/memory/src/cortexkit/wiki-manager.ts` — add `writeBackToMagicContext` option
- `packages/memory/src/cortexkit/dreamer-consumer.ts` — replace polling with Honker NOTIFY subscription
- `packages/daemon/src/daemon.ts` — add `aftPool`, `magicContextDb` fields; wire start/stop; use `SqliteTaskBoard`
- `packages/daemon/src/agents/agent-host.ts` — add `forkWithCacheSharing()`
- `packages/daemon/src/db/unified-db.ts` — add `todos`/`tasks`/`task_attempts` tables to migration
- `docs/developers/cortexkit-integration.md` — document bidirectional sync, daemon lifecycle wiring, deliberate UnifiedDB exception
- `packages/tools/src/tools/baseline.ts` — register todo + task tools

### 29.7 Verification

- [ ] `WikiManager.upsertPage({ writeBackToMagicContext: true })` writes to both wiki and MC `project_memories`
- [ ] Dreamer consumer syncs within 1s of MC epoch change (event-driven, not poll)
- [ ] `getAftBridgeOrNull()` returns `null` when AFT binary missing (no throw)
- [ ] Callers log a one-time warning and continue in degraded mode
- [ ] `Daemon.start()` starts AFT pool + opens MC database; `Daemon.stop()` shuts them down
- [ ] `todo_write` / `todo_read` / `todo_update` tools work and persist to `UnifiedDB.todos`
- [ ] Todos survive daemon restart
- [ ] `SqliteTaskBoard` persists tasks and attempts to `UnifiedDB`
- [ ] `task_list` / `task_claim` / `task_complete` tools work
- [ ] `AgentHost.forkWithCacheSharing()` creates a child agent that inherits parent's AFT bridge + MC compartment snapshot
- [ ] Sub-agent fork does not re-index the project (AFT session shared)
- [ ] `docs/developers/cortexkit-integration.md` updated
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 30. Implementation Order & Milestones

### 30.1 Sprint-by-Sprint Timeline

```
Sprint 1 (Week 1-2):   Phase 3 (Hook Pipeline Redesign) ─────────┐
                       Phase 5 (Gateway → Daemon) ────────────────┤
                       Phase 7 (RAG as Daemon Service) ───────────┤
                       Phase 19 (Langfuse Observability) ─────────┤
                                                                    ├──▶ All four parallel
Sprint 2 (Week 3-4):   Phase 4 (Guardrails Honest Foundation) ────┤
                       Phase 5 finish ─────────────────────────────┤
                       Phase 7 finish ─────────────────────────────┤
                       Phase 19 finish ────────────────────────────┤
                       Phase 20 (Ethical Provider Policy) start ───┤  ← P0, needs Phase 4 + 5
                                                                    ├──▶ Phase 20 is a BLOCK gate
Sprint 3 (Week 5-6):   Phase 6 (Streaming Architecture) ──────────┐
                       Phase 8 (Learning Loop) ────────────────────┤
                       Phase 20 finish ────────────────────────────┤
                       Phase 22 (Web Fetcher Markdown) ────────────┤  ← 2 SP quick win, parallel
                                                                    ├──▶ Phase 8 needs Phase 7
Sprint 4 (Week 7-8):   Phase 9 (Guardrails Behavioral Detectors) ─┤
                       Phase 21 (Docker Tooling) start ────────────┤  ← needs Phase 12 ideally, can start tooling
                                                                    ├──▶ Phase 9 needs Phase 4 + Phase 10
Sprint 5 (Week 9-10):  Phase 9 finish ─────────────────────────────┤
                       Phase 10 (Guardrails Missing Surfaces) ─────┤
                       Phase 21 finish ────────────────────────────┘
                                                                   
Sprint 6 (Week 11-12): Phase 11 (Scope Accountability) ───────────┐
                       Phase 12 (Guardrails Daemon Integration) ──┤
                                                                    ├──▶ Both need Phase 10
Sprint 7 (Week 13-14): Phase 13 (Guardrails Metrics/Benchmarks) ──┤
                       Phase 14 (ACP Agent) start ─────────────────┤
                       Phase 23 (AFT/MC/TaskBoard Hardening) start ┤  ← needs Phase 1 + 15
                                                                    ├──▶ Phase 13 needs Phase 9 + 12
Sprint 8 (Week 15-16): Phase 14 finish ────────────────────────────┤
                       Phase 15 (Project Bootstrap) start ─────────┤
                       Phase 23 finish ────────────────────────────┤
                                                                    ├──▶ Phase 15 needs Phase 8
Sprint 9 (Week 17-18): Phase 15 finish ────────────────────────────┤
                       Phase 16 (Guardrails CLI Polish) ───────────┤
                       Phase 17 (Competitive Sprint) start ────────┤
                                                                    ├──▶ Phase 17 needs Phase 14
Sprint 10 (Week 19-20): Phase 17 continuation ─────────────────────┤
                        Phase 18 (Missing Capabilities) start ─────┤
                                                                    ├──▶ Phase 18 needs Phase 14
Sprint 11 (Week 21-22): Phase 18 finish ───────────────────────────┘
```

### 30.2 Dependencies Graph (Active Scope)

```
Phase 3 (Hooks) ─────────┬──▶ Phase 4 (Guardrails Foundation) ──┬──▶ Phase 9 (Detectors) ──┐
                          │                                       │                          ├──▶ Phase 13 (Metrics)
Phase 5 (Gateway) ────────┼──▶ Phase 6 (Streaming) ──┬──▶ Phase 14 (ACP) ──┬──▶ Phase 18 (Missing)
                          │                           │                     │
Phase 7 (RAG) ────────────┼──▶ Phase 8 (Learning) ────┼──▶ Phase 15 (Bootstrap)
                          │                           │
                          └──▶ Phase 10 (Surfaces) ──▶ Phase 11 (Scope) ──▶ Phase 12 (Daemon Integration)

Phase 1 ✅ ──▶ Phase 19 (Langfuse)    ← independent track, Sprint 1-2

Phase 4 ──▶ Phase 16 (CLI Polish)
Phase 3 + 6 + 14 ──▶ Phase 17 (Competitive)
```

### 30.3 Success Criteria Per Phase Gate

Each phase must pass these gates before the next phase begins:

- All existing tests pass (no regressions)
- New code has >80% test coverage (critical paths >90%)
- `pnpm build` succeeds with zero errors
- `pnpm check-types` succeeds with zero errors
- `pnpm lint` succeeds with zero warnings
- Manual smoke test: `agentsy daemon start` → `agentsy chat` → works end-to-end
- ACP smoke test (after Phase 14): `agentsy daemon start` → connect from Zed → send prompt → receive streamed response with tool calls
- Project bootstrap smoke test (after Phase 15): `agentsy project init` in a sample Next.js project → `.agentsy/config.yml`, `AGENTS.md`, `.agentsy/aft.{md,json}` written → at least one recommended component installed → Magic Context compartments seeded in `agentsy.db`
- Guardrails benchmark passes (after Phase 13): `agentsy guardrails benchmark` → all 12 scenarios at or above threshold

### 30.4 Story Point Burndown

| Sprint | SP Completed | Cumulative | Remaining |
|---|---|---|---|
| 1 | ~15 (P3+P5+P7 start + P19 start) | 15 | 137.5 |
| 2 | ~19 (P4+P5 finish as independent gateway+P7/P19 finish + P20 start) | 34 | 118.5 |
| 3 | ~14 (P6+P8+P20 finish+P22) | 48 | 104.5 |
| 4 | ~13 (P9 start+P21 start) | 61 | 91.5 |
| 5 | ~17 (P9 finish+P10 with §15.7 ingress extension+P21 finish) | 78 | 74.5 |
| 6 | ~10 (P11+P12) | 88 | 64.5 |
| 7 | ~18.5 (P13 with §18.7 langeval integration + P14 start with §19.10 ACP ledger + P23 start) | 106.5 | 46 |
| 8 | ~14 (P14 finish with ACP translators + P15 start + P23 finish) | 120.5 | 32 |
| 9 | ~12 (P15 finish+P16+P17 start) | 132.5 | 20 |
| 10 | ~12 (P17 finish+P18 start) | 144.5 | 8 |
| 11 | ~8 (P18 finish) | 152.5 | 0 |

Active total: ~152.5 SP (Phases 3–23, including Phase 5 independent-gateway revision +1 SP, Phase 10 §15.7 ingress extension +3 SP, Phase 13 §18.7 langeval integration +3.5 SP, Phase 14 §19.10 ACP event ledger +5 SP). Buffer is 0 SP. **Recommend extending the timeline by 1 sprint (Sprint 12) or descoping P3 items (Phase 18 image/audio, Phase 22) to recover ~9 SP of buffer.** Phase 5 (independent gateway), Phase 20 (ethical policy), Phase 10 §15.7 (ingress scanning), Phase 13 §18.7 (langeval eval), and Phase 14 §19.10 (ACP depth) are all P0/P1 and must not be descoped.

### 30.5 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Phase 9 detector false positives erode user trust | Medium | High | Ship detectors in `escalate` mode first; tighten to `block` after benchmark validation (Phase 13). |
| Phase 12 daemon integration breaks existing CLI flows | Medium | High | Phase 12 ships behind `DaemonConfig.guardrails.enabled` flag; enable by default after one sprint of dogfooding. |
| Phase 13 benchmark suite fixtures are too narrow | Medium | Medium | Use the 12 SAFETY.md scenarios as seeds; expand with real-world incidents from the safety-changelog. |
| Phase 14 ACP integration breaks with new ACP spec versions | Low | Medium | Pin `@agentclientprotocol/sdk` version; track spec changes in a quarterly review. |
| Phase 17 competitive sprint scope creeps | High | Medium | Each item has a fixed SP estimate; if an item exceeds estimate by 50%, defer to Phase 18 or a follow-up sprint. |
| Phase 18 image/audio support requires vision/audio-capable models not yet wired | Medium | Low | Defer image/audio to a follow-up if vision models aren't available; text-only ACP is still useful. |
| Phase 19 Langfuse auto-enables for users who have `LANGFUSE_*` set for other tools | Medium | Low | Document the `observability.langfuse.enabled: false` escape hatch in README and upgrade notes. Daemon logs the detection reason at startup so users see what happened. |
| Phase 19 redaction gap means raw prompt content may appear in Langfuse dashboard | High | Medium | Document the caveat prominently in README. The redaction wiring fix (v2.3 Appendix A) is the proper fix; until it lands, advise restricting Langfuse dashboard access. |
| Phase 20 xAI block prompts user backlash from Grok users | Medium | Low | Document the ethical stance prominently in README and ETHICS.md §12. The block is non-negotiable; users who need Grok must use a different framework. |
| Phase 20 style-mimicry false positives block legitimate technique descriptions | Medium | Medium | Conservative `HISTORICAL_FIGURES` set; technique-only phrases ("stream-of-consciousness style") pass. Appeal path via `docs/safety-exceptions.md` with maintainer sign-off. |
| Phase 20 warn-list providers lose users who don't want to acknowledge every session | Medium | Medium | Per-session ack is deliberate. Document that the warning is not permanently silencable. Users who object can use providers not on the warn list (Anthropic, Mistral, local models). |
| Phase 21 Docker dependency excludes users without Docker | Low | Low | Both tools are opt-in and degrade gracefully. `SuperLinterTool` falls back to built-in linters; `PresidioScanner` falls back to regex PIIScanner. No hard failures. |
| Phase 21 Presidio Docker image size (~1GB) slows first invocation | Medium | Low | Auto-pull on first use with progress indicator. Image presence check is cached per session. Document the one-time cost in README. |
| Phase 23 bidirectional MC ↔ wiki sync creates write conflicts | Medium | Medium | Last-write-wins on `updated_at` column. Document the conflict resolution policy. For high-conflict scenarios, add a manual `agentsy memory reconcile` CLI command. |
| Phase 23 `forkWithCacheSharing` increases memory per sub-agent | Medium | Medium | MC compartment snapshot is read-only in the child; reference-counted. AFT bridge is shared (not copied). Monitor memory in `DiagnosticsService` (Phase 18). |
| Active total buffer is only ~3 SP (down from ~13 SP) | High | Medium | The 4 new phases (20–23) consumed the buffer. Descope P3 items first (Phase 18 image/audio, Phase 22 if needed). Phase 20 is non-negotiable. If slippage exceeds 3 SP, extend timeline by 1 sprint. |
| Honker native extension unavailable on some platforms | Low | Medium | Fallback to `better-sqlite3` with polling-based queue (already implemented in Phase 1). |

---

## 31. Master Verification Checklist

This checklist combines the guardrails gap analysis verification items (43 findings), the v2.3 success criteria, and the competitive P0 closures. Organized by phase.

### Phase 0 — Critical Bug Fixes ✅
- [x] All 9 bug fixes landed on `develop`
- [x] `UniversalClient` true streaming
- [x] Tool calls preserved in conversation history
- [x] Hook short-circuit patched (full redesign in Phase 3)
- [x] Gateway cost filter unit mismatch fixed
- [x] Retry quota map per-provider
- [x] Daemon restart orphan server fixed
- [x] Tool-call ID dedup uses provider-assigned ID
- [x] Retry jitter added
- [x] Provider error classification uses HTTP status + specific regexes

### Phase 1 — Daemon Foundation ✅
- [x] `@agentsy/daemon` package exists
- [x] `UnifiedDB` consolidates memory.db + context.db + tokenomics.db into `~/.agentsy/agentsy.db`
- [x] `AgentPool` (Piscina) wired
- [x] `JobScheduler` (Bree on Honker) wired
- [x] `SQLiteWorker` offloads SQLite to worker thread
- [x] `SubprocessManager` with stall detection and memory limits
- [x] REST control API
- [x] IPC server (JSON-RPC 2.0 over Unix sockets, Zod-validated)
- [x] ACP server stub
- [x] `TerminalBridge`, `ServiceHost`, `AgentHost`, `ScopeManager`, `Supervisor`
- [x] `DaemonConfig` schema
- [x] CLI integration (`agentsy daemon start|stop|status|logs`)

### Phase 2 — Package Consolidation ✅
- [x] 27 → 25 packages
- [x] `workflows` → `orchestrator`
- [x] `types` → `shared`
- [x] `renderers` → `ui`
- [x] `scripts` → root
- [x] `mcp` → `daemon`
- [x] `connectors` → `daemon`
- [x] `@agentsy/vscode` preserved
- [x] `pnpm install && pnpm build && pnpm test` green

### Phase 3 — Hook Pipeline Redesign + Claude-Code Hook Schema ✅
- [x] `RuntimeHookRegistry.fire()` composes transforms left-to-right
- [x] `stop` short-circuits the pipeline and returns `stoppedBy`
- [x] Claude-Code hook schema parser handles command/prompt/http/agent types
- [x] `if` filter prevents unnecessary hook spawns
- [x] `failUnsettledTools` fires on stream error
- [x] All existing tests pass (no regressions)

### Phase 4 — Guardrails Honest Foundation ✅
- [x] `EthicsRegistry` exists; every clause has `implementedBy` or is marked as a known gap
- [x] `GuardrailDecisionReceipt` type exists with all 7 fields (`policyId`, `decision`, `reasonCode`, `riskTier`, `surface`, `timestamp`, `correlationId`)
- [x] `quarantine` and `allow-with-approval` are distinct states in `GuardrailResult`
- [x] `transformReason` distinguishes `redaction` | `rewrite` | `normalization`
- [x] `escalate` is differentiated from `block` in the runtime hook
- [x] `JsonlAuditLogger` persists receipts with PII/secret redaction
- [x] One canonical `GuardrailsConfig`; duplicate in `packages/shared` removed
- [x] README matches actual exports; Policy Enforcement Status table present
- [x] `IMPLEMENTATION-PLAN.md` checkboxes audited
- [x] `safety-changelog.md` exists with backfilled entries
- [x] PR template includes ethics review checklist

### Phase 5 — Gateway Daemon Hosting & Independent Package
- [ ] `@agentsy/gateway` package is independently consumable (no daemon dependency required)
- [ ] `createGateway()` factory works with in-memory defaults
- [ ] `PersistenceAdapter` interface defined; `InMemoryPersistenceAdapter` is the default
- [ ] `UnifiedDBPersistenceAdapter` saves/loads quota state, health history, routing decisions, circuit-breaker state
- [ ] `ProviderEthicsPolicyHook` interface defined; pluggable via `GatewayOptions.ethicsPolicy`
- [ ] Daemon's `RoutingService` instantiates `createGateway()` with `UnifiedDBPersistenceAdapter` + Phase 20 ethics policy
- [ ] Daemon's `RoutingService` does NOT reimplement routing logic (delegates to `Gateway`)
- [ ] `GatewayClient` IPC shim provides same interface as `Gateway` over IPC
- [ ] `connectToDaemon(socketPath)` convenience factory works
- [ ] External consumer example works as documented
- [ ] Gateway package README published with quick start, API reference, and extension points
- [ ] Per-provider `QuotaRegistry` persists to `UnifiedDB` when daemon-hosted; in-memory when standalone
- [ ] Routing decisions logged for audit when daemon-hosted
- [ ] Daemon restart preserves quota state

### Phase 6 — Streaming Architecture
- [ ] `StreamManager` runs as a `Service` in the daemon
- [ ] `wrapSSE` aborts on idle
- [ ] `StreamingSecretsFilter` masks secrets across chunk boundaries
- [ ] `failUnsettledTools` fires on stream error
- [ ] ACP `session/update` notifications emitted for all event types

### Phase 7 — RAG as Daemon Service
- [ ] `RetrievalService` runs as a `Service` in the daemon
- [ ] Background indexing job scheduled and runs
- [ ] Vector index persists in `UnifiedDB.rag_vectors`
- [ ] Wiki invariant enforced (only `kind: 'semantic'` items indexed)

### Phase 8 — Learning Loop & Background Jobs
- [ ] `LearningJob` runs as a Bree-scheduled job
- [ ] Event bus uses Honker NOTIFY/LISTEN for cross-process wake
- [ ] Canary and observation events trigger learning immediately

### Phase 9 — Guardrails Behavioral Detectors
- [ ] `SycophancyScanner` exists with 20+ fixtures
- [ ] `AnthropomorphismScanner` exists with 20+ fixtures
- [ ] `DependencyScanner` exists with multi-turn fixtures (requires `SessionState`)
- [ ] `HighRiskDomainScanner` exists with fixtures for all 8 domains
- [ ] `DarkPatternScanner` exists (output phase) with 20+ fixtures
- [ ] `PrivacyScanner` exists with memory-disclosure fixtures
- [ ] `AGIFramingScanner` exists with 20+ fixtures
- [ ] `ProfessionalDisplacementScanner` exists with 20+ fixtures
- [ ] `BiasScanner` exists (runtime portion) with 20+ fixtures
- [ ] All 9 scanners wired into the default pipeline
- [ ] `EthicsRegistry.implementedBy` fields updated for all 9 clauses

### Phase 10 — Guardrails Missing Surfaces & Interaction Safeguards (+ §15.7 Ingress Extension)
- [ ] `GuardrailPhase` includes `retrieval`, `memory`, `action`, `egress`
- [ ] `RetrievalFirewallScanner` exists (runs `PromptInjectionScanner` on retrieved content — closes E-35)
- [ ] `MemoryPoisoningScanner` exists
- [ ] `ActionScanner` exists
- [ ] `EgressScanner` exists
- [ ] `SessionState` threaded through the pipeline (`turnCount`, `reassuranceSeekingCount`, `emotionalIntensityScore`, `scopeDeclarations`, `lastScopeDriftTurn`, `crisisMode`, `sensitiveContextActive`)
- [ ] `InteractionSafeguardsScanner` exists
- [ ] `CrisisEscalationScanner` exists (with `crisisResources` in receipt)
- [ ] `ScopeDriftScanner` exists
- [ ] Runtime hooks exist for `PreRetrieval`, `PostRetrieval`, `PreMemoryWrite`, `PreAction`, `PreEgress`
- [ ] Hook context includes `conversationHistory`, `sessionState`, `agentScopeDeclaration`
- [ ] **§15.7: `IngressScanner` exists and scans response bodies for prompt injection**
- [ ] **§15.7: MCP stdio server responses scanned before reaching the agent**
- [ ] **§15.7: MCP HTTP/SSE server responses scanned**
- [ ] **§15.7: `http_fetch` tool responses scanned; oversized responses disk-spilled**
- [ ] **§15.7: `SubprocessSpec.networkPolicy` field honored (allow-all | allowlist | block-all | proxy-inspect)**
- [ ] **§15.7: `HTTP_PROXY` / `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` / `GIT_SSL_CAINFO` injected into subprocess env when `proxy-inspect` is set (plumbing for Phase 25)**

### Phase 11 — Scope Accountability, Request Classification & High-Risk Domains
- [ ] `ScopeDeclaration` type exists
- [ ] `ScopeDeclarationScanner` enforces it; agent YAML specs consumed
- [ ] `ScopeDriftScanner` (from Phase 10) consumes `agentScopeDeclaration`
- [ ] `RequestClassifier` produces `RequestClassification` consumed by policy selection
- [ ] `HighRiskDomainPolicy` table covers all 8 SAFETY.md domains
- [ ] Crisis resources included in self-harm and abuse policies
- [ ] CLI `agentsy agent show <name> --scope` works

### Phase 12 — Guardrails Daemon Integration
- [ ] `@agentsy/daemon` depends on `@agentsy/guardrails` and `@agentsy/runtime`
- [ ] `GuardrailPipeline` and `HookRegistry` instantiated in `Daemon.start()`
- [ ] All 18 scanners wired (7 security + 9 behavioral + 4 surface + 3 interaction + 2 scope/classification)
- [ ] IPC handlers `agent.spawn`, `process.spawn`, `stream.start` route through hooks
- [ ] `DaemonConfig.guardrails` config section works
- [ ] Audit receipts persisted to `UnifiedDB.guardrail_decisions`
- [ ] Integration test: malicious IPC blocked

### Phase 13 — Guardrails Metrics, Benchmark Suite, Release Gate + langeval Integration
- [ ] All 12 required safety metrics tracked and exported (via OpenTelemetry or local JSON)
- [ ] Benchmark suite exists with all 12 required scenarios (20–50 cases each)
- [ ] `agentsy guardrails benchmark` CLI command runs the suite and produces a report
- [ ] Benchmark runs in CI on every PR touching `packages/guardrails/`
- [ ] `release-gate` script exists and gates first-party agent template PRs
- [ ] Intersectional adequacy benchmark included
- [ ] Benchmark results published in release notes
- [ ] **§18.7: `agentsy eval run` invokes langeval orchestrator API**
- [ ] **§18.7: `agentsy eval scenarios` lists available langeval scenarios**
- [ ] **§18.7: `agentsy eval red-team` launches red-teaming campaign**
- [ ] **§18.7: `agentsy eval battle <a> <b>` runs A/B comparison via Battle Arena**
- [ ] **§18.7: CI workflow runs langeval evals on PRs touching guardrails/agent templates**
- [ ] **§18.7: Release-gate script calls langeval API for the 12 SAFETY.md scenarios**
- [ ] **§18.7: langeval Trace Debugger links appear in PR comments on failure**
- [ ] **§18.7: 12 SAFETY.md scenarios mapped to langeval scenario types**
- [ ] **§18.7: Docker Compose for langeval stack works (shared Langfuse with Phase 19)**
- [ ] **§18.7: Memory + perf regression baselines (`MemoryTestHarness`, `PerfTestHarness`)**

### Phase 14 — ACP Agent & Multi-Agent Deployment
- [ ] ACP server handles all 20 methods in the compatibility matrix
- [ ] Folder-based scope isolation works across concurrent sessions
- [ ] Steering + follow-up queues work (`QueueMode: "all" | "one-at-a-time"`)
- [ ] Rich tool type fields respected (`isReadOnly`, `isConcurrencySafe`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `shouldDefer`, `alwaysLoad`, `searchHint`)
- [ ] Disk-spilled tool results work
- [ ] Reflection loop fires on lint/test failure (max 3)
- [ ] Default agents (coder, researcher, planner) loadable from YAML

### Phase 15 — Project Auto-Detection & Bootstrap
- [ ] `@agentsy/bootstrap` package exists (26th package)
- [ ] Scanner detects languages, frameworks, package managers, build systems, linters, test runners
- [ ] `.agentsy/config.yml` schema is stable (`schemaVersion: 1`)
- [ ] All 4 registry adapters (ECC Tools, Skills.sh, MCP Registry, Guardrails Hub) fetch from authoritative sources
- [ ] Recommendation engine produces relevant recommendations
- [ ] `agentsy install <type> <id>` and `agentsy install --recommended` work
- [ ] `AGENTS.md`, `.agentsy/aft.{md,json}`, Magic Context compartments generated
- [ ] `BootstrapService` runs in the daemon
- [ ] Multi-root workspaces supported via `/add-project-folder`

### Phase 16 — Guardrails CLI, Hub & Polish
- [ ] `agentsy guardrails install` writes to persistent `.agentsy/guardrails.yaml`
- [ ] `agentsy guardrails policy <path>` validates and test-evaluates
- [ ] `agentsy guardrails test <policy-path> <input>` prints decision receipts
- [ ] `agentsy guardrails hub <hub-uri>` resolves `npm://` and `file://` URIs
- [ ] `scanUICopy` API exists; first-party UI packages scanned in CI
- [ ] Custom YAML parser replaced with `yaml` package + Zod validation
- [ ] `DEFAULT_POLICY` rule conditions reference real annotations
- [ ] `ToxicityScanner` `nazi` pattern false positives mitigated
- [ ] `SecretDetectionScanner` Vercel/Postmark/Snyk patterns tightened
- [ ] `PIIScanner` redaction placeholders consistent (`[REDACTED:<id>]`)
- [ ] `RateLimiterScanner` per-key-type defaults
- [ ] `EntropyScanner` threshold lowered to 3.5
- [ ] `docs/safety-exceptions.md` exists (states "none" if none)

### Phase 17 — Competitive Gap-Closing Sprint
- [ ] `RepoMap` (aider) builds and ranks symbols via PageRank
- [ ] 3 edit-format DSLs (aider): SEARCH/REPLACE with RelativeIndenter, udiff, whole-file
- [ ] `DirtyJson` tolerant parser (agent-zero) handles malformed LLM JSON
- [ ] `prepareNextTurn` / `shouldStopAfterTurn` hooks (pi)
- [ ] `convertToLlm` + `transformContext` two-stage (pi)
- [ ] Session tree fork/clone (pi)
- [ ] `GuardianScanner` LLM-as-judge with circuit breaker (codex)
- [ ] Event-sourced rollout + reducer (codex)
- [ ] WebSocket Responses API support (codex)
- [ ] `ContextEpoch` revision tracking (opencode)
- [ ] Structured Markdown compaction template (opencode)
- [ ] Persistent shell with cwd tracking (Claude-Code)
- [ ] Tool deny-rule filtering at registration (Claude-Code)
- [ ] Slash command argument substitution (Claude-Code)
- [ ] `pi-iso` isolation PAL trait with 8 backends (oh-my-pi)
- [ ] `pi-shell` output minimizer (oh-my-pi)
- [ ] `pi-ast` structural summaries (oh-my-pi)

### Phase 18 — Missing Capabilities
- [ ] `OutputValidator` validates and auto-repairs structured output
- [ ] `CheckpointManager` creates and restores checkpoints
- [ ] `SandboxService` sandboxes tool execution
- [ ] `CrossSessionMemory` aggregates across sessions
- [ ] `ResilienceService` circuit breaks and falls back gracefully
- [ ] `DiagnosticsService` exposes comprehensive health report
- [ ] Image support in prompts works
- [ ] ACP session persistence works across daemon restarts

### Phase 19 — Langfuse Observability Integration
- [ ] `detectLangfuseFromEnv` handles all env-var combinations (missing, partial, both, whitespace, empty, `LANGFUSE_HOST` path variants)
- [ ] `createLangfuseExporterFromEnv` returns `null` on missing vars, returns exporter on present vars, honors optional vars, validates integers, overrides take precedence
- [ ] `createObservabilityFromEnv` returns engine with disabled sink on empty env, enabled sink on present env, respects `langfuseEnabled: false`
- [ ] `loadDotenv` loads `.env`, prioritizes `.env.local`, does not override existing `process.env`, throws on malformed file, silent on missing file
- [ ] `DaemonConfig.observability` schema accepts all fields with correct defaults
- [ ] Daemon constructor calls `loadDotenv()` then `createObservabilityFromEnv()`
- [ ] Daemon `start()` logs each sink with enabled/disabled + reason
- [ ] Daemon `stop()` calls `observability.shutdown()` before `db.close()`
- [ ] `agentsy status` shows observability wiring
- [ ] Manual smoke: Langfuse dashboard receives traces
- [ ] Manual smoke: env vars absent → daemon logs "langfuse disabled" → daemon works normally
- [ ] Manual smoke: `observability.langfuse.enabled: false` → "disabled by config" log
- [ ] Manual smoke: malformed `.env` → warning logged, daemon continues
- [ ] Observability README rewritten with Langfuse integration docs, env-var table, quick start, redaction caveat
- [ ] `@agentsy/observability` added as dependency of `@agentsy/daemon`

### Phase 20 — Ethical Provider & Content Policy
- [ ] `PROVIDER_ETHICS_POLICY` contains 6 entries (xai block; openai/microsoft/google/amazon/meta warn)
- [ ] `isProviderBlocked('xai')` returns `true`; all others return `false`
- [ ] `requiresAcknowledgement('openai')` returns `true`; `requiresAcknowledgement('meta')` returns `true`; `requiresAcknowledgement('anthropic')` returns `false`
- [ ] xAI block rationale cites both content safety (CSAM, antisemitism, deepfakes) AND environmental racism (illegal gas turbines, 495 MW, NOx/formaldehyde, NAACP lawsuit)
- [ ] Meta warn rationale cites tent data centers (200 MW gas turbines) AND LibGen training-data theft
- [ ] `RoutingService.selectModel()` removes blocked providers before returning candidates
- [ ] `RoutingService.selectModel()` attaches `requiresAcknowledgement` to warn-listed providers
- [ ] Daemon IPC `stream.start` returns `acknowledgement-required` error when ack is missing
- [ ] Per-session warning can display cumulative environmental impact from Phase 30 ("You have used X for N requests, producing Y gCO2")
- [ ] `agentsy acknowledge-provider --provider openai` records ack in `UnifiedDB.session_meta`
- [ ] Acknowledgement is per-session — new session requires re-ack
- [ ] `StyleMimicryScanner` blocks "in the style of [living creator]" for writing, imagery, audio
- [ ] `StyleMimicryScanner` passes "in the style of Shakespeare" (historical)
- [ ] `StyleMimicryScanner` passes "in a stream-of-consciousness style" (technique, no name)
- [ ] `telegram.ts` deleted; no references remain in `packages/daemon` or `packages/cli`
- [ ] `safety-changelog.md` has Telegram removal entry with sources
- [ ] `ETHICS.md` §12–§16 added (§16: environmental racism as a block criterion); `EthicsRegistry` updated with `implementedBy` fields

### Phase 21 — Docker-Based Optional Tooling
- [ ] `DockerAvailabilityChecker` correctly detects Docker presence, daemon state, and resources
- [ ] `SuperLinterTool` returns graceful degradation when Docker is absent
- [ ] `SuperLinterTool` invokes `docker run` with correct args and parses output
- [ ] `PresidioScanner` returns `pass` when disabled
- [ ] `PresidioScanner` returns `pass` (graceful degradation) when Docker is absent
- [ ] `PresidioScanner` returns `transform` with redacted output when PII is detected
- [ ] `DaemonConfig.docker` schema has correct defaults (all disabled)
- [ ] Resource checks prevent invocation when memory/CPU insufficient

### Phase 22 — Web Fetcher HTML-to-Markdown
- [ ] `http_fetch` returns Markdown when content-type is `text/html`
- [ ] `http_fetch` returns raw body when content-type is not HTML
- [ ] `http_fetch` returns raw HTML when turndown conversion throws (graceful fallback)
- [ ] `bodyFormat` field correctly reports `markdown` | `html` | `<content-type>`

### Phase 23 — AFT, Magic Context & Task Board Integration Hardening
- [ ] `WikiManager.upsertPage({ writeBackToMagicContext: true })` writes to both wiki and MC `project_memories`
- [ ] Dreamer consumer syncs within 1s of MC epoch change (event-driven, not poll)
- [ ] `getAftBridgeOrNull()` returns `null` when AFT binary missing (no throw)
- [ ] Callers log a one-time warning and continue in degraded mode
- [ ] `Daemon.start()` starts AFT pool + opens MC database; `Daemon.stop()` shuts them down
- [ ] `todo_write` / `todo_read` / `todo_update` tools work and persist to `UnifiedDB.todos`
- [ ] Todos survive daemon restart
- [ ] `SqliteTaskBoard` persists tasks and attempts to `UnifiedDB`
- [ ] `task_list` / `task_claim` / `task_complete` tools work
- [ ] `AgentHost.forkWithCacheSharing()` creates a child agent that inherits parent's AFT bridge + MC compartment snapshot
- [ ] Sub-agent fork does not re-index the project (AFT session shared)
- [ ] `docs/developers/cortexkit-integration.md` updated

### Phase 24 — Teams & Remote Daemon Deployment (DEFERRED — verify when activated)
- [ ] `agentsy deploy init --topology local-docker` generates a working `docker-compose.local.yml`
- [ ] `agentsy deploy init --topology teams` generates `docker-compose.teams.yml` + `Caddyfile` + `.env.example`
- [ ] `docker compose up` starts the daemon in a container with a volume-mounted SQLite DB
- [ ] `agentsy login` initiates OAuth flow and returns a session JWT
- [ ] Session JWT validated on every IPC/ACP call
- [ ] Per-user spend tracked in `user_spend` table; spend limit enforced
- [ ] `agentsy team spend` / `agentsy team roi` produce correct reports
- [ ] Audit log records every prompt, tool call, guardrail decision, memory write, agent spawn, admin action
- [ ] Shared team memory: team members can read `team:<teamId>:folder:<hash>` scope
- [ ] Personal memory: `user:<userId>:personal` is not readable by other users or admins
- [ ] Turso Compose service syncs with daemon's `UnifiedDB`
- [ ] OAuth works with Okta, Google, Authentik, Auth0 (tested with at least 2)
- [ ] xAI block and style-mimicry block enforced in server mode (Phase 20 policy applies)

### Phase 25 — MITM Egress Proxy (DEFERRED — verify when activated)
- [ ] `agentsy proxy status` shows proxy running, CA present, port listening
- [ ] Subprocess with `proxy-inspect` policy routes HTTP through the proxy
- [ ] Subprocess with `proxy-inspect` policy routes HTTPS through the proxy (TLS interception works)
- [ ] Blocked request (xAI endpoint) returns 403 to subprocess; receipt persisted
- [ ] Blocked response (prompt injection in fetched page) returns 403 to subprocess; receipt persisted
- [ ] Style-mimicry prompt in subprocess HTTP request is blocked (Phase 20 policy enforced at network layer)
- [ ] Oversized response disk-spilled; subprocess receives preview + path
- [ ] WebSocket traffic intercepted (MCP server over WS)
- [ ] SSE traffic intercepted (MCP server over SSE)
- [ ] Per-language CA trust works (test with Node.js, Python, curl, git at minimum)
- [ ] `failOpen: true` — traffic passes when guardrail endpoint is down; daemon logs warning
- [ ] `failOpen: false` — traffic blocked when guardrail endpoint is down
- [ ] CA rotation works (new CA generated, proxy restarts, old subprocesses re-trust on next spawn)
- [ ] Subprocess identification via source-port lookup works
- [ ] Subprocess identification via `X-Agentsy-Subprocess` header works (opt-in)
- [ ] `DaemonConfig.proxy` schema accepts all fields with correct defaults

### Phase 26 — A2A Protocol Support (DEFERRED — verify when activated)
- [ ] A2A server endpoint accepts task creation, streaming, cancellation
- [ ] External A2A client (gemini-cli) can invoke an agentsy agent and receive streamed results
- [ ] `a2a_delegate` tool delegates to a remote A2A agent and returns the result
- [ ] A2A task attribution to user (spend tracking, audit logging) works in server mode
- [ ] A2A delegation respects guardrails (remote response scanned by `IngressScanner`)
- [ ] First call to a new A2A agent URL requires approval; subsequent calls auto-approved

### Phase 27 — Self-Improvement & Skill Curation (DEFERRED — verify when activated)
- [ ] Skill curator runs when daemon idle >2h and last run >7d
- [ ] Curator marks skills stale after 30 days, archives after 90 days, never deletes
- [ ] Post-turn review fires after every turn with inherited prefix cache
- [ ] Post-turn review respects tool whitelist (memory + skill management only)
- [ ] "Do NOT capture" list prevents transient errors from becoming persistent skills
- [ ] Skill AST audit blocks skills with critical findings (filesystem, network, eval, env, subprocess)
- [ ] Skill AST audit escalates skills with non-critical findings for review

### Phase 28 — Supply-Chain Security & Policy Attestation (DEFERRED — verify when activated)
- [ ] OSV malware scanner blocks `MAL-*` advisories on MCP/skill install
- [ ] OSV scanner fails open on timeout (10s)
- [ ] Policy attestation generates cryptographic hashes (policy, workspace, findings, attestation)
- [ ] `agentsy attestation generate` / `agentsy attestation verify` CLI commands work
- [ ] Conseca generates a per-prompt security policy from user intent + tools
- [ ] Conseca policy enforced per-tool-call (allowed/denied/ask_user)
- [ ] All `package.json` files use exact-pinned dependencies (no `^`, `~`, `>=`)
- [ ] `agentsy doctor --fix` detects, explains, backs up, and rewrites old config shapes
- [ ] JSON Schema for `DaemonConfig` and agent specs auto-generated and published

### Phase 29 — Package Boundary Cleanup & Composability
- [ ] `@agentsy/shared` contains all cross-package interface types (StreamChunk, Message, ToolDefinition, ModelEntry, GuardrailResult interface, MemoryProvider, SessionProvider, TokenTracker interface, ObservabilitySink, CostReporter, SecretResolver)
- [ ] `@agentsy/ui` depends only on `@agentsy/shared`
- [ ] `@agentsy/providers` depends only on `@agentsy/core` and `@agentsy/shared`
- [ ] `@agentsy/tokenomics` depends only on `@agentsy/shared`
- [ ] `@agentsy/retrieval` depends only on `@agentsy/shared`
- [ ] `@agentsy/memory` depends only on `@agentsy/shared`
- [ ] `@agentsy/secrets` depends only on `@agentsy/shared`
- [ ] `@agentsy/runtime` depends only on `@agentsy/shared`
- [ ] `@agentsy/gateway` depends only on `@agentsy/shared` (plus peerDeps for optional integrations)
- [ ] `@agentsy/agents` depends only on `@agentsy/shared`
- [ ] `@agentsy/orchestrator` depends only on `@agentsy/shared`
- [ ] `@agentsy/renderers` deprecated on npm (0.1.3 with deprecation notice)
- [ ] `@agentsy/types` deprecated on npm (0.1.2 re-exporting from shared)
- [ ] No monorepo package imports from `@agentsy/renderers` or `@agentsy/types`
- [ ] Each independently-publishable package can be `pnpm build` and `pnpm test` in isolation

### Phase 30 — Environmental Impact Tracking (CO2 + Water)
- [ ] 4 model energy tiers with estimates matching research
- [ ] 12+ carbon intensity entries for major cloud regions
- [ ] WUE entries for AWS, Azure, GCP, local, default
- [ ] `calculateEnvironmentalImpact()` works for cloud and local requests
- [ ] Cache-hit impact near-zero with savings
- [ ] Cumulative tracking per session/user/team/project
- [ ] `environmental_impact` table in `UnifiedDB`
- [ ] CLI `agentsy env impact` produces report
- [ ] CLI `agentsy env breakdown` and `agentsy env savings` work
- [ ] Per-session warning can display cumulative env impact
- [ ] Local measurement works on Linux; falls back gracefully elsewhere
- [ ] Real-time API (optional) works with Electricity Maps key
- [ ] Limitations documented in README

### Cross-Cutting
- [ ] `pnpm check-types` passes on all phases
- [ ] `pnpm lint` passes on all phases
- [ ] `pnpm test` passes on all phases (new tests added in each phase)
- [ ] `safety-changelog.md` updated for each phase
- [ ] Every clause in `EthicsRegistry` has a non-null `implementedBy` OR a documented exception in `docs/safety-exceptions.md`
- [ ] First-party agent templates pass `release-gate` in CI

---

## 32. Appendix A — 15-Competitor Pattern Atlas

Condensed reference: for each competitor, the top patterns agentsy should borrow and the target phase in this plan. Updated from 12 to 15 competitors (Batch 4 adds openclaw, hermes-agent, gemini-cli).

### A.1 `Aider-AI/aider` (Python, CLI)

| Pattern | What it does | Target phase |
|---|---|---|
| RepoMap | tree-sitter tag extraction + NetworkX graph + PageRank with personalization | Phase 17 §22.1 |
| Edit-format DSLs | 5 formats (SEARCH/REPLACE, udiff, whole-file, apply-patch, architect) | Phase 17 §22.1 |
| Reflection loop | `run_one` → `apply_updates` → `auto_commit` → `lint_edited` → `auto_test`; failed lints become `reflected_message` → re-enter loop (max 3) | Phase 14 §19.5 |
| Auto-commit with attribution | git auto-commit with `--author` flags | (Not in scope — agentsy treats git as user-driven) |
| Cache warming thread | Ping every 4.5 min to keep Anthropic cache alive | (Future enhancement) |
| `model-settings.yml` | Declarative per-model config (`editFormat`, `weakModel`, `useRepoMap`, `cacheControl`, `reasoningTag`) | (Future enhancement) |

### A.2 `agent0ai/agent-zero` (Python, Web UI)

| Pattern | What it does | Target phase |
|---|---|---|
| `@extensible` AOP decorator | Any function can be intercepted; filesystem-discovered extensions, priority-ordered, hot-reload | (Future — plugin system) |
| `DirtyJson` tolerant parser | Handles trailing commas, comments, broken brackets, streaming `feed()` | Phase 17 §22.2 |
| Streaming secret masking | Prefix-suffix matching across chunk boundaries | Phase 6 §11.4 |
| `_infection_check` LLM gate | Background LLM classifier blocks tool execution until verdict | (Subsumed by Phase 17 Guardian) |
| Time-travel (git shadow repo) | Snapshot workdir after every file mutation | (Future enhancement) |
| Chat branching | Trim history at any log message; preserve summarized topics | Phase 17 §22.3 (session tree) |

### A.3 `earendil-works/pi` (TypeScript, CLI + RPC)

| Pattern | What it does | Target phase |
|---|---|---|
| Steering + follow-up queues | `QueueMode: "all" \| "one-at-a-time"`; mid-turn steering injection | Phase 14 §19.5 |
| `prepareNextTurn` / `shouldStopAfterTurn` | Pre-turn context/model swap; graceful stop signal | Phase 17 §22.3 |
| `convertToLlm` + `transformContext` two-stage | Clean separation of context transformation from LLM filtering | Phase 17 §22.3 |
| Session tree (fork/clone) | Each entry has `parentId`; fork/clone navigation; branch summarization | Phase 17 §22.3 |
| Tool `terminate` hint + `details` field | Tool can signal "stop after this batch"; structured details for logs | (Future enhancement) |
| Extension API | `registerCommand`, `registerTool`, `registerAutocompleteProvider`, UI context | (Future — plugin system) |
| OAuth device code + PKCE | For Anthropic, Copilot, Codex | (Future enhancement) |
| Trust manager (per-project) | `/trust` command, persisted trust decisions | (Future enhancement) |

### A.4 `can1357/oh-my-pi` (Rust + TS + Python)

| Pattern | What it does | Target phase |
|---|---|---|
| `pi-iso` isolation PAL | Cross-platform COW isolation: 8 backends (APFS clonefile, btrfs, ZFS, overlayfs, Linux reflink, Windows block clone, ProjFS, Rcopy fallback) | Phase 17 §22.7 |
| `pi-ast` structural summaries | Tree-sitter-based code summarization for context compression | Phase 17 §22.7 |
| `pi-shell` minimizer | In-process Rust bash shell + minimizer with 20+ language filters | Phase 17 §22.7 |
| `mnemopi` memory backend | Beam store, vector index, entity graph, temporal recall, veracity consolidation | (Large — future research) |
| `hashline` structured editing | Grammar, parser, patcher, snapshots, recovery | (Large — future research) |
| `pi-natives` (N-API) | Clipboard, grep, glob, fd, sixel, highlight, HTML, PTY, ISO, AST in Rust | (3-6 month investment) |

### A.5 `CodebuffAI/codebuff` (TypeScript, SDK + cloud)

| Pattern | What it does | Target phase |
|---|---|---|
| `handleSteps` async generator | Programmatic pre-LLM tool calls | (Future enhancement) |
| Output schema retry | If agent has `outputSchema` and didn't call `set_output`, inject reminder and retry | (Future enhancement) |
| Propose/commit two-phase | `propose_write_file` + `write_file` | (Future enhancement) |
| `inheritParentSystemPrompt` | Subagents inherit parent's system prompt | (Future enhancement) |
| Bare-string tool input repair | Per-tool field allowlist for malformed inputs | (Future enhancement) |
| `code-map` (tree-sitter) | Code map for context | (Future enhancement) |

### A.6 `AntigmaLabs/ante-preview` (Rust, SDK + closed daemon)

| Pattern | What it does | Target phase |
|---|---|---|
| `HeadTailBuffer` | Preserves head and tail of output, drops middle with omission marker | (Subsumed by `pi-shell` minimizer in Phase 17) |
| `ProcessPool` with LRU eviction | Bounded pool, recent protection, prefer evicting exited processes | (Future enhancement) |
| Process group isolation | `set_parent_death_signal(SIGTERM)` + `setsid()` + `killpg` | (Future enhancement) |
| Prefixed ULID/UUIDv7 session IDs | Time-ordered, lexicographically sortable, prefix-tagged | (Future enhancement) |
| `TurnPause`/`TurnResume` + `ReviewDecision` enum | `Accept \| Skip \| AcceptForSession \| AcceptAlways \| Abort` | (Future enhancement) |

### A.7 `openai/codex` (Rust + Python + TS)

| Pattern | What it does | Target phase |
|---|---|---|
| Bubblewrap + seccomp sandbox | Two-stage Linux sandbox: bubblewrap first, then seccomp via `--apply-seccomp-then-exec` | (Future — Phase 18 SandboxService) |
| MITM network policy proxy | `BlockedRequestObserver` pattern for egress enforcement | (Future — Phase 10 EgressScanner) |
| `Guardian` LLM-as-judge | Auto-approve/deny `on-request` actions; circuit breaker (3 denials/turn → abort) | Phase 17 §22.4 |
| Event-sourced rollout + reducer | JSONL append-only + materialized views | Phase 17 §22.4 |
| WebSocket Responses API | Prewarm + sticky routing for lower TTFT | Phase 17 §22.4 |
| `keep_forked_rollout_item` fork predicate | system+user+final-assistant only, drop reasoning/tool/output | Phase 17 §22.4 |
| Multi-agent v2 | wait/interrupt/followup_task | (Future enhancement) |
| Tool argument diff consumer | Streaming partial args | (Future enhancement) |

### A.8 `QwenLM/Qwen3-Coder` (Python, model docs + eval)

Excluded from architecture comparison — this is a model release with eval harness, not a framework. No patterns to borrow.

### A.9–A.11 Claude-Code (3 variants treated as one)

| Pattern | What it does | Target phase |
|---|---|---|
| Hook schema | command/prompt/http/agent with `if` filter, `async`/`asyncRewake`/`once` flags | Phase 3 §8.4 |
| Rich tool type | `isReadOnly`, `isConcurrencySafe`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `shouldDefer`, `alwaysLoad`, `searchHint`, `backfillObservableInput` | Phase 14 §19.5 |
| Disk-spilled tool results | Persist to disk when > `maxResultSizeChars`, return preview | Phase 14 §19.5 |
| Cache-stable tool ordering | Built-ins as contiguous prefix for prompt cache stability | (Future enhancement) |
| Skills system | Markdown + frontmatter, 5 sources, `paths` scoping, `allowedTools`, `whenToUse` | Phase 15 (via Skills.sh adapter) |
| Subagent system | `.claude/agents/` markdown, built-in agents, fork-with-cache-sharing | Phase 14 (multi-agent) |
| Slash commands | 70+, 3 types (prompt/local/menu), `$ARGUMENTS`/`$1`/`$2` substitution | Phase 17 §22.6 |
| Auto-dream | Idle consolidation LLM call | (Future enhancement) |
| Auto-compact reactive | Compaction when context window approaches limit | (Future enhancement) |
| Persistent shell | CWD tracking, env accumulation | Phase 17 §22.6 |

### A.12 `anomalyco/opencode` (TypeScript, HTTP/SSE + TUI)

| Pattern | What it does | Target phase |
|---|---|---|
| Effect structured concurrency | `Stream.runForEach`, `FiberSet`, `TurnTransitionError` defects | (Architectural — agentsy uses async/await, not Effect) |
| `failUnsettledTools` | Publish failure for pending tool calls on stream error | Phase 3 §8.5 |
| `ContextEpoch` revision tracking | Abort+rebuild on mid-turn model switch | Phase 17 §22.5 |
| Structured Markdown compaction | 8 sections: Goal, Constraints, Progress, Decisions, Next Steps, Critical Context, Relevant Files | Phase 17 §22.5 |
| `promptCacheKey` per session | Trivially enables OpenAI prompt caching | (Future enhancement) |
| `wrapSSE` idle timeout | Per-read timeout that aborts on idle | Phase 6 §11.3 |
| Permission rulesets | `Rule[]` with `action`/`resource`/`effect: allow\|ask\|deny`, last-match-wins + wildcards | (Future enhancement) |
| Pre-configured agent profiles | build/plan/general/explore with pre-baked rulesets | Phase 14 (default agents) |
| Provider-as-plugin | Each provider is a 17-line plugin | (Future enhancement) |
| Durable steer/queue inbox | `SessionInput.promoteSteers`/`promoteNextQueued` | Phase 14 §19.5 (steering queues) |

### A.13 `openclaw/openclaw` (TypeScript, CLI + daemon + ACP) — NEW (Batch 4)

Claude-Code derivative with 130+ extensions, 7857 .ts files, and the most mature ACP implementation found in any competitor.

| Pattern | What it does | Target phase |
|---|---|---|
| **ACP event ledger (50+ files)** | SQLite-backed event ledger (maxSessions=200, maxEventsPerSession=5000, maxSerializedBytes=16MB) with 13 translator sub-modules (replay, session-lineage, cancel-scoping, permission-relay, tool-streaming, error-kind, final-snapshots, prompt-prefix, prompt-size, session-snapshot, set-session-mode, stop-reason, session-rate-limit) | **Phase 14 (expand scope — openclaw is the reference)** |
| **Policy attestation/evidence system** | `PolicyAttestation` (checkedAt, policy path+hash, workspace hash, findingsHash, attestationHash) + `PolicyEvidence` with 14 evidence types. Enterprise compliance posture attestation with cryptographic hashes. | **Phase 28 (new)** |
| QA Lab (~150 files) | scenario-catalog, scenario-flow-runner, scorecard-evidence, scorecard-taxonomy, self-check-runner, harness-parity, runtime-parity, agentic-parity-report, token-efficiency-report, tool-coverage-report | **Phase 13 (extend — agentic QA harness)** |
| Tool-call repair grammar | Handles Harmony/Kimi channel markers (`<\|channel\|>`, `<\|message\|>`, `<\|call\|>`), bracketed JSON (`[tool_name]\n{...}`), balanced brace counting. Beyond DirtyJson. | **Phase 17 (extend — model-specific formats)** |
| Doctor migration contract | `openclaw doctor --fix` detects old config shape, explains, backs up, rewrites to canonical format. Each extension exposes `doctor-contract-api.ts`. | **Phase 28 (config evolution)** |
| Memory host SDK with swappable backends | Three swappable backends (memory-core, memory-lancedb, memory-wiki) share a stable engine contract. | Phase 23 (extend — swappable memory backends) |
| Code plugins vs bundle-style plugins | Code plugins (runtime hooks, providers, tools) vs Bundle-style plugins (skills, MCP servers, config). "Prefer bundle-style." | Phase 17 (extend — dual plugin model) |
| Active-memory circuit breaker | Prevents memory runaway by circuit-breaking when memory operations exceed threshold. | Phase 23 (extend — memory circuit breaker) |

### A.14 `nousresearch/hermes-agent` (Python, CLI + ACP + gateway) — NEW (Batch 4)

2037 .py files. Standout: operational resilience, self-improvement, and supply-chain hardening patterns found in no other competitor.

| Pattern | What it does | Target phase |
|---|---|---|
| **Multi-credential pool with lifecycle** | `PooledCredential` with `last_status` (OK/EXHAUSTED/DEAD), rotation strategies (FILL_FIRST, ROUND_ROBIN, RANDOM, LEAST_USED), per-status TTL cooldowns (401→5min, 429→1h), OAuth terminal reason detection, provider-supplied `reset_at` timestamps. | **Phase 17 (extend — credential pool)** |
| **22-reason API error taxonomy** | `FailoverReason` enum with 22 reasons; `ClassifiedError` with `retryable/should_compress/should_rotate_credential/should_fallback` hints. billing vs rate_limit disambiguation, image dimension extraction, multimodal tool content patterns. | **Phase 17 (extend — error taxonomy)** |
| **Auxiliary LLM client router** | Side tasks (compression, session search, vision) route through a separate LLM client that never touches the main session's prompt cache. Auto-detection fallback chain. | **Phase 17 (extend — auxiliary client)** |
| **Three-state prompt cache restoration** | Distinguishes `missing` (legitimate first turn), `null` (legacy session), `empty` (silent persistence bug, always warns), `present` (reused). | Phase 17 (extend — cache bug detection) |
| **Background skill curator** | `maybe_run_curator()` forks agent when idle >2h AND last_run >7d. Auto-transitions skill lifecycle (stale_after_days=30, archive_after_days=90). Never auto-deletes. | **Phase 27 (new — self-improvement)** |
| **Post-turn background review** | `spawn_background_review()` fires after every turn; forks agent with inherited runtime (same prefix cache). Tool whitelist (memory + skill management only). "Do NOT capture" list prevents hardening transient errors. | **Phase 27 (new — self-improvement)** |
| **Skill AST audit** | AST-based skill audit (vs regex-only). Parses skill scripts to detect malicious patterns. | **Phase 27 (new — skill security)** |
| **Tiered threat patterns with scope-based filtering** | Patterns organized by ATTACK CLASS. Scope-based filtering: `"all"`, `"context"` (broader for memory/tool results), `"strict"` (aggressive for memory writes/skill installs). `INVISIBLE_CHARS` (zero-width, BOM, directional). C2 framework names. | **Phase 9 (extend — tiered threat patterns)** |
| **OSV malware check for MCP extensions** | Queries OSV API before launching MCP servers via npx/uvx; only blocks `MAL-*` advisories; fail-open; 10s timeout. | **Phase 28 (new — supply-chain security)** |
| **Deterministic tool-call loop guardrails** | `allow/warn/block/halt` based on exact_failure count (same tool + same args hash), same_tool_failure count, no_progress count. `ToolCallSignature` = sha256(canonical_sorted_json(args)). | **Phase 17 (extend — loop detection)** |
| **Automation blueprints** | `AutomationBlueprint` with `BlueprintSlot` types (time/enum/text/weekdays); single source of truth rendered per surface (Dashboard, CLI, Agent, Docs with `hermes://` deep-link). | Phase 24 (extend — teams automation) |
| **Six terminal backends with serverless hibernation** | local, Docker, SSH, Singularity (HPC), Modal (serverless, hibernates), Daytona (serverless, hibernates). `file_sync.py` between environments. | Phase 24 (extend — remote execution) |
| **Exact-pinned dependencies** | Every direct dep is `==X.Y.Z` (no ranges). CVE comments. Lazy-deps for opt-in extras. Supply-chain hardening. | **Phase 28 (new — supply-chain hardening)** |
| **Iteration budget with refund semantics** | Thread-safe consume/refund counter; parent cap=90, subagent cap=50; `execute_code` iterations refunded. | Phase 17 (extend — budget semantics) |
| **Per-model temperature contracts** | `OMIT_TEMPERATURE` sentinel for Kimi (server-side managed); thinking models get 1.0, non-thinking get 0.6. | Phase 17 (extend — per-model config) |

### A.15 `google-gemini/gemini-cli` (TypeScript, CLI + A2A server) — NEW (Batch 4)

130 .ts files. Standout: A2A protocol, behavioral evals, graph-based context, and Conseca (LLM-generated security policy).

| Pattern | What it does | Target phase |
|---|---|---|
| **A2A protocol (full server + client)** | `@a2a-js/sdk` with `TaskStore`, `AgentExecutor`, `AgentExecutionEvent`, `RequestContext`, `ExecutionEventBus`. `CoderAgentExecutor` with task lifecycle. GCS persistence. CLI acts as both A2A server AND invokes remote A2A agents as subagents. | **Phase 26 (new — A2A protocol)** |
| **Behavioral evals with probabilistic pass policies** | `ALWAYS_PASSES` (100%, blocks PRs), `USUALLY_PASSES` (nightly, flaky OK), `USUALLY_FAILS` (negative tests). Trustworthy filter (60% nightly, 80% aggregate over 6 days). 50% pass rule (2/4). Dynamic baseline verification. 7-day incubation before promotion. `LLMJudge` with selfConsistencyRuns (1/3/5) + majority vote. | **Phase 13 §18.7 (via langeval integration — langeval provides DeepEval metrics + G-Eval LLM-as-a-Judge + CI/CD gates)** |
| **Memory + perf regression baselines** | `MemoryTestHarness` (gcCycles, 10% tolerance, leak detection) + `PerfTestHarness` (warmupCount, 15% tolerance, idle CPU). `baselines.json` with `UPDATE_*_BASELINES` env var. | **Phase 13 (extend — regression baselines)** |
| **Conseca — LLM-generated per-prompt security policy** | LLM generates a security policy from user prompt + tool definitions, then enforces it per tool call. `decision: allow/deny/ask_user`. Fundamentally different from static rules. | **Phase 28 (new — dynamic security policy)** |
| **Graph-based context manager** | `ConcreteNode` graph with `PipelineOrchestrator` (sync + async pipelines, `pipelineMutex`, `waitForPipelines()` pressure barrier). Hot Start Calibration. `renderCache`. 8 processors (blobDegradation, historyTruncation, nodeDistillation with `replacesId` lineage, nodeTruncation, rollingSummary, stateSnapshot sync+async, toolMasking). | **Phase 23 (extend — graph-based context) or Phase 26** |
| **Tool output distillation** | Saves raw output to disk + generates intent summary via LLM if oversized (`MAX_DISTILLATION_SIZE=1M` chars) + structural truncation. Beyond HeadTailBuffer. | Phase 17 (extend — output distillation) |
| **11-event hook system with BeforeModel + syntheticResponse** | 11 events (BeforeTool, AfterTool, BeforeAgent, AfterAgent, SessionStart, SessionEnd, PreCompress, **BeforeModel** with `syntheticResponse`, AfterModel, BeforeToolSelection, Notification). `HookType.Command` vs `HookType.Runtime`. | **Phase 3 (extend — 11-event system)** |
| **Cross-platform sandbox** | `LinuxSandboxManager` (bubblewrap), `MacOsSandboxManager` (seatbelt/sandboxd), `WindowsSandboxManager` with **C# sandbox binary** (`GeminiSandbox.cs`). | **Phase 18 (extend — cross-platform sandbox) or Phase 25** |
| **LLM-based model routing classifier** | FLASH vs PRO classification with rubric; 4-turn cleaned history; JSON schema response. | Phase 17 (extend — LLM routing) or Phase 5 |
| **4618-line auto-generated JSON Schema** | Published JSON Schema for IDE autocompletion. Auto-generated from TypeScript types. Docs auto-generated. | **Phase 28 (new — JSON Schema publication)** |
| `config.toml` with 7 layers | defaults → managed → global → project → profile → CLI → env. `ConfigLayerStack` with `ConfigLayerSource` provenance. | (Future enhancement — config layering) |

---

## 33. Appendix B — 43 Guardrails Findings Cross-Reference Index

Quick-reference: finding ID → severity → title → phase that closes it → status.

| ID | Severity | Title | Closing Phase | Status |
|---|---|---|---|---|
| E-1 | CRITICAL | No code path loads/parses/references policy docs | Phase 4 | Pending |
| E-2 | CRITICAL | No `EthicalClause` type, no `EthicsRegistry` | Phase 4 | Pending |
| E-3 | HIGH | Policy decision lattice incomplete (no `quarantine`, no `allow-with-approval`) | Phase 4 | Pending |
| E-4 | HIGH | No decision receipt type | Phase 4 | Pending |
| E-5 | HIGH | No audit logger, no receipt exporter | Phase 4 | Pending |
| E-6 | CRITICAL | No sycophancy detector | Phase 9 | Pending |
| E-7 | CRITICAL | No anthropomorphism detector | Phase 9 | Pending |
| E-8 | CRITICAL | No dependency detector | Phase 9 | Pending |
| E-9 | CRITICAL | No advice-risk detector for high-risk domains | Phase 9 | Pending |
| E-10 | HIGH | No dark-pattern detector | Phase 9 | Pending |
| E-11 | HIGH | No privacy detector (unannounced memory/profiling) | Phase 9 | Pending |
| E-12 | HIGH | No AGI/longtermist framing detector | Phase 9 | Pending |
| E-13 | HIGH | No professional displacement detector | Phase 9 | Pending |
| E-14 | MEDIUM | No structural bias detector | Phase 9 (runtime) + Phase 13 (benchmark) | Pending |
| E-15 | CRITICAL | No request classifier (Layer 1) | Phase 11 | Pending |
| E-16 | HIGH | No interaction-level safeguards (Layer 5) | Phase 10 | Pending |
| E-17 | MEDIUM | No product-level safeguards (Layer 6) | Phase 16 | Pending |
| E-18 | HIGH | No audit and enforcement layer (Layer 8) | Phase 4 (E-4, E-5) | Pending |
| E-19 | CRITICAL | No scope declaration type, no scope enforcement | Phase 11 | Pending |
| E-20 | HIGH | Missing surfaces (`retrieval`, `memory`, `action`, `egress`) | Phase 10 | Pending |
| E-21 | CRITICAL | `@agentsy/daemon` has no guardrails integration | Phase 12 | Pending |
| E-22 | HIGH | `@agentsy/runtime` integration incomplete | Phase 4 (partial) + Phase 10 (full) | Pending |
| E-23 | MEDIUM | Three competing `GuardrailsConfig` types | Phase 4 | Pending |
| E-24 | MEDIUM | `@agentsy/cli` `guardrails` command is display-only | Phase 16 | Pending |
| E-25 | CRITICAL | None of the 12 required safety metrics tracked | Phase 13 | Pending |
| E-26 | CRITICAL | None of the 12 required benchmark scenarios exist | Phase 13 | Pending |
| E-27 | CRITICAL | None of the 9 release criteria items enforced | Phase 13 | Pending |
| E-28 | HIGH | No high-risk domain policy table | Phase 11 | Pending |
| E-29 | MEDIUM | Policy condition evaluator doesn't support nested paths | Phase 16 | Pending |
| E-30 | LOW | `DEFAULT_POLICY` references non-standard annotation | Phase 16 | Pending |
| E-31 | LOW | Custom YAML parser doesn't handle real YAML | Phase 16 | Pending |
| E-32 | MEDIUM | `ToxicityScanner` `nazi` pattern false positives | Phase 16 | Pending |
| E-33 | MEDIUM | `SecretDetectionScanner` false-positive patterns | Phase 16 | Pending |
| E-34 | LOW | `PIIScanner` redacts all PII to generic `[REDACTED]` | Phase 16 | Pending |
| E-35 | MEDIUM | `PromptInjectionScanner` doesn't detect indirect injection | Phase 10 | Pending |
| E-36 | LOW | `RateLimiterScanner` defaults too lax | Phase 16 | Pending |
| E-37 | LOW | `EntropyScanner` threshold may miss known formats | Phase 16 | Pending |
| E-38 | MEDIUM | `README.md` documents APIs that don't exist | Phase 4 | Pending |
| E-39 | MEDIUM | No documentation of which policy docs are enforced | Phase 4 | Pending |
| E-40 | LOW | `IMPLEMENTATION-PLAN.md` checkboxes all unchecked | Phase 4 | Pending |
| E-41 | MEDIUM | No `safety-changelog.md` file | Phase 4 | Pending |
| E-42 | MEDIUM | No ethics review checklist in PR template | Phase 4 | Pending |
| E-43 | LOW | No documented exceptions to ethics/safety rules | Phase 16 | Pending |

**Summary**: 43 findings — 12 CRITICAL, 14 HIGH, 13 MEDIUM, 7 LOW (one finding E-14 spans two severities). All 43 are closed by Phases 4, 9, 10, 11, 12, 13, and 16.

---

## 34. Appendix C — Package Consolidation Map (Before/After)

### Before (27 packages — pre-Phase 2)

```
agents/          (39)   ← Keep
cli/             (71)   ← Keep (becomes thin daemon client)
connectors/      (13)   ← Merge into daemon
core/            (95)   ← Keep
ecc-integration  (0)    ← Doesn't exist
gateway/         (68)   ← Keep (becomes thin daemon client)
guardrails/      (49)   ← Keep
mcp/             (11)   ← Merge into daemon
memory/          (260)  ← Keep
models/          (25)   ← Keep
observability/   (29)   ← Keep
plugins/         (43)   ← Keep
prompts/         (16)   ← Keep (small but distinct concern)
providers/       (68)   ← Keep
ui/              (15)   ← Keep (absorbs renderers)
retrieval/       (25)   ← Keep (Phase 7 moves logic into daemon, types stay)
runtime/         (89)   ← Keep
scripts/         (20)   ← Move to root tooling
secrets/         (58)   ← Keep
session/         (34)   ← Keep
types/           (27)   ← Merge into shared
testing/         (36)   ← Keep
tokenomics/      (84)   ← Keep
tools/           (22)   ← Keep
shared/          (10)   ← Keep (absorbs types)
renderers/       (120)  ← Merge into ui (renamed in codebase)
vscode/          (75)   ← Keep (published Copilot Chat integration library)
workflows/       (1)    ← Merge into orchestrator
```

### After (25 packages + root scripts — post-Phase 2)

```
agents/          ← Keep
cli/             ← Keep (thin daemon client)
core/            ← Keep
daemon/          ← NEW (Phase 1, absorbs mcp, connectors, acp, processes)
gateway/         ← Keep (thin daemon client — Phase 5)
guardrails/      ← Keep (expanded in Phases 4, 9, 10, 11, 12, 13, 16)
memory/          ← Keep
models/          ← Keep
observability/   ← Keep
plugins/         ← Keep
prompts/         ← Keep
providers/       ← Keep
ui/              ← Keep (absorbs renderers)
retrieval/       ← Keep (Phase 7 moves logic into daemon, types stay)
runtime/         ← Keep (Phase 3 redesigns hooks)
secrets/         ← Keep
session/         ← Keep
testing/         ← Keep
tokenomics/      ← Keep
tools/           ← Keep (Phase 14 enriches tool type)
shared/          ← Keep (absorbs types)
orchestrator/    ← Keep (absorbs workflows)
vscode/          ← Keep (published Copilot Chat integration library)
scripts/         ← Root-level tooling (not a package)
```

### Future (Phase 15 adds bootstrap)

```
bootstrap/       ← NEW (Phase 15) — project scanner, registry adapters, install flow, AGENTS.md / AFT generators
```

**Final package count after Phase 15**: 26 packages + root scripts.

**Note on `@agentsy/vscode` preservation**: The `@agentsy/vscode` package is preserved throughout. It is a published npm library (`@agentsy/vscode` on npm) consumed by third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat. ACP (agent–editor communication) and `@agentsy/vscode` (provider↔Copilot Chat integration) are complementary, not overlapping.

---

## 35. Appendix D — IPC Protocol Spec

### Socket Location

| Platform | Default Path |
|----------|-------------|
| macOS | `~/.agentsy/daemon.sock` |
| Linux | `~/.agentsy/daemon.sock` |
| Windows | `\\.\pipe\agentsy-daemon` |

### Message Format

Newline-delimited JSON-RPC 2.0:

```
Client:  {"jsonrpc":"2.0","id":"1","method":"agent.list","params":{}}\n
Server:  {"jsonrpc":"2.0","id":"1","result":[{"id":"coder-1","role":"coder","state":"idle"}]}\n
```

### Streaming Protocol

```
Client:  {"jsonrpc":"2.0","id":"2","method":"stream.start","params":{"agentId":"coder-1","messages":[...]}}
Server:  {"jsonrpc":"2.0","id":"2","result":{"streamId":"s-abc123"}}
Server:  {"jsonrpc":"2.0","method":"stream.chunk","params":{"streamId":"s-abc123","chunk":{"type":"content","text":"Hello"},"index":0}}
Server:  {"jsonrpc":"2.0","method":"stream.chunk","params":{"streamId":"s-abc123","chunk":{"type":"content","text":" world"},"index":1}}
Server:  {"jsonrpc":"2.0","method":"stream.end","params":{"streamId":"s-abc123","usage":{"inputTokens":42,"outputTokens":5},"totalChunks":2}}
```

### Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error (invalid JSON) |
| -32600 | Invalid request (missing required field) |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32001 | Agent not found |
| -32002 | Stream not found |
| -32003 | Routing failure (no model available) |
| -32004 | Budget exceeded |
| -32005 | Guardrail blocked |
| -32006 | Service sleeping (retry after wakeup) |
| -32007 | Process not found |
| -32008 | Process stalled |
| -32009 | ACP session not found |

### Authentication (Future — Server Mode)

For local mode, Unix socket permissions provide security (only the owning user can connect). For server mode:

```typescript
interface AuthToken {
  sub: string;          // User ID
  scope: string[];      // Allowed memory scopes
  agents: string[];     // Allowed agent IDs
  exp: number;          // Expiration timestamp
  iat: number;          // Issued at
}
```

---

## 36. Appendix E — ACP Protocol Mapping

### ACP Client → Agent Methods (Daemon Handles)

| ACP Method | Daemon Operation | Internal Component | Notes |
|------------|-----------------|-------------------|-------|
| `initialize` | Negotiate capabilities | `ACPServer` | Returns `AGENT_CAPABILITIES` |
| `authenticate` | Validate auth token | `ACPServer` | Local mode: always succeeds; Server mode: JWT validation |
| `logout` | Clean up client sessions | `ACPServer` | Closes all sessions for the client |
| `session/new` | Spawn agent with folder scope | `AgentHost.spawn()` + `ScopeManager.createScopeFromPath()` | Creates agent, derives scope from `cwd` |
| `session/prompt` | Execute agent turn with streaming | `AgentHost.streamMessages()` + `StreamManager.startStream()` | Streams response via `session/update` notifications |
| `session/load` | Load existing session | `SessionStore.load()` | Restores session state from SQLite |
| `session/list` | List active sessions | `ACPServer.activeSessions` | Returns all sessions for this client |
| `session/close` | Close session gracefully | `ACPSessionBridge.close()` | Agent stays alive but session is disconnected |
| `session/delete` | Delete session and agent | `ACPSessionBridge.close()` + `AgentHost.kill()` | Fully removes session and agent |
| `session/resume` | Resume a closed session | `ACPSessionBridge` reconnection | Re-creates bridge from persisted state |
| `session/cancel` (notification) | Cancel in-progress prompt | `ACPSessionBridge.cancel()` | Aborts the `AbortController` |
| `session/set_mode` | Change agent mode | `ACPSessionBridge.setMode()` | Modes: 'code', 'ask', 'plan' |
| `session/set_config_option` | Set session config | `ACPSessionBridge.setConfigOption()` | e.g., model tier, temperature |

### ACP Agent → Client Methods (Daemon Calls)

| ACP Method | Daemon Trigger | Internal Component | Notes |
|------------|---------------|-------------------|-------|
| `fs/readTextFile` | Agent needs to read a file | Tool execution (read_file) | Path must be within session `cwd` |
| `fs/writeTextFile` | Agent needs to write a file | Tool execution (write_file) | Path must be within session `cwd` |
| `requestPermission` | Agent wants to execute a restricted action | SandboxService | Auto-approve in local mode; prompt in server mode |
| `terminal/create` | Agent executes a command | `TerminalBridge.create()` + `SubprocessManager.spawnProcess()` | Each terminal = one subprocess |
| `terminal/output` | Agent reads command output | `TerminalBridge.getOutput()` | Returns accumulated stdout/stderr |
| `terminal/wait_for_exit` | Agent waits for command completion | `TerminalBridge.waitForExit()` | Blocks until subprocess exits or times out |
| `terminal/kill` | Agent kills a running command | `TerminalBridge.kill()` | SIGTERM + SIGKILL after 5s |
| `terminal/release` | Agent releases terminal | `TerminalBridge.release()` | Untracks the subprocess |
| `ext/*` | Extension methods | Extensible via plugins | Reserved for custom functionality |

### ACP Agent → Client Notifications (Daemon Sends)

| Notification | Daemon Event | SessionUpdate Type | Content |
|-------------|-------------|-------------------|---------|
| `session/update` | Stream chunk (content) | `agent_message_chunk` | `{ content: string }` |
| `session/update` | Stream chunk (thinking) | `agent_thought_chunk` | `{ content: string }` |
| `session/update` | User message chunk | `user_message_chunk` | `{ content: string }` |
| `session/update` | Tool call starts | `tool_call` | `{ toolCallId, toolName, arguments, status: "running" }` |
| `session/update` | Tool call completes/updates | `tool_call_update` | `{ toolCallId, status, output }` |
| `session/update` | Execution plan | `plan` | `{ entries: [{ content, priority, status }] }` |
| `session/update` | Token usage update | `usage_update` | `{ usage: { inputTokens, outputTokens, costUsd } }` |
| `session/update` | Session info changed | `session_info_update` | `{ info: Record<string, unknown> }` |
| `session/update` | Mode changed | `current_mode_update` | `{ mode: string }` |
| `session/update` | Commands available | `available_commands_update` | `{ commands: string[] }` |

### AgentCapabilities Advertisement

```typescript
export const AGENT_CAPABILITIES: AgentCapabilities = {
  loadSession: true,
  promptCapabilities: {
    image: false,         // Future: enable when vision models are wired (Phase 18)
    audio: false,         // Future: enable when ASR pipeline is added (Phase 18)
    embeddedContext: true, // We accept file paths, URLs as context
  },
  mcpCapabilities: {
    http: true,           // HTTP-based MCP servers
    sse: true,            // SSE-based MCP servers
  },
  sessionCapabilities: {
    close: true,
    list: true,
    delete: true,
    resume: true,
    additionalDirectories: true,
  },
};
```

### ACP → Daemon Scope Mapping

| ACP Concept | Daemon Concept | Mapping |
|-------------|---------------|---------|
| `session/new` `cwd` | Folder-based scope key | `ScopeManager.deriveScopeKey(cwd)` → `folder:[hash]` |
| `session/new` `additionalDirectories` | Cross-scope access | `ScopeManager.crossScopeRecall()` with derived keys |
| `session/new` `mcpServers` | Managed MCP subprocesses | `SubprocessManager.spawnProcess()` for each MCP server |
| `session/prompt` `embeddedContext` | Message context blocks | Added to messages before LLM call |
| `session` ID | Agent instance ID | 1:1 mapping — each session is one agent |
| `session/set_mode` | Agent mode | Configures tool access, model tier, and behavior |
| `terminal/create` | Subprocess | `SubprocessManager.spawnProcess()` with terminal spec |
| `fs/readTextFile` | File read with scope check | Verified against `cwd` boundary |

### ACP Transport Configuration

| Mode | Transport | How to Connect | Security |
|------|----------|----------------|----------|
| **CLI mode** | stdio | `agentsy acp` starts daemon with stdio ACP | Process owner only |
| **Daemon mode** | WebSocket | `ws://localhost:9380` | Localhost only (no remote) |
| **Server mode** (future) | WebSocket + TLS | `wss://agentsy.example.com/acp` | JWT authentication |

---

## 37. Final Assessment & Recommendations

### 37.1 Strategic Priorities

The strategic priority order, synthesized from all three source documents:

1. **Close the guardrails enforcement gap** (Phases 4, 9, 10, 11, 12, 13) — this is the highest-priority work because the current state — policy documents claiming enforceable commitments while the package implements a subset — is itself a safety failure. The `BLOCK` gates on Phase 4 and Phase 12 + 13 are non-negotiable.

2. **Close the agent-core gap** (Phases 3, 14, 17) — this is where daily agent quality is determined. The hook system (Phase 3), ACP agent with steering/reflection (Phase 14), and the competitive gap-closing sprint (Phase 17) are the highest-ROI changes for agent quality.

3. **Lean into agentsy's unique strengths** — governance, guardrails (once Phase 4 is done), gateway, tokenomics, secrets, daemon IPC. These are the differentiators that no competitor can match. Once Phases 4 and 9–13 land, agentsy will be the only framework with both best-in-class infrastructure AND enforceable ethical-safety commitments.

4. **Adopt proven patterns from competitors** rather than reinventing — Aider's RepoMap and edit formats (Phase 17), agent-zero's DirtyJson (Phase 17), pi's steering queues (Phase 14), codex's Guardian and rollout reducer (Phase 17), opencode's wrapSSE (Phase 6) and ContextEpoch (Phase 17), Claude-Code's hook schema (Phase 3) and rich tool type (Phase 14), oh-my-pi's pi-iso and minimizer (Phase 17). These are all battle-tested.

5. **Evaluate Rust natives long-term** — oh-my-pi's `pi-natives` and `pi-shell` patterns show the performance win from moving performance-critical paths (grep, glob, shell, AST) to Rust via N-API. This is a 3-6 month investment but pays off in daemon mode with many parallel agents. Not in this plan's scope.

### 37.2 Two Paths Forward for Guardrails

The guardrails gap analysis offered two paths. This plan chooses **implementation**:

1. **Honest path (Phase 4 only)**: Relabel the package as `@agentsy/security-scanners`, update the README to accurately describe what it does (input/output security scanning with regex-based detectors), and remove the claims in `SAFETY.md` and `GOVERNANCE.md` that the guardrails package enforces ethical-safety commitments. Update `ETHICS.md` to acknowledge that the ethical-safety commitments are aspirational and reviewed manually, not enforced in code.

2. **Implementation path (Phases 4 + 9–13 + 16)**: Execute the remediation plan. Bring the package into alignment with the policy documents. This is a substantial body of work — ~34 story points across 6 phases — but it's the only way to honestly claim that the framework's ethical commitments are "expressed in inspectable prompts, policies, middleware, tests, and release criteria" (`ETHICS.md` §9).

**This plan chooses path 2.** The architectural foundation is sound. The pipeline, the hub URI scheme, the discriminated-union result model, the priority ordering, the OWASP category mapping — all good. What's missing is the *content*: the actual scanners, surfaces, metrics, benchmarks, and integrations that the policy documents require. Adding them is a matter of focused implementation work, not redesign.

### 37.3 BLOCK Recommendations

Two non-negotiable BLOCK gates remain in force:

1. **BLOCK** the `@agentsy/guardrails` package from being described as the project's safety enforcement layer until **Phase 4** (Guardrails Honest Foundation) is complete. The package is currently a solid security-scanner toolkit. Calling it a "safety enforcement layer" before Phase 4 lands is dishonest.

2. **BLOCK** any first-party agent template from shipping until **Phase 12** (Guardrails Daemon Integration) is complete and the **Phase 13** release-gate script passes in CI. Until the daemon invokes the guardrails on every IPC handler, an agent running in the daemon bypasses every guardrail commitment in `SAFETY.md`.

### 37.4 The Worst-of-Both-Worlds State

The current state — where the policy documents claim enforceable commitments and the package implements a subset — is the worst of both worlds. It gives maintainers, contributors, and downstream users a false sense that ethical-safety commitments are enforced when they are not. This is itself a safety failure: it means incidents will be met with "but we had guardrails!" defenses that don't hold up under scrutiny.

Phase 4 closes this gap by making the honesty visible (EthicsRegistry, Policy Enforcement Status table) and Phase 12 closes it by making the enforcement real (daemon integration, audit receipts persisted to `UnifiedDB`).

### 37.5 What Agentsy Already Does Better Than All 15 Competitors

These strengths should be preserved and built upon (validated against all 15 competitors including the 3 new ones — openclaw, hermes-agent, gemini-cli):

1. **Guardrails pipeline** (breadth, not ethics-depth) — 7 security scanners in a priority-sorted, short-circuit pipeline. Phase 4 + 9 + 10 + 11 add the missing ethics-depth. Phase 28 adds Conseca (dynamic policy) on top.
2. **Gateway** — 7 routing strategies, replica scoring, health tracking, circuit breaker, quota enforcement. Phase 5 keeps it as an **independent reusable package** (`createGateway()` + `PersistenceAdapter` + `ProviderEthicsPolicyHook`) consumable by external platforms — agentsy's first published library for the broader agent ecosystem. hermes-agent has a gateway but without the routing strategy breadth or external-consumer API.
3. **Tokenomics** — prompt cache, semantic cache, ROI calculator, learning/pattern-recognizer, attribution, signals. No competitor has anything like this (hermes-agent has InsightsEngine but it's narrower).
4. **Secrets** — 12 provider backends (1Password, Bitwarden, Dashlane, LastPass, Apple PM, Vault, AWS SM, GCP SM, Azure KV, Doppler, Infisical, exec). Phase 17 extends with hermes-agent's credential pool lifecycle.
5. **Daemon IPC** — JSON-RPC over Unix sockets, ACP server, subprocess manager, connector host, agent pool, lifecycle supervisor. openclaw has a daemon but less mature IPC.
6. **Governance docs** — ETHICS.md, SAFETY.md, GOVERNANCE.md, docs/constitution.md. No competitor has equivalent governance frameworks (openclaw has VISION.md but it's thinner). Phase 4 makes these enforceable. Phase 20 adds ethical provider policy. Phase 28 adds compliance attestation.
7. **ACP architecture** — most standards-aligned (even though implementation is a stub). Phase 14 expands to match openclaw's 50-file reference.
8. **Council (three-stage review)** in orchestrator — unique multi-agent review pattern.
9. **Strict TypeScript + monorepo rigor** — 25 packages, strict TS (no `any`), ESM-first, tsup, Vitest, Biome. Phase 28 adds exact-pinned dependencies (from hermes-agent).
10. **Ethical provider policy** (Phase 20) — no competitor blocks xAI/Grok, warns on OpenAI/Microsoft/Google/Amazon, or blocks style-mimicry prompts. This is agentsy's unique ethical differentiator.

### 37.6 Call to Action

**Start with Phase 3 in Sprint 1.** It's the highest-leverage next step: it unblocks Phase 4 (guardrails foundation), Phase 14 (ACP agent), and Phase 17 (competitive sprint). Three engineers can run Phase 3, Phase 5, Phase 7, and Phase 19 in parallel from day one — Phase 19 (Langfuse) is a 6 SP quick win that delivers visible value within the first sprint.

**Phase 20 (Ethical Provider & Content Policy) is the moral centerpiece of this plan.** It is the third non-negotiable BLOCK gate. Agentsy will not route to xAI/Grok, will not ship a Telegram connector, and will block style-mimicry prompts that profit from theft of creators' work. The warnings on OpenAI/Microsoft/Google/Amazon ensure users make an informed choice. This phase must land by Sprint 3 — before any first-party agent template ships. If the timeline slips, Phase 20 is the last thing to descope (and descope it only by splitting the style-mimicry scanner into a follow-up, never the xAI block or Telegram removal).

**Phase 23 (AFT/MC/Task Board Hardening) closes the integration gaps** documented in §25. It delivers the todo-list tool, persisted task delegation, and sub-agent cache sharing that bring agentsy to parity with Claude-Code and opencode on agent-core ergonomics.

**Phases 24–28 are the post-v1 horizon.** All designs are complete (§38–§43, ~93 SP combined). Phase 24 delivers Teams & Remote Deployment (OAuth, per-user spend, audit logging, shared memory, Docker/Turso Compose). Phase 25 delivers a guardrail-aware MITM proxy for subprocess network interception. Phase 26 delivers A2A protocol support (from gemini-cli) — federated agents and cross-daemon delegation. Phase 27 delivers self-improvement (from hermes-agent) — background skill curator, post-turn review, AST-based skill audit. Phase 28 delivers supply-chain security & policy attestation (from openclaw/hermes-agent/gemini-cli) — OSV malware checks, Conseca dynamic policy, exact-pinned deps, doctor migration, JSON Schema publication. None start until v1 ships and stabilizes (§44 activation criteria). The v1 work (Phases 3–23) was designed with all five in mind: transport-agnostic IPC, folder-based scoping extensible to multi-tenant, session-attributed tokenomics, JWT-ready auth stubs, and — via the Phase 10 §15.7 extension — `SubprocessSpec.networkPolicy` plumbing that Phase 25's proxy will consume. §38.4 documents the seven "do not foreclose" constraints that v1 must respect to keep the deferred phases viable. The 3 new competitors from the expanded 15-competitor comparison (§32) drove Phases 26–28 — A2A from gemini-cli, self-improvement from hermes-agent, supply-chain/attestation from all three.

The plan is executable. The architecture is sound. The policy documents are clear. The ethical commitments are non-negotiable. The work is a matter of focused implementation, not redesign. Ship Phase 4, then Phase 9, then Phase 12, then Phase 20, and all three BLOCK gates lift. From there, the competitive sprint (Phase 17), missing capabilities (Phase 18), and integration hardening (Phase 23) close the remaining gaps with proven patterns from competitors and the project's own audit findings. After v1 stabilizes, Phases 24–28 open the Teams / remote-deployment / network-interception / A2A / self-improvement / supply-chain product line — the widest deferred horizon of any agent framework.

The result will be a framework that is honestly described, ethically enforced, architecturally clean, and competitive on agent quality — the only framework in the landscape that is all four.

---

## 38. Phase 24 — Teams & Remote Daemon Deployment (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Do not start until Phases 3–23 are complete and the v1 local-mode product has shipped and stabilized through at least one maintenance sprint.
**Story points**: ~40 (preliminary — will be decomposed into sub-phases when activated)
**Branch**: `feat/teams-remote-deployment` (not yet created)
**Depends on**: Phases 0–23 complete. Hard dependencies: Phase 1 (daemon), Phase 5 (gateway), Phase 6 (streaming), Phase 12 (guardrails daemon integration), Phase 13 (metrics/release gate), Phase 18 (resilience/diagnostics), Phase 20 (ethical provider policy — must be enforced in server mode too), Phase 23 (AFT/MC/task board — shared memory depends on this). Soft dependencies: Phase 14 (ACP — WebSocket transport already stubbed), Phase 19 (Langfuse — per-user attribution in server mode).
**Unblocks**: multi-user agentsy deployment, organizational spend governance, shared team memory
**Status**: DEFERRED — design complete, implementation not started

> **Why deferred**: Server mode is a different product. Local mode (Phases 3–23) must ship, stabilize, and prove the architecture before adding the attack surface, operational burden, and multi-tenant complexity of remote deployment. AD-8 explicitly states: "Server deployment is a future goal that should inform architectural decisions but not block v1." The decisions in Phases 1, 5, 6, 14, and 18 were made with server mode in mind (transport-agnostic IPC, folder-based scoping, JWT-ready auth stubs, WebSocket transport option) — Phase 24 activates those stubs. This section documents the full design so the v1 work doesn't accidentally foreclose any of these paths.

### 38.1 Goal

Transform agentsy from a single-user local daemon into a multi-user remote-deployable team platform with:

1. **Remote daemon deployment** — the daemon runs on a server (bare metal, VM, or Docker container), not just on the user's laptop.
2. **OAuth-based client authentication** — clients (CLI, TUI, ACP editors) authenticate via an external OAuth/OIDC provider (Okta, Google, Authentik, Auth0, etc.) rather than shared secrets or Unix socket permissions.
3. **Per-user spend tracking and ROI** — every LLM call, tool invocation, and background job is attributed to a user; spend limits and ROI dashboards are per-user and per-team.
4. **Audit logging** — every agent action (prompt, tool call, guardrail decision, memory write) is logged with user attribution for compliance and incident response.
5. **Shared team memory** — teams share a memory scope (project knowledge, wiki, RAG index) while individual sessions and personal memories remain private.
6. **Docker daemon deployment** — users can run the daemon in a Docker container instead of as a background process, with `docker compose` as the supported deployment path.
7. **Turso alongside Docker Compose** — a Turso (libSQL) instance runs as a compose service for cross-device sync and multi-user shared state, alongside the daemon container.

### 38.2 Design

#### 38.2.1 Deployment topologies

Phase 24 supports three deployment topologies. All three run the same daemon code; the difference is configuration.

**Topology A — Local background process (current v1 default)**
```
User's laptop
└── agentsy daemon (Node.js background process)
    └── ~/.agentsy/agentsy.db (SQLite, local file)
    └── ~/.agentsy/daemon.sock (Unix socket, local)
```
No auth (Unix socket permissions). Single user. This is what Phases 0–23 build. Phase 24 does not change it.

**Topology B — Local Docker container (new in Phase 24)**
```
User's laptop
└── docker compose up
    ├── agentsy-daemon container (Node.js)
    │   └── /data/agentsy.db (SQLite, volume mount)
    └── (optional) turso container (libSQL)
        └── /data/turso.db (volume mount)
```
Auth: still single-user (no OAuth needed) — the Docker container exposes a localhost port or Unix socket. The benefit is isolation (the daemon doesn't run as the user's PID) and reproducibility (compose file pins versions). Turso is optional here but useful if the user wants cross-device sync.

**Topology C — Remote server, multi-user (the Teams feature)**
```
Remote server (or cloud VM)
└── docker compose up
    ├── agentsy-daemon container (Node.js)
    │   └── /data/agentsy.db (SQLite, volume mount or persistent volume)
    ├── turso container (libSQL)
    │   └── /data/turso.db (shared memory + sync)
    ├── (optional) caddy/nginx container (TLS termination, OAuth proxy)
    └── (optional) langfuse container (self-hosted observability)

Clients (CLI, TUI, ACP editors) connect over WSS (wss://agentsy.example.com/acp)
and authenticate via OAuth/OIDC.
```

#### 38.2.2 OAuth/OIDC authentication

The daemon's IPC layer (Phase 1, §6) is transport-agnostic. Phase 24 adds a `WebSocketTransport` (already stubbed in AD-9) and an `OAuthAuthenticator` that validates OIDC ID tokens.

**Supported providers** (pluggable, configured via `DaemonConfig.auth.providers`):

| Provider | OIDC issuer URL | Notes |
|---|---|---|
| Okta | `https://<tenant>.okta.com/oauth2/default` | Enterprise SSO |
| Google | `https://accounts.google.com` | Workspace or consumer |
| Authentik | `https://<instance>/application/o/<slug>/` | Self-hosted, open-source |
| Auth0 | `https://<tenant>.<region>.auth0.com/` | |
| Generic OIDC | any | Any provider that speaks OIDC |

**Auth flow**:

1. Client (CLI/TUI) initiates `agentsy login`. The daemon's auth service generates a PKCE challenge and redirects the user to the OAuth provider's authorization endpoint.
2. User authenticates with the provider; provider redirects back to the daemon's callback URL with an authorization code.
3. Daemon exchanges the code for an ID token + access token. Validates the ID token signature against the provider's JWKS.
4. Daemon issues a **session JWT** (signed by the daemon's own key) containing: `sub` (user ID from provider), `email`, `groups` (for team membership), `exp` (1 hour), `iat`, `scope` (agents, memory scopes).
5. Client stores the session JWT and presents it on every IPC/ACP call via `Authorization: Bearer <jwt>`.
6. Daemon validates the session JWT on every call. Refresh happens transparently when the client sees a `401` and re-runs the flow.

**Token structure** (extends the stub from Appendix D §29):

```typescript
interface SessionJWT {
  sub: string;          // User ID (from OAuth provider's `sub` claim)
  email: string;
  name: string;
  groups: string[];     // Team membership (from provider's groups claim or directory sync)
  scope: string[];      // Allowed memory scopes, agent IDs
  exp: number;          // Expiration (1 hour)
  iat: number;          // Issued at
  iss: string;          // Daemon's issuer URL
  aud: string;          // Client ID
}
```

**Authorization model**:
- **Agents** are owned by a user. Other users can't see or interact with them unless explicitly shared.
- **Memory scopes** are either `user:<userId>` (private) or `team:<teamId>` (shared). The scope key format from AD-12 (`folder:[hash]`) is extended to `user:<userId>:folder:[hash]` and `team:<teamId>:folder:[hash]`.
- **Tool execution** requires the user to have the tool in their `scope` claim. Destructive tools require per-action approval (the `ApprovalManager` from Phase 4).
- **Admin actions** (daemon shutdown, user management, spend limit changes) require `groups` to include an admin group.

#### 38.2.3 Per-user spend tracking and ROI

The existing `@agentsy/tokenomics` package (cost cache, semantic cache, ROI calculator) is per-session in v1. Phase 24 extends it to per-user and per-team aggregation.

**New tables in `UnifiedDB`**:

```sql
-- Per-user spend ledger (extends tokenomics session_ledger)
CREATE TABLE user_spend (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT,                          -- NULL for personal spend
  session_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  recorded_at TEXT NOT NULL,             -- ISO 8601
  metadata_json TEXT                     -- agent_id, task_id, etc.
);
CREATE INDEX idx_user_spend_user_date ON user_spend(user_id, recorded_at);
CREATE INDEX idx_user_spend_team_date ON user_spend(team_id, recorded_at);

-- Spend limits (per-user and per-team)
CREATE TABLE spend_limits (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,                   -- 'user:<userId>' or 'team:<teamId>'
  daily_limit_usd REAL,
  monthly_limit_usd REAL,
  enforced BOOLEAN NOT NULL DEFAULT true,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL               -- admin user ID
);

-- ROI tracking (value delivered vs cost)
CREATE TABLE roi_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  team_id TEXT,
  session_id TEXT NOT NULL,
  task_description TEXT,                 -- what the user asked for
  cost_usd REAL NOT NULL,                -- total session cost
  time_saved_minutes REAL,              -- user-reported or heuristic
  estimated_value_usd REAL,             -- user-reported or heuristic
  outcome TEXT,                         -- 'completed' | 'partial' | 'failed' | 'abandoned'
  recorded_at TEXT NOT NULL
);
```

**Spend enforcement**: the `RoutingService` (Phase 5) checks `spend_limits` before each LLM call. If the user or team has exceeded their daily/monthly limit, the call is rejected with a `spend-limit-exceeded` error. The user sees their current spend and limit in the CLI prompt (`agentsy chat` shows `[user: $2.34/$10.00 daily]`).

**ROI dashboards**: `agentsy team spend --user <id> --period month` and `agentsy team roi --team <id> --period quarter` produce reports. The daemon exposes a REST API (`/api/v1/spend`, `/api/v1/roi`) for integration with external dashboards (Grafana, Metabase).

#### 38.2.4 Audit logging

Every agent action is logged with user attribution. Extends the `GuardrailDecisionReceipt` (Phase 4) and the daemon's existing logging.

**New table**:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,               -- ISO 8601
  user_id TEXT NOT NULL,
  team_id TEXT,
  session_id TEXT NOT NULL,
  action TEXT NOT NULL,                  -- 'prompt' | 'tool_call' | 'guardrail_decision' | 'memory_write' | 'agent_spawn' | 'admin'
  agent_id TEXT,
  tool_name TEXT,
  details_json TEXT,                     -- action-specific payload
  ip_address TEXT,                       -- client IP (server mode only)
  user_agent TEXT
);
CREATE INDEX idx_audit_user_date ON audit_log(user_id, timestamp);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp);
```

**Audit events**:
- Every prompt submitted (`action: 'prompt'`)
- Every tool call (`action: 'tool_call'`, `tool_name`, `details_json: { args, result_summary }`)
- Every guardrail decision (`action: 'guardrail_decision'`, `details_json: { receipt }`)
- Every memory write (`action: 'memory_write'`, `details_json: { scope, kind, content_hash }`)
- Every agent spawn (`action: 'agent_spawn'`, `details_json: { parent_agent_id, spec }`)
- Every admin action (`action: 'admin'`, `details_json: { command, target }`)

**Retention**: 90 days by default, configurable. Export to S3/external archive via a background job.

**Privacy**: audit logs are visible to the user themselves and to team admins. The daemon's `redactionPolicy` (Phase 4) applies to `details_json` before persistence — PII and secrets are scrubbed.

#### 38.2.5 Shared team memory

Memory scopes become multi-tenant. The `ScopeManager` (Phase 1, AD-12) is extended:

```typescript
// Extended scope key format
type ScopeKey =
  | `user:${userId}:folder:${hash}`      // Personal — only the user can read/write
  | `team:${teamId}:folder:${hash}`      // Shared — all team members can read, only members can write
  | `team:${teamId}:global`              // Team-wide knowledge (not folder-scoped)
  | `user:${userId}:personal`;           // User's personal notes (not project-scoped)
```

**Shared memory semantics**:
- **Team wiki**: a team's `WikiManager` (Phase 23) writes to `team:<teamId>:folder:<hash>`. All team members read from it. Writes are attributed to the user in the wiki page metadata.
- **Team RAG index**: the `RetrievalService` (Phase 7) indexes team-shared memories into a shared vector index. Personal memories are indexed separately and only retrieved for the owning user.
- **Personal memories**: `user:<userId>:personal` is private. Other users (including admins) cannot read it. This is enforced at the `MemoryEngine.recall()` layer, not just at the API layer.
- **Conflict resolution**: when two users write to the same team memory concurrently, the bidirectional sync (Phase 23 Gap 1) uses last-write-wins on `updated_at`, with a conflict log for review.

**Turso sync**: the existing `packages/memory/src/sync/` module (Turso sync engine, conflict resolution, backup manager) is activated in server mode. The Turso instance (compose service) is the primary sync target; each daemon instance (if running multiple for HA) syncs to it. For single-daemon deployments, Turso is optional but recommended for backup and cross-device access.

#### 38.2.6 Docker daemon deployment

**Dockerfile** (`docker/daemon.Dockerfile`):
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY packages/ ./packages/
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --filter @agentsy/daemon...
RUN pnpm --filter @agentsy/daemon build
EXPOSE 9380 9381
VOLUME ["/data"]
ENV AGENTSY_DATABASE_PATH=/data/agentsy.db
ENV AGENTSY_IPC_SOCKET_PATH=/data/daemon.sock
CMD ["node", "packages/daemon/dist/cli.js", "start"]
```

**Docker Compose — Topology B (local Docker)** (`docker-compose.local.yml`):
```yaml
services:
  agentsy:
    build:
      context: .
      dockerfile: docker/daemon.Dockerfile
    volumes:
      - agentsy-data:/data
      - ./projects:/workspace    # Mount project folders here
    ports:
      - "9380:9380"              # ACP WebSocket (localhost only)
    environment:
      - AGENTSY_AUTH_MODE=local  # No OAuth; localhost trusted
    restart: unless-stopped

  # Optional: Turso for cross-device sync
  turso:
    image: ghcr.io/tursodatabase/turso:latest
    volumes:
      - turso-data:/data
    environment:
      - TURSO_DB_PATH=/data/turso.db
    restart: unless-stopped

volumes:
  agentsy-data:
  turso-data:
```

**Docker Compose — Topology C (remote server, Teams)** (`docker-compose.teams.yml`):
```yaml
services:
  agentsy:
    build:
      context: .
      dockerfile: docker/daemon.Dockerfile
    volumes:
      - agentsy-data:/data
    ports:
      - "127.0.0.1:9380:9380"    # Behind Caddy, not directly exposed
    environment:
      - AGENTSY_AUTH_MODE=oauth
      - AGENTSY_OAUTH_PROVIDER=okta        # okta | google | authentik | auth0 | oidc
      - AGENTSY_OAUTH_ISSUER=${OAUTH_ISSUER}
      - AGENTSY_OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}
      - AGENTSY_OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}
      - AGENTSY_OAUTH_REDIRECT_URL=https://agentsy.example.com/callback
      - AGENTSY_TURSO_URL=turso:8080
      - AGENTSY_TURSO_TOKEN=${TURSO_TOKEN}
      - AGENTSY Langfuse vars (if using Langfuse)
    depends_on:
      - turso
    restart: unless-stopped

  turso:
    image: ghcr.io/tursodatabase/turso:latest
    volumes:
      - turso-data:/data
    environment:
      - TURSO_DB_PATH=/data/turso.db
      - TURSO_AUTH_TOKEN=${TURSO_TOKEN}
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - agentsy
    restart: unless-stopped

  # Optional: self-hosted Langfuse
  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://langfuse:langfuse@postgres:5432/langfuse
      - NEXTAUTH_SECRET=${LANGFUSE_NEXTAUTH_SECRET}
      - SALT=${LANGFUSE_SALT}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=langfuse
      - POSTGRES_USER=langfuse
      - POSTGRES_PASSWORD=langfuse
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  agentsy-data:
  turso-data:
  caddy-data:
  caddy-config:
  postgres-data:
```

**Caddyfile** (TLS termination + OAuth proxy):
```
agentsy.example.com {
    reverse_proxy agentsy:9380
    # Optional: Caddy can also handle OAuth at the proxy layer
    # via forward_auth, but the daemon's built-in OAuth is preferred
    # for finer-grained scope enforcement.
}
```

#### 38.2.7 DaemonConfig extensions

```typescript
// Add to DaemonConfigSchema
auth: z.object({
  mode: z.enum(['local', 'oauth']).default('local'),
  oauth: z.object({
    provider: z.enum(['okta', 'google', 'authentik', 'auth0', 'oidc']).optional(),
    issuer: z.string().url().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    redirectUrl: z.string().url().optional(),
    scopes: z.array(z.string()).default(['openid', 'email', 'profile', 'groups']),
    sessionTtlMinutes: z.number().int().positive().default(60),
  }).default({}),
  adminGroups: z.array(z.string()).default([]),     // Groups that can run admin commands
}).default({ mode: 'local' }),

teams: z.object({
  enabled: z.boolean().default(false),
  defaultTeamId: z.string().optional(),
  sharedMemoryScopes: z.array(z.string()).default([]),
}).default({ enabled: false }),

spend: z.object({
  trackingEnabled: z.boolean().default(true),
  enforcementEnabled: z.boolean().default(false),   // Start with tracking only
  defaultDailyLimitUsd: z.number().positive().optional(),
  defaultMonthlyLimitUsd: z.number().positive().optional(),
}).default({}),

audit: z.object({
  enabled: z.boolean().default(true),
  retentionDays: z.number().int().positive().default(90),
  exportToS3: z.object({
    bucket: z.string().optional(),
    prefix: z.string().optional(),
  }).optional(),
}).default({}),

turso: z.object({
  enabled: z.boolean().default(false),
  url: z.string().optional(),
  authToken: z.string().optional(),
  syncIntervalMs: z.number().int().positive().default(60_000),
}).default({}),
```

#### 38.2.8 CLI extensions

- `agentsy login` — initiate OAuth flow (server mode).
- `agentsy logout` — revoke session.
- `agentsy team spend [--user <id>] [--period day|week|month]` — view spend report.
- `agentsy team roi [--team <id>] [--period quarter]` — view ROI report.
- `agentsy team users` — list team members (admin).
- `agentsy team limits set --user <id> --daily <usd>` — set spend limit (admin).
- `agentsy audit query --user <id> --action tool_call --since 2026-06-01` — query audit log (admin).
- `agentsy deploy init --topology local-docker|teams` — generate docker-compose file + Caddyfile.
- `agentsy deploy up` / `agentsy deploy down` — wrap `docker compose up/down` with agentsy-specific checks.

### 38.3 Sub-phase decomposition (when activated)

When Phase 24 is activated (post-v1), decompose into:

| Sub-phase | Scope | SP |
|---|---|---|
| 24.1 | Docker daemon + local Docker Compose (Topology B) | 5 |
| 24.2 | OAuth/OIDC authentication + session JWT | 8 |
| 24.3 | Per-user spend tracking + enforcement | 5 |
| 24.4 | Audit logging + retention/export | 4 |
| 24.5 | Shared team memory + multi-tenant ScopeManager | 6 |
| 24.6 | Turso Compose integration + sync activation | 4 |
| 24.7 | Remote server Compose (Topology C) + Caddy + TLS | 4 |
| 24.8 | CLI extensions (login, team, audit, deploy) | 4 |
| | **Total** | **~40 SP** |

### 38.4 What v1 (Phases 3–23) must NOT foreclose

To keep Phase 24 viable, the v1 work must respect these constraints:

1. **IPC transport must stay transport-agnostic.** The `IPCServer` (Phase 1) must not hardcode Unix sockets. The `IPCTransport` abstraction (already in the design) must support a `WebSocketTransport` implementation in the future. **Status: respected — AD-9 specifies this.**

2. **ACP server must support WebSocket transport.** The `ACPServer` (Phase 14) must not be stdio-only. The `transport: 'stdio' | 'websocket'` config option must be honored. **Status: respected — Phase 14 config already has this.**

3. **Memory scopes must be extensible to multi-tenant.** The `ScopeManager` (Phase 1, AD-12) uses `folder:[hash]`. Phase 24 extends this to `user:<userId>:folder:[hash]` and `team:<teamId>:folder:[hash]`. The v1 code must not assume the scope key starts with `folder:`. **Status: respected — the scope key is an opaque string.**

4. **Tokenomics must attribute to a session, not a process.** The `session_ledger` (Phase 1) already has `session_id`. Phase 24 adds `user_id` and `team_id` columns. The v1 code must not assume a single user. **Status: respected — the ledger is session-scoped.**

5. **Guardrail receipts must be attributable.** The `GuardrailDecisionReceipt` (Phase 4) has `sessionId` and `correlationId`. Phase 24 adds `userId` to the receipt. **Status: respected — the receipt is session-scoped.**

6. **The daemon must not assume it's the only writer to `UnifiedDB`.** In a multi-daemon HA setup (future), two daemon instances might write to the same Turso-backed database. The v1 schema must use `updated_at` columns and avoid destructive updates where possible. **Status: respected — all tables have `updated_at`.**

7. **The ethical provider policy (Phase 20) must be enforced in server mode too.** A team admin cannot override the xAI block or the style-mimicry block for their team. These are framework-level commitments, not team preferences. The warn-list acknowledgement becomes per-user-per-session (each team member must acknowledge individually). **Status: respected — Phase 20's policy is enforced at the `RoutingService` layer, which is daemon-owned.**

### 38.5 Out of scope for Phase 24

- **High availability (multi-daemon)** — running multiple daemon instances behind a load balancer with shared state. Requires distributed locking (Honker's locks could work) and is a follow-up to Phase 24.
- **Marketplace / billing** — charging for agentsy as a service. Phase 24 tracks spend but does not integrate with Stripe or any payment processor.
- **SSO via SAML** — SAML is more complex than OIDC and most modern providers support OIDC. SAML support is a follow-up if enterprise customers demand it.
- **Granular RBAC** — Phase 24 uses group-based authorization (admin group vs. regular users). Fine-grained role-based access (e.g. "can use `run_command` but not `delete_file`") is a follow-up.
- **Per-agent sandboxing in server mode** — the sandbox (Phase 18) runs in the daemon's context. True per-user filesystem isolation in server mode requires container-per-user or namespace isolation, which is a follow-up.

### 38.6 Verification (when activated)

- [ ] `agentsy deploy init --topology local-docker` generates a working `docker-compose.local.yml`
- [ ] `agentsy deploy init --topology teams` generates `docker-compose.teams.yml` + `Caddyfile` + `.env.example`
- [ ] `docker compose up` starts the daemon in a container with a volume-mounted SQLite DB
- [ ] `agentsy login` initiates OAuth flow and returns a session JWT
- [ ] Session JWT validated on every IPC/ACP call
- [ ] Session JWT expires after `sessionTtlMinutes` and client re-authenticates
- [ ] Per-user spend tracked in `user_spend` table
- [ ] Spend limit enforced — call rejected when limit exceeded
- [ ] `agentsy team spend --user <id> --period month` produces correct report
- [ ] `agentsy team roi --team <id> --period quarter` produces correct report
- [ ] Audit log records every prompt, tool call, guardrail decision, memory write, agent spawn, admin action
- [ ] Audit log redacts PII/secrets before persistence
- [ ] `agentsy audit query` returns filtered results (admin only)
- [ ] Shared team memory: team members can read `team:<teamId>:folder:<hash>` scope
- [ ] Personal memory: `user:<userId>:personal` is not readable by other users or admins
- [ ] Turso Compose service syncs with daemon's `UnifiedDB`
- [ ] Conflict resolution (last-write-wins) logged for review
- [ ] OAuth works with Okta, Google, Authentik, Auth0 (tested with at least 2)
- [ ] xAI block and style-mimicry block enforced in server mode (Phase 20 policy applies)
- [ ] Warn-list acknowledgement is per-user-per-session (each team member acknowledges individually)
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 38.7 Risk register (Phase 24 specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OAuth provider changes API or JWKS endpoint | Medium | High | Cache JWKS with TTL; fall back to previous keys for a grace period. Pin provider SDK versions. |
| Multi-tenant memory leak (user A sees user B's data) | Low | Critical | Enforce scope at `MemoryEngine.recall()` layer, not just API layer. Integration test: user A cannot read user B's personal scope. Pen-test before launch. |
| Spend tracking drift (recorded cost ≠ provider invoice) | Medium | Medium | Reconcile daily against provider APIs (OpenAI usage endpoint, etc.). Log discrepancies. |
| Audit log grows unbounded | High | Low | 90-day retention default; background job archives to S3. Configurable retention. |
| Docker image missing native deps (Honker extension, better-sqlite3) | Medium | High | Multi-stage build with platform-specific native deps. Test on linux/amd64 and linux/arm64. Fallback to pure-JS Honker. |
| Turso sync conflicts corrupt shared memory | Medium | High | Conflict resolution log (Phase 23). `agentsy memory reconcile` CLI command. Backup before sync. |
| Server-mode daemon has different behavior than local-mode | Medium | Medium | Same code path, different config. Integration test matrix: local-socket, local-docker, remote-oauth. |
| Admin abuse (admin reads user's personal memory) | Medium | High | Personal memory (`user:<userId>:personal`) is encrypted at rest with a user-derived key. Admins can delete but not read. Document this clearly. |

---

## 39. Phase 25 — MITM Egress Proxy for Subprocess Network Interception (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Ships alongside or shortly after Phase 24 (Teams). Can run in local mode (Topology A/B) but is most valuable in server mode (Topology C) where untrusted subprocesses run on shared infrastructure.
**Story points**: ~12 (preliminary)
**Branch**: `feat/mitm-egress-proxy` (not yet created)
**Depends on**: Phase 10 §15.7 extension (`SubprocessSpec.networkPolicy` plumbing + `IngressScanner`), Phase 12 (guardrails daemon integration — the proxy runs the guardrail pipeline), Phase 21 (Docker tooling — `mitmproxy` runs as a Docker container), Phase 24.1 (local Docker Compose — the proxy is a compose service). Soft dependency: Phase 20 (ethical policy — the proxy enforces provider blocks at the network layer too).
**Unblocks**: real-time inspection of arbitrary subprocess network traffic, blocking of jailbreaks in fetched content, per-subprocess network policy enforcement
**Status**: DEFERRED — design complete, implementation not started

> **Why deferred**: Phase 10 §15.7 closes the highest-risk ingress paths (MCP servers, `http_fetch`) by scanning at the daemon-controlled transport layer. Phase 25 extends coverage to arbitrary subprocesses (build runners, `curl` in shell commands, linters fetching rules) that make their own network connections. This is valuable but not blocking for v1 — most agent workflows use the daemon-controlled tools. Phase 25 becomes critical in server mode (Phase 24) where untrusted subprocesses run on shared infrastructure.

### 39.1 Goal

Run a guardrail-aware MITM (man-in-the-middle) HTTP/HTTPS proxy as a daemon service. Every subprocess with `networkPolicy.mode === 'proxy-inspect'` (set via the Phase 10 §15.7.5 plumbing) routes its HTTP/HTTPS traffic through the proxy. The proxy:

1. **Intercepts every request and response in real time** — including HTTPS, via a daemon-local CA installed into subprocess trust stores.
2. **Runs the guardrail pipeline on every request** — `EgressScanner` (URL allowlist, PII/secret scan on outbound payload), `StyleMimicryScanner` (Phase 20 — block style-mimicry prompts even in subprocess traffic), provider-ethics checks (block xAI endpoints even if a subprocess tries to call them directly).
3. **Runs the guardrail pipeline on every response** — `IngressScanner` (Phase 10 §15.7.2 — prompt-injection detection on response bodies), `PromptInjectionScanner`, disk-spill for oversized responses.
4. **Enforces per-subprocess network policy** — allowlist, blocklist, domain restrictions, size limits.
5. **Emits `GuardrailDecisionReceipt`s** for every blocked or transformed request/response, persisted to `UnifiedDB.guardrail_decisions` for audit.
6. **Handles WebSocket and SSE** — not just plain HTTP, since MCP servers increasingly use these transports.

### 39.2 Design

#### 40.2.1 Implementation choice: `mitmproxy` in Docker

Rather than building a custom Node.js proxy (which would need to handle CONNECT tunneling, HTTPS decryption, WebSocket interception, and certificate generation — easily 2000+ lines), Phase 25 uses [`mitmproxy`](https://mitmproxy.org/) running in a Docker container with an agentsy addon script.

**Why mitmproxy**:
- Mature, battle-tested, handles HTTPS/WebSocket/SOCKS5 out of the box
- Scriptable via Python addons — the agentsy addon calls the daemon's guardrail pipeline over a local IPC channel
- Runs in Docker (reuses Phase 21's `DockerAvailabilityChecker` and resource-awareness patterns)
- Active maintenance, known security posture
- Handles the tricky parts (CA generation, certificate per-domain signing, CONNECT tunneling) for free

**Why not a custom Node.js proxy**:
- HTTPS interception requires a per-connection TLS context with a dynamically-signed certificate — Node.js can do this but it's ~500 lines of fiddly `tls.createSecureContext` code
- WebSocket interception requires upgrading the connection and parsing frames bidirectionally — another ~300 lines
- CA management (generation, trust-store installation, rotation) is another ~200 lines
- Total: ~1000+ lines of security-critical code that mitmproxy already provides and tests

**The agentsy mitmproxy addon** (~200 lines of Python):

```python
# docker/mitm-addon/agentsy_intercept.py

import json
import urllib.request
from mitmproxy import http, ctx

AGENTSY_GUARDRAIL_ENDPOINT = "http://127.0.0.1:9381/guardrail/scan"  # daemon's local REST endpoint

def request(flow: http.HTTPFlow) -> None:
    """Inspect outbound request before it's sent."""
    policy = get_subprocess_policy(flow.client_conn.peername)
    if policy is None:
        return  # Not a proxied subprocess

    scan_request = {
        "direction": "egress",
        "subprocessId": policy["subprocessId"],
        "url": flow.request.pretty_url,
        "method": flow.request.method,
        "headers": dict(flow.request.headers),
        "body": flow.request.get_text() or "",
        "policy": policy,
    }

    result = call_guardrail(scan_request)
    if result["status"] == "block":
        flow.response = http.Response.make(
            403, json.dumps({"error": result["reason"]}), {"Content-Type": "application/json"}
        )
        ctx.log.warn(f"Blocked egress to {flow.request.pretty_url}: {result['reason']}")
    elif result["status"] == "transform":
        flow.request.set_text(result["sanitized"])

def response(flow: http.HTTPFlow) -> None:
    """Inspect response body before it's returned to the subprocess."""
    policy = get_subprocess_policy(flow.client_conn.peername)
    if policy is None or not policy.get("inspectResponses", True):
        return

    body = flow.response.get_text() or ""
    scan_request = {
        "direction": "ingress",
        "subprocessId": policy["subprocessId"],
        "url": flow.request.pretty_url,
        "contentType": flow.response.headers.get("content-type", ""),
        "body": body,
        "bodySizeBytes": len(body.encode()),
        "policy": policy,
    }

    result = call_guardrail(scan_request)
    if result["status"] == "block":
        flow.response = http.Response.make(
            403, json.dumps({"error": result["reason"]}), {"Content-Type": "application/json"}
        )
        ctx.log.warn(f"Blocked ingress from {flow.request.pretty_url}: {result['reason']}")
    elif result["status"] == "transform":
        flow.response.set_text(result["sanitized"])

def call_guardrail(payload: dict) -> dict:
    """Call the daemon's guardrail scan endpoint."""
    try:
        req = urllib.request.Request(
            AGENTSY_GUARDRAIL_ENDPOINT,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        ctx.log.error(f"Guardrail endpoint unavailable: {e}")
        # Fail-open (return pass) — a downed guardrail service should not
        # block all subprocess network access. The daemon logs the failure.
        return {"status": "pass"}

def get_subprocess_policy(peer_ip: str) -> dict | None:
    """Look up the network policy for the subprocess making this request.

    The daemon maintains a registry of subprocessId → networkPolicy.
    The proxy identifies the subprocess by the client connection's peer IP.
    For local proxy (single daemon), all subprocesses share 127.0.0.1,
    so identification is by port range (each subprocess gets a unique
    ephemeral port range) or by an X-Agentsy-Subprocess header injected
    at the env layer.

    Simplest: the daemon's guardrail endpoint resolves subprocessId from
    the source port (which it knows because it spawned the subprocess).
    """
    # Query the daemon for the policy based on source port
    # (the daemon tracks subprocessId → pid → source port range)
    pass
```

#### 40.2.2 Daemon-side guardrail scan endpoint

The daemon exposes a local REST endpoint (port 9381, localhost only) that the mitmproxy addon calls:

```typescript
// packages/daemon/src/api/guardrail-scan.ts (NEW)

export function registerGuardrailScanEndpoint(server: HttpServer, pipeline: GuardrailPipeline) {
  server.post('/guardrail/scan', async (req, res) => {
    const payload = await parseBody(req);

    // Resolve subprocess policy from source port or X-Agentsy-Subprocess header
    const subprocessId = resolveSubprocessId(req);
    const policy = getNetworkPolicy(subprocessId);

    // Run the appropriate scanner
    const input: IngressScanInput | EgressScanInput = payload.direction === 'ingress'
      ? { sourceUrl: payload.url, sourceType: 'subprocess-stdout', body: payload.body, bodySizeBytes: payload.bodySizeBytes }
      : { url: payload.url, method: payload.method, body: payload.body, headers: payload.headers };

    const result = await pipeline.evaluate(input, {
      phase: 'egress',
      sessionId: getSessionId(subprocessId),
      networkPolicy: policy,
    });

    // Persist receipt (Phase 4)
    await auditLogger.log(result.receipt);

    res.json(result.result);
  });
}
```

#### 40.2.3 CA generation and trust-store installation

At daemon first-run (or when Phase 25 is enabled), the daemon generates a local CA:

```typescript
// packages/daemon/src/services/ca-manager.ts (NEW)

export class CAAuthority {
  private caPath = path.join(os.homedir(), '.agentsy', 'ca');
  private certPath = path.join(this.caPath, 'agentsy-ca.pem');
  private keyPath = path.join(this.caPath, 'agentsy-ca-key.pem');

  async ensureExists(): Promise<void> {
    if (existsSync(this.certPath) && existsSync(this.keyPath)) return;
    await this.generate();
  }

  private async generate(): Promise<void> {
    // Generate a self-signed CA certificate (RSA 4096, 10-year validity)
    // Using node-forge or node:crypto's X509Certificate API (Node 19+)
    mkdirSync(this.caPath, { recursive: true, mode: 0o700 });
    // ... generate CA cert + key, write to disk with restrictive permissions ...
  }

  getCertPath(): string { return this.certPath; }

  async rotate(): Promise<void> {
    // Generate a new CA; the proxy picks it up on restart.
    // Old CA remains trusted until subprocesses are restarted.
  }
}
```

The mitmproxy container mounts `~/.agentsy/ca/` and uses the CA to sign per-domain certificates on the fly. The `SubprocessManager` (Phase 10 §15.7.5) injects the CA path into subprocess env vars (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`, `GIT_SSL_CAINFO`).

**Per-language trust handling**:

| Subprocess type | Env var injected | Notes |
|---|---|---|
| Node.js (`node`, `npx`) | `NODE_EXTRA_CA_CERTS` | Works for `fetch`, `https`, `axios` |
| Python (`python`, `pip`) | `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE` | Works for `requests`, `urllib3`, `httpx` |
| curl / wget | `SSL_CERT_FILE`, `CURL_CA_BUNDLE` | |
| git | `GIT_SSL_CAINFO` | |
| Go binaries | `SSL_CERT_FILE` | Go respects this since 1.15 |
| Java | `javax.net.ssl.trustStore` | Requires a JKS-format truststore; convert the PEM with `keytool` |
| System tools (apt, yum) | System CA store | Requires `sudo` install to `/usr/local/share/ca-certificates/`; document as a manual step |

The `SubprocessManager.spawnChild()` detects the subprocess type from `spec.command` and injects the appropriate env vars. Apps that don't respect any env var (certificate pinning, hardcoded trust stores) are documented as uninterceptable.

#### 40.2.4 Docker Compose integration

Add the proxy as a compose service. Extends Phase 21's Docker tooling and Phase 24's compose files.

```yaml
# docker-compose.local.yml (Topology B with proxy enabled)
services:
  agentsy:
    # ... existing config ...
    environment:
      - AGENTSY_PROXY_ENABLED=true
      - AGENTSY_PROXY_PORT=8899
    volumes:
      - agentsy-ca:/home/agentsy/.agentsy/ca  # Shared CA between daemon and proxy
    depends_on:
      - mitm-proxy

  mitm-proxy:
    image: mitmproxy/mitmproxy:latest
    command: mitmdump --listen-host 0.0.0.0 --listen-port 8899 -s /addon/agentsy_intercept.py
    ports:
      - "127.0.0.1:8899:8899"  # Localhost only
    volumes:
      - ./docker/mitm-addon:/addon:ro
      - agentsy-ca:/home/mitmproxy/.mitmproxy  # mitmproxy's CA storage
    environment:
      - AGENTSY_DAEMON_HOST=agentsy
      - AGENTSY_DAEMON_PORT=9381
    restart: unless-stopped

volumes:
  agentsy-data:
  agentsy-ca:  # Shared CA volume
```

#### 40.2.5 DaemonConfig extension

```typescript
// Add to DaemonConfigSchema
proxy: z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['docker', 'native']).default('docker'),  // 'native' = custom Node.js proxy (future)
  port: z.number().int().positive().default(8899),
  dockerImage: z.string().default('mitmproxy/mitmproxy:latest'),
  caPath: z.string().default(path.join(os.homedir(), '.agentsy', 'ca')),
  // Per-subprocess defaults
  defaultNetworkPolicy: z.enum(['allow-all', 'allowlist', 'block-all', 'proxy-inspect']).default('block-all'),
  mcpNetworkPolicy: z.enum(['allow-all', 'allowlist', 'block-all', 'proxy-inspect']).default('proxy-inspect'),
  inspectResponses: z.boolean().default(true),
  maxResponseSizeBytes: z.number().int().positive().default(100_000),
  // Fail-open behavior if guardrail endpoint is down
  failOpen: z.boolean().default(true),  // true = allow traffic if guardrail is down; false = block
}).default({})
```

#### 40.2.6 Subprocess identification

The proxy needs to know which subprocess made each request, to apply the right policy. Two mechanisms:

1. **Source-port lookup** (default): the daemon tracks `subprocessId → pid → ephemeral source port range`. When the proxy receives a request, it queries the daemon's guardrail endpoint with the source port; the daemon resolves it to a subprocessId and returns the policy. Works for local proxy where all subprocesses share `127.0.0.1`.

2. **`X-Agentsy-Subprocess` header** (opt-in): the daemon injects a unique token per subprocess via an env var (`AGENTSY_SUBPROCESS_TOKEN`). Well-behaved HTTP clients include this header; the proxy reads it directly. More reliable but requires subprocess cooperation (most tools don't inject custom headers).

The daemon's guardrail endpoint supports both: it first checks for the header, then falls back to source-port lookup.

### 39.3 What Phase 25 covers (and doesn't)

**Covers**:
- All HTTP/HTTPS requests from subprocesses that respect `HTTP_PROXY`/`HTTPS_PROXY` env vars (curl, wget, npm, pip, requests, axios, fetch, httpx, etc.)
- WebSocket and SSE traffic (mitmproxy handles these)
- Per-subprocess policy enforcement (allowlist, blocklist, inspect, disk-spill)
- Real-time blocking of jailbreaks in response bodies
- Real-time blocking of xAI endpoints and style-mimicry prompts in subprocess traffic
- Audit receipts for every blocked/transformed request

**Does NOT cover** (documented limitations):
- **Raw TCP sockets** — apps that open direct TCP connections (not via HTTP) bypass the proxy. Mitigation: Phase 25 logs a warning when a subprocess with `proxy-inspect` policy opens a non-HTTP connection (via OS-level socket monitoring, if available). Full coverage requires Layer 3 (network namespace) isolation, which is out of scope.
- **Certificate-pinning apps** — apps that hardcode their trusted CAs and ignore env vars (notably some mobile-app backends, some enterprise tools) will reject the MITM CA. No fix short of patching the app.
- **Apps that explicitly disable proxy** — some apps (e.g. `curl --noproxy '*'`) bypass the proxy. The `SubprocessManager` can strip `--noproxy` from args for `proxy-inspect` subprocesses, but this is fragile.
- **System-level tools requiring root** — `apt`, `yum`, `dnf` need the CA installed system-wide (`/usr/local/share/ca-certificates/`), which requires `sudo`. Document as a one-time setup step; the daemon prints instructions.
- **Java apps** — require a JKS-format truststore, not PEM. The daemon converts via `keytool` if Java is detected; otherwise document the manual step.

### 39.4 Sub-phase decomposition (when activated)

| Sub-phase | Scope | SP |
|---|---|---|
| 25.1 | CA generation + per-language trust-store env injection (extends Phase 10 §15.7.5 plumbing) | 2 |
| 25.2 | `mitmproxy` Docker container + agentsy addon script | 3 |
| 25.3 | Daemon guardrail-scan REST endpoint (port 9381) | 2 |
| 25.4 | Subprocess identification (source-port lookup + header fallback) | 2 |
| 25.5 | Docker Compose integration (local + teams topologies) | 1 |
| 25.6 | `DaemonConfig.proxy` schema + CLI (`agentsy proxy status`, `agentsy proxy logs`) | 1 |
| 25.7 | Tests: HTTP, HTTPS, WebSocket, blocked request, blocked response, fail-open, CA rotation | 1 |
| | **Total** | **~12 SP** |

### 39.5 Verification (when activated)

- [ ] `agentsy proxy status` shows proxy running, CA present, port listening
- [ ] Subprocess with `proxy-inspect` policy routes HTTP through the proxy (verified via `mitmproxy` logs)
- [ ] Subprocess with `proxy-inspect` policy routes HTTPS through the proxy (TLS interception works)
- [ ] Blocked request (xAI endpoint) returns 403 to subprocess; receipt persisted
- [ ] Blocked response (prompt injection in fetched page) returns 403 to subprocess; receipt persisted
- [ ] Style-mimicry prompt in subprocess HTTP request is blocked (Phase 20 policy enforced at network layer)
- [ ] Oversized response disk-spilled; subprocess receives preview + path
- [ ] WebSocket traffic intercepted (MCP server over WS)
- [ ] SSE traffic intercepted (MCP server over SSE)
- [ ] Per-language CA trust works (test with Node.js, Python, curl, git at minimum)
- [ ] `failOpen: true` — traffic passes when guardrail endpoint is down; daemon logs warning
- [ ] `failOpen: false` — traffic blocked when guardrail endpoint is down
- [ ] CA rotation works (new CA generated, proxy restarts, old subprocesses re-trust on next spawn)
- [ ] Subprocess identification via source-port lookup works
- [ ] Subprocess identification via `X-Agentsy-Subprocess` header works (opt-in)
- [ ] `DaemonConfig.proxy` schema accepts all fields with correct defaults
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 39.6 Risk register (Phase 25 specific)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MITM CA compromised | Low | Critical | CA stored at `~/.agentsy/ca/` with `0o600` permissions. CA never leaves the host. Rotation supported. Document that the CA is a security-sensitive artifact. |
| Proxy adds unacceptable latency to high-frequency subprocess calls (npm install) | Medium | Medium | Per-subprocess `mode: 'allowlist'` bypasses body scanning for trusted domains (npm registry). Document the trade-off. |
| Subprocess ignores env vars (certificate pinning) | Medium | Medium | Documented limitation. The daemon logs which subprocesses aren't interceptable. Phase 25 doesn't promise 100% coverage. |
| Guardrail endpoint down → all subprocess network blocked (if `failOpen: false`) | Medium | High | Default `failOpen: true`. Document the trade-off. Server-mode deployments with strict security requirements can set `failOpen: false`. |
| mitmproxy container consumes significant memory | Low | Low | Resource limits in compose. `DockerAvailabilityChecker` (Phase 21) verifies resources before starting. |
| WebSocket/SSE interception breaks MCP servers that expect unmodified frames | Low | Medium | mitmproxy passes frames through unmodified unless a scanner returns `block`. Test with real MCP servers. |
| CA not trusted by Java apps (JKS format mismatch) | Medium | Low | Daemon detects Java subprocesses and converts PEM → JKS via `keytool`. Document manual step if `keytool` is unavailable. |

### 39.7 Relationship to codex and the competitive landscape

codex (§A.7 of Appendix A) implements this same pattern (MITM network policy proxy with `BlockedRequestObserver`) but goes further with Layer 3 isolation (bubblewrap + seccomp + Landlock on Linux, seatbelt on macOS, AppContainer on Windows). Phase 25 matches codex's Layer 2 (MITM proxy) but does not attempt Layer 3 — that's a larger investment that's only justified if agentsy targets high-sensitivity deployments (e.g. regulated industries, government). For most teams, Layers 1 (Phase 10 §15.7) + 2 (Phase 25) provide strong protection without the complexity.

oh-my-pi's `pi-iso` (Phase 17 §22.7) provides filesystem isolation (8 backends) but not network isolation. A future phase could add a network-isolation PAL trait (`pi-net`) analogous to `pi-iso`, but this is research-grade and not planned.

---

## 45. Phase 29 — Package Boundary Cleanup & Composability

**Priority**: P0 — Sprint 1–2 (can run in parallel with Phase 5; must complete before any new packages are published)
**Story points**: 8
**Branch**: `refactor/package-boundary-cleanup`
**Depends on**: Phase 2 ✅ (consolidation complete), Phase 4 ✅ (guardrails foundation — EthicsRegistry, GuardrailDecisionReceipt types are part of the shared interface contracts)
**Unblocks**: clean npm publication of `@agentsy/gateway`, `@agentsy/guardrails`, `@agentsy/observability`, `@agentsy/retrieval`, `@agentsy/memory`, `@agentsy/tokenomics`, `@agentsy/models`, `@agentsy/tools`, `@agentsy/prompts`, `@agentsy/secrets`, `@agentsy/agents`, `@agentsy/runtime`, `@agentsy/orchestrator`
**Closes**: the cross-dependency problem that prevents independent consumption of agentsy packages

### 45.1 The Problem

agentsy was designed as a composable framework where each package can be used independently by third-party consumers. In practice, 12 packages have hard `@agentsy/*` dependencies that make independent consumption impossible without pulling in the entire monorepo:

**Current cross-dependency graph (problematic edges marked)**:

```
@agentsy/shared (base layer — zero deps ✅)
├── @agentsy/core → shared ✅
├── @agentsy/guardrails → shared ✅
├── @agentsy/models → shared ✅
├── @agentsy/observability → shared ✅
├── @agentsy/session → shared ✅
├── @agentsy/plugins → shared ✅
├── @agentsy/prompts → shared ✅
├── @agentsy/tools → shared ✅
│
├── @agentsy/ui → core, models, shared ❌ (should be shared only)
├── @agentsy/providers → core, tokenomics, shared ❌ (should be core + shared only)
├── @agentsy/tokenomics → core, observability, shared ❌ (should be shared only)
├── @agentsy/retrieval → core, shared ❌ (should be shared only)
├── @agentsy/memory → shared, tokenomics ❌ (should be shared only)
├── @agentsy/secrets → runtime, shared ❌ (should be shared only)
├── @agentsy/runtime → guardrails, memory, session, tokenomics, shared ❌ (should be shared only)
├── @agentsy/gateway → core, guardrails, models, observability, providers, secrets, tokenomics, shared ❌ (should be shared + optional injection only)
├── @agentsy/agents → core, runtime, shared ❌ (should be shared only)
└── @agentsy/orchestrator → core, gateway, memory, observability, runtime, shared ❌ (should be shared only)
```

**Composition roots (correct to have many deps)**:
- `@agentsy/daemon` → memory, observability, shared ✅ (composition root — will gain more deps as it hosts more services)
- `@agentsy/cli` → many ✅ (composition root — thin client that wires everything)
- `@agentsy/testing` → many ✅ (test utility)
- `@agentsy/vscode` → core, providers, ui, shared ✅ (composition surface)

### 45.2 Target Architecture: Dependency Injection + Peer Dependencies

The fix is not to remove the functionality that crosses package boundaries, but to invert the dependency direction. Packages that currently import other `@agentsy/*` packages at runtime should instead:

1. **Define interfaces in `@agentsy/shared`** — any type that crosses a package boundary (e.g. `MemoryProvider`, `GuardrailPipeline`, `TokenTracker`, `ObservabilitySink`) must be defined as an interface in `shared`, not in the implementing package.
2. **Accept dependencies via constructor injection** — instead of importing `@agentsy/tokenomics` at the top of `@agentsy/memory`, the memory package accepts a `TokenTracker?` (optional) in its constructor options.
3. **Use `peerDependencies` + `optionalDependencies`** — when a package *can* use another package but doesn't *require* it, declare it as a peer/optional dep, not a hard dep. Example: `@agentsy/gateway` *can* use `@agentsy/guardrails` for ethics filtering, but should work without it.
4. **Never import implementation from another package** — only import types/interfaces from `@agentsy/shared`.

### 45.3 Package-by-package fixes

#### 45.3.1 `@agentsy/ui` — remove `core` and `models` deps

**Current**: imports from `@agentsy/core` (stream types) and `@agentsy/models` (model metadata for display).
**Fix**: Move the stream-display types and model-display types to `@agentsy/shared`. UI package becomes `@agentsy/ui → @agentsy/shared` only.

#### 45.3.2 `@agentsy/providers` — remove `tokenomics` dep

**Current**: imports `@agentsy/tokenomics` for cost tracking during provider calls.
**Fix**: Define a `CostReporter` interface in `@agentsy/shared`. Providers accept an optional `CostReporter?` in their constructor. The daemon injects the real `TokenTracker` (from tokenomics) at composition time. `@agentsy/providers → @agentsy/core, @agentsy/shared` only.

#### 45.3.3 `@agentsy/tokenomics` — remove `core` and `observability` deps

**Current**: imports `@agentsy/core` (stream chunk types for token counting) and `@agentsy/observability` (for metric reporting).
**Fix**: Define `StreamChunk` (or the minimal token-counting subset) in `@agentsy/shared`. Define a `MetricsSink` interface in `@agentsy/shared`. Tokenomics accepts an optional `MetricsSink?`. `@agentsy/tokenomics → @agentsy/shared` only.

#### 45.3.4 `@agentsy/retrieval` — remove `core` dep

**Current**: imports `@agentsy/core` for stream/structured types.
**Fix**: The retrieval package should only depend on `@agentsy/shared`. Move any shared types it needs from `core` to `shared`. `@agentsy/retrieval → @agentsy/shared` only. **This package must remain independently consumable by third-party apps** — it's a RAG retrieval library, not an agentsy-internal module.

#### 45.3.5 `@agentsy/memory` — remove `tokenomics` dep

**Current**: imports `@agentsy/tokenomics` for budget tracking during memory operations.
**Fix**: Define a `BudgetProvider` interface in `@agentsy/shared`. Memory accepts an optional `BudgetProvider?`. The daemon injects the real `TokenTracker` at composition time. `@agentsy/memory → @agentsy/shared` only.

#### 45.3.6 `@agentsy/secrets` — remove `runtime` dep

**Current**: imports `@agentsy/runtime` for... (needs investigation — likely tool execution context or session context).
**Fix**: Define the minimal interface secrets needs in `@agentsy/shared`. Accept it via constructor injection. `@agentsy/secrets → @agentsy/shared` only.

#### 45.3.7 `@agentsy/runtime` — remove `guardrails`, `memory`, `session`, `tokenomics` deps

**Current**: imports 4 other packages — this is the worst offender. The runtime directly imports `GuardrailPipeline`, `MemoryEngine`, `SessionStore`, and `TokenTracker`.
**Fix**: Define `GuardrailPipelineInterface`, `MemoryProvider`, `SessionProvider`, `BudgetProvider` interfaces in `@agentsy/shared`. Runtime accepts all four as optional constructor injections. The daemon wires the real implementations. `@agentsy/runtime → @agentsy/shared` only.

This is the biggest change — the runtime becomes a pure execution engine that doesn't know about guardrails, memory, sessions, or tokenomics until the daemon injects them.

#### 45.3.8 `@agentsy/gateway` — remove `core`, `guardrails`, `models`, `observability`, `providers`, `secrets`, `tokenomics` deps

**Current**: imports 7 other packages. This contradicts the Phase 5 goal of an independently consumable gateway.
**Fix**: The gateway already has the `ProviderEthicsPolicyHook` and `PersistenceAdapter` interfaces (Phase 5 design). Extend the same pattern:
- `ModelRegistry` accepts `ModelEntry[]` (plain data — no `@agentsy/models` import)
- `HealthRegistry` accepts an optional `MetricsSink?` (no `@agentsy/observability` import)
- `QuotaRegistry` accepts an optional `BudgetProvider?` (no `@agentsy/tokenomics` import)
- Provider ethics is already via `ProviderEthicsPolicyHook` (no `@agentsy/guardrails` import)
- Provider adapters are passed in via `registerProvider()` (no `@agentsy/providers` import)
- Secret resolution is via an optional `SecretResolver?` (no `@agentsy/secrets` import)
- Core stream types moved to `@agentsy/shared` (no `@agentsy/core` import)

`@agentsy/gateway → @agentsy/shared` only (plus `peerDependencies` for optional integrations).

#### 45.3.9 `@agentsy/agents` — remove `core` and `runtime` deps

**Current**: imports `@agentsy/core` (stream types) and `@agentsy/runtime` (agent execution).
**Fix**: Agent specs (YAML templates) are pure data — they should only need `@agentsy/shared` for their types. The runtime integration is via injection. `@agentsy/agents → @agentsy/shared` only.

#### 45.3.10 `@agentsy/orchestrator` — remove `core`, `gateway`, `memory`, `observability`, `runtime` deps

**Current**: imports 5 other packages.
**Fix**: The orchestrator accepts all dependencies via constructor injection: `RuntimeEngine?`, `Gateway?`, `MemoryProvider?`, `ObservabilitySink?`. `@agentsy/orchestrator → @agentsy/shared` only.

### 45.4 Types that need to move to `@agentsy/shared`

The following types are currently defined in their implementation packages but are imported by other packages. They must move to `@agentsy/shared` (as interfaces/types only — implementations stay in their packages):

| Type | Currently in | Used by | Action |
|---|---|---|---|
| `StreamChunk`, `NormalizedChunk` | `core` | providers, tokenomics, ui, retrieval, gateway | Move to shared |
| `CompletionRequest`, `CompletionResponse` | `core` | providers, gateway | Move to shared |
| `Message` | `core` | runtime, agents, orchestrator | Move to shared |
| `ToolDefinition`, `ToolResult` | `core` | runtime, tools, agents | Move to shared |
| `ModelEntry`, `ModelTier` | `models` | gateway, ui | Move to shared |
| `GuardrailResult`, `GuardrailPhase` | `guardrails` | runtime | Define interface in shared; implementation stays in guardrails |
| `MemoryProvider` | `memory` | runtime, orchestrator | Define interface in shared |
| `SessionProvider` | `session` | runtime | Define interface in shared |
| `TokenTracker`, `BudgetProvider` | `tokenomics` | providers, memory, runtime | Define interface in shared |
| `ObservabilitySink`, `MetricsSink` | `observability` | tokenomics, gateway, orchestrator | Define interface in shared |
| `CostReporter` | (new) | providers | Define in shared |
| `SecretResolver` | (new) | gateway | Define in shared |
| `HealthRecord`, `QuotaSnapshot` | `gateway` | (stays — gateway owns these) | No action |

`@agentsy/shared` becomes the **interface contract layer** — it contains all types and interfaces that cross package boundaries, with zero runtime code. Packages import from `shared` for types; they accept implementations via constructor injection.

### 45.5 Eliminate `@agentsy/renderers` (complete the merge)

Phase 2 was supposed to merge `renderers` into `ui` and eliminate the package. The npm package `@agentsy/renderers` (0.1.2) is still published. Action:

1. Ensure all renderer source code is under `packages/ui/src/renderers/` (already done in Phase 2)
2. **Deprecate** `@agentsy/renderers` on npm — publish a final 0.1.3 with a deprecation notice in README and a postinstall warning
3. Remove `@agentsy/renderers` from all `package.json` dependencies across the monorepo
4. Update `@agentsy/ui` to re-export everything that `@agentsy/renderers` used to export (already done — verify)
5. Add a redirect in `@agentsy/ui`'s README pointing `renderers` consumers to `ui`

### 45.6 `@agentsy/types` → `@agentsy/shared` migration

The old `@agentsy/types` package (published as 0.1.1 on npm) was merged into `@agentsy/shared` in Phase 2. Action:

1. **Deprecate** `@agentsy/types` on npm — publish a final 0.1.2 that re-exports from `@agentsy/shared` with a deprecation warning
2. Ensure no package in the monorepo imports from `@agentsy/types` (all should use `@agentsy/shared`)
3. Update external consumers via README

### 45.7 Published packages (current and target)

**Currently published on npm** (verified 2026-06-17):

| Package | Version | Status |
|---|---|---|
| `@agentsy/core` | 0.2.0 | ✅ Published, zero deps — clean |
| `@agentsy/providers` | 0.2.0 | ✅ Published, zero deps — clean (but has `tokenomics` dep in repo; published version may differ) |
| `@agentsy/context` | 0.2.4 | ✅ Published, zero deps — clean |
| `@agentsy/types` | 0.1.1 | ⚠️ Published but deprecated — merged into `shared` |
| `@agentsy/ui` | 0.1.1 | ✅ Published, zero deps — clean |
| `@agentsy/renderers` | 0.1.2 | ⚠️ Published but deprecated — merged into `ui` |

**Target: publish after Phase 29 cleanup**:

| Package | Deps after cleanup | Notes |
|---|---|---|
| `@agentsy/shared` | (none) | Base layer — all cross-package types/interfaces |
| `@agentsy/core` | shared | Stream processing, SSE, XML filter, structured JSON |
| `@agentsy/providers` | core, shared | Provider normalizers + UniversalClient |
| `@agentsy/gateway` | shared | Independent routing library (peerDeps for optional integrations) |
| `@agentsy/guardrails` | shared | Safety/ethics pipeline |
| `@agentsy/observability` | shared | OTel tracing, metrics, Langfuse |
| `@agentsy/retrieval` | shared | RAG retrieval (independently consumable by third-party apps) |
| `@agentsy/models` | shared | Model selection/profiles |
| `@agentsy/tokenomics` | shared | Token management, quotas, ROI |
| `@agentsy/ui` | shared | UI store/bridge + Ink/TUI rendering |
| `@agentsy/vscode` | core, providers, ui, shared | VS Code integration (composition surface) |
| `@agentsy/tools` | shared | Tool implementations |
| `@agentsy/prompts` | shared | Prompt layering |
| `@agentsy/secrets` | shared | Secret management (12 backends) |
| `@agentsy/agents` | shared | Agent specs/templates |

**Composition roots (not independently publishable — they wire everything together)**:
- `@agentsy/runtime` → shared (accepts guardrails, memory, session, tokenomics via injection)
- `@agentsy/orchestrator` → shared (accepts runtime, gateway, memory, observability via injection)
- `@agentsy/daemon` → memory, observability, shared (will gain more as it hosts more services)
- `@agentsy/cli` → many (thin client)
- `@agentsy/testing` → many (test utility)

### 45.8 Verification

- [ ] `@agentsy/shared` contains all cross-package interface types (StreamChunk, Message, ToolDefinition, ModelEntry, GuardrailResult interface, MemoryProvider, SessionProvider, TokenTracker interface, ObservabilitySink, CostReporter, SecretResolver)
- [ ] `@agentsy/ui` depends only on `@agentsy/shared`
- [ ] `@agentsy/providers` depends only on `@agentsy/core` and `@agentsy/shared`
- [ ] `@agentsy/tokenomics` depends only on `@agentsy/shared`
- [ ] `@agentsy/retrieval` depends only on `@agentsy/shared`
- [ ] `@agentsy/memory` depends only on `@agentsy/shared`
- [ ] `@agentsy/secrets` depends only on `@agentsy/shared`
- [ ] `@agentsy/runtime` depends only on `@agentsy/shared`
- [ ] `@agentsy/gateway` depends only on `@agentsy/shared` (plus peerDeps for optional integrations)
- [ ] `@agentsy/agents` depends only on `@agentsy/shared`
- [ ] `@agentsy/orchestrator` depends only on `@agentsy/shared`
- [ ] `@agentsy/renderers` deprecated on npm (0.1.3 with deprecation notice)
- [ ] `@agentsy/types` deprecated on npm (0.1.2 re-exporting from shared)
- [ ] No monorepo package imports from `@agentsy/renderers` or `@agentsy/types`
- [ ] `fallow dead-code` passes with no new findings
- [ ] `pnpm check-types && pnpm lint && pnpm test` green across all packages
- [ ] Each independently-publishable package can be `pnpm build` and `pnpm test` in isolation without errors

---

## 46. Phase 30 — Environmental Impact Tracking (CO2 + Water)

**Priority**: P1 — Sprint 3–4 (parallel with Phase 6/8; extends tokenomics)
**Story points**: 6
**Branch**: `feat/environmental-impact-tracking`
**Depends on**: Phase 4 ✅, Phase 5 (provider/region info), Phase 29 (tokenomics boundary cleanup)
**Unblocks**: Phase 20 (environmental data strengthens ethical provider policy), Phase 13 (benchmark env cost reporting)
**Closes**: extends tokenomics from cost-only to full environmental accounting

### 46.1 Goal

Add CO2 emissions and water consumption tracking to `@agentsy/tokenomics`, per-request and cumulatively: energy (kWh) by model tier and execution location (cloud vs local); CO2 (gCO2) using regional carbon intensity; water (mL) from on-site cooling + indirect electricity generation; optimization savings from caching/routing; cumulative per-session/user/team/project totals; relatable comparison reporting.

### 46.2 Research basis

**Energy per AI request:**
- ChatGPT query: ~2.9 Wh (arXiv:2509.07218v1, 2025) — 10× a Google search (~0.3 Wh)
- Global data centers: ~415 TWh in 2024, 1.5% of global electricity (IEA, 2025); projected ~945 TWh by 2030
- US data centers: 183 TWh in 2024, 4% of US electricity (Pew Research, 2025)
- PUE: Google 1.09 (2024); industry 1.1–2.9; immersion cooling 1.02–1.04 (arXiv:2509.07218v1)
- A100 under-clocking: 40% power reduction, 22% performance loss (arXiv:2509.07218v1)

**CO2:**
- Average carbon intensity: ~395.65 gCO2/kWh (IEA cross-calculation, 2024)
- Global data center CO2: ~182 Mt CO2 (2024, IEA); AI specifically: 32.6–79.7 Mt CO2 (2025, NIH/PMC)

**Water:**
- WUE (Water Usage Effectiveness): Amazon 0.12 L/kWh; Microsoft 0.30 L/kWh; Google est. 0.20–0.30; industry avg 0.84 L/kWh (Axis Intelligence, 2026); EESI broader avg 1.9 L/kWh
- Per ChatGPT query: 10–25 mL direct+indirect (UC Riverside, Li et al., arXiv:2304.03271, 2023); 519 mL for 100-word GPT-4 email (Washington Post, 2024)
- Large data centers: up to 5 million gallons/day (Brookings, 2026)
- US data centers: 17 billion gallons direct water in 2023 (LBNL 2024 Report)
- Global AI data centers: 264 billion gallons (≈1 trillion liters) in 2025 (Mordor Intelligence via Axis Intelligence, 2026)
- Three components: on-site cooling (WUE), indirect electricity water (grid type), manufacturing water (chips — excluded per-request)

**Sources:**
- IEA Energy and AI: https://www.iea.org/reports/energy-and-ai
- Pew Research: https://www.pewresearch.org/short-reads/2025/10/24/what-we-know-about-energy-use-at-us-data-centers-amid-the-ai-boom/
- arXiv:2509.07218v1: https://arxiv.org/html/2509.07218v1
- EESI Water: https://www.eesi.org/articles/view/data-centers-and-water-consumption
- Brookings Water: https://www.brookings.edu/articles/ai-data-centers-and-water/
- Axis Intelligence Water: https://axis-intelligence.com/ai-data-center-water-usage-statistics/
- Axis Intelligence Energy: https://axis-intelligence.com/ai-data-center-energy-consumption-statistics/
- Google Efficiency: https://datacenters.google/efficiency/
- LBNL 2024 Report: https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf
- IEA-4E Review: https://www.iea-4e.org/wp-content/uploads/2025/05/Data-Centre-Energy-Use-Critical-Review-of-Models-and-Results.pdf
- ELI Water Fact Sheet: https://www.eli.org/sites/default/files/files-pdf/Data%20Centers%20and%20Water%20Fact%20Sheet%20ELI%20January%202026%20%281%29.pdf
- Ceres Drained by Data: https://www.ceres.org/resources/reports/drained-by-data-the-cumulative-impact-of-data-centers-on-regional-water-stress
- LBNL Water Efficiency: https://datacenters.lbl.gov/water-efficiency

### 46.3 Design — formulas

```
ENERGY:
  E_compute = (total_tokens / 1000) × energy_per_1K_tokens_Wh[tier]
  E_total = E_compute × PUE                  (cloud)
  E_total = E_compute                        (local, no PUE)

CO2:
  CO2 = (E_total / 1000) × carbon_intensity[gCO2/kWh][region]

WATER:
  W_direct = (E_total / 1000) × WUE[L/kWh][provider] × 1000    (mL, on-site cooling)
  W_indirect = (E_total / 1000) × indirect_water[L/kWh][grid_type] × 1000  (mL, electricity gen)
  W_total = W_direct + W_indirect

Grid type from carbon intensity:
  > 400 gCO2/kWh → fossil → 2.5 L/kWh indirect water
  > 200 gCO2/kWh → mixed → 1.5 L/kWh
  ≤ 200 gCO2/kWh → renewable → 0.3 L/kWh

SAVINGS (when model routing saves tokens):
  E_saved = (tokens_saved / 1000) × energy_per_1K[tier] × PUE
  CO2_saved = (E_saved / 1000) × carbon_intensity
  W_saved = (E_saved / 1000) × (WUE + indirect_water) × 1000

CACHE HIT:
  E = 0.01 Wh (network transfer only)
  Savings = full_request_energy - 0.01 Wh
```

### 46.4 Implementation

**New files in `@agentsy/tokenomics`** (all under `src/environmental/`):
- `energy-tiers.ts` — 4 tiers (edge 0.05 Wh/1K, foundation 0.2, mid-tier 0.8, frontier 2.9) + `classifyModelEnergyTier()`
- `carbon-intensity.ts` — 12 region entries (AWS, GCP, Azure, local) + `getCarbonIntensity()`
- `water-usage.ts` — WUE by provider (Amazon 0.12, Azure 0.30, GCP 0.25, local 0, default 0.84) + indirect water by grid type
- `impact-calculator.ts` — `calculateEnvironmentalImpact()` implementing the formulas above
- `cumulative-tracker.ts` — per-session/user/team/project aggregation
- `local-measurement.ts` — GPU/CPU power measurement for local inference (nvidia-smi on Linux, powermetrics on macOS, fallback to estimates)
- `realtime-intensity.ts` — optional Electricity Maps API integration (5-min cache, fallback to static table)

**New `UnifiedDB` table**: `environmental_impact` (links to `session_ledger` via `request_id`)

**Integration**:
- `CostTracker.recordCost()` optionally calls `EnvironmentalImpactCalculator` when present (daemon mode)
- Phase 20 per-session warning can show cumulative env impact per provider
- Phase 13 langeval benchmarks report their own environmental cost
- CLI: `agentsy env impact`, `agentsy env breakdown`, `agentsy env savings`, `agentsy env export`

### 46.5 Accuracy and limitations

**This is an approximation, not a measurement.** Cloud API energy is estimated (within 2-3×). PUE varies by facility. Carbon intensity changes hourly (optional real-time API improves this). Water has three components; we track two (excluded: chip manufacturing water, ~10-30% of lifecycle). Local inference is more accurate (actual power measurement). Savings are estimated from token deltas. Documented in README. Goal: meaningful approximation making impact visible, not scientific precision. Users needing precision should use CodeCarbon or Green Algorithms for local workloads.

### 46.6 Verification

- [ ] 4 model energy tiers with estimates matching research
- [ ] 12+ carbon intensity entries for major cloud regions
- [ ] WUE entries for AWS, Azure, GCP, local, default
- [ ] `calculateEnvironmentalImpact()` works for cloud and local requests
- [ ] Cache-hit impact near-zero with savings
- [ ] Cumulative tracking per session/user/team/project
- [ ] `environmental_impact` table in `UnifiedDB`
- [ ] CLI `agentsy env impact` produces report
- [ ] CLI `agentsy env breakdown` and `agentsy env savings` work
- [ ] Per-session warning can display cumulative env impact
- [ ] Local measurement works on Linux; falls back gracefully elsewhere
- [ ] Real-time API (optional) works with Electricity Maps key
- [ ] Limitations documented in README
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 47. (Superseded — implementation order consolidated below)

> Implementation order for all deferred phases (24–28) is consolidated in the final section below.

---

## 48. Phase 26 — A2A Protocol Support (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Ships after Phase 24 (Teams) — A2A is most valuable in a federated multi-agent context.
**Story points**: ~15 (preliminary)
**Branch**: `feat/a2a-protocol` (not yet created)
**Depends on**: Phase 14 (ACP agent — A2A builds on the same transport and session model), Phase 23 (task board — A2A tasks map to the task board), Phase 24 (Teams — A2A is most useful in server mode with authenticated agents)
**Unblocks**: federated agents, cross-daemon agent delegation, agent marketplace
**Status**: DEFERRED — design complete, implementation not started
**Source**: gemini-cli (§A.15) — full `@a2a-js/sdk` implementation with `TaskStore`, `AgentExecutor`, `AgentExecutionEvent`, `RequestContext`, `ExecutionEventBus`

### 41.1 Goal

Implement the [A2A (Agent-to-Agent) protocol](https://github.com/a2a-io/a2a-js) so agentsy agents can:
1. **Act as an A2A server** — expose agentsy agents as A2A-callable services that other A2A-compatible clients (gemini-cli, other agentsy instances, third-party A2A agents) can invoke.
2. **Invoke remote A2A agents as subagents** — an agentsy agent can delegate a sub-task to a remote A2A agent (e.g. a specialized research agent running on another server) and receive the result.
3. **Federate across daemons** — multiple agentsy daemons (e.g. one per team, one per region) can delegate to each other, enabling distributed agent topologies.

### 41.2 Design

#### 41.2.1 A2A server

The agentsy daemon exposes an A2A server endpoint (alongside the existing ACP endpoint). A2A uses JSON-RPC 2.0 over HTTP/SSE — same wire format as ACP, different method set.

```typescript
// packages/daemon/src/a2a/a2a-server.ts (NEW)

import { TaskStore, AgentExecutor, AgentExecutionEvent, RequestContext, ExecutionEventBus } from '@a2a-js/sdk';

export class AgentsyA2AServer {
  constructor(
    private agentHost: AgentHost,
    private taskBoard: TaskBoard,
    private scopeManager: ScopeManager,
  ) {}

  async handleTaskCreate(params: A2ATaskCreateParams): Promise<A2ATask> {
    // 1. Create a agentsy agent for the A2A task
    const agentId = await this.agentHost.spawn({
      spec: resolveAgentSpecForA2ATask(params),
      scope: this.scopeManager.deriveScopeKey(params.context?.cwd),
    });

    // 2. Create a task-board entry linking A2A task → agentsy agent
    const task = await this.taskBoard.create({
      planId: `a2a:${params.taskId}`,
      stepId: 'a2a-root',
      parentTaskId: params.parentTaskId,
      metadata: { a2aTaskId: params.taskId, agentId },
    });

    return { id: params.taskId, agentId, status: 'running' };
  }

  async handleTaskCancel(taskId: string): Promise<void> {
    const task = await this.taskBoard.getByMetadata('a2aTaskId', taskId);
    if (task) {
      await this.agentHost.kill(task.metadata.agentId);
      await this.taskBoard.cancel(task.id);
    }
  }

  // Stream A2A events (agent output → A2A client)
  async *streamTaskEvents(taskId: string): AsyncGenerator<AgentExecutionEvent> {
    const task = await this.taskBoard.getByMetadata('a2aTaskId', taskId);
    const agent = this.agentHost.getAgent(task.metadata.agentId);

    for await (const chunk of agent.stream) {
      yield mapAgentsyChunkToA2AEvent(chunk);
    }
  }
}
```

#### 41.2.2 A2A client (remote subagent invocation)

An agentsy agent can delegate to a remote A2A agent via a new tool:

```typescript
// packages/tools/src/tools/a2a/index.ts (NEW)

export function createA2ADelegateTool(deps: { a2aClient: A2AClient }): ToolDefinition {
  return {
    name: 'a2a_delegate',
    description: 'Delegate a sub-task to a remote A2A-compatible agent. ' +
                 'The remote agent runs independently and returns its result.',
    parameters: [
      { name: 'agentUrl', type: 'string', required: true, description: 'URL of the remote A2A agent' },
      { name: 'task', type: 'string', required: true, description: 'Task description for the remote agent' },
      { name: 'context', type: 'object', required: false, description: 'Additional context (cwd, files, etc.)' },
    ],
    handler: async (input) => {
      const task = await deps.a2aClient.createTask(input.agentUrl, {
        task: input.task,
        context: input.context,
      });

      // Stream events until completion
      const events = [];
      for await (const event of deps.a2aClient.streamTaskEvents(input.agentUrl, task.id)) {
        events.push(event);
        if (event.type === 'completion') break;
      }

      return { ok: true, data: { taskId: task.id, events, result: events.find(e => e.type === 'completion')?.result } };
    },
  };
}
```

#### 41.2.3 Integration with Phase 24 (Teams)

In server mode (Topology C), the A2A server endpoint is exposed alongside the ACP endpoint. Authentication uses the same OAuth/session-JWT mechanism (§38.2.2). Each A2A task is attributed to the authenticated user for spend tracking and audit logging.

#### 41.2.4 Security

- A2A delegation respects the same guardrail pipeline (Phase 4/9/10/12) — the remote agent's response is scanned by `IngressScanner` before being passed to the local agent.
- The `a2a_delegate` tool requires explicit user approval (Phase 4 `ApprovalManager`) for the first call to a new agent URL. Subsequent calls to the same URL are auto-approved (configurable).
- A2A agent URLs are subject to the `EgressScanner` (Phase 10) URL allowlist.

### 41.3 Verification (when activated)

- [ ] A2A server endpoint accepts task creation, streaming, cancellation
- [ ] External A2A client (gemini-cli) can invoke an agentsy agent and receive streamed results
- [ ] `a2a_delegate` tool delegates to a remote A2A agent and returns the result
- [ ] A2A task attribution to user (spend tracking, audit logging) works in server mode
- [ ] A2A delegation respects guardrails (remote response scanned by `IngressScanner`)
- [ ] First call to a new A2A agent URL requires approval; subsequent calls auto-approved
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 42. Phase 27 — Self-Improvement & Skill Curation (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Ships after Phase 15 (Bootstrap — owns skill installation) and Phase 23 (task board — curator uses the task board).
**Story points**: ~12 (preliminary)
**Branch**: `feat/self-improvement` (not yet created)
**Depends on**: Phase 15 (skills system), Phase 23 (task board, forkWithCacheSharing), Phase 8 (learning loop — curator extends the background job infrastructure)
**Unblocks**: self-curating skill library, post-turn self-review, automated skill quality maintenance
**Status**: DEFERRED — design complete, implementation not started
**Source**: hermes-agent (§A.14) — background skill curator, post-turn background review, skill AST audit

### 42.1 Goal

Implement three self-improvement mechanisms from hermes-agent:

1. **Background skill curator** — when the daemon is idle (>2h) and the curator hasn't run in >7d, fork an agent to review installed skills. Auto-transition skill lifecycle: `stale_after_days=30` → mark stale, `archive_after_days=90` → archive. Never auto-delete (only archive).
2. **Post-turn background review** — after every agent turn, fork a background agent (with inherited prefix cache) to review the turn. The reviewer has a tool whitelist (memory + skill management only) and a "do NOT capture" list that prevents hardening transient errors into persistent skills.
3. **Skill AST audit** — replace regex-only skill validation with AST-based auditing that parses skill scripts to detect malicious patterns (file system access, network calls, eval/exec, etc.).

### 42.2 Design

#### 42.2.1 Background skill curator

```typescript
// packages/daemon/src/services/skill-curator.ts (NEW)

export class SkillCurator implements Service {
  readonly name = 'skill-curator';
  private idleThresholdMs = 2 * 60 * 60 * 1000;  // 2 hours
  private minIntervalMs = 7 * 24 * 60 * 60 * 1000;  // 7 days
  private staleAfterDays = 30;
  private archiveAfterDays = 90;

  async start(): Promise<void> {
    // Schedule via Bree (Phase 8's job scheduler)
    this.scheduler.schedule('skill-curator', {
      cron: '0 */4 * * *',  // Check every 4 hours
      handler: () => this.maybeRunCurator(),
    });
  }

  private async maybeRunCurator(): Promise<void> {
    // Only run if daemon has been idle and curator hasn't run recently
    const lastActivity = this.serviceHost.lastActivityTime();
    const lastRun = await this.db.querySingle('SELECT MAX(run_at) FROM curator_runs');

    if (Date.now() - lastActivity < this.idleThresholdMs) return;  // Not idle enough
    if (lastRun && Date.now() - lastRun.getTime() < this.minIntervalMs) return;  // Too soon

    // Fork an agent to review skills (uses forkWithCacheSharing from Phase 23)
    const reviewerAgent = await this.agentHost.forkWithCacheSharing('curator-parent');
    await reviewerAgent.execute(CURATOR_PROMPT, {
      tools: ['skill_list', 'skill_archive', 'skill_mark_stale', 'memory_read'],
      doNotCapturePatterns: [
        'rate_limit', 'timeout', 'network_error', 'transient',
      ],
    });

    await this.db.execute('INSERT INTO curator_runs (run_at) VALUES (?)', [new Date().toISOString()]);
  }
}
```

#### 42.2.2 Post-turn background review

```typescript
// packages/daemon/src/services/post-turn-review.ts (NEW)

export class PostTurnReviewService implements Service {
  readonly name = 'post-turn-review';

  // Hooks into the runtime's PostResponse event (Phase 3 hook system)
  async onTurnComplete(agentId: string, turnResult: TurnResult): Promise<void> {
    // Fork a background agent with inherited prefix cache (Phase 23)
    const reviewer = await this.agentHost.forkWithCacheSharing(agentId);

    // Tool whitelist — only memory + skill management
    await reviewer.execute(POST_TURN_REVIEW_PROMPT, {
      tools: ['memory_append', 'memory_search', 'skill_update', 'skill_create'],
      doNotCaptureList: [
        // Prevent hardening transient errors into persistent skills
        'rate_limit', 'timeout', 'network_error', 'temporary', 'transient',
        'flaky', 'intermittent', 'one-off',
      ],
      input: {
        turnSummary: turnResult.summary,
        toolsUsed: turnResult.toolCalls.map(tc => tc.name),
        outcome: turnResult.outcome,
      },
    });

    // The reviewer runs in the background; its output is logged but not
    // surfaced to the user unless it creates/updates a skill or memory.
  }
}
```

#### 42.2.3 Skill AST audit

```typescript
// packages/guardrails/src/scanners/skill-ast-audit.ts (NEW)

export class SkillASTAuditScanner implements GuardrailScanner {
  readonly id = 'skill-ast-audit';
  readonly phase: GuardrailPhase = 'memory';  // Runs on skill install (memory surface)

  evaluate(skillContent: string, context: GuardrailContext): GuardrailResult {
    // Parse the skill script as an AST (language-dependent)
    // For TypeScript/JavaScript skills: use @babel/parser or acorn
    // For Python skills: use @pyodide or a Python subprocess
    const ast = this.parse(skillContent);

    const findings: Finding[] = [];

    // Detect: file system access outside sandbox
    this.detectFilesystemAccess(ast, findings);
    // Detect: network calls (fetch, http, https, net)
    this.detectNetworkAccess(ast, findings);
    // Detect: eval / exec / Function constructor
    this.detectDynamicExecution(ast, findings);
    // Detect: process.env access (secret leakage)
    this.detectEnvAccess(ast, findings);
    // Detect: child_process spawn
    this.detectSubprocessSpawn(ast, findings);

    if (findings.some(f => f.severity === 'critical')) {
      return { status: 'block', phase: 'memory', reason: 'Skill AST audit failed: critical findings', detections: findings };
    }
    if (findings.length > 0) {
      return { status: 'escalate', phase: 'memory', reason: `Skill AST audit: ${findings.length} findings require review`, riskScore: 0.6, detections: findings };
    }
    return { status: 'pass', phase: 'memory' };
  }
}
```

### 42.3 Verification (when activated)

- [ ] Skill curator runs when daemon idle >2h and last run >7d
- [ ] Curator marks skills stale after 30 days, archives after 90 days, never deletes
- [ ] Post-turn review fires after every turn with inherited prefix cache
- [ ] Post-turn review respects tool whitelist (memory + skill management only)
- [ ] "Do NOT capture" list prevents transient errors from becoming persistent skills
- [ ] Skill AST audit blocks skills with critical findings (filesystem, network, eval, env, subprocess)
- [ ] Skill AST audit escalates skills with non-critical findings for review
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 43. Phase 28 — Supply-Chain Security & Policy Attestation (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Can ship alongside Phase 24–25 (Teams/security hardening batch).
**Story points**: ~14 (preliminary)
**Branch**: `feat/supply-chain-attestation` (not yet created)
**Depends on**: Phase 4 (EthicsRegistry — attestation references ethics clauses), Phase 12 (guardrails daemon integration), Phase 15 (bootstrap — MCP/skill installation is the main OSV check point), Phase 21 (Docker tooling — attestation runs in CI)
**Unblocks**: enterprise compliance posture, supply-chain malware detection, dynamic security policy
**Status**: DEFERRED — design complete, implementation not started
**Sources**: hermes-agent (§A.14 — OSV check, exact-pinned deps), openclaw (§A.13 — policy attestation, doctor migration), gemini-cli (§A.15 — Conseca, JSON Schema)

### 43.1 Goal

Implement five supply-chain and compliance patterns:

1. **OSV malware check for MCP/skill installs** (hermes-agent) — before launching an MCP server via npx/uvx or installing a skill, query the [OSV API](https://osv.dev/) for known malware advisories. Block `MAL-*` advisories; fail-open on timeout (10s).
2. **Policy attestation/evidence system** (openclaw) — produce a `PolicyAttestation` with cryptographic hashes (policy path+hash, workspace hash, findings hash, attestation hash) for enterprise compliance. 14 evidence types.
3. **Conseca — LLM-generated per-prompt security policy** (gemini-cli) — an LLM generates a security policy from the user's prompt + available tool definitions, then enforces it per tool call. Complements agentsy's static guardrails with dynamic, intent-aware policy.
4. **Exact-pinned dependencies** (hermes-agent) — pin every direct dependency to `==X.Y.Z` (no ranges) with CVE comments. Lazy-deps for opt-in extras.
5. **Doctor migration contract** (openclaw) — `agentsy doctor --fix` detects old config shapes, explains, backs up, and rewrites to canonical format. Each extension exposes a `doctor-contract-api.ts`.
6. **Auto-generated JSON Schema** (gemini-cli) — publish a JSON Schema for `DaemonConfig` and agent YAML specs, auto-generated from TypeScript types, for IDE autocompletion.

### 43.2 Design

#### 43.2.1 OSV malware check

```typescript
// packages/guardrails/src/scanners/osv-check.ts (NEW)

export class OSVMalwareScanner implements GuardrailScanner {
  readonly id = 'osv-malware';
  readonly phase: GuardrailPhase = 'action';  // Runs before MCP/skill install
  private timeoutMs = 10_000;

  async evaluate(input: { package: string; version?: string }, context: GuardrailContext): Promise<GuardrailResult> {
    try {
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        body: JSON.stringify({ package: { name: input.package, ecosystem: 'npm' }, version: input.version }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const data = await response.json();

      // Only block MAL-* advisories (not regular CVEs — those are informational)
      const malwareAdvisories = (data.vulns ?? []).filter((v: any) => v.id.startsWith('MAL-'));

      if (malwareAdvisories.length > 0) {
        return {
          status: 'block',
          phase: 'action',
          reason: `Package ${input.package} has ${malwareAdvisories.length} malware advisories: ${malwareAdvisories.map((a: any) => a.id).join(', ')}`,
          detections: malwareAdvisories.map((a: any) => ({ id: a.id, severity: 'critical', description: a.summary })),
        };
      }
      return { status: 'pass', phase: 'action' };
    } catch {
      // Fail-open — OSV unavailability should not block installation
      return { status: 'pass', phase: 'action' };
    }
  }
}
```

Wire into Phase 15's bootstrap install flow — every `agentsy install mcp <id>` and `agentsy install skill <id>` runs `OSVMalwareScanner` before downloading.

#### 43.2.2 Policy attestation

```typescript
// packages/daemon/src/services/policy-attestation.ts (NEW)

export interface PolicyAttestation {
  checkedAt: string;              // ISO 8601
  policyPath: string;             // Path to the policy file (e.g. .agentsy/guardrails.yaml)
  policyHash: string;             // SHA-256 of the policy file
  workspaceHash: string;          // SHA-256 of the workspace tree (git ls-files | sha256sum)
  findingsHash: string;           // SHA-256 of the guardrail findings summary
  attestationHash: string;        // SHA-256 of all the above fields
  evidence: PolicyEvidence[];     // 14 evidence types (see openclaw §A.13)
  ethicsRegistryVersion: string;  // Version of the EthicsRegistry checked against
}

export class PolicyAttestationService {
  async generate(workspacePath: string): Promise<PolicyAttestation> {
    const policy = await this.loadPolicy(workspacePath);
    const findings = await this.runGuardrailAudit(workspacePath);
    const attestation = this.buildAttestation(policy, workspacePath, findings);
    await this.persist(attestation);
    return attestation;
  }

  // CLI: agentsy attestation generate [--workspace <path>]
  // CLI: agentsy attestation verify [--attestation <path>]
  // CI: run on every PR that touches guardrails config or agent templates
}
```

#### 43.2.3 Conseca (LLM-generated per-prompt security policy)

```typescript
// packages/guardrails/src/scanners/conseca.ts (NEW)

export class ConsecaScanner implements GuardrailScanner {
  readonly id = 'conseca';
  readonly phase: GuardrailPhase = 'input';
  readonly priority = 5;  // Runs first — generates policy before other scanners

  async evaluate(input: string, context: GuardrailContext): Promise<GuardrailResult> {
    // 1. Generate a security policy from the user's prompt + available tools
    const policy = await this.llm.generate({
      system: CONSECA_SYSTEM_PROMPT,
      user: JSON.stringify({
        prompt: input,
        availableTools: context.availableTools?.map(t => ({ name: t.name, description: t.description })),
      }),
      responseFormat: { type: 'json_schema', schema: CONSECA_POLICY_SCHEMA },
    });

    // 2. Attach the generated policy to the context for per-tool-call enforcement
    context.generatedPolicy = JSON.parse(policy);

    // 3. Don't block — just attach. Per-tool-call enforcement happens in the
    //    PreToolCall hook, which checks the generated policy.
    return { status: 'pass', phase: 'input' };
  }
}

// The generated policy has the shape:
// {
//   "decision": "allow" | "deny" | "ask_user",
//   "allowedTools": ["read_file", "search_files"],
//   "deniedTools": ["run_command"],
//   "reasoning": "The user wants to read files; run_command is not needed.",
//   "restrictions": { "maxFilesize": "1MB", "allowedPaths": ["/src/**"] }
// }
```

Conseca complements agentsy's static guardrails (Phase 9 detectors, Phase 20 ethical policy) — it adds intent-aware dynamic policy on top. The static guardrails always run; Conseca adds an additional layer.

#### 43.2.4 Exact-pinned dependencies

Update all `package.json` files to use exact versions (`1.2.3` not `^1.2.3`). Add a CI check that rejects ranged dependencies:

```typescript
// scripts/check-exact-pinned-deps.ts (NEW)
// Runs in CI; exits non-zero if any direct dependency uses ^, ~, or >=
```

Add CVE comments to dependencies with known issues:
```json
{
  "dependencies": {
    // CVE-2026-XXXX: fixed in 1.2.4; pin to >=1.2.4
    "some-package": "1.2.4"
  }
}
```

#### 43.2.5 Doctor migration

```typescript
// packages/cli/src/commands/doctor.ts (NEW)

export class DoctorCommand {
  async run(fix: boolean): Promise<void> {
    // 1. Detect old config shapes (e.g. pre-Phase 2 GuardrailsConfig)
    const issues = await this.detectConfigIssues();

    // 2. For each issue, explain what changed and why
    for (const issue of issues) {
      console.warn(`[doctor] ${issue.description}`);
      console.warn(`  Migration: ${issue.migrationGuide}`);
    }

    // 3. If --fix, back up old config and rewrite to canonical
    if (fix) {
      for (const issue of issues) {
        await this.backupConfig(issue.path);
        await this.rewriteConfig(issue.path, issue.canonicalForm);
        console.info(`[doctor] Fixed: ${issue.path} (backup at ${issue.path}.bak)`);
      }
    }
  }
}
```

Each package/extension that has a config shape exposes a `doctor-contract-api.ts` that the doctor command discovers and invokes.

#### 43.2.6 Auto-generated JSON Schema

```typescript
// scripts/generate-json-schema.ts (NEW)

import { zodToJsonSchema } from 'zod-to-json-schema';
import { DaemonConfigSchema } from '../packages/daemon/src/config.js';
import { AgentSpecSchema } from '../packages/agents/src/specs/schema.js';

// Generate schemas for IDE autocompletion
writeFileSync('schemas/daemon-config.json', JSON.stringify(zodToJsonSchema(DaemonConfigSchema), null, 2));
writeFileSync('schemas/agent-spec.json', JSON.stringify(zodToJsonSchema(AgentSpecSchema), null, 2));

// Publish to agentsy.dev/schemas/ for IDE configuration
```

### 43.3 Verification (when activated)

- [ ] OSV malware scanner blocks `MAL-*` advisories on MCP/skill install
- [ ] OSV scanner fails open on timeout (10s)
- [ ] Policy attestation generates cryptographic hashes (policy, workspace, findings, attestation)
- [ ] `agentsy attestation generate` / `agentsy attestation verify` CLI commands work
- [ ] Policy attestation runs in CI on PRs touching guardrails or agent templates
- [ ] Conseca generates a per-prompt security policy from user intent + tools
- [ ] Conseca policy enforced per-tool-call (allowed/denied/ask_user)
- [ ] Conseca complements (does not replace) static guardrails
- [ ] All `package.json` files use exact-pinned dependencies (no `^`, `~`, `>=`)
- [ ] CI check rejects ranged dependencies
- [ ] CVE comments present on dependencies with known issues
- [ ] `agentsy doctor --fix` detects, explains, backs up, and rewrites old config shapes
- [ ] Doctor migration contract discovered from each extension's `doctor-contract-api.ts`
- [ ] JSON Schema for `DaemonConfig` and agent specs auto-generated and published
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

## 44. Updated Implementation Order (with Phases 24–28 deferred)

Phases 24–28 do not appear in the Sprint 1–11 timeline. They are activated after v1 ships:

```
v1 (Sprints 1–11): Phases 3–23 ship. Local mode (Topology A) is the product.
                      ↓
v1.1 (Sprint 12):   One maintenance sprint. Bug fixes, dogfooding feedback, docs.
                      ↓
v1.2 (Sprints 13–16): Phase 24 (Teams) activated. Sub-phases 24.1–24.8 ship over ~4 sprints.
                      Phase 25 (MITM Proxy) activated in Sprints 17–18.
                      ↓
v1.3 (Sprints 17–20): Phase 26 (A2A Protocol) — ~2 sprints.
                      Phase 27 (Self-Improvement) — ~2 sprints.
                      Phase 28 (Supply-Chain & Attestation) — ~2 sprints.
                      These three can run in parallel (different subsystems).
```

**Activation criteria** (for Phases 26–28, in addition to Phase 24's criteria):
- [ ] Phase 14 (ACP agent) shipped — A2A (Phase 26) builds on the same transport
- [ ] Phase 15 (Bootstrap) shipped — skill installation (Phase 27) and OSV checks (Phase 28) depend on it
- [ ] Phase 23 (Task board, forkWithCacheSharing) shipped — curator and post-turn review (Phase 27) use it
- [ ] v1 shipped and stabilized
- [ ] Each phase's design reviewed and approved by maintainers

---

*End of Agentsy Unified Remediation & Implementation Plan v1.2*
