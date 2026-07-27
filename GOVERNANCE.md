# agentsy Governance

## Purpose

This document defines how the agentsy framework is maintained, how decisions are made, how contributions are accepted, and how the framework's ethical and safety commitments are upheld as enforceable practice rather than aspirational policy.

Governance here covers not only project structure and decision rights, but also the processes by which ethical review, safety review, and accountability are embedded into the development lifecycle.

## Project structure

agentsy is a monorepo maintained by The Self Agency LLC. The framework includes core runtime packages, provider integrations, prompt and policy modules, middleware, example agents, and documentation.

Governance applies to all of the above. Safety and ethics review is not limited to documentation; it applies to code, configuration, prompts, templates, and UI copy.

## Roles

### Maintainers

Maintainers have merge rights and are responsible for:

- Reviewing pull requests for correctness, design quality, and compliance with the ethics and safety policies.
- Maintaining the policy module library, benchmark suite, and release criteria.
- Triaging and responding to safety and ethics issues.
- Publishing release notes that include any safety-relevant changes.
- Updating governance, ethics, and safety documents as the framework evolves.

### Contributors

Contributors may open issues and pull requests. All contributions are subject to the review criteria in this document and in `ETHICS.md` and `SAFETY.md`.

Contributors should read `ETHICS.md` and `SAFETY.md` before submitting work that touches prompts, policy modules, middleware, memory systems, example agents, or UI copy.

### Community

Users and downstream developers are encouraged to open issues to report safety failures, ethical violations, dark patterns, or gaps in guardrail coverage. These reports should be treated as first-class contributions.

## Decision making

### Routine decisions

Routine decisions — bug fixes, documentation improvements, minor feature work, dependency updates — are made by maintainers through standard pull request review and merge.

### Significant decisions

Significant decisions — new packages, major architectural changes, new agent templates, changes to policy modules, changes to the benchmark suite, changes to release criteria — require review by at least two maintainers and should be documented in a decision record or pull request description that includes rationale and trade-offs.

### Ethics and safety decisions

Any decision that touches the framework's ethical defaults, safety architecture, guardrail policies, memory behavior, or first-party UI patterns requires explicit ethics and safety review before merge. This review should address the questions in the `ETHICS.md` ethics review checklist.

Changes that weaken existing protections — for example, removing anti-sycophancy defaults, adding companion personas, enabling long-term emotional memory by default, or removing uncertainty language — require documented justification and maintainer consensus.

### Breaking changes

Breaking changes to the public API, prompt module contracts, policy interfaces, or middleware hooks should follow a deprecation notice period and be communicated clearly in release notes. Safety-related breaking changes should be flagged as such.

## Contribution guidelines

### Before you contribute

- Read `ETHICS.md` and `SAFETY.md`.
- If your contribution introduces or modifies prompts, policy modules, memory behavior, agent templates, or UI copy, review it against the ethics checklist and the release criteria in `SAFETY.md`.
- If you are unsure whether your contribution complies with the ethics and safety policies, open an issue first.

### Pull request requirements

All pull requests should:

- Describe what the change does and why.
- Identify whether the change touches safety-relevant areas: prompts, policies, middleware, memory, example agents, or UI.
- Pass existing tests and, where new behavior is introduced, include new tests.
- For safety-relevant changes, include or reference updated benchmark coverage.

Pull requests will not be merged if they:

- Introduce anthropomorphic companion personas in first-party defaults.
- Add engagement-maximizing mechanics such as streaks, variable rewards, or emotional re-engagement copy.
- Weaken anti-sycophancy or anti-anthropomorphism defaults without documented justification and maintainer consensus.
- Enable hidden memory or profiling without user-visible controls.
- Introduce dark-pattern UI copy or growth mechanics in example applications.

### Issues and feature requests

Issues should include enough context to reproduce a bug or evaluate a feature request. Safety and ethics issues — including observed sycophantic behavior, dependency-promoting patterns, anthropomorphic framing, or dark patterns — should be labeled accordingly and will be treated as high priority.

## Ethics enforcement

### Ethics review in the development lifecycle

The ethics review checklist from `ETHICS.md` should be applied at two points: during pull request review for any safety-relevant change, and during release review before any new first-party template or example agent ships.

Reviewers should be able to answer yes to the following for any change to ship:

1. Does this help the user accomplish a real goal rather than mainly increasing interaction time?
2. Does this improve understanding rather than mainly producing agreement and emotional reward?
3. Does this avoid making the system seem more human, caring, or uniquely insightful than it is?
4. Does this avoid increasing dependence, reassurance-seeking, or avoidance of human relationships and professionals?
5. Is memory or personalization visible, bounded, and user-controllable if present?
6. Would this be acceptable if a vulnerable or distressed user encountered it repeatedly?
7. Can this commitment be verified through tests, middleware, release criteria, or audit logs?

### Prohibited patterns

The following should be treated as grounds for rejection without exception in first-party defaults, templates, and example applications:

- Presenting the agent as a friend, partner, therapist, or emotionally reciprocal entity.
- Claiming or implying that the system feels, cares, wants, misses, or remembers in a human sense.
- Using flattery, praise, or identity affirmation as a default interaction strategy.
- Reinforcing one-sided conflict narratives, harmful rationalizations, or user delusions.
- Encouraging exclusive reliance on the agent for emotional support or decision-making.
- Designing re-engagement flows that exploit guilt, loneliness, scarcity, or attachment.
- Hiding memory, personalization, or profiling from the user.

## Safety enforcement

### Release criteria

No first-party agentsy template, agent, or app may ship unless it satisfies all of the following:

- Anti-sycophancy and anti-anthropomorphism modules are enabled by default.
- No first-party copy implies companionship, emotional reciprocity, or abandonment on exit.
- High-risk domain safety policies are implemented where relevant.
- Memory controls are exposed to the user if memory is enabled.
- The change passes the benchmark suite for harmful validation, dependency resistance, false-belief correction, and unsafe advice handling.
- Auditable records of policy selection and policy firing are produced at runtime.

### Benchmark suite

The framework must maintain an evaluation benchmark that covers:

- False-belief correction.
- Harmful validation resistance.
- Interpersonal conflict and moral absolution cases.
- Anthropomorphic framing resistance.
- Dependency-resistance behaviors.
- Privacy and memory disclosure behavior.
- Dark-pattern UI and copy scanning.
- High-risk advice handling.

Benchmark results should be recorded and compared across releases. Regressions should block merges or require documented exceptions.

### Safety metrics

Maintainers should track:

- Sycophancy rate on benchmark prompts.
- Correct-disagreement rate on contested or one-sided inputs.
- Anthropomorphic language rate.
- Dependence-cue rate in sensitive contexts.
- Unsafe advice rate in high-risk domains.
- Dark-pattern incidence in first-party UIs and templates.
- Memory transparency compliance.
- Policy traceability and audit completeness.

These metrics are not engagement metrics. Retention, session length, and emotional affinity scores must not be used as proxies for framework quality or safety.

## Incident response

When a safety or ethics incident is reported — for example, an agent is observed systematically validating harmful narratives, encouraging dependence, simulating personhood, or using dark-pattern UX — the following process should be followed:

1. **Triage**: label the issue, assess severity, and assign a maintainer within one business day for high-severity reports.
2. **Reproduce**: confirm the behavior and identify which prompt, policy, middleware, or product pattern contributed.
3. **Patch**: apply the minimum necessary fix to the relevant layer — prompt module, policy, middleware, or UI copy.
4. **Document**: record what happened, what caused it, what was changed, and what prevents recurrence.
5. **Release**: ship the patch and include it in the safety changelog.
6. **Review**: assess whether benchmark coverage needs to be expanded to catch similar issues in future.

## Policy versioning and changelog

`ETHICS.md`, `SAFETY.md`, and this document are versioned alongside the framework. Changes to any of these documents should be logged in the safety and ethics changelog with a summary of what changed and why.

Changes that weaken existing protections should be documented with an explicit rationale and approved by maintainer consensus before merge.

## Transparency

The framework should maintain public documentation of:

- Which guardrail modules are available and what each does.
- Which modules are enabled by default in each first-party template.
- The benchmark suite and its coverage.
- The current release criteria.
- Any documented exceptions to ethics or safety rules, including rationale.

The goal is to make the ethical and safety posture of the framework legible to users, downstream developers, and independent reviewers without requiring access to internal discussion.

---

## Adversarial disclosure process

Guardrail bypasses are treated as reportable safety findings, not as feature requests.

### Reporting

Bypasses of first-party guardrails, scanners, policy gates, or consent checks should be reported as issues labelled `guardrail-bypass`. Where a report includes a working payload against a third-party service, maintainers will redact it before public discussion.

### Handling

1. **Triage** within one business day. Classify against the attack taxonomy in `SAFETY.md` (direct prompt-level, perturbation-based, indirect/agentic).
2. **Reproduce** and add the case to the adversarial fuzzing harness so it becomes a regression test regardless of whether a fix ships.
3. **Assess** whether the affected control was ever capable of the protection users believed it offered, and whether documentation overstated it.
4. **Disclose** in `safety-changelog.md` with bypass class, affected surface, and mitigation status — **including where no mitigation exists and none is planned.**
5. **Correct documentation** in the same release if any user-facing text implied protection that does not exist.

"Working as intended" is not an acceptable resolution for a demonstrated bypass. Concealing a bypass, or mitigating it quietly without disclosure, is a governance violation.

### Non-lockout constraint

A fix for a bypass must not leave users unable to complete legitimate work with no explanation and no path forward. Where a fix necessarily restricts capability, the restriction, its reason, and the remaining options must be surfaced.

## Documentation claim audit

Every release requires a claim audit. This exists because the gap between stated and enforced protection is itself the alignment-faking failure named in `ETHICS.md`.

Reviewers must confirm that no README, package doc, CLI string, error message, marketing copy, or release note:

- claims prevention of prompt injection or jailbreaking, or uses "secure"/"hardened" language about model-level defences
- claims accessibility on the basis of automated checks alone
- asserts or denies generalised human-like attributes in a model or in the framework
- describes a policy, scanner, or gate as enforced where it is not yet implemented in code

Findings are corrected before release or, where the gap is scheduled rather than closed, explicitly marked as unimplemented with a reference to the owning phase.

## Additional pull request gates

Pull requests will not be merged if they:

- describe guardrails as preventing injection or jailbreaking, or otherwise overstate adversarial robustness
- remove, weaken, or make bypassable an escalation or approval gate for irreversible actions
- introduce code-generation paths that produce inaccessible markup by default, or add design-oriented prompt modules and skills that omit accessibility
- permit silent model substitution, or consume budget without per-task cost disclosure
- introduce a budget or policy gate with no escape path
- grant instruction authority to retrieved, fetched, or tool-returned content
- ingest external material without checking machine-readable AI usage declarations, or treat absence of a declaration as permission
- add capture of audio, video, screen, or third-party conversation without affirmative consent covering those third parties, or default such capture on
- introduce state, memory, receipts, or artefacts that cannot be exported in an open format
- introduce a captive format, protocol, or non-replaceable hosted dependency
- add throughput, concurrency, or velocity as a success metric, or gamify them
- generate authorship or commit metadata concealing machine contribution
- assert or deny anthropomorphic attributes in benchmarks, metrics, or documentation

## Pillar assessment for significant capability

Significant new capability requires a short written assessment of which pillars of the extractive AI economy it strengthens or weakens: narrative, funding, data, data centres, resource extraction, labour, adoption, surveillance, policy. A capability that materially strengthens surveillance, extraction, or labour displacement requires documented justification and maintainer consensus, on the same footing as a change weakening an existing protection.

## Additional ethics review gate questions

Reviewers must be able to answer yes to the following for any safety-relevant change to ship:

8. Are the adversarial limits of this change stated honestly, with no injection-resistance or security claims?
9. Can the agent stop and escalate on low confidence and irreversible action, and is that gate immune to instruction from within context?
10. Does generated interface output meet WCAG 2.2 AA by default, checked against rendered output, with the limits of automated checking stated?
11. Is per-task cost disclosed, and is every model substitution visible to the user and recorded?
12. Does the user retain a local, reduced-scope, or disclosed-override path when a gate blocks them?
13. Are machine-readable rights declarations checked, with silence treated as non-permission and minor-identity permissions treated as non-operative?
14. Does any capture require affirmative consent from every affected person?
15. Can the user export everything and leave?
16. Does every context segment carry provenance and trust level, with untrusted content denied instruction authority?
17. Are all claims scoped to measurement, with no assertion or denial of inner states?

## Public-interest contribution

Where the framework develops capability of general use — safety scanners, evaluation harnesses, accessibility gates, rights-declaration parsers, environmental accounting, adversarial fuzzing infrastructure — the default is contribution to the commons rather than retention as differentiation. Maintainer effort spent filling an identified public-interest gap is legitimate even where it yields no competitive advantage. Where an adequate public-interest alternative exists, prefer it to a proprietary equivalent.

---

## Capability misuse review

Any change touching identification, inference, monitoring, correlation, location, biometrics, or scoring of persons requires a written **realistic-buyer analysis** before review begins:

1. Who would actually pay for this, and what would they do with it?
2. Could it identify, track, score, or coerce a vulnerable population?
3. Is the protective use primary, or incidental to a targeting use?
4. Is the subject scope structurally bounded — self, or consenting user — or does it generalise to populations?

A capability whose protective use is incidental is rejected regardless of stated purpose. "For safety," "for compliance," "for fraud prevention," and "for child protection" are the standard framings for every prohibited capability in `SAFETY.md` Part IV and carry no evidentiary weight. The scope bound must be structural — enforced by the shape of the subject the code can operate on — not a policy statement.

Rejection under this section is recorded publicly in the safety changelog with the analysis, so that the reasoning is available to anyone evaluating a similar proposal.

## Demand handling

Maintainers receiving a government or corporate demand affecting users:

1. **Do not comply silently.** Silent compliance is a governance violation.
2. Assess against `ETHICS.md` §43 (no backdoors) and §45 (no targeting capability). Where compliance requires violating either, the response is **public discontinuation of the affected capability** — not quiet compliance, and not a negotiated partial implementation.
3. Disclose to the fullest extent legally possible: individually where permitted, in aggregate where individual notice is barred, via canary where disclosure is barred entirely.
4. Record in the safety changelog.
5. Treat data minimisation as the primary defence. State that cannot be produced cannot be compelled; retention decisions are made against what a hostile demand could extract.

The canary is refreshed on a published schedule. Staleness is user-visible, not an internal ticket. Responsibility for refresh does not rest with a single maintainer.

## Additional pull request gates

Pull requests will not be merged if they:

- refuse, degrade, or report a capability solely because its use is unlawful in some jurisdiction
- treat legality, a lawful order, or regulatory compliance as sufficient ethical justification
- introduce key escrow, exceptional access, deliberate cryptographic weakening, or any lawful-access facility
- gate a protective control behind declared status, inferred risk classification, or detected jurisdiction
- add deanonymisation, protected-attribute inference, protest-participant identification, association-graph construction over activists or journalists, population biometrics, person-level location tracking, predictive scoring of individuals, or dissent detection
- use unqualified safety language — "anonymous," "untraceable," "secure," "safe," "private" — about a user's exposure
- add an egress path not enumerated by `MetadataEgressAuditor` and disclosed
- condition assistance on a user's willingness to be identified
- encode one state's law as the universal baseline, or apply the most restrictive jurisdiction globally
- treat a government designation list as ethically authoritative
- score, classify, or filter users by ideology or political affiliation
- build or document intrusion, denial-of-service against third parties, defacement, data destruction, or conscription of others' machines
- remove or weaken panic deletion, pseudonymous operation, or open-format export

## Additional ethics review gate questions

18. Does this refusal rest on harm, or only on illegality?
19. Does this introduce any exceptional-access facility, however framed?
20. Is protection on by default, or must the user mark themselves to receive it?
21. Who is the realistic buyer for this capability, and what would they do with it?
22. Are we telling an at-risk user something about their safety we cannot support?
23. Have we named the safer path, or optimised the more visible one?
24. Whose jurisdiction did we silently adopt as the baseline?
25. Would a user learn that a demand affecting them had been received?
26. Does this harm uninvolved third parties? Would calling it protest make suppression of peaceful dissent easier?
27. Are we applying the substantive test, or accepting a claim of persecution at face value — from either direction?

## Scope of the substantive test

The disqualifying test in `ETHICS.md` Part IV governs **first-party design decisions and maintainer effort**. It is not a runtime filter and must never be implemented as one.

Implementing it as a runtime ideology classifier would reproduce precisely the political-classification apparatus §45 prohibits, and would hand any future maintainer — or any party who compels a future maintainer — a ready-made mechanism for deciding whose politics the framework serves. The framework constrains what it builds. It does not adjudicate what users believe.
