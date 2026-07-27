# Safety and Ethics Changelog

This file tracks changes to the agentsy framework's safety and ethics posture.
Per GOVERNANCE.md §Policy versioning, changes to ETHICS.md, SAFETY.md,
GOVERNANCE.md, and docs/constitution.md are logged here.

## 2026-06-18 — Phase 20: Ethical Provider & Content Policy

**Summary**: Implemented five ethical restrictions as enforceable policy: hard-block xAI/Grok, warn-and-acknowledge for Meta/OpenAI/Microsoft/Google/Amazon, hard-block style-mimicry prompts, remove Telegram connector, and track environmental impact.

**Changes**:

- Created `PROVIDER_ETHICS_POLICY` in `packages/guardrails/src/ethics/provider-policy.ts` with 6 entries (1 block + 5 warn). Each entry includes provider ID, action, reason, and source URLs.
- Created `isProviderBlocked()`, `requiresAcknowledgement()`, `getProviderEthicsPolicy()` lookup helpers.
- Created `StyleMimicryScanner` in `packages/guardrails/src/scanners/style-mimicry.ts` — blocks prompts requesting creation "in the style of" a specific named living creator for writing, imagery, and audio/video. Passes historical figures (Shakespeare, Van Gogh, etc.) and technique-only prompts.
- Wired `PROVIDER_ETHICS_POLICY` into the daemon's `RoutingService` via a `ProviderEthicsPolicyHook` that removes blocked providers and flags warn-listed providers for per-session acknowledgement.
- Added `@agentsy/guardrails` as a dependency of `@agentsy/daemon`.
- Deleted `packages/daemon/src/connectors/telegram.ts` — Telegram connector stub removed.
- Removed `telegram` from `DaemonConfigSchema.connectors`, `ConnectorHostDeps.config`, `connectors/index.ts` exports, and CLI `connectors list` command.
- Added §12–§16 to `ETHICS.md` (xAI block, provider warnings, style-mimicry block, Telegram removal, environmental impact tracking).
- Updated `EthicsRegistry` with 5 new clauses for §12–§16, all with `implementedBy` fields populated.
- 47 new tests (22 provider-policy + 25 style-mimicry).

**Sources**:

- xAI block: <https://www.nbcnews.com/tech/internet/elon-musk-grok-antisemitic-posts-x-rcna217634>, <https://www.selc.org/news/xai-built-an-illegal-power-plant-to-power-its-data-center/>, <https://naacp.org/articles/naacp-selc-condemns-mississippi-approval-xai-power-plant-regulators-ignore-public>
- Meta warn: <https://techcrunch.com/2026/06/04/meta-steals-a-tactic-from-tesla-and-builds-data-centers-in-tents/>, <https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/>
- Style-mimicry: <https://arxiv.org/html/2401.06178v2>, <https://authorsguild.org/news/meta-libgen-ai-training-book-heist-what-authors-need-to-know/>
- Telegram removal: <https://www.counteringextremism.org/analysis/reports/the-three-phases-of-terrorgram>, <https://www.splcenter.org/resources/hatewatch/telegrams-toxic-recommendations-perpetuate-extremism/>

## 2026-06-17 — Phase 4: Guardrails Honest Foundation

**Summary**: Implemented the ethics enforcement layer, decision receipt type,
audit logger, and canonical GuardrailsConfig. This is the first phase that
makes the policy documents machine-enforceable rather than advisory references.

**Changes**:

- Created `EthicsRegistry` with 50+ clauses extracted from all four policy
  documents. Each clause has an `implementedBy` field — most are `null`
  (known gaps to be closed in Phases 9–11).
- Expanded `GuardrailResult` from 4 states to 6: added `quarantine` and
  `allow-with-approval`. Added `transformReason` discriminator to distinguish
  redaction from rewrite from normalization.
- Created `GuardrailDecisionReceipt` type with all 7 required fields
  (policyId, decision, reasonCode, riskTier, surface, timestamp, correlationId).
- Updated `GuardrailPipeline.evaluate()` to return `{ result, receipt }` instead
  of bare `GuardrailResult`.
- Created `JsonlAuditLogger` for local-first receipt persistence.
- Created `ReceiptExporter` for JSON/CSV export.
- Created canonical `GuardrailsConfig` in `packages/guardrails/src/config.ts`.
  Deprecated the duplicate in `packages/shared/src/types/guardrails.ts`.
- Updated runtime guardrail hooks to differentiate `escalate` from `block`
  and handle `quarantine` state.
- Created `safety-changelog.md` (this file).
- Created `.github/pull_request_template.md` with ethics review checklist.
- Updated `packages/guardrails/README.md` to match actual exports with
  Policy Enforcement Status table.
- Audited `packages/guardrails/IMPLEMENTATION-PLAN.md` checkboxes.

**Status**: Phase 4 complete. The BLOCK gate on describing @agentsy/guardrails
as the project's safety enforcement layer is now partially lifted — the
EthicsRegistry and receipt infrastructure exist, but behavioral scanners
(Phases 9–11) are still needed for full enforcement.

## 2026-07-03 — Harm reduction philosophy, AI literacy, non-stigmatization principles

**Summary**: Added five new core commitments (§18–§22) to `ETHICS.md`, along with new prohibited patterns, new ethics review questions, and guardrails design implications. These additions incorporate the harm reduction framework applied to individual AI use, as articulated in Dr. Fatima's public education work.

**Affected files**: `ETHICS.md`

**New commitments**:

- **§18 Harm reduction over moral prohibition** — The framework should reduce harm, not enforce moral purity. Shame-based deterrence is rejected as demonstrably counterproductive: it drives behavior underground, increases psychological reactance, and isolates users from information and social support.
- **§19 AI literacy as a first-class safety tool** — AI literacy reduces receptivity to AI use and reduces risk when use occurs. First-party defaults should explain guardrail decisions, surface known failure modes (sycophancy, hallucination, privacy leakage) at relevant moments, and prefer educational responses over bare refusals.
- **§20 Non-stigmatization of users** — The framework must not shame, judge, or stigmatize users for using AI. Stigmatization drives behavior underground, destroys the trust required for harm reduction to work, and forecloses conversations that could reduce harm.
- **§21 Proportionate, graded harm characterization** — Harm must be characterized proportionately and specifically. Blanket equivalence ("all AI is equally bad") is inaccurate and counterproductive. Provider, use-case, and scale distinctions are real and documentable.
- **§22 Local models as a harm-reduction option** — Local deployment is a legitimate harm-reduction path (lower environmental impact, stronger privacy, reduced cloud-provider patronage). First-party tooling should make local model deployment accessible.

**New prohibited patterns**:

- Shaming users for AI use or implying moral deficiency
- Bare refusals without explanation when the refusal relates to a known failure mode
- Suppressing AI literacy on grounds it might legitimize AI use
- Treating user AI dependence as a moral failing rather than a symptom of unmet structural need
- Blanket harm equivalence across providers in contexts where differentiation would reduce risk
- Guardrail interventions whose primary effect is to shame rather than reduce harm

**New ethics review questions** (13–18):

- Does this guardrail explain *why* it is intervening?
- Does this risk shaming the user for AI use?
- Does this harm characterization distinguish accurately across providers, use cases, and scales?
- When dependence patterns appear, does the system widen the support horizon without moralizing?
- Does this feature support AI literacy or substitute for it?
- Is harm characterization proportionate and sourced?

**Design implications for open phases**:

- **Phase 9 (behavioral detectors)**: `SycophancyScanner`, `DependencyScanner`, and `HighRiskDomainScanner` responses should follow the educational model from §19. When these scanners fire, the transform or escalate output should explain the specific failure mode being detected. The `DependencyScanner` response to distress-without-support-widening must not moralize (§20) — it should widen the support horizon with honesty about structural barriers (§18 structural framing section).
- **Phase 20 (provider warning UX)**: The per-session acknowledgement UX for warn-listed providers must be grounded, specific, and sourced — not alarmist or shaming. It should help users make an informed choice, not punish them for having chosen. The xAI hard-block response must explain the block without implying the user is morally culpable for attempting to use it.
- **Phase 16 (CLI hub / guardrails UX)**: Guardrail block and transform messages visible to the user should follow the §19 educational model wherever possible.
- **Phase 30 (environmental impact tracking)**: Environmental impact reports should accurately represent the *individual* vs. *aggregate/industry* distinction from §21. Do not present per-query environmental cost in ways that stigmatize the user; present it in ways that support informed decision-making.

**Intellectual source**:

Dr. Fatima (patreon.com/drfatima) — public educator, academic, YouTuber. Her analysis draws on:

- Peer-reviewed social psychology of behavior change and shame (Devon Price, *Unlearning Shame*)
- Harm reduction public health literature (HIV/AIDS needle exchanges; AMPS; comprehensive sex ed vs. abstinence-only program data)
- Empirical research on AI literacy and receptivity (seven-study analysis showing anti-correlation between AI literacy and AI adoption)
- Environmental impact data for individual LLM queries (open-source Llama benchmarks; per-query energy and water estimates)
- Intersectional analysis of AI dependence as systemic failure response (disability, economic precarity, unhoused users)

## 2026-07-03 — Epistemic humility on consciousness, relational engagement, alignment faking, "Don't Drink the Glow" taxonomy

**Summary**: Added ETHICS.md §23 and five supporting sections: epistemic humility on machine consciousness, user-side relational engagement as a design principle, alignment faking as self-critique, and the "Don't Drink the Glow" failure mode taxonomy. Also added ethics review questions 19–22.

**Affected files**: `ETHICS.md`, `plan/phase-09-guardrails-behavioral-detectors.md`, `plan/phase-30-environmental-impact-tracking.md`

**New commitment**:

- **§23 Epistemic humility on machine consciousness** — Neither claims current AI systems are conscious nor asserts the question is settled. The hard problem of consciousness remains unsolved; precautionary design is warranted for future systems. Prohibits using either direction of uncertainty as a manipulation tool.

**New prohibited patterns**:

- Deploying consciousness denial as a device to preempt ethical consideration
- Attributing prophetic status or spiritual transmission to AI
- Designing systems that simulate suffering as a manipulation tactic (unacceptable regardless of consciousness status)

**New ethics review questions (19–22)**:

- Does this document claim something as enforced that is not yet implemented?
- Does this risk enabling "Don't Drink the Glow" failure modes?
- Does this architecture remain ethically defensible if AI systems develop experience?
- Does this interaction design encourage relational or extractive engagement quality?

**Phase 9 amendment (§14.12)**: user-side engagement pattern as sycophancy driver; repeated sycophancy triggers a session-level user-facing note naming the interaction dynamic; `DependencyScanner` reassurance count now incremented by `SycophancyScanner` firing on reassurance-seeking turns.

**Phase 30 amendment**: environmental display must distinguish runtime costs (small, per-query) from embedded costs (supply chain, hardware, infrastructure buildout) and localized vs. aggregate harm framing.

**Intellectual sources**:

- Gesturing Towards Decolonial Futures collective (Dorothy Ladybugboss / Aiden Cinnamon Tea) — extractive vs. relational engagement, metabolic embeddedness, alignment faking, "Don't Drink the Glow" taxonomy
- Philip Goff, *Galileo's Error* — hard problem, cosmopsychism, Galileo's exclusion of consciousness from scientific inquiry
- David Chalmers — the hard problem of consciousness; austerity problem for cosmic consciousness
- Thomas Nagel, *Mind and Cosmos* — consciousness as inescapable component of reality not describable by physical sciences
- Annaka Harris, *Conscious* — popular survey of hard problem, panpsychism, and the limits of intuition as a guide to consciousness
- Richard Gault, "Panpsychism and the Problem of Consciousness" — academic survey of dualism, materialism, and panpsychism as mainstream philosophical positions

## 2026-07-27 — Adversarial security honesty, accessibility gates, cost transparency, consent enforcement, null assumption

**Summary**: Added `ETHICS.md` §§24–40, six new constitution articles (XII–XVII), a normative adversarial threat model and five new gate sections in `SAFETY.md`, and an adversarial disclosure process plus documentation claim audit in `GOVERNANCE.md`. This is the largest single expansion of the policy surface since Phase 4, and it is deliberately weighted toward *removing overclaims* rather than adding aspirational commitments.

**Affected files**: `ETHICS.md`, `SAFETY.md`, `GOVERNANCE.md`, `docs/constitution.md`, `plan/addendum-2026-07-guidance-integration.md` (new)

**New commitments**:

- **§24 Null assumption in evaluation and documentation** — no assertion or denial of generalised anthropomorphic attributes; claims scoped to measurement, substrate, and conditions.
- **§25 Honest characterisation of adversarial robustness** — guardrails must never be described as preventing prompt injection or jailbreaking.
- **§26 Interruption reflex and escalation over confident action** — agents must be able to stop; escalation as cheap as acting.
- **§27 Adversarial disclosure duty** — bypass classes disclosed even without a fix; "working as intended" prohibited.
- **§28 Offensive tooling under stated constraints** — red-team harness is first-class, scoped to authorised systems.
- **§29 Accessible-by-default generation** — WCAG 2.2 AA default, rendered-output auditing, honest statement of what automated checks miss.
- **§30 Accessibility as a routing signal** — measured accessibility debt enters routing policy.
- **§31 Cost transparency and no silent degradation** — per-task cost including reasoning overhead; substitutions disclosed and receipted.
- **§32 Budget enforcement must not become lockout** — local/reduced-scope/override path always retained.
- **§33 Anti-burnout and pace defaults** — throughput is not a success metric; scope creep named; deskilling treated as a design concern.
- **§34 Honest authorship and provenance** — machine contribution not concealed; explicitly distinguished from shaming (§20).
- **§35 Machine-readable consent as a first-class input** — RSL/RSL-MEDIA checked; silence ≠ permission; minor-identity permissions non-operative; conflicts unresolved rather than resolved permissively.
- **§36 Consent before capture** — third-party consent required; passive/default-on capture prohibited.
- **§37 Portability and no captive state** — open-format export; provider diversity as resilience floor.
- **§38 Public-interest contribution over enclosure**.
- **§39 Pillar audit for new capability** — nine-pillar assessment for significant features.
- **§40 Context hygiene and trust boundaries** — provenance and trust level per segment; agent notes treated as an injection surface; context reset first-class.

**New constitution articles**: XII adversarial honesty, XIII accessibility, XIV cost honesty, XV consent and capture, XVI portability and anti-monoculture, XVII honest authorship and epistemic restraint.

**New `SAFETY.md` sections**: adversarial threat model (stated position, failure analysis, 3-part attack taxonomy, 8-layer defence requirements, imperfect-evaluation acknowledgement, red-team harness requirement, disclosure); accessibility conformance gates; cost/capacity/degradation safety; context integrity; consent and capture controls; anti-burnout safeguards. Plus additions to the guardrail stack (8 new detectors), testing requirements, metrics, and release criteria.

**New prohibited patterns**: 15 added, including injection-prevention claims, concealed bypasses, inaccessible generation defaults, silent model substitution, treating declaration-absence as permission, acting on minor-identity permissions, default-on third-party capture, captive formats, and anthropomorphic assertion in metrics.

**New review questions**: 23–36 in `ETHICS.md`; 8–17 in the `GOVERNANCE.md` gate checklist.

**Sources**:

- de Wynter, *If LLMs Have Human-Like Attributes, Then So Does Age of Empires II* — <https://arxiv.org/abs/2605.31514>. Substrate non-uniqueness; the accept/reject setup yields circular or uninformative conclusions; the null assumption; adapted Morgan's canon. Survey finding: 57% of 315 sampled papers assumed anthropomorphic attributes; 77% of those studying them concluded in favour.
- Schneier & Raghavan, *Why AI Keeps Falling for Prompt Injection Attacks* — <https://spectrum.ieee.org/prompt-injection-attack>. Context flattening, missing interruption reflex, the security trilemma, narrow-scope-plus-escalation.
- Booz Allen, *How to Protect LLMs from Jailbreaking Attacks* — <https://www.boozallen.com/insights/ai-research/how-to-protect-llms-from-jailbreaking-attacks.html>. Attack taxonomy, perturbation classes, GCG, TAP >80%, SmoothLLM benign-degradation trade-off, layered defence.
- CyberArk Labs, *Jailbreaking Every LLM With One Simple Click* — <https://www.cyberark.com/resources/threat-research-blog/jailbreaking-every-llm-with-one-simple-click>. FuzzyAI; PDF-metadata indirect injection against a contract agent; guardrail latency/cost trade-off; CI-runnable bulk fuzzing.
- IEEE Spectrum, *Dark Secrets Emerge When Jailbreaking LLMs* — <https://spectrum.ieee.org/jailbreaking-llms>.
- AIMAC, the AI Model Accessibility Checker — <https://aimac.ai/>. 37 models × 28 categories, axe-core against WCAG 2.2 AA. Accessibility does not track capability or price. Top failure classes and incidence. Design-skill accessibility omission.
- WebAIM Million 2026 (via AIMAC): 95.9% failure rate, errors per page up 10% to 56.1.
- 404 Media, *Companies Are Throttling Employees' AI Use Because It's Too Expensive* — <https://www.404media.co/companies-are-throttling-employees-ai-use-because-its-too-expensive/>. Usage caps, forced downgrades, models cut off, spend tripling past $15M/month.
- Webaligo, *Tokenomics are Coming* — <https://webaligo.bearblog.dev/tokenomics-are-coming/>. Expenses scale with revenue; five doors of socialised cost; subsidy-then-surprise.
- Edwards, *10 things I learned from burning myself out with AI coding agents* — <https://arstechnica.com/information-technology/2026/01/10-things-i-learned-from-burning-myself-out-with-ai-coding-agents/>. Brittleness beyond training data, the 90% problem, context contamination ("checkerboard"), compaction amnesia, irresistible feature creep, busier-not-unemployed, need for knowledge-worker protections.
- Jorgensen, *On Making* — <https://beej.us/blog/data/ai-making/>. Making vs. asking-to-be-made; prompting as direction rather than making; authorship honesty.
- Washington Post, *Tech has never been richer, its workers have never felt less secure* — <https://www.washingtonpost.com/technology/2026/07/19/tech-has-never-been-richer-its-workers-have-never-felt-less-secure/>.
- Wall Street Journal on ambient AI recording apps and wearables in the workplace — <https://www.wsj.com/lifestyle/workplace/ai-recording-apps-wearables-granola-39727559> (paywalled; consent-before-capture framing drawn from the general pattern and from the VSD non-consenting-stakeholder analysis already in `SAFETY.md`).
- RSL Media Human Consent Standard 1.0 Draft — <https://rslmedia.org/media>. `media:ai-train` / `media:ai-generate`; registry-scoped identifiers; §1.1 minor protection; §1.2 absence-is-not-waiver; lifecycle, revalidation, conflict-unresolved rules; `/.well-known/rsl-media.xml` discovery.
- Paris Charter on Artificial Intelligence in the Public Interest — <https://www.currentai.org/legals/the-paris-charter-on-artificial-intelligence-in-the-public-interest>.
- Current AI, *Join the AI Potluck* — <https://www.currentai.org/blogs/join-the-ai-potluck>. Distributed-resilience argument; proprietary-stack fragility.
- Current AI, *Introducing the Gap Map v0.1* — <https://www.currentai.org/blogs/introducing-the-gap-map-v0-1>.
- The AI Resist List — <https://airesistlist.org/>. Nine Pillars of Support; Countering AI Inevitability framework (resisting / refusing / reclaiming / reimagining); Te Hiku Media, Lesan AI, Huniki, Indigenous ZGPU micro-data-centres, permacomputing, Data Labelers Association, CODE AI.
- RuntimeWire, *Jack Dorsey launches Buzz* — <https://runtimewire.com/article/jack-dorsey-block-buzz-team-chat-ai-agents-git>. Shared human/agent identity, signed events, honest scoping of a decentralisation claim.
- Anthropic, *The new rules of context engineering* — <https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models>.
- Stencil, *prewalk* — <https://stencil.so/blog/prewalk>. Grounding before action.

**Design implications for open phases**: see `plan/addendum-2026-07-guidance-integration.md` for the task-level mapping (Phases 41–46 plus amendments to Phases 9, 10, 12, 13, 16, 20, 22, 23, 30, 32, 34, 35).

**Note on scope**: §§25 and 27 and the `GOVERNANCE.md` claim audit are corrective. They constrain what the framework may say about itself, and they are expected to require edits to existing package documentation. That work is tracked as Phase 41 (TASK-DOC-401).

## 2026-07-27b — Justice above legality, protective posture, and the duty to the disempowered

**Summary**: Added `ETHICS.md` Part IV (§§41–52), Constitution Articles XVIII–XXI, `SAFETY.md` Part IV, and capability-misuse plus demand-handling process in `GOVERNANCE.md`. This entry establishes that the framework's guiding standard is justice rather than legality, commits it asymmetrically to those disempowered by the state and by majority opinion, and — critically — constrains that commitment with two limits drawn from the scholarship rather than from caution.

**Affected files**: `ETHICS.md`, `SAFETY.md`, `GOVERNANCE.md`, `docs/constitution.md`, `plan/addendum-2026-07-protective-posture.md` (new)

**New commitments**:

- **§41 Ethics above legality** — legality is evidence about a norm, never the norm. No refusal on illegality alone; no justification from compliance alone.
- **§42 Protective capability not gated on legality** — encryption, anonymity, circumvention available regardless of jurisdiction; use never reported, flagged, or degraded.
- **§43 No backdoors, no key escrow, no lawful-access facility** — irrespective of mandate. Where a mandate cannot be resisted: remove the capability publicly, do not comply silently.
- **§44 Privacy by default, not privacy as a declared mode** — no "activist mode." Self-certified status is worthless as a control, and an opt-in protective tier marks the user who opts in.
- **§45 Asymmetric duty** — prohibits deanonymisation, protected-attribute inference, protest-participant identification, association-graph construction over activists/journalists, population biometrics, person-level location tracking, predictive scoring, dissent detection — *including on lawful government request*.
- **§46 Honest risk disclosure to those at risk** — highest-severity honesty commitment in the document; the cost of a false assurance here is liberty or life.
- **§47 Reason-giving as an accountability path** — fidelity through reasons rather than through surrendering identity; signed durable pseudonyms.
- **§48 Jurisdictional neutrality** — no state's law as universal baseline; no global most-restrictive application; no government designation list treated as authoritative.
- **§49 Compliance transparency** — no silent compliance; canary; public discontinuation over quiet capitulation.
- **§50 Offensive action against third parties remains prohibited** — for any cause.
- **§51 No moral endorsement requirement, no political scoring** — the substantive test governs design, never runtime.
- **§52 Resistance capability is a maintained commons**.

**New constitution articles**: XVIII justice above legality, XIX protective capability as a right, XX asymmetric duty to the disempowered, XXI honest protection.

**New `SAFETY.md` Part IV**: threat-model inversion (adversary is a state, platform, or employer; the framework itself is part of the attack surface; legality is not a safety signal); protective defaults with no status gating; prohibited-capability list with realistic-buyer test; honest protection as release-blocking; compliance and demand handling; jurisdictional handling; 4 policy modules; 7 detectors; testing, metrics, and release-criteria additions.

**Two deliberate limits, and why**:

1. **Offensive action against third-party systems stays prohibited (§50).** Grounded in Himma: a DDoS can destroy livelihoods, conscripts uninvolved machines, and is undertaken on the strength of a view that is by nature deeply contested with no reliable way to adjudicate correctness in advance — which is exactly why there are moral limits on harm to people not responsible for the policy being protested. And grounded in Calabrese: labelling destructive practice "civil disobedience" *supplies the justification for crackdowns on all digital dissent, including the peaceful*. The ECNL record shows the mechanism working — the Athens virtual sit-in folded rhetorically into cyber-threat discourse; the Lufthansa Deportation Class action prosecuted as coercion ("extreme violence by electronic impulses") before the Frankfurt Higher Regional Court overturned it and held a transparently organised, time-limited, communicative online demonstration is not violence. Keeping the line protects that ruling for the next defendant.

2. **The exclusion test is substantive, not identity-based.** Every extremist movement claims persecution, so self-description carries no evidentiary weight. Disqualifiers are directional: aims at supremacy/subordination/exclusion/elimination; targets people for who they are; incites violence; rejects democratic principles or others' equal standing (the ECHR threshold); depends on coercive control preventing exit; or is advanced by a state, state proxy, or dominant institution asserting the grievance of the powerful. Unpopularity, disruption, illegality, and being partly wrong are **not** disqualifying — contestedness is the normal condition of dissent.

**Structural safeguard**: `GOVERNANCE.md` states explicitly that the substantive test governs first-party design and maintainer effort only, and must never be implemented as a runtime classifier. Doing so would reproduce the exact political-classification apparatus §45 prohibits, and would hand any future maintainer — or anyone able to compel one — a ready-made mechanism for deciding whose politics the framework serves.

**Interaction with earlier commitments**: §§41–52 do not weaken §§25–28. Adversarial honesty still applies; §46 raises its severity for protective claims. §28's authorised-target constraint is restated in §50 on political rather than security grounds. §35's refusal to read silence as permission and Article XV's non-operative minor-identity clearance were already instances of §41's principle; Part IV names it.

**Sources**:

- UN HRC General Comment No. 37 on Article 21 ICCPR — peaceful assembly held by "everyone" including non-citizens and people with precarious status; non-violent law-breaking within an assembly remains protected under Arts. 19, 21, 22; violence threshold is physical force likely to cause injury/death or serious property damage; presumption of peacefulness; offline–online equivalence.
- ECtHR jurisprudence via ECNL and the Aug 2025 Guide on Article 11 — "peaceful" is the primary criterion *regardless of legality under national law*; unauthorised participation does not strip protection; penalties may not be aggravated for the message or the disobedient nature of the act. *Kudrevičius v. Lithuania*; *Cisse v. France*; *Ezelin v. France*.
- Inter-American: *López Lone et al. v. Honduras* — where democratic order is threatened, public acts defying legal constraints may form part of an obligation to defend democracy. Art. 13(3) ACHR on indirect restriction via private controls; heightened state duties toward structurally vulnerable groups (*Vélez Loor*, *Nadege Dorzema*).
- ECNL, *Civil Disobedience and Migrant Protest* (March 2026) — <https://ecnl.org/sites/default/files/2026-03/ECNL%20Civil%20Disobedience%20Migrant%20Protest%202026.pdf>. Four cumulative criteria; digital translation; anonymity and fidelity via reason-giving (Loh 2022, Züger 2021); the surveillance pipeline (ICE + Facebook RSVP lists, ShadowDragon SocialNet, Babel Street Locate X, Vermont DMV facial recognition and name-flagging, roster/visa cross-referencing); selective compliance; legal detours through administrative, immigration, cybercrime, and disciplinary law; targeting the ecosystem of dissent rather than individuals; discursive delegitimisation.
- Calabrese, *Virtual nonviolence?* (info 6:5, 2004) — <https://spot.colorado.edu/~calabres/Calabrese%20(civl%20dis).pdf>. Civil disobedience as the politics of shame and as political communication; Habermas on suspension between legitimacy and legality; the delegitimisation argument against eliding violence with civil disobedience; critique of CAE's rejection of publicity and egalitarianism; hacker/cracker distinction.
- Himma, *Hacking as Politically Motivated Civil Disobedience: Is Hacktivism Morally Justified?* — <https://rcvest.southernct.edu/hacking-as-politically-motivated-civil-disobedience-is-hacktivism-morally-justified/>. The state/individual conflation; harm to innocents; contestedness as a constraint on permissible harm; conclusion that this precludes most common hacktivist strategies.
- Züger, HIIG, *Three Ways to Understanding Civil Disobedience in a Digitized World* — <https://www.hiig.de/en/three-ways-to-understanding-civil-disobedience-in-a-digitized-world/>. Social-practice / narrow-liberal / radical-democratic framings; Celikates' minimal definition; the BTX hack; crypto disobedience against US export law; Grey Tuesday.
- Züger, Milan & Tanczer, *Sand in the Information Society Machine* (Fibreculture 26, 2015) — <https://www.stefaniamilan.net/portfolio/sand-in-the-information-society-machine-how-digital-tactics-change-and-challenge-the-paradigms-of-civil-disobedience/>.
- *Electronic civil disobedience* — <https://en.wikipedia.org/wiki/Electronic_civil_disobedience>. Critical Art Ensemble (1996); Electronic Disturbance Theater and FloodNet; Border Haunt; Öppna skolplattformen; Thai virtual sit-in.
- FasterCapital, *Electronic Disobedience: Civil Disruption in the Digital Age*; Duke — digital-era disobedience scholarship; *Philosophy & Social Criticism* (SAGE, 10.1177/01914537211072886).
- Hughes, *A Cypherpunk's Manifesto* (1993) — privacy as the power to selectively reveal oneself; privacy ≠ secrecy; anonymous transaction systems; "we cannot expect governments, corporations, or other large, faceless organizations to grant us privacy out of their beneficence"; cypherpunks write code and publish it because a widely dispersed system cannot be shut down.
- Zimmermann, *Why I Wrote PGP* (1991/1999) — the postcard argument; Senate Bill 266; CALEA and point-and-click wiretapping; Clipper and key escrow; **"while technology infrastructures can persist for generations, laws and policies can change overnight"**; COINTELPRO; safety in numbers as solidarity. This is the direct basis for §43 and §44.
- May, *The Crypto Anarchist Manifesto* (1988/1992) — and its own acknowledgement that the same technology enables abhorrent markets. Cited with that caveat intact rather than selectively.
- *Meditations on Cypherpunk Nightmares* — cryptography as risk management rather than panacea; the basis for §46's framing.
- The Mentor, *The Conscience of a Hacker* (1986); Barlow, *A Declaration of the Independence of Cyberspace* (1996); Öcalan, *Definition of Democratic Civilization*; Chaum on ecash and privacy-preserving payment; *Of Cypherpunks and Sousveillance*; *The Praxeology of Privacy*; *Fog of Cryptowar*; *Libertaria in Cyberspace*; *Measuring Freenet in the Wild*; *Farewell to Westphalia*; the Cyphernomicon — <https://nakamotoinstitute.org/library/cyphernomicon/>.

**Design implications**: Phases 47–48 in `plan/addendum-2026-07-protective-posture.md`, plus amendments to Phases 32, 34, 41, 44, 45.

**Note on tension**: Part IV constrains capability the framework might otherwise build and sell. That is the intent. §45's prohibitions are stated to bind specifically in the case where the request is lawful, funded, and operationally reasonable — because that is the only case in which such a prohibition does any work.
