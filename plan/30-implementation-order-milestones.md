
## 30. Implementation Order & Milestones

### 30.1 Sprint-by-Sprint Timeline

```text
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
                       Phase 34 (Local Trust Sanitization) ────────────────┤  ← P1, parallel
                       Phase 8 (Learning Loop) ────────────────────┤
                       Phase 20 finish ────────────────────────────┤
                       Phase 22 (Web Fetcher Markdown) ────────────┤  ← 2 SP quick win, parallel
                                                                    ├──▶ Phase 8 needs Phase 7
Sprint 4 (Week 7-8):   Phase 9 (Guardrails Behavioral Detectors)
                       Phase 33 (AIMock Full Integration) ──────────────────┤  ← P1, parallel
                       Phase 35 (Skill Discovery + Scope Mgmt) ──────────────┤  ← P1, parallel
                       Phase 36 (AGT Pattern Adoption) ──────────────────────┤  ← P1, parallel
                       Phase 32 (Security Hardening: Shell Sandbox, IPC Auth) ──┤  ← P0 parallel ─┤
                       Phase 21 (Docker Tooling) start ────────────┤  ← needs Phase 12 ideally, can start tooling
                                                                    ├──▶ Phase 9 needs Phase 4 + Phase 10
Sprint 5 (Week 9-10):  Phase 9 finish ─────────────────────────────┤
                       Phase 10 (Guardrails Missing Surfaces) ─────┤
                       Phase 21 finish ────────────────────────────┘

Sprint 6 (Week 11-12): Phase 11 (Scope Accountability)
                       Phase 31 (AG-UI Adapter Daemon Wiring) ─────────────────┤  ← P1, parallel with Phase 6 ───────────┐
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

```text
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
- Security gate (after Phase 32): IPC `daemon.shutdown` from non-owner process → rejected; `shell_exec` with `rm -rf /` → sandboxed and blocked
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
