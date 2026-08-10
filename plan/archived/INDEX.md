# @agentsy Unified Implementation Plan — Master Index

**Last Updated:** 2026-06-02  
**Status:** Complete split into 27 phase documents  
**Authority:** Master plan consolidating 25+ planning artifacts

---

## Document Index

| Document                                    | Purpose                                                                | Read Time  |
| ------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| **00-EXECUTIVE-SUMMARY.md**                 | Digest, quick navigation, status                                       | 5 min      |
| **00-AUTHORITY-ARCHITECTURE.md**            | Canonical layer model, ecosystem                                       | 15 min     |
| **01-PHASE-0-FOUNDATION.md**                | ✅ Complete baseline                                                   | 10 min     |
| **02-PHASE-R1-PLAN-SYNC.md**                | Plan file updates (1 hr work)                                          | 5 min      |
| **03-PHASE-1-CONTRACT-STABILIZATION.md**    | Cross-package APIs, MSW bootstrap                                      | 5 min      |
| **04-PHASE-2-TUI-VERTICAL-SLICE.md**        | FIRST DOGFOODABLE (streaming chat)                                     | 20 min     |
| **05-PHASE-3-MODEL-SELECTION.md**           | Provider routing, local discovery                                      | 8 min      |
| **06-PHASE-3.5-LLM-GATEWAY.md**             | Semantic gateway, failover, quota                                      | 15 min     |
| **07-PHASE-4-ORCHESTRATION.md**             | Hooks, skills, agents, secrets, budget                                 | 30 min     |
| **08-PHASE-5-TOOLS-APPROVALS.md**           | Tool execution, deny-by-default                                        | 20 min     |
| **09-PHASE-6-SESSION-DURABILITY.md**        | Resume, branching, snapshots                                           | 8 min      |
| **10-PHASE-7-MEMORY-INTEGRATION.md**        | Memory capture/retrieval, AgentFS                                      | 8 min      |
| **11-PHASE-8-RAG-AUGMENTATION.md**          | 4-stage retrieval, hybrid ranking                                      | 12 min     |
| **12-PHASE-9-OBSERVABILITY.md**             | Cost tracking, structured logging                                      | 10 min     |
| **13-PHASE-10-CONFIGURATION.md**            | XDG config, interactive editor                                         | 5 min      |
| **14-PHASE-11-INTEGRATION.md**              | Standards compliance, manifests                                        | 5 min      |
| **15-PHASE-12-HARDENING-RELEASE.md**        | Smoke tests, CI gates, closure                                         | 15 min     |
| **16-CLI-SURFACE-CMUX.md**                  | Optional: terminal multiplexing                                        | 3 min      |
| **17-GOVERNANCE-QUALITY-GATES.md**          | Build rules, security, completion                                      | 15 min     |
| **18-PHASE-AIMOCK-INTEGRATION.md**          | aImock for LLM provider mocking                                        | 10 min     |
| **19-AIMOCK-MIGRATION-PLAN.md**             | MSW → aImock migration steps                                           | 5 min      |
| **20-PHASE-13-WORKFLOWS-IMPLEMENTATION.md** | Declarative YAML workflow layer                                        | 20 min     |
| **21-DCP-PATTERNS-TOKENS.md**               | DCP context pruning patterns in tokens                                 | 11 hours   |
| **22-ECC-INTEGRATION.md**                   | Optional ECC patterns adoption                                         | 25 hours   |
| **23-PHASE-14-EXTERNAL-ADOPTIONS.md**       | Patterns from 8 external repos (incl. context-mode session continuity) | 33.5 hours |
| **24-PHASE-15-COUNCIL-MODE.md**             | Multi-model council collaboration                                      | 15 hours   |
| **25-PHASE-16-SMALL-MODEL-PARITY.md**       | Make 7B-14B models rival cloud models                                  | 40 hours   |
| **28-PHASE-19-CONTEXT-RENAME.md**           | Rename @agentsy/context → @agentsy/context                             | 1 hour     |
| **29-PHASE-20-TOKENOMICS.md**               | Spend ledger, frustration, ROI, learning loop                          | 49 hours   |
| **35-CORTEXKIT-INTEGRATION.md**             | Magic Context + AFT integration; @agentsy/context deprecation          | 36 hours   |
| **35-CORTEXKIT-INTEGRATION.md**             | CortexKit integration — Magic Context + AFT                           | 36 hours   |

---

## Recommended Reading Order

**Quick Overview (15 min):**

1. 00-EXECUTIVE-SUMMARY.md
2. 00-AUTHORITY-ARCHITECTURE.md

**For Team Leads (1 hour):**

1. 00-EXECUTIVE-SUMMARY.md
2. 00-AUTHORITY-ARCHITECTURE.md
3. 04-PHASE-2-TUI-VERTICAL-SLICE.md (unblocked work)
4. 07-PHASE-4-ORCHESTRATION.md (critical path)
5. 17-GOVERNANCE-QUALITY-GATES.md (execution rules)

**For All Contributors:**

- Your phase document (e.g., 04-PHASE-2-TUI-VERTICAL-SLICE.md)
- 17-GOVERNANCE-QUALITY-GATES.md (rules)
- Related dependency phases

---

## Quick Facts

- **Total phases:** 0, R1, 1-12, 13-20, 22 (23 phases total)
- **Unblocked ready:** Phase 2 (TUI vertical slice)
- **Critical path:** Phases 0 → R1 → 1 → 2 → 3 → 4 → 5
- **Estimated total effort:** ~233 hours forward work
- **Verified complete:** Phase 0 (foundation baseline)
- **Key gates:** Phase 2 (dogfood), Phase 4 (before tools), Phase 9 (before GA)

---

## File Organization

All phase documents in: `~/Developer/agentsy/plan/phases/`

```text
plan/
├── phases/
│   ├── 00-EXECUTIVE-SUMMARY.md
│   ├── 00-AUTHORITY-ARCHITECTURE.md
│   ├── 01-PHASE-0-FOUNDATION.md
│   ├── 02-PHASE-R1-PLAN-SYNC.md
│   ├── 03-PHASE-1-CONTRACT-STABILIZATION.md
│   ├── ...
│   ├── 17-GOVERNANCE-QUALITY-GATES.md
│   └── INDEX.md (this file)
├── IMPLEMENTATION-COMPLIANCE-MATRIX.md (updated)
├── TODO.txt (updated)
└── MASTER-IMPLEMENTATION-PLAN-V2.md (archived reference)
```

---

## Execution Flow

```text
Day 1: Review 00-EXECUTIVE-SUMMARY.md + 00-AUTHORITY-ARCHITECTURE.md
  ↓
Day 1-2: Execute Phase R1 (plan file sync, 1 hr)
  ↓
Day 2-3: Execute Phase 1 (contract stabilization, 2 hrs)
  ↓
Week 1: Execute Phase 2 (TUI vertical slice, 11 hrs) ← FIRST DOGFOODABLE
  ↓
Continue phases 3-12 per sequencing

Each phase: Review → Plan → Execute → Test → Verify → Merge
```

---

## Questions?

1. **\"Where do I start?\"** → 00-EXECUTIVE-SUMMARY.md
2. **\"What's the architecture?\"** → 00-AUTHORITY-ARCHITECTURE.md
3. **\"What can I do right now?\"** → 05-PHASE-3-MODEL-SELECTION.md
4. **\"What are the rules?\"** → 17-GOVERNANCE-QUALITY-GATES.md
5. **\"Which phase is blocking my work?\"** → Your phase document → \"Next phase:\" link

---

**Authority:** Master plan 2026-05-25 codebase audit + verified implementation status.

Generated: 2026-05-25  
Updated: Ongoing per phase completion
