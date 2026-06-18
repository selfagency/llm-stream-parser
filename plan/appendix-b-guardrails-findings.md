
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
