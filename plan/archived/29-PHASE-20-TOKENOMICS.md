# Phase 20 — @agentsy/tokenomics

**Effort:** ~49h total (8 implementation phases — Phase 20.0 complete)  
**Milestone:** Spend accountability, frustration-aware ROI, and agent self-improvement loop operational  
**Package:** `@agentsy/tokenomics` (new)  
**Gate:** Session ledger persisted; frustration score computed; MCP server responding; patch review flow functional  
**Depends on:** Phase 0 (observability ✅), Phase 9 (cost telemetry), Phase 7 (memory — for learning loop), Phase 4 (plugins/instructions — for patch applier), Phase 3.5 (gateway — for cache middleware)  
**Next:** Phase 21 (post-GA iteration)

---

## Overview

`@agentsy/tokenomics` is the attribution and intelligence layer above `@agentsy/context` and `@agentsy/observability`. It answers the question Zitron's critique raises: *is this spend producing value, or is it producing frustration?*

### What it does

0. **Tokenizer layer** — resolves model names to accurate BPE tokenizers via tiktoken WASM, with tuned fallback estimation for all major model families. Provides `TokenizerRegistry` for model-aware token counting.
1. **Ledger** — every session produces a `SessionLedgerEntry` recording spend, artifacts, quality gate results, and frustration score.
2. **Signal collection** — 5 passive frustration detectors + 4 satisfaction detectors, all reading hook events with zero user friction.
3. **Attribution** — git commit trailers link every AI-assisted commit to its session cost and quality.
4. **Cache efficiency** — prompt cache injection and semantic cache middleware cut effective spend; efficiency is tracked and reported.
5. **Analytics adapters** — 5 deployed-app adapters correlate post-deploy error rates and conversion changes with specific sessions.
6. **ROI calculator + MCP server** — surfaces cost-per-commit, cost-per-surviving-line, frustration waste %, and deployment impact.
7. **Learning loop** — clusters frustration signals into `FailureMode` records, generates `PromptPatch` text, writes approved patches to `learned-behaviors.md`, reinforces successful patterns in routing weights.
8. **UI widgets** — status bar (live session spend + frustration) and dashboard (7/30/90-day spend vs value).

### What it deliberately does not do

- Does not store raw prompt or file content anywhere — privacy-safe by construction.
- Does not make autonomous LLM calls except in `PatchGenerator`, which is gated and logged.
- Does not replace `@agentsy/observability` cost tracking — it *attributes* that data to artifacts and signals.
- Does not require user annotation — frustration is detected behaviorally, not via ratings.

---

## The Frustration Score

Every session gets a `FrustrationScore` (0.0–1.0) computed from passive signal events:

| Signal | Detection method | Weight |
|---|---|---|
| Immediate rewrite | File edited within 90s of `write_file` tool call, delta > 5 lines | 0.30 |
| Rapid retry | Consecutive user messages with cosine similarity ≥ 0.85 within 2 turns | 0.20 |
| Tool rejection | `approval:denied` hook event | 0.15 |
| Repair loop | `auto-repair.attempts > 1` in structured output repair | 0.15 |
| Post-write error | Typecheck/test failure after AI writes code | 0.10 |
| Session abandonment | Session ends with zero artifacts and duration > 30s | 0.05 |
| Explicit negative | User issues `/bad` or `/thumbs-down` command | 0.05 |

Satisfaction events offset the score (max -0.3): clean commits, `/good` command, deployment within 2h of session, fast output acceptance.

**Key derived metric:** `costAtFrustrationLevel = session.costUsd × frustrationScore`

This is the number that makes invisible waste visible: "You spent $0.84 this session. $0.61 of it was spent getting to the result you actually wanted."

---

## The Learning Loop

```text
FrustrationEvent (per session)
      │
      ▼ (after ≥ 3 matching sessions)
PatternRecognizer → FailureMode { category, confidence, contextFingerprint }
      │
      ▼ (one LLM call per FailureMode, no raw content)
PatchGenerator → PromptPatch { section, content, target, confidence }
      │
      ▼ (if confidence ≥ 0.9: auto-apply; else: user approval via /tokenomics patch review)
PatchApplier → writes to ~/.agents/agentsy/learned-behaviors.md
      │            loaded by InstructionsDiscoverer on every subsequent session
      ▼
Reinforcement → tags successful model+skill combos in routing weights
                read by gateway model selector to bias future routing
```

Learned behaviors accumulate in `~/.agents/agentsy/learned-behaviors.md` as structured sections, e.g.:

```markdown
[typescript-style]
Always use `type` aliases over `interface` unless extending.
Strict `readonly` by default. Never use `any`. Explicit return types required.
<!-- agentsy:patch id=patch_abc123 confidence=0.91 applied=2026-06-15 -->

[file-path-verification]
Before writing any file, verify the exact path exists using list_dir.
Never assume directory structure from memory alone.
<!-- agentsy:patch id=patch_def456 confidence=0.78 approved=2026-06-18 -->
```

---

## Session Summary UX

Post-session output in TUI (automatic):

```text
────────────────────────────────────────────────
Session complete
Cost:         $0.43   (effective $0.30 after cache)
Output:       3 commits · +247 / -89 LOC · 4 tests added
Quality:      typecheck ✅  lint ✅  tests ✅
Frustration:  12% — 1 rewrite detected (src/gateway/router.ts)
Cache:        71% hit rate — $0.13 saved vs uncached
────────────────────────────────────────────────
Was that useful? /good · /bad · skip
```

Weekly report (`agentsy tokenomics report`):

```text
Week of 2026-06-02
─────────────────────────────────────────────────
Total spend:      $12.40
Effective spend:  $7.80  (37% frustration-adjusted waste)
Cache savings:    $4.20  (34% of gross spend)
Commits shipped:  24
Cost/commit:      $0.33  ↓ from $0.51 last week
Code survival:    82%    ↑ from 71% last week
─────────────────────────────────────────────────
⚠ Frustration patterns detected (2):
  · TypeScript type rewrites (4 sessions, 0.91 confidence)
    → Patch ready: agentsy tokenomics patch review
  · File path errors (3 sessions, 0.67 confidence)
    → Patch ready: agentsy tokenomics patch review

✅ Reinforced patterns:
  · council:review mode → 0 production incidents in 2 weeks
  · claude-sonnet-4-5 + tdd skill → 89% code survival rate
─────────────────────────────────────────────────
```

---

## Sub-phase Sequencing

| Sub-phase | Module | Effort | Unblocks |
|---|---|---|---|
| **20.0** | **tokenizers/** (tiktoken BPE + estimator fallback) | **3h** ✅ | accurate ledger |
| 20.2 | `signals/` | 8h | learning loop, UI |
| 20.3 | `attribution/` | 4h | ROI calculator |
| 20.4 | `cache/` | 5h | efficiency metrics |
| 20.5 | `analytics/` + `roi/` | 8h | dashboard, MCP |
| 20.6 | `learning/` | 10h | patch review CLI |
| 20.7 | `ui/` + CLI commands | 5h | — |

20.1–20.3 can start immediately after Phase 9 (observability). 20.4 unblocks after Phase 3.5 (gateway). 20.6 unblocks after Phase 7 (memory) and Phase 4 (plugins).

---

## Quality Gates

- ✅ `pnpm check-types` clean (zero `any`)
- ✅ `pnpm test` — all modules have unit tests with fixtures
- ✅ No raw prompt/file content in ledger, signals, or patches
- ✅ No hardcoded analytics credentials — all via secrets broker
- ✅ Git trailers opt-in; disabled by default
- ✅ Semantic cache opt-in; disabled by default
- ✅ Patch auto-apply only at `confidence ≥ 0.9`; below that requires user approval
- ✅ MCP server registers via `@agentsy/mcp` (Phase 11 integration)
- ✅ All exports from `src/index.ts`
- ✅ No circular dependencies
- ✅ `packages/tokenomics/IMPLEMENTATION-PLAN.md` updated as tasks complete

---

**Implementation detail:** See `packages/tokenomics/IMPLEMENTATION-PLAN.md` for full TASK-TKNM-001 through TASK-TKNM-027 specifications.

**Previous:** `28-PHASE-19-CONTEXT-RENAME.md`  
**Next:** Integrate into `00-EXECUTIVE-SUMMARY.md` timeline + `00-AUTHORITY-ARCHITECTURE.md` layer table.
