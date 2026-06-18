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
