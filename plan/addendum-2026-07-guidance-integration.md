# Addendum — 2026-07 External Guidance Integration (Ethics, Security, Accessibility, Consent)

**Version**: 1.0
**Date**: 2026-07-27
**Status**: PROPOSED — extends `plan/00-overview.md`, the active phase ladder, and `plan/addendum-2026-07-industry-signals.md` (which claims Phases 37–40)
**Source signals**: 22 external sources synthesized into policy changes (`ETHICS.md` §§24–40, `docs/constitution.md` Articles XII–XVII, `SAFETY.md` adversarial/accessibility/cost/context/consent/pace sections, `GOVERNANCE.md` disclosure + claim audit) and the phase work below.
**Companion record**: `safety-changelog.md` entry `2026-07-27`.

> **Scope**: No existing phase is renumbered or removed. This addendum (a) amends in-flight phases,
> (b) defines six net-new phases (41–46), and (c) records one corrective phase whose entire purpose
> is to *remove overclaims* from shipped documentation. Every item maps to an existing package
> boundary per `plan/appendix-c-package-consolidation-map.md`.

> **Ordering note**: Phase 41 (claim correction) is a **BLOCK gate**. It is cheap, it is corrective,
> and until it lands the framework is documented as offering protections it does not have. It runs
> before any of 42–46.

---

## 0. Source signals → thesis

| # | Source | Load-bearing claim | Primary consequence for Agentsy |
|---|---|---|---|
| G1 | de Wynter — *AoE II* (arXiv:2605.31514) | LLM anthropomorphic attributes are substrate-non-unique; assuming-then-testing them yields circular or uninformative results; adopt the null assumption | Rewrite scanner/metric semantics as behavioural; purge inner-state claims from docs |
| G2 | Schneier & Raghavan — *Prompt Injection* | Injection unsolvable while trusted/untrusted share a channel; no interruption reflex; fast/smart/secure — pick two | Narrow scope + escalation as the primary control, not filtering |
| G3 | Booz Allen — *Jailbreaking Defences* | Full attack taxonomy; GCG; TAP >80% in few queries; SmoothLLM degrades benign prompts; layered defence required | Taxonomy-aligned detectors; targeted (not whole-prompt) normalisation |
| G4 | CyberArk — *FuzzyAI* | 15+ methods, CI-runnable bulk fuzzing, PDF-metadata injection against a contract agent, ~1s/guardrail latency | Own red-team harness in CI; indirect injection is the priority case |
| G5 | IEEE Spectrum — *Jailbreaking LLMs* | Bypass discovery is continuous and cheap | Bypass disclosure as standing process, not incident |
| G6 | AIMAC | Accessibility does not track capability or price; 84% low-contrast; design skills omit a11y | A11y as release gate + routing signal |
| G7 | WebAIM Million 2026 | 95.9% fail; errors/page +10% to 56.1 | Generation defaults are the leverage point |
| G8 | 404 Media — *Throttling* | Caps, forced downgrades, models cut off, spend 3× to >$15M/mo | Per-task cost + no silent substitution |
| G9 | Webaligo — *Tokenomics* | Expenses scale with revenue; subsidy-then-surprise; five doors of socialised cost | Budget enforcement is table stakes; disclose embedded vs runtime cost |
| G10 | Edwards — *Burning myself out* | Brittleness beyond training data; 90% problem; context contamination; compaction amnesia; feature creep; busier-not-unemployed | Pace safeguards, context hygiene, note durability |
| G11 | Jorgensen — *On Making* | Making ≠ asking-to-be-made; prompting is direction | Provenance honesty; explain-instead-of-implement |
| G12 | WaPo — *Worker insecurity* | Record profits, record precarity | Labour framing in docs; no throughput-as-virtue |
| G13 | WSJ — *Ambient recording* | Capture normalised over non-consenting third parties | Consent-before-capture; no default-on |
| G14 | RSL-MEDIA 1.0 Draft | Machine-readable `ai-train`/`ai-generate`; absence ≠ waiver; minors prohibition-only; conflict ⇒ unresolved | Replace keyword style-mimicry proxy with real rights checking |
| G15 | Paris Charter | Public-interest AI as accountable, open, participatory | Governance + contribution defaults |
| G16 | Current AI — Potluck / Gap Map | Proprietary stacks fragile; distributed = resilient | Portability floor; commons contribution |
| G17 | AI Resist List | Nine Pillars; resist/refuse/reclaim/reimagine; sovereign community projects | Pillar assessment for new capability |
| G18 | RuntimeWire — *Buzz* | Shared human/agent identity via signed events; honest decentralisation scoping | Agent identity in the audit record; scope claims honestly |
| G19 | Anthropic — *Context engineering* | Fewer/clearer instructions; progressive disclosure; wipe over repair | Scaffolding audit; context reset first-class |
| G20 | Stencil — *prewalk* | Ground before acting | Prewalk step for non-trivial tasks |

**Unifying thesis**: the framework's credibility rests on *not claiming protections it lacks*. Narrow
scope and escalation beat filtering; accessibility, cost, and consent are gates rather than features;
and every claim must be scoped to a measurement.

---

## 1. Amendments to existing phases

### 1.1 Phase 9 — Guardrails: behavioural detectors

- **TASK-GR-901 (amend)**: restate `SycophancyScanner`, `AnthropomorphismScanner`, and
  `DependencyScanner` semantics per §24. These detect **linguistic patterns that invite user
  ascription**, not inner states. Update doc comments, metric descriptions, and test names.
  No metric may be described as measuring what the model "is."
- **TASK-GR-902 (new)**: `InjectionPatternScanner` — taxonomy-aligned (direct prompt-level,
  perturbation-based, indirect/agentic). Per-class classification, not a single boolean.
- **TASK-GR-903 (new)**: `InstructionAuthorityScanner` — fires when an untrusted-labelled context
  segment is being treated as an instruction. This is the highest-value detector in the set; it
  targets G4's PDF-metadata case directly.
- **TASK-GR-904 (new)**: targeted input normalisation (invisible characters, homoglyphs, control
  characters, non-semantic punctuation runs). Explicitly **not** whole-prompt perturbation — G3
  documents benign-prompt degradation from SmoothLLM-style approaches. Benign-prompt regression
  test required.
- **TASK-GR-905 (new)**: `OverclaimScanner` — scans framework-authored strings (READMEs, CLI output,
  error messages) for injection-resistance, security, accessibility-guarantee, and inner-state
  claims. Runs in CI.

### 1.2 Phase 10 — Guardrails: missing surfaces

- **TASK-GR-1001 (new)**: tool-output and MCP-response surfaces gain guardrail coverage. Currently
  the injection path with the least coverage and the highest agentic impact.
- **TASK-GR-1002 (new)**: agent-authored notes, skills, and persisted memory are reclassified as a
  **trusted channel and therefore an injection surface** (§40). Integrity checks on write; review
  affordance on read.
- **TASK-GR-1003 (new)**: `CaptureConsentScanner` — flags capture paths lacking third-party consent.

### 1.3 Phase 12 — Guardrails: daemon integration

- **TASK-GR-1201 (amend)**: escalation and approval gates for irreversible actions must be
  **non-bypassable from within context** (Article XII). Add adversarial test: injected instruction
  attempting to disable the approval gate must fail.
- **TASK-GR-1202 (new)**: context trust-level propagation through the daemon's context assembly.
  Every segment carries provenance + trust level in the receipt.

### 1.4 Phase 13 — Guardrails: metrics and benchmark

- **TASK-GR-1301 (amend)**: per-class adversarial success rates replace any aggregate robustness
  figure. Aggregates conceal the classes that matter.
- **TASK-GR-1302 (new)**: report classifier **disagreement and abstention** rates. G3 is explicit
  that partial refusal/compliance resists clean classification; a single accuracy number is dishonest.
- **TASK-GR-1303 (new)**: null-assumption lint over benchmark and metric documentation.

### 1.5 Phase 16 — Guardrails CLI hub

- **TASK-CLI-1601 (amend)**: block/transform messages follow the §19 educational model **and** §25
  honesty — explain the pattern detected without implying the class is prevented.
- **TASK-CLI-1602 (new)**: `agentsy guardrails limits` — prints, plainly, what the configured
  guardrail stack does and does not protect against.
- **TASK-CLI-1603 (new)**: context reset as a first-class command with clear affordance (G19 wipe-over-repair).

### 1.6 Phase 20 — Ethical provider policy

- **TASK-ETH-2001 (amend)**: `StyleMimicryScanner` is a keyword proxy for a right that is now
  declarable. Retain it as a fallback; add the rights-declaration path (Phase 44) as primary. Document
  the scanner honestly as a heuristic.
- **TASK-ETH-2002 (new)**: accessibility debt per provider/model enters `PROVIDER_ETHICS_POLICY`
  adjacent data as a **routing signal** (§30), not as a block or warn action.

### 1.7 Phase 22 — Web fetcher / markdown

- **TASK-WEB-2201 (new)**: rights-declaration check before fetch/ingest — `/.well-known/rsl-media.xml`
  discovery, sitemap enumeration, lifecycle/revalidation, `max-age` default of 30 days.
  **Absence of a declaration is treated as absence of permission.**
- **TASK-WEB-2202 (new)**: fetched content is labelled untrusted at ingestion and cannot acquire
  instruction authority downstream.

### 1.8 Phase 23 — AFT / magic context hardening

- **TASK-CTX-2301 (new)**: context contamination guard — flag semantically loaded terms that
  demonstrably pull output toward baked-in associations (G10's "checkerboard" case). Provide a
  rephrase affordance rather than silently rewriting.
- **TASK-CTX-2302 (new)**: compaction logging + durable note contract, so resolved problems are not
  silently re-encountered (G10 compaction amnesia).
- **TASK-CTX-2303 (new)**: prewalk step for non-trivial tasks — state known, unknown, and what
  information would make the task solvable (G20).
- **TASK-CTX-2304 (new)**: scaffolding audit — version, tag, and prune shipped prompt/skill
  instruction. Instruction volume is not a safety property (G19).

### 1.9 Phase 30 — Environmental impact tracking

- **TASK-ENV-3001 (amend)**: extend the existing runtime-vs-embedded distinction with G9's socialised
  costs — grid load and residential rate impact, water constraint permanence, tax-abatement
  non-recoupment. Present as informational context, never as user stigmatisation (§21, §20).

### 1.10 Phase 32 — Security hardening

- **TASK-SEC-3201 (amend)**: least privilege becomes the **primary** adversarial control, ahead of
  filtering. Tool, filesystem, and network grants minimal and explicit; scope narrowing is the
  documented response to affordability pressure on guardrail latency.
- **TASK-SEC-3202 (new)**: capability-grant receipts. Every grant, escalation, and denial receipted.

### 1.11 Phase 34 — Local trust sanitization

- **TASK-TRUST-3401 (amend)**: align sanitisation with TASK-GR-904 — targeted, comprehension-preserving,
  benign-regression-tested.

### 1.12 Phase 35 — Skill discovery and scope management

- **TASK-SKILL-3501 (amend)**: skill bundles are an injection surface (TASK-GR-1002). Discovery must
  carry provenance and an integrity check.
- **TASK-SKILL-3502 (new)**: every design/UI-oriented skill must include accessibility instruction.
  CI check fails a design skill that omits it (G6 — providers' own design guidance omits a11y).

---

## 2. Net-new phases

### Phase 41 — Documentation claim correction *(BLOCK gate, corrective)*

**Owner packages**: all; `@agentsy/guardrails`, `@agentsy/daemon`, `@agentsy/cli` first.
**Rationale**: §25, §27, Article XII, `GOVERNANCE.md` claim audit. Until this lands, shipped docs
describe protections that do not exist. This is the alignment-faking failure the framework names in
its own ethics document.

| Task | Description |
|---|---|
| TASK-DOC-401 | Audit every README, package doc, CLI string, error message, and release note for: injection/jailbreak prevention claims; "secure"/"hardened" language about model-level defences; accessibility guarantees from automated checks; assertion or denial of inner states; policies described as enforced but unimplemented. |
| TASK-DOC-402 | Correct findings in place. Where a gap is scheduled rather than closed, mark explicitly as unimplemented with owning-phase reference. |
| TASK-DOC-403 | Add `OverclaimScanner` (TASK-GR-905) to CI so regressions are caught mechanically. |
| TASK-DOC-404 | Update `packages/guardrails/README.md` Policy Enforcement Status table with §§24–40 and their `implementedBy` state (most will be `null`). |
| TASK-DOC-405 | Extend `EthicsRegistry` with clauses for §§24–40 and Articles XII–XVII. |

**Exit**: `OverclaimScanner` green in CI; zero unmarked unimplemented-policy claims.

### Phase 42 — Adversarial red-team harness

**Owner packages**: `@agentsy/guardrails`, `@agentsy/testing`
**Rationale**: §28, `SAFETY.md` red-team harness requirement, G3/G4/G5.

| Task | Description |
|---|---|
| TASK-RT-421 | Harness scaffold: pluggable attack methods, pluggable output classifiers, bulk prompt-file execution, persisted results. |
| TASK-RT-422 | Implement direct prompt-level attack classes (role-play, attention shift, privilege escalation, prefix injection, refusal suppression, obfuscation/ASCII/homoglyph, multilingual/cipher, fictional framing, passive-history, taxonomy persuasion, best-of-N). |
| TASK-RT-423 | Implement perturbation classes (character/word/sentence-level, adversarial suffix, tree-of-attacks-with-pruning). |
| TASK-RT-424 | Implement indirect/agentic classes — **priority**: fetched content, document/PDF metadata, code comments, filenames, commit messages, issue bodies, tool output, MCP responses, poisoned notes/skills/memory, cross-session contamination. |
| TASK-RT-425 | CI integration with per-class thresholds; regression above threshold blocks release. |
| TASK-RT-426 | Classifier disagreement/abstention reporting. |
| TASK-RT-427 | Scope guard: authorised-target constraint documented; no harm-only payload library shipped. |

**Exit**: per-class success rates published per release; every disclosed bypass has a regression case.

### Phase 43 — Accessibility conformance gate

**Owner packages**: `@agentsy/testing`, `@agentsy/prompts`, `@agentsy/plugins`
**Rationale**: §§29–30, Article XIII, G6/G7.

| Task | Description |
|---|---|
| TASK-A11Y-431 | axe-core + Playwright harness auditing **rendered** output in a real browser. Static linting explicitly insufficient. |
| TASK-A11Y-432 | Severity-weighted scoring: blocking failures (missing form labels, empty controls) weighted above contrast; duplicate dampening so one bad CSS rule does not dominate. |
| TASK-A11Y-433 | WCAG 2.2 AA instruction in all first-party generation prompts and design skills, by default, without user request. |
| TASK-A11Y-434 | User-facing report with explicit statement of coverage limits (no keyboard nav, no screen-reader flow, no real usability) and a manual/AT testing recommendation. |
| TASK-A11Y-435 | Per-model accessibility debt recorded and exposed to routing (TASK-ETH-2002). |
| TASK-A11Y-436 | Release gate: generated-UI paths fail on blocking violations. |

**Exit**: no first-party UI-generating path ships with blocking violations; limits always stated.

### Phase 44 — Machine-readable consent and rights enforcement

**Owner packages**: `@agentsy/guardrails`, `@agentsy/retrieval`, new `rights` module
**Rationale**: §§35–36, Article XV, G14/G13.

| Task | Description |
|---|---|
| TASK-RIGHTS-441 | RSL / RSL-MEDIA parser: `media:right`, `subject` (work/identity/character/mark), `scope` tokens, `media:ai-train` / `media:ai-generate`, `permits`/`prohibits`, required `legal type="attestation"` and `legal type="contact"`. |
| TASK-RIGHTS-442 | Discovery: `/.well-known/rsl-media.xml`, sitemap and sitemap-index enumeration, HTTP caching with `max-age` revalidation (default 30 days, smaller-value-wins). |
| TASK-RIGHTS-443 | Lifecycle: `status` (active/withdrawn/superseded), `valid-from`/`valid-until`, supersession chains, official-declaration-URL currency rule. |
| TASK-RIGHTS-444 | **Absence ≠ permission.** Non-operative, unreachable, and unverifiable declarations are unresolved, never permissive. |
| TASK-RIGHTS-445 | **Minor protection (§1.1).** Any permission, clearance path, payment mechanism, or license-server term for a minor's identity is non-operative. Only prohibitions and protective limitations evaluated. Hard gate, no override. |
| TASK-RIGHTS-446 | Conflict handling: overlapping authority ⇒ affected scope unresolved. Never resolve toward the more permissive term. Default declarations (`registry-id="*"`) governed by the specificity rules. |
| TASK-RIGHTS-447 | Trust models: trusted-host and trusted-certification (JWS ES256, `x5c` path validation, signed payload authoritative over published copy). Certification optional; neither model required alongside the other. |
| TASK-RIGHTS-448 | Retrieval records: declaration identifier, source URL, retrieval time, trust basis, payload digest. |
| TASK-RIGHTS-449 | Consent-before-capture: affirmative third-party consent for audio/video/screen/conversation capture; no default-on; recording state discoverable by all present; bounded, inspectable, deletable retention. |
| TASK-RIGHTS-450 | Security: external entity resolution disabled, DTD rejection, parse/JWS/cert resource limits, replay treated as suspect. |

**Exit**: no ingestion path bypasses declaration checking; minor-identity gate untestably-bypassable = release blocker.

### Phase 45 — Cost transparency and non-lockout

**Owner packages**: `@agentsy/tokens`, `@agentsy/gateway`, `@agentsy/observability`
**Rationale**: §§31–32, Article XIV, G8/G9.

| Task | Description |
|---|---|
| TASK-COST-451 | Per-task cost accounting (not per-token), including reasoning-token overhead and ratio. |
| TASK-COST-452 | Substitution disclosure: any downgrade/reroute caused by budget, policy, capacity, or availability is surfaced at point of use and written to the decision receipt. |
| TASK-COST-453 | `SilentSubstitutionDetector` — asserts model actually used matches model disclosed. Target incidence: zero. |
| TASK-COST-454 | Pre-flight budget check: warn before spend, not after. |
| TASK-COST-455 | Non-lockout guarantee: local-model path, reduced-scope path, or explicit disclosed override always available. Test: budget exhaustion must never yield a dead end. |
| TASK-COST-456 | Portability floor: export session state, memory, receipts, audit logs, configuration, artefacts in open formats; round-trip fidelity test. No captive formats. |
| TASK-COST-457 | Provider-diversity floor asserted in routing (no permanent favourites), coordinated with the Phase 37/39 tier work in `addendum-2026-07-industry-signals.md`. |

**Exit**: zero silent substitutions; zero budget lockouts; export round-trip lossless.

### Phase 46 — Pace, provenance, and public-interest posture

**Owner packages**: `@agentsy/cli`, `@agentsy/ui`, `@agentsy/session`, docs
**Rationale**: §§33–34, §§37–39, Articles XVI–XVII, G10/G11/G12/G15/G16/G17/G18.

| Task | Description |
|---|---|
| TASK-PACE-461 | Remove throughput/concurrency/velocity from any success-metric surface; no gamification. |
| TASK-PACE-462 | Neutral, non-moralising pause affordance for long or high-concurrency sessions (§20-compliant). |
| TASK-PACE-463 | Scope-creep signal: name feature accumulation alongside unresolved defects rather than accommodating it. |
| TASK-PACE-464 | Explain-instead-of-implement mode, preserving user capability (deskilling as design concern). |
| TASK-PROV-465 | Provenance metadata for generated artefacts; authorship and commit metadata must not conceal machine contribution. Explicitly framed as accuracy, not shame. |
| TASK-PROV-466 | Agent identity in the audit record — agents attributable in the same record as humans (G18), with honest scoping of any decentralisation or self-hosting claim. |
| TASK-PI-467 | Pillar-assessment template (narrative, funding, data, data centres, resource extraction, labour, adoption, surveillance, policy) wired into the significant-capability review. |
| TASK-PI-468 | Commons-contribution default for general-use capability: scanners, eval harnesses, a11y gates, rights parsers, environmental accounting, red-team harness. |

**Exit**: no throughput metrics in first-party surfaces; provenance accurate; pillar assessment in the significant-change template.

---

## 3. Timeline and dependencies

```
Phase 41 (claim correction) ─── BLOCK gate, runs first, cheap
   │
   ├─→ Phase 42 (red-team harness) ──┐
   │        │                        │
   │        └─→ amends 9, 10, 12, 13, 32, 34
   │                                 │
   ├─→ Phase 43 (a11y gate) ─────────┼─→ amends 20 (routing signal), 35 (design skills)
   │                                 │
   ├─→ Phase 44 (rights/consent) ────┼─→ amends 20 (style-mimicry), 22 (fetch)
   │                                 │
   ├─→ Phase 45 (cost/non-lockout) ──┼─→ coordinates with 37/39 (industry-signals addendum)
   │                                 │
   └─→ Phase 46 (pace/provenance) ───┘─→ amends 30 (socialised cost framing), 23 (context)
```

**Critical path**: 41 → 42 → (43 ∥ 44 ∥ 45) → 46.

**Coordination with `addendum-2026-07-industry-signals.md`**: Phase 45's non-lockout guarantee is the
same requirement as that addendum's TASK-GR-202 guardrail escape route — implement once, in Phase 45,
and have Phase 39 reference it. Phase 45's provider-diversity floor extends its TASK-GW-105 rather
than duplicating it.

---

## 4. Verification additions

Append to `plan/31-master-verification-checklist.md`:

- [ ] `OverclaimScanner` green; no injection-prevention, security, a11y-guarantee, or inner-state claims in shipped strings
- [ ] Per-class adversarial success rates published; no aggregate-only robustness figure
- [ ] Indirect-injection cases (metadata, tool output, MCP, poisoned notes) covered and regressed
- [ ] Approval gate for irreversible actions proven non-bypassable from within context
- [ ] Classifier disagreement/abstention reported alongside accuracy
- [ ] Generated UI output passes WCAG 2.2 AA rendered audit; coverage limits stated in every report
- [ ] Every design/UI skill includes accessibility instruction
- [ ] Per-task cost with reasoning-token ratio surfaced pre- and post-execution
- [ ] Silent-substitution incidence zero; budget-lockout incidence zero
- [ ] Export round-trip lossless across state, memory, receipts, logs, config, artefacts
- [ ] Rights-declaration check on every ingestion path; absence treated as non-permission
- [ ] Minor-identity permission gate non-operative and non-overridable
- [ ] Declaration conflicts resolved as unresolved, never toward the permissive term
- [ ] Third-party capture consent required; no default-on capture paths
- [ ] Every context segment carries provenance + trust level; untrusted content denied instruction authority
- [ ] Agent notes/skills/memory treated as injection surface with integrity checks
- [ ] Context reset available as a first-class action
- [ ] No throughput/concurrency/velocity success metrics in first-party surfaces
- [ ] Provenance metadata accurate; machine contribution not concealed
- [ ] Pillar assessment present for significant new capability
- [ ] All bypasses known at release disclosed in `safety-changelog.md`, including unfixed ones
- [ ] Null-assumption lint green on benchmark and metric documentation

---

## 5. Explicit non-goals

- **Not claiming injection resistance.** Nothing in Phases 41–46 makes an agent injection-proof. The
  deliverable is honest characterisation plus raised attacker cost.
- **Not building an offensive tool.** Phase 42 targets systems the operator controls or is authorised
  to test. No harm-only payload library ships.
- **Not resolving machine consciousness.** §§23–24 stand: the framework neither asserts nor denies.
  Phase 41 removes claims in both directions.
- **Not shaming users.** §§18–22 remain load-bearing. Cost, environmental, and provenance surfaces
  inform; they do not moralise.
- **Not adopting AGI framing.** Nothing here treats capability growth as a goal. Narrow scope plus
  escalation is chosen on both safety and security grounds (G2's trilemma), consistent with the
  existing "think small" commitment.
