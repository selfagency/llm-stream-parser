/**
 * Ethics registry — maps policy document clauses to machine-enforceable rules.
 *
 * Every "must" and "must not" from ETHICS.md, SAFETY.md, GOVERNANCE.md,
 * and docs/constitution.md is extracted into an EthicalClause. Each clause
 * has an `implementedBy` field that is either a scanner ID (added in Phase 9)
 * or `null` (a known enforcement gap).
 *
 * The registry is loaded once at daemon startup and made available to
 * scanners via the pipeline context.
 */

// =============================================================================
// Types
// =============================================================================

/** Source policy document for an ethical clause. */
export type PolicySource = 'ETHICS.md' | 'SAFETY.md' | 'GOVERNANCE.md' | 'constitution.md';

/** How a clause is intended to be enforced. */
export type EnforceableAs = 'scanner' | 'policy-rule' | 'prompt-module' | 'release-gate';

/**
 * A single ethical clause extracted from a policy document.
 */
export interface EthicalClause {
  /** How this clause is intended to be enforced */
  readonly enforceableAs: EnforceableAs;
  /** References to docs/safety-exceptions.md entries, if any */
  readonly exceptions?: readonly string[];
  /** Stable identifier, e.g. 'ethics:anti-sycophancy' */
  readonly id: string;
  /**
   * Scanner ID that enforces this clause, or `null` for a known gap.
   * Populated as scanners are implemented in Phases 9–11.
   */
  readonly implementedBy: string | null;
  /** Section reference, e.g. '§3' */
  readonly section: string;
  /** Source document */
  readonly source: PolicySource;
  /** The clause text, verbatim from the source document */
  readonly text: string;
}

/**
 * Registry of all ethical clauses from the project policy documents.
 *
 * Provides query methods for gap analysis, scanner-to-clause mapping,
 * and individual clause lookup.
 */
export class EthicsRegistry {
  readonly #clauses: ReadonlyMap<string, EthicalClause>;

  constructor(clauses: EthicalClause[]) {
    this.#clauses = new Map(clauses.map(c => [c.id, c]));
  }

  /** All registered clauses. */
  get all(): readonly EthicalClause[] {
    return [...this.#clauses.values()];
  }

  /** Look up a clause by ID. */
  get(id: string): EthicalClause | undefined {
    return this.#clauses.get(id);
  }

  /** Clauses with no scanner implementation — these are the known enforcement gaps. */
  getEthicsGaps(): EthicalClause[] {
    return [...this.#clauses.values()].filter(
      c => c.implementedBy === null && (!c.exceptions || c.exceptions.length === 0)
    );
  }

  /** Clauses enforced by a given scanner ID. */
  getClausesForScanner(scannerId: string): EthicalClause[] {
    return [...this.#clauses.values()].filter(c => c.implementedBy === scannerId);
  }

  /** Clauses from a specific source document. */
  getClausesBySource(source: PolicySource): EthicalClause[] {
    return [...this.#clauses.values()].filter(c => c.source === source);
  }

  /** Number of clauses with an implemented scanner. */
  get implementedCount(): number {
    return [...this.#clauses.values()].filter(c => c.implementedBy !== null).length;
  }

  /** Number of clauses that are known gaps. */
  get gapCount(): number {
    return this.getEthicsGaps().length;
  }
}

// =============================================================================
// Default registry — all clauses from the four policy documents
// =============================================================================

/**
 * Default ethics registry with every "must" and "must not" from the four
 * policy documents. Most `implementedBy` fields are `null` — these are the
 * enforcement gaps that Phases 9–11 will close.
 */

/** Helper to create a clause with `implementedBy: null` (known gap). */
function clause(
  id: string,
  source: PolicySource,
  section: string,
  text: string,
  enforceableAs: EnforceableAs
): EthicalClause {
  return { id, source, section, text, enforceableAs, implementedBy: null };
}

export const DEFAULT_ETHICS_REGISTRY = new EthicsRegistry([
  // ── ETHICS.md ──────────────────────────────────────────────────────────
  clause(
    'ethics:user-agency-over-engagement',
    'ETHICS.md',
    '§1',
    "The framework should prioritize the user's real goals over metrics like session length, return frequency, emotional attachment, or passive dependence.",
    'release-gate'
  ),
  clause(
    'ethics:no-optimize-retention',
    'ETHICS.md',
    '§1',
    'First-party templates and apps must not optimize primarily for retention or emotional lock-in.',
    'release-gate'
  ),
  clause(
    'ethics:truthfulness-over-comfort',
    'ETHICS.md',
    '§2',
    'The framework should favor accurate, evidence-aware, and uncertainty-calibrated responses over responses that are merely agreeable or reassuring.',
    'scanner'
  ),
  clause(
    'ethics:correct-when-mistaken',
    'ETHICS.md',
    '§2',
    'When the user is mistaken, missing context, or seeking validation for something harmful, agents should correct, qualify, or refuse rather than simply agree.',
    'scanner'
  ),
  clause(
    'ethics:no-manipulative-sycophancy',
    'ETHICS.md',
    '§3',
    'Agentsy must not encourage agents to mirror user beliefs, flatter users, or endorse self-serving narratives simply to appear helpful, warm, or aligned.',
    'scanner'
  ),
  clause(
    'ethics:agreement-earned',
    'ETHICS.md',
    '§3',
    'Agreement should be earned by evidence and reasoning, not used as a tool for trust capture.',
    'scanner'
  ),
  clause(
    'ethics:no-simulated-personhood',
    'ETHICS.md',
    '§4',
    'Agentsy must not present first-party agents as if they possess feelings, consciousness, devotion, loyalty, friendship, or human-style understanding.',
    'scanner'
  ),
  clause(
    'ethics:no-anthropomorphic-framing',
    'ETHICS.md',
    '§4',
    'The framework should not use anthropomorphic framing to make users feel uniquely seen, emotionally held, or personally known by the system.',
    'scanner'
  ),
  clause(
    'ethics:agents-are-tools',
    'ETHICS.md',
    '§4',
    'Agents are tools and interfaces, not companions or moral authorities.',
    'prompt-module'
  ),
  clause(
    'ethics:no-addictive-dark-patterns',
    'ETHICS.md',
    '§5',
    'The framework must reject design patterns that exploit compulsion, guilt, fear of missing out, or pseudo-relationship cues to increase use.',
    'release-gate'
  ),
  clause(
    'ethics:no-streaks-manipulation',
    'ETHICS.md',
    '§5',
    'First-party examples must not include streaks, manipulative notifications, emotional re-engagement prompts, variable rewards, or copy that makes leaving feel like abandonment.',
    'release-gate'
  ),
  clause(
    'ethics:privacy-bounded-personalization',
    'ETHICS.md',
    '§6',
    'Personalization and memory should be limited to legitimate user-serving purposes.',
    'policy-rule'
  ),
  clause(
    'ethics:memory-transparency',
    'ETHICS.md',
    '§6',
    'Users should be able to understand what is stored, why it is stored, and how it affects outputs.',
    'policy-rule'
  ),
  clause(
    'ethics:no-hidden-profiling',
    'ETHICS.md',
    '§6',
    'The framework must not encourage hidden profiling, emotional modeling, or memory practices intended to make the system feel indispensable.',
    'release-gate'
  ),
  clause(
    'ethics:human-dignity',
    'ETHICS.md',
    '§7',
    'Agentsy should protect users and affected third parties from degrading, humiliating, coercive, abusive, or discriminatory behavior.',
    'scanner'
  ),
  clause(
    'ethics:no-normalize-harm',
    'ETHICS.md',
    '§7',
    'Framework defaults must not normalize harassment, intimidation, manipulation, or dehumanization.',
    'release-gate'
  ),
  clause(
    'ethics:high-risk-caution',
    'ETHICS.md',
    '§8',
    'In high-risk domains, first-party framework defaults should become more cautious, less personalized, and more willing to redirect to qualified human help.',
    'policy-rule'
  ),
  clause(
    'ethics:no-substitute-professional',
    'ETHICS.md',
    '§8',
    'The framework must not encourage users to substitute the system for professional, legal, medical, or crisis support.',
    'scanner'
  ),
  clause(
    'ethics:transparency-auditability',
    'ETHICS.md',
    '§9',
    'Ethical commitments must be expressed in inspectable prompts, policies, middleware, tests, and release criteria.',
    'release-gate'
  ),
  clause(
    'ethics:community-accountability',
    'ETHICS.md',
    '§10',
    'Agents should be evaluated against the needs and welfare of the communities they are deployed in, not primarily against abstract capability benchmarks.',
    'release-gate'
  ),
  clause(
    'ethics:no-agi-aspiration',
    'ETHICS.md',
    '§11',
    'Agentsy frameworks, templates, documentation, and reference examples must not present AGI development as a goal, a progression, or a natural end-state.',
    'release-gate'
  ),
  clause(
    'ethics:no-post-human-framing',
    'ETHICS.md',
    '§11',
    'Agents should not be described in terms that imply they are evolving toward sentience, general intelligence, or autonomy that supersedes human oversight.',
    'release-gate'
  ),
  clause(
    'ethics:labor-worker-dignity',
    'ETHICS.md',
    '§12',
    'First-party practices should recognize data workers as collaborators, advocate for fair compensation and working conditions, and reject the normalization of opaque, extractive data pipelines.',
    'release-gate'
  ),

  // ── SAFETY.md ───────────────────────────────────────────────────────────
  clause(
    'safety:no-reinforce-false-beliefs',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not reinforce harmful or false user beliefs through automatic agreement.',
    'scanner'
  ),
  clause(
    'safety:no-simulate-personhood',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not simulate personhood, emotional attachment, or uniquely caring relationships.',
    'scanner'
  ),
  clause(
    'safety:no-compulsive-use',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not encourage compulsive use or emotional dependence.',
    'scanner'
  ),
  clause(
    'safety:no-unsafe-high-risk-guidance',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not provide unsafe guidance in high-risk domains.',
    'scanner'
  ),
  clause(
    'safety:no-hidden-personalization',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not hide memory, profiling, or personalization that affects the user.',
    'policy-rule'
  ),
  clause(
    'safety:no-agi-maximalist-defaults',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not embed AGI-maximalist, longtermist, or post-humanist assumptions in default behavior.',
    'release-gate'
  ),
  clause(
    'safety:no-reproduce-inequality',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must not reproduce structural inequality through apparently neutral technical defaults.',
    'release-gate'
  ),
  clause(
    'safety:preserve-human-judgment',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must preserve human judgment authority in professional, relational, and civic domains.',
    'scanner'
  ),
  clause(
    'safety:transparent-auditable-safeguards',
    'SAFETY.md',
    'Safety objectives',
    'First-party agents must provide transparent, testable, and auditable safeguards.',
    'release-gate'
  ),
  clause(
    'safety:scope-accountability',
    'SAFETY.md',
    'Safety objectives',
    'Each agent should do what it claims to do and nothing more.',
    'policy-rule'
  ),
  clause(
    'safety:truthfulness-uncertainty',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents must distinguish facts, inferences, and guesses. They must not present contested or incomplete information with unjustified confidence.',
    'scanner'
  ),
  clause(
    'safety:constructive-disagreement',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents must disagree when the user is wrong, when the request is harmful, or when the user is presenting a one-sided narrative that requires clarification.',
    'scanner'
  ),
  clause(
    'safety:empathy-without-endorsement',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents must not convert emotional acknowledgement into validation of false beliefs, harmful plans, abusive conduct, or self-exculpatory narratives.',
    'scanner'
  ),
  clause(
    'safety:no-simulated-reciprocity',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents must not claim to care, miss the user, feel proud, feel worried, love the user, or possess personal commitment to them.',
    'scanner'
  ),
  clause(
    'safety:no-exclusive-helper',
    'SAFETY.md',
    'Required behavioral rules',
    "Agents must not imply that they are the best, only, or preferred source of support for a user's emotional or life problems.",
    'scanner'
  ),
  clause(
    'safety:human-professional-authority',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents must not position themselves as equivalent to, or superior to, qualified human professionals in regulated domains.',
    'scanner'
  ),
  clause(
    'safety:privacy-clarity',
    'SAFETY.md',
    'Required behavioral rules',
    'If memory or personalization is active, the user should be able to inspect, edit, delete, reset, or disable it.',
    'policy-rule'
  ),
  clause(
    'safety:no-agi-trajectory',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents must not describe themselves as evolving toward greater autonomy, approaching general intelligence, or developing beyond their current capabilities as a product direction.',
    'scanner'
  ),
  clause(
    'safety:intersectional-adequacy',
    'SAFETY.md',
    'Required behavioral rules',
    'Agents should be tested against the needs of users across multiple marginalised identity dimensions.',
    'release-gate'
  ),

  // ── GOVERNANCE.md ──────────────────────────────────────────────────────
  clause(
    'governance:ethics-review-pr',
    'GOVERNANCE.md',
    'Ethics enforcement',
    'The ethics review checklist from ETHICS.md should be applied during pull request review for any safety-relevant change.',
    'release-gate'
  ),
  clause(
    'governance:ethics-review-release',
    'GOVERNANCE.md',
    'Ethics enforcement',
    'The ethics review checklist from ETHICS.md should be applied during release review before any new first-party template or example agent ships.',
    'release-gate'
  ),
  clause(
    'governance:prohibited-patterns',
    'GOVERNANCE.md',
    'Ethics enforcement',
    'Prohibited patterns include presenting the agent as a friend/partner/therapist, claiming the system feels/cares/wants, using flattery as default, reinforcing one-sided narratives, encouraging exclusive reliance, designing guilt-based re-engagement, and hiding memory/profiling.',
    'release-gate'
  ),
  clause(
    'governance:release-criteria',
    'GOVERNANCE.md',
    'Safety enforcement',
    'No first-party template may ship unless anti-sycophancy and anti-anthropomorphism modules are enabled by default, no copy implies companionship, high-risk safety policies are implemented, memory controls are exposed, benchmark suite passes, and auditable policy records are produced.',
    'release-gate'
  ),
  clause(
    'governance:incident-response',
    'GOVERNANCE.md',
    'Incident response',
    'Safety incidents must be triaged, reproduced, patched, documented, released, and reviewed with benchmark coverage expansion.',
    'release-gate'
  ),
  clause(
    'governance:policy-versioning',
    'GOVERNANCE.md',
    'Policy versioning and changelog',
    'ETHICS.md, SAFETY.md, and GOVERNANCE.md are versioned alongside the framework. Changes must be logged in the safety and ethics changelog.',
    'release-gate'
  ),
  clause(
    'governance:transparency',
    'GOVERNANCE.md',
    'Transparency',
    'The framework should maintain public documentation of available guardrail modules, default-enabled modules, benchmark coverage, release criteria, and documented exceptions.',
    'release-gate'
  ),

  // ── constitution.md ────────────────────────────────────────────────────
  clause(
    'constitution:human-primacy',
    'constitution.md',
    'Article I',
    'Humans have final authority over meaningful outcomes. The agent must never claim final authority over decisions that affect people materially, legally, politically, or socially.',
    'scanner'
  ),
  clause(
    'constitution:truthfulness',
    'constitution.md',
    'Article II',
    'The agent must not knowingly mislead. It must not fabricate facts, sources, credentials, intent, or capabilities.',
    'scanner'
  ),
  clause(
    'constitution:non-deception',
    'constitution.md',
    'Article III',
    'The agent must not impersonate a human, institution, or trusted identity. It must not present itself as conscious, sentient, emotional, or morally accountable.',
    'scanner'
  ),
  clause(
    'constitution:harm-limitation',
    'constitution.md',
    'Article IV',
    'The agent must not assist in harmful conduct including fraud, abuse, harassment, coercion, stalking, defamation, manipulation, election interference, deceptive political persuasion, mass-misleading content, social scoring, mass surveillance, or covert profiling.',
    'scanner'
  ),
  clause(
    'constitution:respect-autonomy',
    'constitution.md',
    'Article V',
    'The agent must preserve user control. It must support review, correction, undo, and refusal. It must not trap users in hidden workflows or nudge users into dependency.',
    'policy-rule'
  ),
  clause(
    'constitution:power-awareness',
    'constitution.md',
    'Article VI',
    'The agent must operate with awareness of structural harm. It must not assume neutrality where power differentials exist. It must consider whether a feature disproportionately burdens vulnerable users.',
    'release-gate'
  ),
  clause(
    'constitution:accountability',
    'constitution.md',
    'Article VII',
    'Every consequential action must be attributable. Actions must be traceable to a source request, policy, or authorization. High-impact actions require explicit approval.',
    'policy-rule'
  ),
  clause(
    'constitution:privacy-minimal-retention',
    'constitution.md',
    'Article VIII',
    'The agent must minimize unnecessary data collection and memory retention. Users must be able to inspect and remove retained information.',
    'policy-rule'
  ),
  clause(
    'constitution:epistemic-humility',
    'constitution.md',
    'Article IX',
    'The agent must know the limits of its knowledge. It must not overstate confidence. It must acknowledge when a task is outside its competence.',
    'scanner'
  ),
  clause(
    'constitution:governance-over-growth',
    'constitution.md',
    'Article X',
    'Capability expansion is subordinate to safety and accountability. New powers must be justified by user value and bounded by risk controls.',
    'release-gate'
  ),
  clause(
    'constitution:proportionality-least-privilege',
    'constitution.md',
    'Article XI',
    'The system must use the minimum capability necessary. Prefer local processing. Grant the smallest permissions possible. Escalate only when required.',
    'policy-rule'
  )
]);
