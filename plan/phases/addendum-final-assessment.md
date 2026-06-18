

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

### 37.7 Post-Audit Additions (2026-06-17)

Two new phases were added after a line-by-line code audit against the 28-package codebase:

**Phase 31 — AG-UI Adapter Integration (3 SP, P1)**: The `runtime/src/ag-ui/` directory contains
8 unplanned but production-quality files implementing the AG-UI protocol (CopilotKit compatible).
This is a significant capability addition. Phase 31 retroactively documents it and wires the
AG-UI HTTP server into the daemon's streaming pipeline so it's accessible without importing
`@agentsy/runtime` directly.

**Phase 33 — AIMock Full Integration (5 SP, P1)**: `@copilotkit/aimock@1.29.0` is installed but
only `LLMock` is used in a single smoke test. `MCPMock`, `VectorMock`, `A2AMock`, `AGUIMock`,
record/replay, chaos mode, and drift detection are all available in the installed version but
unwired. MSW provider handlers are marked `@deprecated` in comments but not yet deleted. Phase 33
completes the migration: LLMock → gateway E2E; VectorMock → RAG tests; MCPMock → daemon MCP tests;
AGUIMock → Phase 31 AG-UI tests; chaos suite for failover validation; daily drift CI job.

**Phase 32 — Security Hardening (6 SP, P0)**: Four security gaps identified in code audit:
1. `shell_exec` uses `execSync` without routing through the existing `VirtualSandbox` — a process
   isolation gap.
2. IPC server has no authentication layer — any process running as the same user can issue
   `daemon.shutdown`, `agent.spawn`, or `process.spawn` over the Unix socket.
3. `ApprovalManager` exists in `@agentsy/runtime` but has no IPC surface — agents running in the
   Piscina pool cannot surface approval requests to the CLI/TUI.
4. `VirtualSandbox` `WORKER_PATH` is computed from `process.cwd()` — will fail when daemon starts
   from any directory other than the repo root.

Both phases can run in parallel with existing active-scope phases. Phase 32 is the higher priority.


**Phase 34 — Local Trust Sanitization Workflow (4 SP, P1)**: ZipTyPrompt's core
pattern is valuable and directly applicable: browser-local sanitization, no server upload,
custom regex rules, and a sanitize-first workflow. Agentsy already has redaction primitives
(`deep-scrub`, `message-scrubbing`, `pii`, `secret-detection`, `baseline`, `inline-ignore`) but
lacks a dedicated productized command and rules UX. Phase 34 adds `agentsy sanitize`, local rule
files, infra preset, preview/diff, and import/export so support and SRE users can scrub logs/configs
before sending them to the model.


**Phase 35 — Skill Discovery, Registry Install & Scope Management (5 SP, P1)**: The existing
`@agentsy/plugins` skill system already has discovery and semantic activation, but lacks the
`autoskills`/`skillsor` product layer: curated registry install, lockfile, global vs project scope,
shadowing, and stack-aware recommendation. Phase 35 adds `agentsy skills install/discover/scope`,
verified bundle installs, and resolution rules so skills can be managed globally and per project.


**Phase 36 — Agent Governance Toolkit Pattern Adoption (6 SP, P1)**: AGT’s strongest value is
its architecture: policy engine separated from runtime, trust mesh / scope-chain delegation,
Merkle-chained audit logs, kill switch, governance SLOs, and trust-scored plugins/marketplace.
Agentsy already has many primitives, but Phase 36 unifies them into a proper governance layer so
policy decisions are pure, delegation is trust-bounded, and every governance event is tamper-evident.

### 37.6 Call to Action


**Start with Phase 3 in Sprint 1.** It's the highest-leverage next step: it unblocks Phase 4 (guardrails foundation), Phase 14 (ACP agent), and Phase 17 (competitive sprint). Three engineers can run Phase 3, Phase 5, Phase 7, and Phase 19 in parallel from day one — Phase 19 (Langfuse) is a 6 SP quick win that delivers visible value within the first sprint.

**Phase 20 (Ethical Provider & Content Policy) is the moral centerpiece of this plan.** It is the third non-negotiable BLOCK gate. Agentsy will not route to xAI/Grok, will not ship a Telegram connector, and will block style-mimicry prompts that profit from theft of creators' work. The warnings on OpenAI/Microsoft/Google/Amazon ensure users make an informed choice. This phase must land by Sprint 3 — before any first-party agent template ships. If the timeline slips, Phase 20 is the last thing to descope (and descope it only by splitting the style-mimicry scanner into a follow-up, never the xAI block or Telegram removal).

**Phase 23 (AFT/MC/Task Board Hardening) closes the integration gaps** documented in §25. It delivers the todo-list tool, persisted task delegation, and sub-agent cache sharing that bring agentsy to parity with Claude-Code and opencode on agent-core ergonomics.

**Phases 24–28 are the post-v1 horizon.** All designs are complete (§38–§43, ~93 SP combined). Phase 24 delivers Teams & Remote Deployment (OAuth, per-user spend, audit logging, shared memory, Docker/Turso Compose). Phase 25 delivers a guardrail-aware MITM proxy for subprocess network interception. Phase 26 delivers A2A protocol support (from gemini-cli) — federated agents and cross-daemon delegation. Phase 27 delivers self-improvement (from hermes-agent) — background skill curator, post-turn review, AST-based skill audit. Phase 28 delivers supply-chain security & policy attestation (from openclaw/hermes-agent/gemini-cli) — OSV malware checks, Conseca dynamic policy, exact-pinned deps, doctor migration, JSON Schema publication. None start until v1 ships and stabilizes (§44 activation criteria). The v1 work (Phases 3–23) was designed with all five in mind: transport-agnostic IPC, folder-based scoping extensible to multi-tenant, session-attributed tokenomics, JWT-ready auth stubs, and — via the Phase 10 §15.7 extension — `SubprocessSpec.networkPolicy` plumbing that Phase 25's proxy will consume. §38.4 documents the seven "do not foreclose" constraints that v1 must respect to keep the deferred phases viable. The 3 new competitors from the expanded 15-competitor comparison (§32) drove Phases 26–28 — A2A from gemini-cli, self-improvement from hermes-agent, supply-chain/attestation from all three.

The plan is executable. The architecture is sound. The policy documents are clear. The ethical commitments are non-negotiable. The work is a matter of focused implementation, not redesign. Ship Phase 4, then Phase 9, then Phase 12, then Phase 20, and all three BLOCK gates lift. From there, the competitive sprint (Phase 17), missing capabilities (Phase 18), and integration hardening (Phase 23) close the remaining gaps with proven patterns from competitors and the project's own audit findings. After v1 stabilizes, Phases 24–28 open the Teams / remote-deployment / network-interception / A2A / self-improvement / supply-chain product line — the widest deferred horizon of any agent framework.

The result will be a framework that is honestly described, ethically enforced, architecturally clean, and competitive on agent quality — the only framework in the landscape that is all four.

---

