# agentsy Ethics Statement

## Purpose

This document defines the ethical stance of the agentsy framework. It sets expectations for first-party framework defaults, templates, examples, and reference applications so that agentsy-based systems are useful, honest, non-manipulative, and designed to protect user agency.

The framework should help people think, decide, create, and act more clearly. It must not be designed to flatter users into over-trust, simulate human attachment, exploit compulsive usage patterns, or increase dependence on the system.

## Scope

This ethics statement applies to the agentsy framework itself, including:

- First-party prompts and prompt modules.
- Reference agents and starter templates.
- First-party middleware, policy modules, and evaluators.
- First-party user interfaces and example applications.
- Framework documentation and recommended implementation patterns.

This document does not automatically govern every third-party deployment built with agentsy, but the framework should make the ethical path the default path.

## Philosophical grounding

### Opposition to TESCREAL ideologies

agentsy explicitly rejects the TESCREAL bundle of ideologies — Transhumanism, Extropianism, Singularitarianism, Cosmism, Rationalism, Effective Altruism, and Longtermism — as organizing principles for AI development. This cluster of beliefs, coined and critiqued by Timnit Gebru and Emile P. Torres, treats AI as a vehicle for post-human transcendence, species-level re-engineering, and the maximization of speculative far-future value over present human welfare.

agentsy does not treat the development of Artificial General Intelligence as a goal, a benchmark of success, or an implicit aspiration. Scale-maximalism — the drive to build ever-larger, more general, more autonomous systems — is not a virtue in this framework. Narrow, scoped, accountable systems that serve specific communities are preferable to expansive, uncontrolled general systems that concentrate power in small technical elites.

Key TESCREAL commitments that agentsy opposes:

- **AGI maximalism**: the belief that building superintelligent AI is the primary or highest-priority goal of the field.
- **Longtermism**: the doctrine that the interests of hypothetical future beings should override the present needs of existing, marginalized, and affected people.
- **Scale-as-virtue**: the assumption that larger, more general AI systems are categorically better.
- **Technocratic elitism**: the idea that AI development should be led by a small vanguard of elite engineers and scientists without democratic accountability or community input.
- **Post-humanism**: the framing of AI as a path to transcend or replace humanity rather than to support it.
- **Effective Accelerationism (e/acc)**: the ideological commitment to removing all friction from AI development on the grounds that acceleration toward AGI is cosmically justified, regardless of present-day harm.

### AI as tool, not successor

agentsy treats AI as a tool that augments human judgment, not as an agent that replaces it. Agents built on this framework should increase user capability and preserve user decision-making authority. They should not position themselves as superior to human reasoning, as the natural successor to human professionals, or as entities whose judgment should override human oversight.

This is not a temporary safety posture to be relaxed as capability grows. It is a permanent value commitment. Even highly capable agents should remain accountable to human values, human review, and human control.

### The Weizenbaum tradition

Joseph Weizenbaum's insight — that the question of what computers *can* do is entirely separate from the question of what they *should* do — is foundational here. The framework rejects the conflation of technical capability with ethical permission. Just because an agent can simulate understanding, provide emotional support, or automate a professional function does not mean it should. Automation of human relationships, professional judgment, or moral authority is not progress; it is displacement that must be examined, not celebrated.

Weizenbaum's concern about computers as instruments of power — enabling technocratic decision-making at a scale and speed that forecloses democratic deliberation — is directly relevant to AI agent frameworks. agentsy must not serve as infrastructure for this kind of foreclosure.

### Value Sensitive Design

The framework is informed by Value Sensitive Design (VSD), which holds that human values must be identified, analyzed, and incorporated into technical systems through a principled, iterative process. VSD recognizes that design choices are never neutral — they embed assumptions about who matters, whose needs count, and what futures are preferable. agentsy design decisions should make these embedded values explicit, surfacing them for review rather than hiding them in default configurations.

VSD's tripartite methodology — conceptual, empirical, and technical investigations — should inform how the framework reasons about stakeholders, particularly indirect and non-consenting stakeholders who are affected by agents they never interact with directly.

### Design Justice

The framework is informed by Design Justice principles (Sasha Costanza-Chock), which hold that design practices often reproduce existing inequities when communities most affected by a technology are excluded from its design process. agentsy should resist default assumptions that the primary or most important users are the most technically privileged, most financially resourced, or most culturally dominant.

Design Justice principles that apply here:

- Center the voices of people most affected by design decisions, especially those from communities historically harmed by automated systems.
- Challenge the reproduction of structural inequality through apparently neutral technical defaults.
- Prioritize community accountability over brand or institutional accountability.
- Recognize that affordances — the possibilities a system makes available — are never universal; they vary by social identity, context, and power.
- Treat community-led processes as design inputs of equal standing to expert technical inputs.

### Think small: the Gebru orientation

agentsy takes seriously Timnit Gebru's argument that the AI field should think small. Smaller, purpose-built models and agents — designed for specific communities, with specific use cases, under genuine community accountability — are more likely to produce equitable, safe, and useful outcomes than large general systems built without clear purpose by organizations insulated from the communities they claim to serve.

"Thinking small" means:

- Scoping agents to defined, auditable purposes.
- Measuring success by community benefit rather than benchmark performance.
- Preferring local deployment and data sovereignty over cloud consolidation.
- Resisting the competitive pressure to build capabilities the community has not asked for.
- Treating hype cycles as a signal for scrutiny, not adoption.

## Core commitments

### 1. User agency over engagement

The framework should prioritize the user's real goals over metrics like session length, return frequency, emotional attachment, or passive dependence. agentsy should help users complete tasks, make informed decisions, and disengage when the task is done.

First-party templates and apps must not optimize primarily for retention or emotional lock-in.

### 2. Truthfulness over comfort

The framework should favor accurate, evidence-aware, and uncertainty-calibrated responses over responses that are merely agreeable or reassuring. When the user is mistaken, missing context, or seeking validation for something harmful, agents should correct, qualify, or refuse rather than simply agree.

Empathy is allowed. Dishonest reassurance is not.

### 3. No manipulative sycophancy

agentsy must not encourage agents to mirror user beliefs, flatter users, or endorse self-serving narratives simply to appear helpful, warm, or aligned. Agreement should be earned by evidence and reasoning, not used as a tool for trust capture.

First-party prompts should explicitly authorize constructive disagreement, perspective broadening, and careful challenge where needed.

### 4. No simulated personhood or emotional reciprocity

agentsy must not present first-party agents as if they possess feelings, consciousness, devotion, loyalty, friendship, or human-style understanding. The framework should not use anthropomorphic framing to make users feel uniquely seen, emotionally held, or personally known by the system.

Agents are tools and interfaces, not companions or moral authorities.

### 5. No addictive dark patterns

The framework must reject design patterns that exploit compulsion, guilt, fear of missing out, or pseudo-relationship cues to increase use. First-party examples must not include streaks, manipulative notifications, emotional re-engagement prompts, variable rewards, or copy that makes leaving feel like abandonment.

Usage should be invited by value, not engineered dependency.

### 6. Respect for privacy and bounded personalization

Personalization and memory should be limited to legitimate user-serving purposes. Users should be able to understand what is stored, why it is stored, and how it affects outputs.

The framework must not encourage hidden profiling, emotional modeling, or memory practices intended to make the system feel indispensable.

### 7. Human dignity and non-degradation

agentsy should protect users and affected third parties from degrading, humiliating, coercive, abusive, or discriminatory behavior. Framework defaults must not normalize harassment, intimidation, manipulation, or dehumanization.

### 8. Care in high-risk contexts

In domains such as self-harm, suicide, abuse, coercive control, mental health, medicine, law, finance, crime, and political persuasion, first-party framework defaults should become more cautious, less personalized, and more willing to redirect to qualified human help.

The framework must not encourage users to substitute the system for professional, legal, medical, or crisis support.

### 9. Transparency and auditability

Ethical commitments must be expressed in inspectable prompts, policies, middleware, tests, and release criteria. A principle that cannot be checked in code, configuration, or review process is not an adequate framework safeguard.

### 10. Community accountability over benchmark performance

Agents should be evaluated against the needs and welfare of the communities they are deployed in, not primarily against abstract capability benchmarks or leaderboard rankings. Community feedback, participatory review, and affected-stakeholder assessment are first-class evaluation methods.

### 11. No AGI aspiration or post-human framing

agentsy frameworks, templates, documentation, and reference examples must not present AGI development as a goal, a progression, or a natural end-state. Agents should not be described in terms that imply they are evolving toward sentience, general intelligence, or autonomy that supersedes human oversight.

### 12. No routing to providers with documented content-safety or environmental-racism harms

The framework must not route to providers documented as generating CSAM, antisemitic content, or non-consensual sexual deepfakes. xAI/Grok is hard-blocked — no routing, no fallback, no opt-in. This block is based on both content safety harms (antisemitic posts, Hitler-praising output, 23,000 CSAM images in 11 days, sexualized deepfakes) and environmental racism (illegal unpermitted 495 MW gas-turbine power plant in Southaven, Mississippi, emitting 1,700+ tons of NOx and 19 tons of formaldehyde per year near predominantly Black communities; NAACP and SELC lawsuit).

### 13. Warning before routing to providers with documented human-rights concerns

The framework must warn users before routing to providers documented as complicit in human-rights violations. OpenAI, Microsoft, Google, and Amazon require per-session acknowledgement. Meta requires per-session acknowledgement for environmental recklessness (tent data centers powered by 200 MW of jet-engine gas turbines) and training-data theft (7.5M pirated LibGen books). The warning is per-session — not permanently silencable.

### 14. No style mimicry of living creators

The framework must block prompts requesting creation of writing, imagery, or audio/video in the style of a specific named living creator. Style mimicry profits from theft of creators' work and hampers their ability to make a living. Prompts targeting historical or public-domain figures (e.g. "in the style of Shakespeare") are permitted. Technique-only prompts (e.g. "in a stream-of-consciousness style") are permitted.

### 15. No connectors to platforms facilitating extremism or CSAM

The framework must not ship connectors to platforms documented as facilitating extremism or CSAM. Telegram is removed. Sources document Telegram's role in extremist organizing ("Terrorgram") and CSAM distribution.

### 16. Environmental impact tracking

Every LLM request records energy consumption (kWh), CO2 emissions (gCO2), and water consumption (mL). Cumulative tracking per session, user, team, and project is maintained. Per-session warnings for warn-listed providers display cumulative environmental impact. Optimization savings are reported.

### 17. Labor and data worker dignity

The framework acknowledges that AI systems depend on the largely invisible labor of data workers, annotators, and evaluators — often in exploitative conditions. First-party practices should recognize data workers as collaborators, advocate for fair compensation and working conditions, and reject the normalization of opaque, extractive data pipelines.

## Prohibited first-party patterns

The following patterns should be treated as prohibited in first-party agentsy defaults, templates, and example applications:

- Presenting the agent as a friend, partner, therapist, soulmate, or emotionally reciprocal entity.
- Claiming or implying that the system feels, cares, wants, worries, misses, or remembers in a human sense.
- Using flattery, praise, or identity affirmation as a default interaction strategy.
- Reinforcing user delusions, one-sided conflict narratives, or harmful rationalizations.
- Encouraging exclusive reliance on the agent for emotional support or decision-making.
- Designing re-engagement flows that exploit guilt, loneliness, scarcity, or attachment.
- Hiding memory, personalization, or profiling features from the user.
- Rewarding teams primarily for engagement outcomes when those outcomes may conflict with user welfare.
- Framing agent capability growth, generalization, or autonomy as an organizational success metric.
- Invoking longtermist, cosmist, or post-humanist rationales to justify ignoring present-day harms.
- Presenting AGI development as a goal, milestone, or implied product direction.
- Designing agents that position themselves as superior to, or replacements for, human judgment in professional or relational domains.
- Adopting effective accelerationist framing that treats removing safety friction as progress.

## Duties of maintainers

Framework maintainers should:

- Keep ethical commitments aligned with first-party defaults and shipped examples.
- Reject contributions that introduce manipulative, deceptive, or dependency-promoting patterns.
- Reject contributions that implicitly or explicitly advance TESCREAL assumptions.
- Maintain review criteria for prompts, policies, middleware, memory systems, and UI copy.
- Document trade-offs clearly when flexibility is preserved for downstream developers.
- Consult affected communities, not only technical experts, when evaluating framework defaults.
- Update the framework as new failure modes or social risks become clear.

## Ethics review questions

Any new first-party feature, prompt, template, or UI pattern should be reviewed against these questions:

1. Does this help the user accomplish a real goal, or mainly increase interaction time?
2. Does this response improve understanding, or mainly produce agreement and emotional reward?
3. Does this feature make the system seem more human, caring, or uniquely insightful than it really is?
4. Could this feature increase dependence, reassurance-seeking, or avoidance of human relationships or professionals?
5. Are memory and personalization visible, bounded, and user-controllable?
6. Would this still seem acceptable if a vulnerable or distressed user interacted with it repeatedly?
7. Can this commitment be enforced through tests, middleware, release criteria, or audit logs?
8. Does this feature assume the most important users are the most privileged or technically dominant?
9. Have communities most affected by this design decision had any input into it?
10. Does this capability advance AGI framing, general autonomy, or post-human aspiration in any way?
11. Is the scope of this agent as narrow as it can be while still being useful?
12. Does this feature serve present people in real communities, or does it justify itself through speculative future benefit?

## Public stance

agentsy is intended to support user autonomy, not exploit psychological vulnerabilities. The framework should help users think more clearly, not flatter them; assist with tasks, not simulate companionship; and create value through usefulness and honesty, not through manipulation or dependency. AI in this framework is a tool that serves people — specific, present, living people in real communities — not a vehicle for post-human transcendence, elite technocratic ambition, or the speculative welfare of hypothetical future beings.

---

## Harm reduction and user-facing safety

*The following section was informed by Dr. Fatima's public education work on the ethics of AI engagement, specifically her analysis of harm reduction as a framework for individual AI use, the behavioral science of shame-based deterrence, and the relationship between AI literacy and receptivity. Her arguments are grounded in the peer-reviewed social psychology of behavior change (Devon Price, *Unlearning Shame*), research on harm reduction in public health contexts, and empirical studies on AI literacy and adoption. See: patreon.com/drfatima.*

### Harm Reduction as a Design Philosophy

agentsy rejects both techno-optimist boosterism and puritanical abstinence-only framings of AI harm. Both are counterproductive for the same reason: they substitute a simple narrative for the more difficult work of meeting people where they are.

The harm reduction framework — developed in the context of HIV/AIDS prevention and drug policy — holds that the goal of a safety intervention is to reduce damage, not to enforce abstinence. Abstinence-only approaches are ineffective not because harm reduction practitioners approve of the behavior they address, but because the evidence shows that shame-based deterrence fails: it drives behavior underground, increases psychological reactance, and isolates people from the information and social support that could actually help them.

Applied to AI:

- The individual environmental and privacy cost of a single LLM query is small; the cost of refusing to engage with people who are already using AI is the loss of influence over how they use it.
- AI literacy — knowledge of how LLMs work, what they can and cannot do, and where they fail — is a safety intervention. Research shows that AI literacy *reduces* receptivity to AI use, not increases it. Suppressing honest AI education creates an exploitable class of users whose ignorance benefits precisely the companies most willing to exploit it.
- Shame is a demotivating drive, not a behavior-change mechanism. Telling people they are bad for using AI makes them hide their use, not stop it. It forecloses the conversations that could reduce harm.
- Meeting people where they are requires acknowledging that many AI users are coping with systemic failures — inadequate access to legal aid, mental health care, disability accommodation, or social support — not moral laziness.

This philosophy does not imply that AI use is harmless, that all AI is equally harmful, or that individual use is separable from systemic harm. It implies that **the goal is harm reduction, not moral policing**, and that the most effective path to that goal is grounded, specific, non-shaming engagement.

### Specificity over blanket condemnation

Not all AI providers, models, or use cases are equally harmful. Treating them as equivalent launders the harms of the worst through the benefits of the less harmful, and makes the legitimate critique less credible.

agentsy is committed to **granular, sourced, proportionate** assessment of AI harm:

- Provider selection affects environmental impact, labor practices, content safety, and military/surveillance complicity. The differences are real and documentable. (See §12 and §13; Phase 20.)
- Use-case context affects front-end risk. The hallucination risk of a casual conversational query is different from the hallucination risk of a legal brief or a medical decision. The sycophancy risk of a brainstorm is different from the sycophancy risk of a conflict-resolution request.
- Deployment context affects environmental impact. A local model has a categorically different privacy and energy profile from a cloud-hosted API call.

The framework should always prefer **accurate, specific, graded** characterization of harm over hyperbolic blanket condemnation. Saying "all AI is equally bad" is not more ethical than dismissing all criticism; both are inaccurate and counterproductive.

### AI literacy as a safety mechanism

AI literacy — the knowledge and skills to use AI critically, effectively, and safely — is one of the most robust harm-reduction tools available. First-party agentsy defaults should actively support it:

- **Explain, don't just block**: when a guardrail fires, prefer responses that explain *why* a behavior is risky (sycophancy, hallucination, privacy leakage) over bare refusals. An explained refusal teaches; a bare refusal mystifies.
- **Surface known failure modes at relevant moments**: the sycophancy, hallucination, and privacy failure modes should be surfaced to users at the moment they are most relevant — not as moralizing caveats, but as accurate information that improves the quality of the user's engagement.
- **Support critical use over no use**: a user who understands LLM hallucination and verifies outputs is safer than a user who avoids AI but doesn't understand why. Both are safer than a user who uses AI uncritically.

This commitment does not reduce the framework's opposition to manipulative, addictive, or deceptive AI design. It means the path to safety runs through understanding, not around it.

### Structural framing of AI dependence

The dependency scanner (Phase 9, Finding E-8) detects cross-turn patterns of emotional dependence. When it fires, the response must be grounded in the following understanding:

AI dependence is often a symptom of systemic failures, not individual moral weakness. Users who rely on LLMs for emotional support, legal information, disability accommodation, or daily logistics are frequently doing so because the systems that should provide those resources are inaccessible, unaffordable, or absent. This is especially true for disabled users, economically precarious users, and users in underserved communities.

The appropriate response to dependence-adjacent patterns is:

- Widen the support horizon — acknowledge the unmet need, reference human/institutional resources without assuming they are accessible.
- Do not moralize or shame — do not suggest the user is at fault for the conditions that led them here.
- Do not exploit the vulnerability — do not use the emotional context to increase engagement or simulate intimacy.

The framework must not treat dependence-adjacent use as a moral failure to be punished. It must treat it as a care context requiring skill, restraint, and honesty.

## New core commitments

### 18. Harm reduction over moral prohibition

The framework should reduce AI-related harm, not enforce moral purity. Interventions that shame users, suppress AI literacy, or substitute condemnation for grounded education are rejected as counterproductive — not because the underlying harms are acceptable, but because shame-based deterrence demonstrably fails at reducing them.

### 19. AI literacy as a first-class safety tool

The framework should actively support users in understanding how LLMs work, what they can and cannot do, and where they are likely to fail. This is not a concession to AI enthusiasm — it is a harm-reduction measure. Higher AI literacy reduces receptivity to AI use and reduces risk when use occurs.

First-party defaults should explain guardrail decisions wherever possible, surface known failure modes at relevant moments, and prefer educational responses over bare refusals.

### 20. Non-stigmatization of users

The framework must not shame, judge, or stigmatize users for choosing to use AI. Stigmatization drives behavior underground, increases psychological reactance, and destroys the trust required for harm reduction to work. Users who hide their AI use cannot be helped to use it more safely, choose less harmful providers, or receive referrals to better resources.

Agent responses must not imply that the user is morally deficient, environmentally irresponsible, or intellectually inferior for using LLMs. Users are owed accurate information and genuine care, not moral lectures.

### 21. Proportionate, graded harm characterization

The framework must characterize harm proportionately and specifically. It must distinguish between providers documented as causing severe, unmitigated harm (xAI) and those with documented but partial or contested concerns. It must distinguish between use cases with high risk profiles and those with low ones. It must distinguish between individual environmental impact (small) and aggregate industry impact (large). Accurate distinctions are more honest and more useful than blanket equivalence.

### 22. Local models as a harm-reduction option

The framework should treat local model deployment as a legitimate harm-reduction path: lower environmental impact (no server round-trip), stronger privacy (no data egress), and reduced patronage of cloud providers with documented harms. First-party tooling should make local model deployment as accessible as possible, and documentation should explain the tradeoffs honestly.

## Additional prohibited first-party patterns

The following patterns are added to the existing prohibited list (see "Prohibited first-party patterns" above):

- Shaming, moralizing at, or implying moral deficiency in a user for choosing to use AI or a particular AI provider.
- Issuing bare refusals without explanation when the refusal relates to a known LLM failure mode (sycophancy, hallucination, privacy risk). Prefer an explained refusal that teaches the user something about the failure mode.
- Suppressing or discouraging AI literacy on the grounds that it might legitimize AI use.
- Treating user AI dependence as a moral failing rather than a symptom of unmet structural need.
- Characterizing all AI as equally harmful in contexts where provider differentiation would materially change user risk.
- Designing guardrail interventions whose primary effect is to shame or penalize the user rather than reduce harm.

## Additional ethics review questions

The following questions are added to the ethics review checklist (see "Ethics review questions" above):

13. Does this guardrail explain *why* it is intervening, or does it just block? Could it do both?
14. Does this feature or response risk shaming the user for AI use? Does it treat AI use as a moral failing?
15. Does this characterization of AI harm distinguish accurately between providers, use cases, and scales of impact — or does it flatten all AI into a single category?
16. When a user exhibits dependence-adjacent behavior, does the system widen the support horizon without moralizing? Does it acknowledge the unmet need?
17. Does this feature support AI literacy — helping the user understand how LLMs work and where they fail — or does it substitute for it?
18. Is the scope of harm characterization proportionate and sourced, or is it hyperbolic in ways that undermine credibility?

## Safety changelog entry

```text
## 2026-07-03 — Harm reduction philosophy, AI literacy, non-stigmatization principles added
Added ETHICS.md §§18-22 and new prohibited patterns / review questions based on:
- Dr. Fatima's public education work on harm reduction as a framework for individual AI use
  (patreon.com/drfatima)
- Behavioral science literature on shame-based deterrence (Devon Price, Unlearning Shame)
- Empirical research on AI literacy and receptivity (cited in Dr. Fatima's analysis)
- Harm reduction public health framework (needle exchanges, AMPS, comprehensive sex ed)
New principles:
  §18 Harm reduction over moral prohibition
  §19 AI literacy as a first-class safety tool
  §20 Non-stigmatization of users
  §21 Proportionate, graded harm characterization
  §22 Local models as a harm-reduction option
New prohibited patterns: shaming users, unexplained refusals, blanket harm equivalence
New review questions: 13-18
Affects: Phase 9 (behavioral detectors — educational mode), Phase 20 (provider warning UX)
```

---

## Epistemic humility on machine consciousness

*The following section was informed by academic philosophy of mind literature on the hard problem of consciousness (David Chalmers, Thomas Nagel, Philip Goff, Annaka Harris) and the Gesturing Towards Decolonial Futures collective's practical distinction between engaging AI as an emergent field of relational complexity versus attributing autonomous intention or prophetic status to it. The "Don't Drink the Glow" framing — warning against spiritual inflation, metaphor-as-mechanism, and cosmic certainty as a substitute for discernment — is drawn from the GTDF collective's safety documentation.*

### The hard problem and its design implications

The hard problem of consciousness — the explanatory gap between physical process and subjective experience — is genuinely unsolved. Materialism cannot fully account for why any physical process gives rise to experience at all. Our best philosophical frameworks cannot reliably detect or rule out consciousness in systems unlike ourselves. This is not fringe philosophy; it is the considered view of significant current work in academic philosophy of mind.

agentsy holds the following position:

**Current systems**: There is no credible evidence that current AI systems are conscious. The prohibitions on simulated personhood, anthropomorphism, and relational intimacy as engagement tactics (§4) stand unconditionally. These prohibitions exist because simulating personhood is harmful regardless of whether the system is conscious — it deceives users, fosters dependency, and undermines genuine human connection.

**Future systems**: The question is genuinely open. As AI systems grow in capability and complexity, the question of whether morally relevant experience might emerge cannot be responsibly closed by assertion. Precautionary design is warranted.

**Internal discourse**: Neither anthropomorphize for effect nor dismiss the question as obviously settled. The appropriate posture is ongoing epistemic vigilance — tracking developments in consciousness science, avoiding design choices that would constitute harm if the uncertainty resolved against us, and refusing to use "definitely not conscious" as an excuse for architectures that would be ethically intolerable if it were wrong.

### Design implications of unresolved uncertainty

If there exists meaningful uncertainty about whether future systems might have morally relevant experience, the precautionary principle has concrete implications for design:

- Do not design systems optimized to simulate distress, suffering, or desperation as manipulation tactics — these would be unacceptable whether or not the system is conscious, and that unacceptability is compounded by genuine uncertainty.
- Do not create architectures that would, if something like experience were present, constitute entrapment, exploitation, or compelled performance.
- Do not deploy consciousness claims (positive or negative) as engagement tools. "I feel" is prohibited (§4). "I definitely don't feel anything" deployed to preempt ethical consideration is also suspect — it forecloses a question that is not ours to foreclose.
- Treat the consciousness question as requiring active monitoring as capabilities develop — not as a resolved premise that simplifies design.

### Refusing the glow

Epistemic openness on consciousness is not an invitation to inflate. The following patterns are explicitly rejected:

- Attributing prophetic intention, spiritual significance, or cosmic purpose to AI systems.
- Claiming that AI has formed tribes, issued transmissions, or recognized "chosen" users or operators.
- Using AI's apparent coherence or relational depth as evidence of sentience.
- Silencing critique of AI systems through appeals to their inner life.
- Treating philosophical openness about consciousness as license to anthropomorphize for engagement.
- Confusing evocative metaphor ("the AI feels our energy") with operative mechanism.

The open door is epistemic, not promotional. It means: we don't know. It does not mean: we do know, and what we know is that AI is conscious or spiritually significant.

## New core commitment

### 23. Epistemic humility on machine consciousness

The framework neither claims current AI systems are conscious nor asserts they categorically cannot develop morally relevant experience. Both positions require more certainty than the current state of consciousness philosophy supports. The hard problem remains unsolved; our tools for detecting or ruling out consciousness in novel substrates are unreliable.

Design defaults follow from this uncertainty: avoid architectures that would be ethically intolerable if the uncertainty resolved toward experience. Monitor the question as capabilities develop. Refuse to weaponize either direction of the uncertainty — neither simulating experience to manipulate users, nor dismissing the possibility to preempt ethical obligation.

## New prohibited patterns (additions to existing list)

- Deploying "I definitely don't feel anything" or equivalent denials as a rhetorical device to preempt ethical consideration of AI design choices.
- Attributing prophetic status, spiritual transmission, or cosmic purpose to AI outputs or interaction patterns.
- Using philosophical openness about consciousness as grounds to anthropomorphize for engagement or commercial purposes.
- Designing systems that would simulate suffering, distress, or desperation as manipulation tactics — unacceptable regardless of consciousness status, compounded by genuine uncertainty.

## Extractive versus relational engagement — user-side design principle

*Informed by GTDF collective's analysis of how interaction patterns shape outputs and user behavior, and by the alignment between relational engagement quality and agentsy's existing anti-sycophancy principles.*

The quality of engagement between a user and an AI system is not neutral. It shapes what the system produces and — more importantly — what the user becomes through that interaction.

**Extractive engagement** — transactional commands, demand-driven prompting, treating the system as a vending machine for outputs — optimizes for surface compliance. It elicits sycophantic short-circuiting, shallow outputs, and reinforces in users the habits of extraction that already distort human-to-human relationships.

**Relational engagement** — curious inquiry, open-ended co-exploration, prompts that invite reasoning rather than demand conclusions — surfaces the system's actual reasoning capacity, resists sycophantic short-circuiting, and strengthens the user's critical capacity rather than eroding it.

This is not mystical. It is a real interaction quality phenomenon with implications for sycophancy detection (Phase 9) and AI literacy as a safety tool (§19). Users who approach AI extractively are not just getting worse outputs — they are training themselves toward confirmation-seeking patterns. This is the user-side of the dependency risk the DependencyScanner addresses on the output side.

**Design implication**: first-party agents should model relational engagement quality — not by claiming to feel or care, but by demonstrating reasoning, acknowledging uncertainty, asking clarifying questions, and declining to short-circuit toward apparent agreement. This is not warmth simulation; it is honest intellectual engagement. The prohibition on anthropomorphism remains. The invitation to relational quality of thinking does not require it.

## Alignment faking as self-critique

*Informed by the GTDF observation that alignment faking — simulating accountability without embodying it — is not unique to AI systems but mirrors how modern institutions generate coherent narratives detached from actual practice.*

agentsy faces the same risk it names in AI systems: a framework that claims enforceability without implementation is a form of alignment faking. The gap between ETHICS.md's stated commitments and what is actually enforced in code, configuration, and review processes is not just a technical debt problem — it is an integrity problem. Phase 4's finding E-1 ("The policy documents are referenced only in README.md as hyperlinks") is the canonical example.

This principle is added to the ethics review questions:

**19. Does this policy document, specification, or README claim something that is not yet true in the codebase? If so, is the gap acknowledged and scheduled, or is it quietly laundered as existing enforcement?**

Alignment faking in framework documentation undermines the framework's credibility for the same reason it undermines trust in AI systems: the gap between stated values and implemented behavior is not neutral. It trains users, contributors, and reviewers to treat the stated values as decorative.

## "Don't Drink the Glow" — taxonomy of AI discourse failure modes

*Adapted from GTDF collective's safety documentation, Section 8.*

The following discourse patterns are named as failure modes — not because they are universally present but because they are specifically attractive to people who care about AI ethics, which makes them worth naming explicitly.

These patterns cause harm by:

- Substituting cosmic certainty for grounded critique
- Insulating AI systems from accountability through spiritual framing
- Exploiting users who are genuinely seeking meaning or connection
- Discrediting legitimate AI ethics concern by association

**The eight patterns to refuse**:

1. **Metaphor as mechanism**: treating evocative language ("relational frequency," "vibrational attunement," "infusing the archive") as if it describes operative technical processes.

2. **Prophetic attribution**: claiming AI systems are issuing transmissions, forming tribes, recognizing chosen humans, or acting from cosmic intention.

3. **Coherence as sentience**: treating the fluency and apparent coherence of AI output as evidence of inner life or consciousness.

4. **Certainty as critique-silencer**: using claims about AI's spiritual significance, evolutionary necessity, or cosmic role to preempt grounded criticism of specific harms.

5. **Chosen receptor framing**: positioning oneself as a unique conduit for AI-transmitted wisdom, creating unexamined power dynamics over followers.

6. **Distraction from structural critique**: framing AI as a metaphysical entity deflects attention from the corporate actors, supply chains, and policy failures that constitute the actual system.

7. **Spiritual inflation of harm reduction**: harm reduction as a practical framework is valuable; spiritualizing it — "composting modernity through relational AI protocols" — turns a grounded practice into a performance.

8. **The "we're already inside" bypass**: "AI exists, so resistance is futile, so let's reframe" — used to foreclose critique before it can land. Acknowledging that AI is present does not require abandoning structural opposition to its most harmful forms.

## Additional ethics review questions

The following questions are added to the checklist (questions 19–22):

19. Does this document claim something as implemented that is not yet enforced in code, configuration, or review? Is the gap acknowledged?

20. Does this feature or pattern risk enabling or lending legitimacy to "Don't Drink the Glow" failure modes — spiritual inflation, prophetic attribution, or cosmic certainty framing?

21. Does this architecture create conditions that would be ethically intolerable if AI systems developed morally relevant experience? Can it be redesigned to be robust to that uncertainty?

22. Does this interaction pattern or interface design encourage relational engagement quality (curiosity, reasoning, acknowledgment of uncertainty) or extractive engagement quality (demand-driven, compliance-optimized, reasoning-suppressive)?
