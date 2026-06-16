# @agentsy Canonical Architecture

**Authority:** Master plan §1-3  
**Last Updated:** 2026-05-25  
**Purpose:** Canonical package boundaries, layer model, ecosystem decisions, verified compliance

---

## 1. Authority & Source Map

| Source                                           | Role                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `MASTER-IMPLEMENTATION-PLAN.md` v2026-05-15      | Canonical package boundaries, layer model, ecosystem decisions                                                                  |
| `DOGFOOD-PLAN.md` v2.1                           | Phase sequencing (1-12), TASK numbering, requirements/constraints/patterns                                                      |
| `REVISED-ARCHITECTURE-PLAN.md` 2026-05-25        | P0-P8 architectural upgrade layer (observability, credentials, MCP, sandbox, RAG, gateway, agent mode, config, fact extraction) |
| `ARCHITECTURE-UPGRADE-PLAN.md` 2026-05-25        | Verified state of P0-1/P0-2 completion; P0-3 next                                                                               |
| `REMEDIATION-PLAN.md` 2026-05-25                 | Plan-stale vs gap-exists classification; R1/R2/R3 phasing                                                                       |
| `SKILLS-INSTRUCTIONS-AGENT-PLAN.md` v1.0         | Skills/Instructions/Agents/Hooks 3-layer model, TASK numbering                                                                  |
| `MEMORY-AGENTFS-PLAN.md` 2026-05-21              | Phase 5/6/7/8a/8b/8c memory migration to Turso AgentFS                                                                          |
| `LLM-GATEWAY-PLAN.md`                            | TASK-LB-001..020 gateway scaffold                                                                                               |
| 25 archived compliance/gap/phase-completion docs | 2026-05-17 verified compliance matrix + migration ledger                                                                        |
| 25 `packages/*/IMPLEMENTATION-PLAN.md`           | Per-package TASK-{PKG}-NNN detailed work                                                                                        |
| 2026-05-25 codebase audit                        | Verified current state (observability, runtime, orchestrator, core, providers, plugins)                                         |

**Decision Authority:** This document is the single source of truth for:

- Canonical package boundaries
- Verified implementation sequencing
- Current-state vs planned-state maturity
- Retirement of superseded planning files

---

## 2. Layer Model (Canonical)

| Layer                         | Packages                                                                                                                                                         | Status        | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------- |
| **Core stream & transform**   | `@agentsy/core`                                                                                                                                                  | 🟡 85%        | Normalize provider output to typed events                  |
| **Provider integration**      | `@agentsy/providers`, `@agentsy/gateway`                                                                                                                     | 🟡 70%        | Adapt protocol differences, request/response normalization |
| **Execution & orchestration** | `@agentsy/runtime`, `@agentsy/orchestrator`                                                                                                                      | 🟢 P0-2 ✅    | Loop, hooks, scheduling, mode policy                       |
| **Session, memory & tokens**  | `@agentsy/session`, `@agentsy/memory`, `@agentsy/context`, `@agentsy/tokenomics`                                                                                                         | 🟢 Ready      | State durability, cognitive layers, context compression, spend accountability                 |
| **Surfaces & rendering**      | `@agentsy/renderers`, `@agentsy/ui`, `@agentsy/vscode`, `@agentsy/cli`                                                                                           | 🟠 Phase 2+   | CLI, UI, editor integration                                |
| **Extensibility & policy**    | `@agentsy/plugins`, `@agentsy/prompts`, `@agentsy/secrets`, `@agentsy/tools`, `@agentsy/guardrails`, `@agentsy/mcp`, `@agentsy/connectors`, `@agentsy/retrieval` | 🔴 Phase 4-11 | Skills, instructions, agents, policy, integrations         |
| **Model catalog & selection** | `@agentsy/models`                                                                                                                                                | 🟢 Stable     | Provider/model ranking, capability probing                 |
| **Foundations**               | `@agentsy/types`, `@agentsy/observability`, `@agentsy/testing`, `@agentsy/scripts`                                                                               | 🟢 Ready      | Types, logging, testing infrastructure                     |

---

## 3. Data Flow (Canonical)

```text
Provider raw output (OpenAI/Anthropic/Ollama/etc)
  │
  ├─→ @agentsy/providers
  │    - normalize
  │    - adapter pattern (request builder, response parser)
  │    - request path validation
  │
  ├─→ @agentsy/core
  │    - stream-to-events adapter (ReadableStream → typed events)
  │    - text-delta, thinking-delta, tool-call-start/end, error, done
  │    - compression/token awareness
  │
  ├─→ @agentsy/orchestrator
  │    - mode policy (single/orchestrated/autonomous)
  │    - hook compilation + registration
  │    - agent session creation
  │
  ├─→ @agentsy/runtime
  │    - turn loop execution
  │    - approval gating
  │    - tool execution & sandbox
  │    - hook firing (pre/post turn, tool lifecycle)
  │
  ├─→ @agentsy/session + @agentsy/memory
  │    - state snapshot persistence
  │    - episodic/semantic/procedural capture
  │    - wiki synthesis
  │    - RAG retrieval injection
  │
  ├─→ @agentsy/renderers
  │    - Ink TUI components
  │    - streaming display
  │    - approval prompts
  │    - document/diff viewers
  │
  └─→ @agentsy/cli | @agentsy/ui | @agentsy/vscode
       - interactive surfaces
       - user interaction + approval
```

---

## 4. Three-Layer Skills/Instructions/Hooks Model

```text
@agentsy/prompts:     ┌─────────────────────────────────────────┐
                      │  Instructions Layer (always injected)    │
                      │  + Skills Layer (lazy-activated)          │
                      │  + Hooks (pre/post turn, tool lifecycle)  │
                      └─────────────────────────────────────────┘
                                      ↑
@agentsy/plugins:     ┌─────────────────────────────────────────┐
                      │  InstructionsDiscoverer                  │
                      │  + SkillDiscoverer                       │
                      │  + AgentLoader / AgentRegistry           │
                      └─────────────────────────────────────────┘
                                      ↓
@agentsy/orchestrator:┌─────────────────────────────────────────┐
                      │  HookRegistry                            │
                      │  → compileHooks()                        │
                      │  → createAgentSession()                  │
                      └─────────────────────────────────────────┘
                                      ↓
@agentsy/runtime:     ┌─────────────────────────────────────────┐
                      │  AgentLoopOptions {                      │
                      │    beforeInit, beforeStep, prepareStep,  │
                      │    onStep, afterStep,                    │
                      │    beforeToolCall, afterToolCall,        │
                      │    beforeFinal, afterFinal,              │
                      │    onAbort, onError,                     │
                      │    approveToolCalls                      │
                      │  }                                       │
                      └─────────────────────────────────────────┘
```

---

## 5. Hook Taxonomy (8 Types)

| Hook Type           | Phase | Event                                  | Characteristics                        |
| ------------------- | ----- | -------------------------------------- | -------------------------------------- |
| `pre-turn`          | 4     | Before user input processed            | Read-only; determines routing          |
| `post-turn`         | 4     | After model response, before next turn | Side effects (memory writes, logging)  |
| `pre-compact`       | 7     | Before context compaction              | Budget-aware, determines what to evict |
| `pre-tool-call`     | 5     | Before tool execution                  | Approval, policy, sandboxing           |
| `post-tool-call`    | 5     | After tool result captured             | Secret detection, redaction            |
| `on-session-create` | 4     | Session initialized                    | Setup, capability negotiation          |
| `on-session-end`    | 4     | Session concluded                      | Cleanup, metrics emission              |
| `on-error`          | 4     | Unhandled exception                    | Recovery, observability                |

**Plus extensions (REVISED P0-2):**

- `UserPromptSubmit` — Input classification/guardrails
- `SubagentStop` — Delegated work cleanup

---

## 6. Discovery Roots (Canonical Precedence)

### Skills (highest → lowest)

1. `<project>/.agents/` (project-specific)
2. `~/.agents/` (user home)
3. `~/.config/agentsy/skills/` (XDG config)
4. `$XDG_DATA_HOME/agentsy/skills/` (XDG data)
5. Bundled with `@agentsy/cli`

### Instructions (all merged; highest priority wins)

1. `<project>/AGENTS.md`
2. `<project>/CLAUDE.md`
3. `<project>/.github/copilot-instructions.md`
4. `<project>/.cursor/rules/*.md` (glob, `applyTo`-scoped)
5. `~/.agentsy/instructions.md`
6. `~/.config/agentsy/instructions.md`

### Agents

1. `<project>/.agents/AGENT.md`
2. `~/.agents/AGENT.md`
3. `~/.config/agentsy/agents/AGENT.md`

### Config Layering (highest → lowest, PAT-005)

1. Session slash override (e.g., `/model gpt-4o`)
2. Workspace `.agentsy/agentsy.yml`
3. User `~/.agentsy/agentsy.yml`
4. Environment variables
5. Built-in defaults

---

## 7. Ecosystem & Adapter Decisions

### Bundle Strategy (Use Instead of Build)

| Component          | Provider                    | Owner                | Purpose                                  |
| ------------------ | --------------------------- | -------------------- | ---------------------------------------- |
| Model catalog      | models.dev                  | `@agentsy/models`    | 100+ providers, capabilities, pricing    |
| Agent filesystem   | Turso AgentFS               | `@agentsy/memory`    | SQLite-native memory substrate           |
| Pub/sub + tasks    | Honker (SQLite ext)         | Separate local DB    | Coordination (Turso doesn't support)     |
| Bidirectional sync | `@tursodatabase/sync`       | `@agentsy/memory`    | SQLite ↔ Turso Cloud replication         |
| Local-only RAG     | mcp-rag-server              | `@agentsy/retrieval` | Zero-ceremony, MCP-native                |
| System keyring     | `@napi-rs/keyring`          | `@agentsy/secrets`   | macOS Sequoia support (replaces keytar)  |
| Plugin sandbox     | `isolated-vm`               | `@agentsy/plugins`   | Untrusted code containment               |
| MCP SDK            | `@modelcontextprotocol/sdk` | `@agentsy/mcp`       | stdio + HTTP transports                  |
| CLI framework      | `@oclif/core` + plugins     | `@agentsy/cli`       | Command lifecycle, plugins, autocomplete |

### Patterns to Adopt

| Pattern                                      | Source                       | Implementation                             |
| -------------------------------------------- | ---------------------------- | ------------------------------------------ |
| Token compression (75% output / 46% memory)  | Caveman                      | `@agentsy/context`, `@agentsy/core/context` |
| Virtual sandbox (90% infra savings)          | Flue                         | `@agentsy/runtime` (Phase 4 complete)      |
| Content addressing + dedup                   | re_gent                      | `@agentsy/memory/content-addressing`       |
| Structural sandboxing                        | SpiceAI                      | `@agentsy/runtime/sandbox`                 |
| Schema-first secrets                         | Varlock                      | `@agentsy/secrets` (Phase 4)               |
| Tree-sitter tools (59 tokens vs 224)         | Maki                         | `@agentsy/tools` (Phase 5)                 |
| Spec-first think/plan/build/review/test/ship | Superpowers/Sisyphus         | Superagent plugin modes                    |
| Category-based delegation                    | oh-my-openagent              | Runtime orchestration                      |
| Iterative search → summarize → reflect       | local-deep-researcher        | Research mode plugin                       |
| Multi-path exploration                       | LATS-style                   | Research phase                             |
| Generator → critic → refinement              | Evaluator-Optimizer          | Review phase                               |
| Hypothetical-answer embeddings               | HyDE                         | Phase 8 RAG                                |
| Hybrid retrieval ranking                     | Reciprocal Rank Fusion (RRF) | Phase 8 retrieval                          |
| Lost-in-middle ordering                      | Context ordering             | Phase 8 context builder                    |
| Schema-first structured output               | Outlines/llguidance          | Prompt assembly                            |

### Standards Integration (Tier System)

**Tier 1 (enhance existing):**

- MCP (Model Context Protocol) — Tool integration
- ACP (Editor integration) — Editor-native patterns
- A2UI/AG-UI (UI generation) — Aligned with `@agentsy/runtime/ag-ui`
- agentskills.io SKILL.md — Canonical plugin format (Phase 4, REQ-044)

**Tier 2 (reference only):**

- Ratify (identity/trust)
- Skills Protocol (capability framework)
- AP2 (payments, domain-specific)

**Legacy (adapter docs):**

- OpenTelemetry baseline + tslog logger
- Hatchet/Agentspan/Chidori durable-execution patterns
- CacheLLM prompt-caching
- R2R/Mem0 backend adapters

### Local LLM Provider Targets (Priority Order)

1. **Ollama** — Most mature ecosystem
2. **vLLM** (OpenAI-compat) — Production inference
3. **LM Studio** — Desktop UX
4. **Lemonade Server** — Alternative
5. **Docker Model Runner**
6. **Jan API Server**
7. **Apfel**
8. **Agentsy native** (`node-llama-cpp`-based adapter, Phase 3.5)

**Pipeline ownership:**

- `@agentsy/models` — ranking, fetch-plan generation
- `@agentsy/providers` — protocol adapters, node-llama-cpp wrapper
- `@agentsy/runtime` — lifecycle (fetch/install/activate/swap)

### Official Superagents Plugin (CON-015, REQ-027/028)

First-party plugin prepackaged with `@agentsy/cli` for zero-config.

**Three reusable modes:**

- **research** — Iterative retrieval, synthesis, citation, source strategy, gap detection
- **plan** — Interview-driven clarification, architecture review, plan generation, approval gates
- **agent** — Investigation discipline, review/test gates, completion enforcement, safe shipping

Pattern sources adapted (NOT rebranded): minds-platform, Agent-S, local-deep-researcher, superpowers, oh-my-openagent, gstack, Sisyphus.

### Built-in Agent Set (REQ-036)

Five first-class `AgentDefinition` in `@agentsy/plugins/src/agents/builtins/`:

- `default` — General-purpose multi-mode
- `research` — Iterative search + synthesis
- `code` — Structured code development
- `plan` — Interview-driven planning
- `superagent` — Delegated multi-step orchestration

---

## 8. Guiding Principles (Non-Negotiable)

1. **Dogfood-first** — Every phase produces CLI-demoable artifact. No backend-only milestones.
2. **Vertical-slice ordering** — Build TUI chat early; validate every subsequent capability.
3. **Budget-first** — Hard token caps + per-turn/per-session ceilings active before autonomous mode.
4. **Approval-gated execution** — Destructive ops deny-by-default with explicit user approval from first tool-enabled release.
5. **Adapter-first** — Use proven external projects at integration boundaries; keep internal ownership explicit.
6. **Hook/Prompt Axiom** — Safety logic lives in hooks (deterministic) — never in system prompts (probabilistic). `block: true` hooks cannot be overridden by model output. **Primary security boundary.**
7. **Hooks taxonomy invariant** — Pre-turn hooks are read-only observers that inform routing. Post-turn hooks run side effects. **Hard architectural rule.**
8. **Always-injected instructions vs lazy-loaded skills** — Instructions narrow behavior (baseline budget). Skills expand (task budget).
9. **Auto-compaction is a runtime primitive** — Runtime owns schedule, fires PreCompact; memory registers handler.
10. **Untrusted content discipline** — Retrieved/model-generated content treated as hostile by default; sanitized at boundaries.
11. **Structured logging contract** — All packages emit through `@agentsy/observability` (tslog). No ad-hoc `console.*` in production paths.
12. **MSW v2** — Canonical HTTP mock layer for cross-package network tests.
13. **Universal quality gates** — `pnpm build`, `pnpm check-types`, `pnpm test` green; no circular deps; touched plans/docs updated.

---

## 9. Verified Compliance Snapshot (2026-05-25)

| Package                               | Phase       | Status           | Notes                                                                |
| ------------------------------------- | ----------- | ---------------- | -------------------------------------------------------------------- |
| `@agentsy/observability`              | 0-1, 9      | 🟢 P0-1 ✅       | Tracer, logger, exporters, instrumentation complete; metrics Phase 9 |
| `@agentsy/runtime`                    | 0-2, 4-7, 9 | 🟢 P0-2 ✅       | Hooks, registry, interruption, checkpoint, AG-UI, sandbox            |
| `@agentsy/orchestrator`               | 0-2, 4      | 🟢 P0-2 ✅       | Hook compilation, scheduling, agent loop                             |
| `@agentsy/memory`                     | 0-1, 7-8    | 🟢 98% 🟡        | Production-ready; AgentFS migration pending Phase 8                  |
| `@agentsy/types`                      | 0, 1        | 🟢 ✅            | TASK-067 complete 2026-05-25                                         |
| `@agentsy/session`                    | 1, 6-7      | 🟡 75%           | Typed state scaffold done; snapshot/resume pending                   |
| `@agentsy/context`                    | 0, 4, 9, 19 | 🟢 Phase 0 ✅    | Compression done; renamed from tokens (Phase 19)                     |
| `@agentsy/tokenomics`                 | 20          | 📋 Planned       | Spend ledger, frustration signals, ROI MCP, learning loop            |
| `@agentsy/core`                       | 0-2, 7      | 🟡 85%           | TASK-009 ✅; stream-to-events done                                   |
| `@agentsy/providers`                  | 0-3         | 🟡 70%           | TASK-008 ✅; request path exists                                     |
| `@agentsy/gateway`                | 3.5, 9      | 🟡 Foundation ✅ | TASK-LB-001..009 done; TASK-LB-010..020 Phase 3.5                    |
| `@agentsy/models`                     | 3           | 🟢 Stable        | Model selector, capability probing ready                             |
| `@agentsy/plugins`                    | 1-4         | 🟠 TASK-091 ✅   | Manifest registry done; skills/instructions/agent loaders Phase 4    |
| `@agentsy/cli`                        | 2-12        | 🟠 ~37%          | Readline chat partial; TUI Phase 2                                   |
| `@agentsy/renderers`                  | 2-5         | 🟠 Scaffold      | Framework ready; Ink components Phase 2                              |
| `@agentsy/tools`                      | 5           | 🔴 ~15%          | REPL + AgentFS adapter; baseline tools Phase 5                       |
| `@agentsy/secrets`                    | 4           | 🔴 ~8%           | Interface exists; broker pattern Phase 4                             |
| `@agentsy/guardrails`                 | 5, 10-11    | 🔴 ~12%          | Error classes exist; policy engine Phase 5                           |
| `@agentsy/prompts`                    | 4           | 🔴 Scaffold      | Layer types Phase 4                                                  |
| `@agentsy/testing`                    | 1, 11       | 🟡 Scaffold      | MSW bootstrap ready Phase 1                                          |
| `@agentsy/ui`                         | 5, 9        | 🟠 —             | Adapters Phase 5                                                     |
| `@agentsy/vscode`                     | 12          | —                | Cross-surface parity Phase 12                                        |
| `@agentsy/scripts`                    | 12          | —                | Release automation Phase 12                                          |
| `@agentsy/{mcp,connectors,retrieval}` | 10-11       | Plan-only        | Manifest promotion deferred Phase 10                                 |

---

**Read next:** Jump to your phase document (e.g., `04-PHASE-2-TUI-VERTICAL-SLICE.md`) or continue through `01-PHASE-0-FOUNDATION.md` → `03-PHASE-1-CONTRACT-STABILIZATION.md`
