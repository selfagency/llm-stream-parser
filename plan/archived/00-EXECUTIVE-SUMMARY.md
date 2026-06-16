# @agentsy Unified Implementation Plan — Executive Summary

**Last Updated:** 2026-05-26  
**Status:** Phase 0 ✅ VERIFIED COMPLETE; Phase R1 ✅ PLAN SYNC COMPLETE; Phase 1 ✅ COMPLETE; Phase 2 ✅ COMPLETE; Phase 3 🟢 READY TO START; Phases 3.5-12 in planning/progress  
**Authority Document:** Master plan consolidating 25+ planning artifacts + codebase audit

---

## Quick Navigation

| Document                                 | Purpose                                                 | Audience                       |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| **00-AUTHORITY-ARCHITECTURE.md**         | Layer model, package boundaries, ecosystem decisions    | Architects, TLs                |
| **01-PHASE-0-FOUNDATION.md**             | ✅ Verified complete baseline                           | Reference                      |
| **02-PHASE-R1-PLAN-SYNC.md**             | ✅ Plan sync complete (8 files updated)                 | Plan owners                    |
| **03-PHASE-1-CONTRACT-STABILIZATION.md** | ✅ Complete cross-package API contracts, MSW bootstrap  | Teams on core packages         |
| **04-PHASE-2-TUI-VERTICAL-SLICE.md**     | ✅ Complete FIRST DOGFOODABLE: streaming chat TUI       | CLI, renderers, core teams     |
| **05-PHASE-3-MODEL-SELECTION.md**        | 🟢 Ready: provider routing, local LLM discovery         | Models, providers, renderers   |
| **06-PHASE-3.5-LLM-GATEWAY.md**          | Semantic gateway, failover, quota tracking              | Gateway team                   |
| **07-PHASE-4-ORCHESTRATION.md**          | Hooks, skills, instructions, agents, secrets, budget    | Orchestrator, plugins, runtime |
| **08-PHASE-5-TOOLS-APPROVALS.md**        | Safe tool execution, deny-by-default, guardrails        | Runtime, tools, guardrails     |
| **09-PHASE-6-SESSION-DURABILITY.md**     | Resume, branching, snapshot persistence                 | Session, runtime               |
| **10-PHASE-7-MEMORY-INTEGRATION.md**     | AgentFS migration, memory capture/retrieval             | Memory, runtime                |
| **11-PHASE-8-RAG-AUGMENTATION.md**       | 4-stage retrieval, hybrid ranking, reranking            | Retrieval, memory              |
| **12-PHASE-9-OBSERVABILITY.md**          | Cost tracking, tracing, structured logging              | Observability, all packages    |
| **13-PHASE-10-CONFIGURATION.md**         | XDG config, interactive editor, plan-only promotion     | CLI, plugins, mcp              |
| **14-PHASE-11-INTEGRATION.md**           | Standards compliance (MCP/ACP/A2UI), complete manifests | All packages                   |
| **15-PHASE-12-HARDENING-RELEASE.md**     | Smoke tests, CI gates, cross-surface parity, closure    | All teams, Release             |
| **16-CLI-SURFACE-CMUX.md**               | Optional: cmux integration for terminal multiplexing    | CLI team                       |
| **17-GOVERNANCE-QUALITY-GATES.md**       | Build rules, security invariants, completion protocol   | All teams                      |

---

## Execution Timeline

```text
Phase 0  ✅ DONE (observability, runtime, orchestrator, memory) — VERIFIED 2026-05-26
         ↓
Phase R1 ✅ DONE (plan sync — 1 hr) — COMPLETE 2026-05-26
         ↓
Phase 1  ✅ DONE (contract stabilization — 2 hrs) — COMPLETE
          ↓
Phase 2  ✅ DONE (TUI vertical slice — 11 hrs) ← FIRST DOGFOODABLE MILESTONE
          ↓
Phase 3  🟢 READY (Model selection — 5 hrs)
          ↓
Phase 3.5 (Gateway — 8 hrs)
          ↓
Phase 4  (Orchestration — 24 hrs) ← GATE BEFORE TOOLS
         ↓
Phase 5  (Tools+approvals — 16 hrs)
         ↓
Phase 6  (Session durability — 8 hrs)
         ↓
Phase 7  (Memory integration — 20 hrs)
         ↓
Phase 8  (RAG pipeline — 14 hrs)
         ↓
Phase 9  (Observability — 12 hrs) ← GATE BEFORE GA
         ↓
Phase 10 (Configuration — 10 hrs) + plan-only promotion
         ↓
Phase 11 (Integration — 8 hrs)
         ↓
Phase 12 (Hardening+release — 10 hrs)

TOTAL FORWARD WORK: ~197 hours (starting Phase 1)
         ↓
Phase 19 (tokens→context rename — 1 hr)
         ↓
Phase 20 (tokenomics — 46 hrs) ← SPEND vs VALUE MILESTONE
```

---

## Key Decisions (Non-Negotiable)

1. **Dogfood-first** — Every phase produces CLI-demoable artifact
2. **Vertical-slice ordering** — Build TUI chat early; validate each subsequent capability
3. **Approval-gated execution** — Destructive ops deny-by-default before any autonomous mode
4. **Hook/Prompt Axiom** — Safety lives in hooks (deterministic), never in system prompts
5. **Always-injected instructions vs lazy-loaded skills** — Narrow behavior vs expand capability
6. **Hard budget enforcement** — Token caps active before autonomous mode
7. **Default-deny hooks** — No hook runs unless explicitly registered
8. **Untrusted content discipline** — Retrieved/model-generated content treated as hostile
9. **Structured logging contract** — All packages emit through `@agentsy/observability` (tslog)
10. **Universal quality gates** — `pnpm build`, `pnpm check-types`, `pnpm test` green; no circular deps

---

## Verified Completion Status (2026-06-02 Plan Reconciliation)

### Phase 0 — ✅ COMPLETE (VERIFIED 2026-05-26)

| Component                                   | Evidence                                           |
| ------------------------------------------- | -------------------------------------------------- |
| Token compression (75% output / 46% memory) | `@agentsy/context` + `@agentsy/core/context`        |
| Memory 5-tier foundation                    | `@agentsy/memory` — 214 TS files, production-ready |
| Types audit + stability                     | TASK-067 — 17 modules, 7 TSDoc, zero `any`         |
| Observability P0-1 (tracer + logger)        | `@agentsy/observability` — 13 TS files ✅          |
| Runtime hook taxonomy P0-2                  | `@agentsy/runtime` — hooks/registry/types ✅       |
| Orchestrator hook compilation P0-2          | `@agentsy/orchestrator` — compileHooks ✅          |
| Core stream-to-events (TASK-009)              | `@agentsy/core` — processor/stream-to-events.ts ✅  |
| Providers request path (TASK-008)             | `@agentsy/providers` — request-path.ts, pipeline/ ✅  |
| Plugins manifest (TASK-091)                   | `@agentsy/plugins` — 8 TS files ✅               |

### Critical Compliance Findings (CORRECTED)

**Major underreporting corrected (6 packages):**

- **observability**: Marked ~30% → Actually P0-1 **COMPLETE ✅**
- **runtime**: Marked "hooks needed" → P0-2 **COMPLETE ✅**
- **orchestrator**: Marked ~40% → P0-2 **COMPLETE ✅**
- **core**: Marked "stream-to-events missing" → TASK-009 **DONE ✅**
- **providers**: Marked "request path missing" → TASK-008 **DONE ✅**
- **plugins**: Marked ~10% → TASK-091 **DONE ✅**

### Phase R1 — ✅ COMPLETE (PLAN SYNC)

**Deliverables:**

All 8 `IMPLEMENTATION-PLAN.md` files updated with verified completion marks:

1. ✅ `packages/types/IMPLEMENTATION-PLAN.md` — TASK-067 complete
2. ✅ `packages/memory/IMPLEMENTATION-PLAN.md` — 51/52 tasks complete, 98% verified
3. ✅ `packages/runtime/IMPLEMENTATION-PLAN.md` — Phase 4 complete
4. ✅ `packages/orchestrator/IMPLEMENTATION-PLAN.md` — Phase 0-2 (P0-2) complete ✅
5. ✅ `packages/observability/IMPLEMENTATION-PLAN.md` — Phase 1 complete
6. ✅ `packages/providers/IMPLEMENTATION-PLAN.md` — TASK-008 complete ✅
7. ✅ `packages/core/IMPLEMENTATION-PLAN.md` — TASK-009 complete ✅
8. ✅ `packages/prompts/IMPLEMENTATION-PLAN.md` — Structure exists, ready for Phase 4

**Verification:**

- ✅ Plan files committed; no code touched
- ✅ `pnpm check-types` passes (no code changes)
- ✅ Cross-references checked
- ✅ Markdown formatting validated

---

## Immediate Next Steps

1. ✅ **Phase R1** — Update 8 package IMPLEMENTATION-PLAN.md files with verified marks ✅ COMPLETE
2. ✅ **Phase 1** — Stabilize cross-package contracts + MSW bootstrap (2 hrs) — **COMPLETE**
3. ✅ **Phase 2** — TUI vertical slice (11 hrs) ← **COMPLETE**
4. 🟢 **Phase 3** — Model selection & provider routing (5 hrs) — **READY TO START**
5. Continue phases 3.5-12 per sequencing
6. 🟡 **Phase 19** — Rename @agentsy/context → @agentsy/context (1 hr) — unblocked after Phase 1
7. 🟡 **Phase 20** — @agentsy/tokenomics spend ledger + frustration tracking (46 hrs) — unblocked after Phase 9

---

## Success Definition

✅ Phase 0-1 foundations verified complete  
✅ Phase R1 plan synchronization complete  
✅ Package boundaries match code/export reality  
✅ All deferred work correctly scheduled in Phases 2-12  
✅ Cross-domain governance enforced  
✅ Package-level IMPLEMENTATION-PLAN.md files reflect verified completion

---

**Read next:** `05-PHASE-3-MODEL-SELECTION.md` (READY TO START)
