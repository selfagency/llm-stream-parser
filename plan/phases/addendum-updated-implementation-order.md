

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
