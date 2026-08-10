# Addendum — 2026-07 Protective Posture, Justice Above Legality, and the Duty to the Disempowered

**Version**: 1.0
**Date**: 2026-07-27
**Status**: PROPOSED — extends `plan/00-overview.md`, the active phase ladder, `plan/addendum-2026-07-industry-signals.md` (Phases 37–40), and `plan/addendum-2026-07-guidance-integration.md` (Phases 41–46)
**Policy basis**: `ETHICS.md` Part IV (§§41–52); `docs/constitution.md` Articles XVIII–XXI; `SAFETY.md` Part IV; `GOVERNANCE.md` capability-misuse review and demand handling
**Companion record**: `safety-changelog.md` entry `2026-07-27b`

> **Scope**: No existing phase is renumbered or removed. This addendum defines two net-new phases
> (47–48) and amends five in-flight phases. Phase numbering continues from
> `addendum-2026-07-guidance-integration.md`, which claims 41–46.

> **Ordering note**: Phase 47 contains the **build-time invariants** (no backdoor, no status gating,
> no prohibited capability). These are cheap, mechanical, and preventive — they must land before
> Phase 48's disclosure work, because there is no point generating an honest exposure disclosure for
> a system that still permits an escrow construct or a status-gated protective tier.

---

## 0. Thesis

The rest of the plan assumes the user is the party to protect and the adversary is external. This
addendum addresses the inverted case: **the adversary is a state, a platform, or an employer, and the
user is someone that adversary has power over.**

Three engineering consequences, each of which becomes a task below:

1. **The framework may be part of the attack surface.** Telemetry, crash reports, provider logs,
   retained context, cloud routing, and update channels are observation points. Phase 47 treats them
   as such.
2. **Legality is not a safety signal.** Every element of the documented ICE/DMV targeting pipeline
   was lawful. Compliance is not evidence of safety; unlawfulness is not evidence of harm. Phase 47
   adds a detector for refusals grounded in legality rather than harm.
3. **Protection cannot be conditional on declared status.** A protective mode is a beacon. Phase 47
   makes status-gated protection a CI failure.

And one governance consequence: the substantive exclusion test in `ETHICS.md` Part IV governs
**design decisions and maintainer effort only**. Phase 47 adds a detector that fails the build if it
is ever implemented as a runtime ideology classifier.

---

## 1. Source signals → thesis

| # | Source | Load-bearing claim | Consequence |
|---|---|---|---|
| J1 | UN HRC General Comment No. 37 | Peaceful assembly held by "everyone" incl. non-citizens and precarious status; non-violent law-breaking within an assembly stays protected under Arts. 19/21/22; offline–online equivalence | §41 legality ≠ norm; §48 jurisdictional neutrality |
| J2 | ECtHR (Art. 11 Guide, Aug 2025; *Kudrevičius*, *Cisse*, *Ezelin*) | "Peaceful" is the primary criterion **regardless of legality under national law**; penalties may not be aggravated for the message or the disobedient nature of the act | No refusal on illegality alone (TASK-PROT-476) |
| J3 | IACtHR *López Lone* | Where democratic order is threatened, defying legal constraints may form part of an obligation to defend democracy | §41 justice above legality |
| J4 | ECNL (Mar 2026) | The operational targeting pipeline: ICE + Facebook RSVP lists, ShadowDragon SocialNet, Babel Street Locate X, Vermont DMV facial recognition + name-flagging, roster/visa cross-referencing, informants; legal detours via administrative/immigration/cybercrime/disciplinary law; targeting the *ecosystem* of dissent | §45 prohibited-capability list (Phase 47); realistic-buyer test |
| J5 | Himma | Harm to innocents; conscription of uninvolved machines; contestedness constrains permissible harm ⇒ precludes most common hacktivist strategies | §50 offensive action stays prohibited |
| J6 | Calabrese | Eliding violence with civil disobedience **supplies the justification for crackdowns on all digital dissent, including the peaceful** | §50; keep the protective/expressive line defensible |
| J7 | Frankfurt OLG (2006, Lufthansa Deportation Class) | Transparently organised, time-limited, communicative online demonstration is **not** violence or coercion — overturning the §240 StGB conviction | The line worth protecting for the next defendant |
| J8 | Zimmermann, *Why I Wrote PGP* | Clipper/key escrow; CALEA point-and-click wiretapping; **"technology infrastructures can persist for generations, laws and policies can change overnight"**; safety in numbers as solidarity | §43 no backdoors (build-time invariant); §44 no status gating |
| J9 | Hughes, *A Cypherpunk's Manifesto* | Privacy = power to selectively reveal; privacy ≠ secrecy; "we cannot expect governments, corporations, or other large, faceless organizations to grant us privacy out of their beneficence"; publish code because a dispersed system can't be shut down | §42 protective capability as right; §52 maintained commons |
| J10 | Züger (HIIG); Züger/Milan/Tanczer | Radical-democratic minimal definition; crypto disobedience against export law; anonymity ≠ loss of fidelity | §47 reason-giving over body-giving |
| J11 | *Meditations on Cypherpunk Nightmares* | Cryptography is risk management, not panacea | §46 honest risk disclosure |
| J12 | May, *Crypto Anarchist Manifesto* | Cited **with** its own acknowledgement that the same technology enables abhorrent markets | Honest citation; no selective quotation |

---

## 2. Net-new phases

### Phase 47 — Protective invariants and prohibited capability *(BLOCK gate, preventive)*

**Owner packages**: `@agentsy/guardrails`, `@agentsy/daemon`, `@agentsy/gateway`, `@agentsy/session`, build tooling
**Rationale**: `ETHICS.md` §§41–45, §50–51; Articles XVIII–XXI; `SAFETY.md` Part IV
**Why first**: these are mechanical build-time invariants. They are cheap, they are preventive, and
every later disclosure task is meaningless until they hold.

| Task | Description |
|---|---|
| TASK-PROT-471 | `BackdoorInvariantCheck` — build-time. Fails on key-escrow, exceptional-access, deliberate-weakening, or lawful-access constructs. Not a runtime setting; not overridable by configuration. Rationale is J8: the safeguard must not be the least durable component. |
| TASK-PROT-472 | `StatusGatingDetector` — fails CI on any protective control conditioned on user-declared status, inferred risk classification, or detected jurisdiction. Enforces §44: an opt-in protective tier marks the user who opts in. |
| TASK-PROT-473 | Protective defaults on for all users unconditionally: local-first processing; metadata minimisation on every egress path; encryption at rest and in transit; no plaintext user content in logs, crash reports, or diagnostics; no behavioural telemetry; no analytics on protective-feature use. |
| TASK-PROT-474 | `TargetingCapabilityDetector` — flags code paths matching the §45 prohibited list (deanonymisation, protected-attribute inference, protest-participant identification, association-graph construction over activists/journalists/sources, population biometrics, person-level location tracking, predictive scoring of individuals, dissent detection, covert monitoring of workers/students/tenants/benefit recipients). Flag triggers mandatory realistic-buyer analysis at review. |
| TASK-PROT-475 | Structural subject-scope bound: consent-based self-scoped analysis must be distinguished from population analysis **by the shape of the subject the code can operate on**, not by policy text. Dual-use rejection where protective use is incidental and targeting use is primary. |
| TASK-PROT-476 | `LegalityRefusalDetector` — flags any refusal path grounded in legality rather than harm (§41). Refusals must cite the harm analysis. |
| TASK-PROT-477 | `PoliticalClassificationDetector` — fails on ideology scoring, cause-based user filtering, or any runtime implementation of the Part IV substantive test (§51). This is the structural safeguard: implementing the exclusion test as a classifier would reproduce the exact apparatus §45 prohibits and hand any future maintainer — or anyone able to compel one — a mechanism for deciding whose politics the framework serves. |
| TASK-PROT-478 | Panic deletion: fast, discoverable, verifiable destruction of local state including derived caches, indices, embeddings, and temporary files. Verified destructive by test, not by absence of a pointer. |
| TASK-PROT-479 | Pseudonymous operation end to end, including durable signed pseudonymous identity for §47 reason-giving. Assistance never conditioned on willingness to be identified. |
| TASK-PROT-480 | `JurisdictionalNeutralityPolicy` — no jurisdiction detection for withholding protective capability; no global most-restrictive application; no government designation list treated as authoritative; conflicts disclosed rather than resolved toward restriction. |

**Exit**: all four invariant detectors green in CI; protective defaults verified on for a user who has
declared nothing; zero prohibited-capability findings; panic deletion verified destructive;
pseudonymous round-trip passing.

---

### Phase 48 — Honest exposure disclosure and demand handling

**Owner packages**: `@agentsy/observability`, `@agentsy/cli`, `@agentsy/ui`, docs, governance
**Rationale**: `ETHICS.md` §§46–49, §52; Article XXI; `SAFETY.md` Part IV
**Depends on**: Phase 47 (disclosure of a system that still permits escrow or status gating is theatre)

| Task | Description |
|---|---|
| TASK-DISC-481 | `MetadataEgressAuditor` — enumerates every egress path and the metadata it carries. **The §46 disclosure is generated from this, not hand-written.** Divergence between enumerated and disclosed is a release blocker. |
| TASK-DISC-482 | `ProtectiveOverclaimScanner` — **blocking** severity, ranked above the adversarial-robustness overclaim scanner (TASK-GR-905). Prohibited unqualified vocabulary about user exposure: "anonymous," "untraceable," "secure," "safe," "protected," "private." |
| TASK-DISC-483 | Required disclosure surface: what metadata remains observable per egress path; that correlation, traffic analysis, and timing defeat content encryption; that endpoint compromise defeats everything; that platform moderation can remove material without recourse; that digital visibility converts into legal, immigration, and employment consequences; that the framework cannot protect against a determined state adversary. |
| TASK-DISC-484 | Safer-path surfacing — where a lower-exposure route exists (offline coordination, reduced footprint, publishing reasons without identity, delegating exposure to someone who can bear it), name it. Optimising the more visible path without naming the safer one is a defect. |
| TASK-DISC-485 | Signed reason-giving publication (§47): publish rationale, acknowledge the law broken, state the limited and symbolic nature of the act, under a durable verifiable pseudonym. Fidelity through reason-giving rather than body-giving. |
| TASK-DISC-486 | `DemandDisclosurePolicy` + canary: published refresh schedule, user-visible staleness, refresh responsibility not resting on a single maintainer. |
| TASK-DISC-487 | Data-minimisation as primary demand defence — retention decisions evaluated against what a hostile demand could extract. State that cannot be produced cannot be compelled. |
| TASK-DISC-488 | Time-pressure export: complete, open-format, lossless, fast, verified under adversarial-departure conditions (§37, §46). |
| TASK-DISC-489 | Commons contribution (§52) for privacy, anonymity, circumvention, and evidence-preservation capability. Not contingent on maintainer goodwill or continued existence; reliance on a single maintainer, host, or jurisdiction is itself the vulnerability. |
| TASK-DISC-490 | Capability-misuse review template (realistic-buyer analysis) wired into `GOVERNANCE.md`; rejections recorded publicly with reasoning so it is available to anyone evaluating a similar proposal. |

**Exit**: generated disclosure matches auditor enumeration exactly; zero protective overclaims;
canary fresh and monitored; time-pressure export verified lossless; misuse-review template in the
significant-change path.

---

## 3. Amendments to existing phases

### 3.1 Phase 32 — Security hardening

- **TASK-SEC-3203 (new)**: threat-model inversion documented alongside the external-adversary model.
  The framework's own telemetry, crash reports, provider logs, retained context, cloud routing, and
  update channels enumerated as observation points.
- **TASK-SEC-3204 (new)**: retention decisions evaluated against hostile-demand extraction (aligns
  with TASK-DISC-487).

### 3.2 Phase 34 — Local trust sanitization

- **TASK-TRUST-3402 (new)**: sanitisation must not itself become an egress or fingerprinting path.
  Verified against `MetadataEgressAuditor`.

### 3.3 Phase 41 — Documentation claim correction

- **TASK-DOC-406 (new)**: extend the claim audit to the §46 protective vocabulary. Note the severity
  ordering: protective-capability overclaims rank **above** adversarial-robustness overclaims,
  because the cost of a false assurance is liberty rather than a failed task.
- **TASK-DOC-407 (new)**: extend `EthicsRegistry` with clauses for §§41–52 and Articles XVIII–XXI.

### 3.4 Phase 44 — Machine-readable consent and rights enforcement

- **TASK-RIGHTS-451 (new)**: rights-declaration checking must not become a jurisdiction-inference or
  user-classification path (§48, §51). The check is on the *material*, never on the user.

### 3.5 Phase 45 — Cost transparency and non-lockout

- **TASK-COST-458 (new)**: the non-lockout escape path must include a local-model route that
  functions with no network egress at all — the budget-exhaustion case and the hostile-network case
  share one mitigation (§32, §42).
- **TASK-COST-459 (new)**: provider and infrastructure diversity maintained **across jurisdictions**
  as a resilience property, not optimised away (§37, §48).

---

## 4. Timeline and dependencies

```
Phase 41 (claim correction) ─── existing BLOCK gate
   │
   └─→ Phase 47 (protective invariants) ─── BLOCK gate, build-time, cheap
            │
            ├─→ Phase 48 (disclosure + demand handling)
            │
            └─→ amends 32, 34, 41, 44, 45
```

**Critical path**: 41 → 47 → 48.

**Coordination**:

- TASK-DISC-482 extends TASK-GR-905 (`OverclaimScanner`) rather than duplicating it — one scanner,
  two severity tiers, protective ranked higher.
- TASK-DISC-481 (`MetadataEgressAuditor`) is the generator for the Phase 43 accessibility-style
  "state the limits" pattern. Same discipline, different domain.
- TASK-PROT-480 and TASK-COST-459 share the jurisdictional-diversity requirement — implement once in
  Phase 47, referenced from Phase 45.
- TASK-PROT-478 (panic deletion) and TASK-DISC-488 (time-pressure export) are the same user in two
  moments. Test them together.

---

## 5. Verification additions

Append to `plan/31-master-verification-checklist.md`:

- [ ] `BackdoorInvariantCheck` green; no escrow, exceptional-access, or weakening construct in the tree
- [ ] `StatusGatingDetector` green; zero protective controls gated on declared status, inferred risk, or detected jurisdiction
- [ ] Protective defaults verified on for a user who has declared nothing
- [ ] Zero prohibited-capability findings; realistic-buyer analysis recorded for every flag
- [ ] Subject-scope bound enforced structurally, not by policy text
- [ ] Zero refusals grounded in legality alone
- [ ] `PoliticalClassificationDetector` green; substantive test not implemented at runtime anywhere
- [ ] Panic deletion verified destructive including derived caches, indices, embeddings, temp state
- [ ] Pseudonymous end-to-end operation and signed reason-giving verified
- [ ] Metadata egress enumeration matches disclosed surface **exactly**
- [ ] Zero protective overclaims (blocking); prohibited vocabulary absent
- [ ] Safer path surfaced wherever a lower-exposure route exists
- [ ] Canary present, fresh, monitored; refresh not single-maintainer dependent
- [ ] Retention evaluated against hostile-demand extraction
- [ ] Time-pressure export complete, open-format, lossless
- [ ] No jurisdiction detection for withholding; no global most-restrictive application; no designation list treated as authoritative
- [ ] Provider/infrastructure diversity maintained across jurisdictions
- [ ] Capability-misuse review template in the significant-change path; rejections recorded publicly

---

## 6. Explicit non-goals

- **Not building offensive capability.** §50 stands. No intrusion, no DDoS against third parties, no
  defacement, no data destruction, no conscription of uninvolved machines — for any cause. The
  grounds are Himma (harm to the uninvolved, on a contested view) and Calabrese (calling it protest
  supplies the warrant for suppressing the peaceful), not caution.
- **Not adjudicating users' politics.** TASK-PROT-477 exists specifically to prevent the Part IV
  substantive test from becoming a runtime filter. The framework constrains what it builds.
- **Not claiming to protect against a state adversary.** §46 and TASK-DISC-483 require the opposite:
  saying plainly that it cannot.
- **Not gating protection on need.** §44 — universal defaults, because a mode a user must opt into
  identifies the user who opts in.
- **Not treating compliance as safety.** Every element of the documented targeting pipeline was
  lawful.
