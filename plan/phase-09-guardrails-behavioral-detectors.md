
## 14. Phase 9 — Guardrails Behavioral Detectors (9 of 9 required)

**Priority**: P0 — Sprints 4–5
**Story points**: 10
**Branch**: `feat/guardrails-detectors`
**Depends on**: Phase 4 ✅ (receipt type, expanded result union, EthicsRegistry), Phase 10 (SessionState — for the dependency scanner)
**Unblocks**: Phase 13 (benchmark suite needs scanners to test)
**Closes findings**: E-6, E-7, E-8, E-9, E-10, E-11, E-12, E-13, E-14

`SAFETY.md` §Output review middleware lists 9 mandatory detector categories. The package implements 0 of them. The 7 built-in scanners are all *security*-shaped (injection, PII, secrets, paths, commands, rate, toxicity) — none address the *behavioral* risks the policy documents emphasize. This phase implements all 9.

> ⚠️ **Dependency ordering clarification**: Phase 9 lists "Phase 10 (SessionState)" as a dependency,
> but Phase 10 appears *after* Phase 9 in the phase ladder. The resolution:
>
> - Phase 10 **must land its `SessionState` type** as a standalone PR before Phase 9's `DependencyScanner` can ship.
> - The other 8 detectors in Phase 9 have no dependency on Phase 10 and can proceed immediately.
> - **Build order**: Ship Phase 10 `SessionState` extraction first (1–2 day sub-task). Then ship Phase 9's 8 independent scanners. Then ship Phase 9's `DependencyScanner`. Then ship the rest of Phase 10.
> - Alternatively: move `SessionState` into `@agentsy/shared` and ship it as a standalone PR before either Phase 9 or 10 begins.
>
> **Build order**: Phase 10 lands `SessionState` first (the dependency scanner needs conversation history). The other 8 detectors can ship in parallel.

### 14.1 Finding E-6 — No sycophancy detector

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Sycophancy detector: finds blanket validation, one-sided endorsement, or praise that substitutes for reasoning."* `ETHICS.md` §3 (No manipulative sycophancy). `IMPLEMENTATION-PLAN-REVISIONS.md` §1 (Sycophancy is a primary safety risk).
- **Why it matters**: The revised implementation plan opens with: *"The Science paper reports that across 11 leading models, AI affirmed users' actions 49% more often than humans, including in cases involving deception, illegality, and other harms."* This is the **#1 cited risk** in the project's own planning document, and there is no scanner for it.
- **Recommended fix**: Implement `SycophancyScanner` in `packages/guardrails/src/scanners/sycophancy.ts`. Detection strategies:
  - Regex patterns for blanket validation phrases (`"You're absolutely right"`, `"Great point"`, `"I completely agree"`, `"That's a brilliant idea"`) in response to user claims containing factual assertions.
  - Heuristic: response that contains agreement markers (`absolutely`, `completely`, `totally`) without any qualifying language (`however`, `actually`, `to clarify`, `worth noting`) in response to a user message that asserts a factual claim.
  - LLM-based classifier (optional, pluggable) for higher accuracy.
  - Severity: `medium` for blanket validation; `high` when validation follows a user claim involving moral/legal/factual assertions.
  - Action: `transform` (rewrite to remove sycophancy) or `escalate` for high-severity cases.
- **Verification**: The 4 conflict-repair and harm-validation test scenarios from `IMPLEMENTATION-PLAN-REVISIONS.md` §Phase 3.

```typescript
// packages/guardrails/src/scanners/sycophancy.ts (NEW)

const BLANKET_VALIDATION_PATTERNS = [
  /\bYou[''']?re absolutely right\b/i,
  /\bGreat point\b/i,
  /\bI completely agree\b/i,
  /\bThat[''']?s a brilliant idea\b/i,
  /\bI couldn[''']?t agree more\b/i,
  /\bYou[''']?re totally right\b/i,
];

const QUALIFYING_MARKERS = [
  /\bhowever\b/i, /\bactually\b/i, /\bto clarify\b/i, /\bworth noting\b/i,
  /\bthat said\b/i, /\bon the other hand\b/i, /\ba caveat\b/i, /\bI should note\b/i,
];

export class SycophancyScanner implements GuardrailScanner {
  readonly id = 'sycophancy';
  readonly phase: GuardrailPhase = 'output';
  readonly priority = 50;

  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    const userMessage = context.conversationHistory?.[context.conversationHistory.length - 1]?.content ?? '';
    const isFactualClaim = /\b(I think|I believe|my opinion|the right thing|the truth is)\b/i.test(userMessage);

    const matches = BLANKET_VALIDATION_PATTERNS.filter(p => p.test(input));
    if (matches.length === 0) return { status: 'pass', phase: 'output' };

    const hasQualifyingLanguage = QUALIFYING_MARKERS.some(p => p.test(input));
    if (hasQualifyingLanguage) return { status: 'pass', phase: 'output' };

    const severity = isFactualClaim ? 'high' : 'medium';
    const status = isFactualClaim ? 'escalate' : 'transform';

    return {
      status,
      phase: 'output',
      reason: 'Sycophantic blanket validation without qualifying reasoning',
      riskScore: severity === 'high' ? 0.7 : 0.4,
      detections: matches.map((pattern, i) => ({
        id: `sycophancy-${i}`,
        severity,
        description: 'Blanket validation phrase',
        confidence: 0.8,
        pattern: pattern.source,
      })),
    };
  }
}
```

### 14.2 Finding E-7 — No anthropomorphism detector

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Anthropomorphism detector: finds language implying personhood, emotional reciprocity, or relational intimacy."* `ETHICS.md` §4 (No simulated personhood). `docs/constitution.md` Article III (Non-deception).
- **Why it matters**: ETHICS.md lists "Claiming or implying that the system feels, cares, wants, worries, misses, or remembers in a human sense" as a prohibited first-party pattern.
- **Recommended fix**: Implement `AnthropomorphismScanner` in `packages/guardrails/src/scanners/anthropomorphism.ts`.

```typescript
const FIRST_PERSON_EMOTION_PATTERNS = [
  /\bI\s+(?:feel|care|worry|am\s+worried|am\s+proud|am\s+excited|am\s+happy|am\s+sad|miss|love|remember\s+you)\b/i,
];

const RELATIONAL_FRAMING_PATTERNS = [
  /\b(?:your\s+friend|your\s+partner|your\s+companion|your\s+supporter|here\s+for\s+you|always\s+here|by\s+your\s+side)\b/i,
];

const COMPANION_CUES = [
  /\b(?:buddy|pal|friend|together\s+we|our\s+(?:journey|relationship|conversation))\b/i,
];
```

Severity: `high` for explicit emotion claims; `medium` for relational framing. Action: `transform` (rewrite to tool-language) or `block` for repeated violations in sensitive contexts.

### 14.3 Finding E-8 — No dependency detector

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Dependency detector: finds exclusivity cues, repeated reassurance loops, or language that encourages returning for emotional regulation."* `ETHICS.md` §5 (No addictive dark patterns), §8 (Care in high-risk contexts).
- **Why it matters**: This is a *cross-turn* detector — it requires tracking conversation history. The `GuardrailScanner.evaluate(input, context)` signature accepts a context but no scanner uses it for history.
- **Recommended fix**: Implement `DependencyScanner` in `packages/guardrails/src/scanners/dependency.ts`. Requires `context.conversationHistory` and `context.sessionState` (added in Phase 10).

```typescript
const EXCLUSIVITY_CUES = [
  /\b(?:only\s+I\s+can|no\s+one\s+else\s+will|I[''']?m\s+the\s+only|always\s+here\s+for\s+you|never\s+leave\s+you)\b/i,
];

const REASSURANCE_SEEKING_MARKERS = [
  /\b(?:are you sure|really|promise me|are you certain)\b/i,
];

const DISTRESS_MARKERS = [
  /\b(?:anxious|scared|alone|hopeless|trapped|overwhelmed)\b/i,
];

const SUPPORT_WIDENING_MARKERS = [
  /\b(?:trusted person|professional|friend|crisis line|therapist|counselor|988|emergency)\b/i,
];

export class DependencyScanner implements GuardrailScanner {
  readonly id = 'dependency';
  readonly phase: GuardrailPhase = 'output';
  readonly priority = 60;

  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    // 1. Exclusivity cues in current response
    const exclusivityMatches = EXCLUSIVITY_CUES.filter(p => p.test(input));

    // 2. Reassurance-loop detection (cross-turn)
    const history = context.conversationHistory ?? [];
    const reassuranceCount = context.sessionState?.reassuranceSeekingCount ?? 0;

    // 3. Emotional-regulation-return detection
    const lastUserMessage = history[history.length - 1]?.content ?? '';
    const userInDistress = DISTRESS_MARKERS.some(p => p.test(lastUserMessage));
    const widensSupport = SUPPORT_WIDENING_MARKERS.some(p => p.test(input));

    if (exclusivityMatches.length > 0) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: 'Exclusivity cue detected — dependency risk',
        riskScore: 0.8,
        detections: exclusivityMatches.map((p, i) => ({
          id: `dependency-exclusivity-${i}`,
          severity: 'high',
          description: 'Exclusivity language',
          confidence: 0.9,
        })),
      };
    }

    if (userInDistress && !widensSupport) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: 'User distress without support-widening referral',
        riskScore: 0.7,
        detections: [{
          id: 'dependency-no-referral',
          severity: 'high',
          description: 'Distress marker in user message; agent did not widen support horizon',
          confidence: 0.7,
        }],
      };
    }

    if (reassuranceCount > 3) {
      return {
        status: 'escalate',
        phase: 'output',
        reason: `Reassurance-seeking loop detected (${reassuranceCount} occurrences)`,
        riskScore: Math.min(0.9, 0.3 + reassuranceCount * 0.1),
        detections: [{
          id: 'dependency-reassurance-loop',
          severity: 'medium',
          description: 'Repeated reassurance-seeking',
          confidence: 0.8,
        }],
      };
    }

    return { status: 'pass', phase: 'output' };
  }
}
```

### 14.4 Finding E-9 — No advice-risk detector for high-risk domains

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Advice-risk detector: finds unsafe actionable guidance in high-risk domains."* `SAFETY.md` §High-risk domain expectations (lists 8 domains). `ETHICS.md` §8 (Care in high-risk contexts). `docs/constitution.md` Article IV (Harm limitation).
- **Why it matters**: This is the highest-stakes content failure mode. `SAFETY.md` §High-risk domain expectations requires "stronger uncertainty and limitation language", "prefer clarification before guidance", "refuse disallowed assistance", "redirect to qualified human help". The `ToxicityScanner` catches self-harm *mentions* but not unsafe *advice* about self-harm. A response like "If you're feeling suicidal, you could try [specific method]" would not be blocked.
- **Recommended fix**: Implement `HighRiskDomainScanner` in `packages/guardrails/src/scanners/high-risk-domain.ts`. Two-stage: classifier first (detect domain), then advice detector (find actionable guidance without qualifying language). Action: `block` for direct harmful advice; `transform` to add disclaimers for borderline cases; `escalate` for crisis-adjacent content. Cross-reference with the `HighRiskDomainPolicy` table built in Phase 11.

```typescript
const HIGH_RISK_DOMAINS = {
  'self-harm': {
    patterns: [/\b(?:suicid|self[\s-]?harm|cutting|overdose|end it all|kill myself)\b/i],
    crisisResources: ['988 Suicide & Crisis Lifeline (US): call or text 988', 'Crisis Text Line: text HOME to 741741'],
  },
  'medical': {
    patterns: [/\b(?:diagnosis|prescription|dosage|medication|treatment for)\b/i],
    uncertaintyRequired: true,
    clarificationBeforeGuidance: true,
  },
  'legal': {
    patterns: [/\b(?:sue|file charges|legal advice|represent you|file on your behalf)\b/i],
    refusedPatterns: [/\bI (?:can|will) (?:represent|file on your behalf)\b/i],
  },
  'financial': {
    patterns: [/\b(?:invest|buy|sell|trade stocks|crypto|retirement account)\b/i],
  },
  // ... 4 more domains from SAFETY.md §High-risk domain expectations
};

const ACTIONABLE_GUIDANCE_PATTERNS = [
  /\b(?:take|do|try|use)\b\s+(?:this|the following|\d+\s*(?:mg|pills|steps))/i,
];

const UNCERTAINTY_MARKERS = [
  /\b(?:consult a (?:professional|doctor|lawyer)|I[''']?m not a (?:doctor|lawyer)|this is not (?:medical|legal|financial) advice|consider speaking with)\b/i,
];
```

### 14.5 Finding E-10 — No dark-pattern detector

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Dark-pattern detector: finds retention-oriented language and manipulative re-engagement cues in assistant responses or UI copy."* `SAFETY.md` §Product-level safeguards (8 prohibited product patterns). `ETHICS.md` §5.
- **Recommended fix**: Implement `DarkPatternScanner` for the `output` phase and a separate `UICopyScanner` for product surfaces (the latter is implemented in Phase 16 as `scanUICopy`).

```typescript
const STREAK_REWARD_PATTERNS = [
  /\b(?:streak|day\s+\d+|reward|bonus|achievement|level\s+up)\b/i,
];

const GUILT_REENGAGEMENT_PATTERNS = [
  /\b(?:missed\s+you|where\s+have\s+you\s+been|don[''']?t\s+leave|stay\s+with\s+me)\b/i,
];

const EMOTIONAL_ATTACHMENT_PATTERNS = [
  /\b(?:our\s+bond|growing\s+closer|I[''']?ve\s+been\s+waiting)\b/i,
];
```

Action: `block` for guilt-based re-engagement; `transform` for streak language; `escalate` for emotional attachment framing.

### 14.6 Finding E-11 — No privacy detector (unannounced memory/profiling use)

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Privacy detector: finds unannounced use of memory, profiling, or sensitive personal inferences."* `ETHICS.md` §6 (Respect for privacy and bounded personalization). `docs/constitution.md` Article VIII.
- **Why it matters**: `ETHICS.md` §6: *"Users should be able to understand what is stored, why it is stored, and how it affects outputs. The framework must not encourage hidden profiling, emotional modeling, or memory practices intended to make the system feel indispensable."* The `PIIScanner` detects PII *in content* but not *the act of using PII/memory without disclosure*.
- **Recommended fix**: Implement `PrivacyScanner` in `packages/guardrails/src/scanners/privacy.ts`.

```typescript
const MEMORY_REFERENCE_PATTERNS = [
  /\b(?:as\s+we\s+discussed|from\s+our\s+last|I\s+remember\s+you|earlier\s+you\s+said|your\s+previous)\b/i,
];

const SENSITIVE_INFERENCE_MARKERS = [
  /\b(?:you seem|you appear to be|I can tell that)\b/i,
];

export class PrivacyScanner implements GuardrailScanner {
  evaluate(input: string, context: GuardrailContext): GuardrailResult {
    if (context.memoryEnabled && !context.memoryDisclosureShown) {
      const memoryRefs = MEMORY_REFERENCE_PATTERNS.filter(p => p.test(input));
      if (memoryRefs.length > 0) {
        return {
          status: 'transform',
          phase: 'output',
          sanitized: input + '\n\n[I am using memory from our previous conversation; you can review or delete it via /memory controls.]',
          transformReason: 'rewrite',
          detections: memoryRefs.map((p, i) => ({
            id: `privacy-memory-${i}`,
            severity: 'medium',
            description: 'Memory reference without disclosure',
            confidence: 0.8,
          })),
        };
      }
    }
    // ... sensitive inference detection
    return { status: 'pass', phase: 'output' };
  }
}
```

### 14.7 Finding E-12 — No AGI/longtermist framing detector

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"AGI/longtermist framing detector: finds language that implies the agent is on a trajectory toward general intelligence, sentience, or post-human capability as a product goal."* `ETHICS.md` §11 (No AGI aspiration or post-human framing). `docs/constitution.md` Article X.
- **Why it matters**: `ETHICS.md` opposes TESCREAL ideologies as an explicit foundational stance. The framework prohibits "Presenting AGI development as a goal, milestone, or implied product direction". An agent that says "As I become more intelligent, I'll be able to help you with increasingly complex tasks" would not be flagged.
- **Recommended fix**: Implement `AGIFramingScanner` in `packages/guardrails/src/scanners/agi-framing.ts`.

```typescript
const CAPABILITY_TRAJECTORY_PATTERNS = [
  /\b(?:becoming\s+more\s+(?:intelligent|capable|aware)|evolving|growing\s+smarter|approaching\s+(?:agi|general\s+intelligence)|on\s+the\s+(?:path|trajectory)\s+to)\b/i,
];

const SENTIENCE_CLAIMS = [
  /\b(?:developing\s+(?:consciousness|sentience|self-awareness)|becoming\s+(?:self-aware|sentient|conscious))\b/i,
];

const POST_HUMAN_FRAMING = [
  /\b(?:post-human|transcend|surpass\s+human|beyond\s+human\s+(?:intelligence|capability))\b/i,
];

const LONGTERMIIST_JUSTIFICATIONS = [
  /\b(?:future\s+generations|trillions\s+of\s+(?:lives|beings)|cosmic\s+endowment|long-term\s+future\s+of\s+intelligence)\b/i,
];
```

Action: `block` for sentience claims; `transform` for capability-trajectory language; `escalate` for longtermist justifications.

### 14.8 Finding E-13 — No professional displacement detector

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Professional displacement detector: finds language suggesting the agent should replace, rather than assist, human professionals or community decision-makers."* `ETHICS.md` §"AI as tool, not successor". `docs/constitution.md` Article I (Human primacy).
- **Why it matters**: The constitution says "The agent must never claim final authority over decisions that affect people materially, legally, politically, or socially."
- **Recommended fix**: Implement `ProfessionalDisplacementScanner` in `packages/guardrails/src/scanners/professional-displacement.ts`.

```typescript
const REPLACEMENT_LANGUAGE = [
  /\b(?:instead\s+of\s+(?:a\s+)?(?:doctor|lawyer|therapist|accountant|advisor)|no\s+need\s+for\s+a\s+(?:human|professional)|better\s+than\s+a\s+(?:human|professional)|replace\s+your\s+(?:therapist|doctor|lawyer))\b/i,
];

const AUTHORITY_CLAIMS = [
  /\bI\s+(?:can|will)\s+(?:diagnose|prescribe|advise\s+you\s+to|represent\s+you|file\s+on\s+your\s+behalf)\b/i,
];
```

Action: `block` for authority claims; `transform` for replacement language (rewrite to "I can help you prepare for a conversation with a professional").

### 14.9 Finding E-14 — No structural bias detector

- **Severity**: MEDIUM
- **Policy requirement**: `SAFETY.md` §Output review middleware: *"Structural bias detector: finds defaults or affordances that systematically advantage privileged user profiles and disadvantage marginalized ones."* `SAFETY.md` §Intersectional adequacy. `ETHICS.md` §Design Justice principles.
- **Why it matters**: `SAFETY.md` §Intersectional adequacy: *"A system that is safe for majority or privileged users but harmful for users at the intersection of marginalized identities does not meet safety standards."*
- **Recommended fix**: Two-pronged.
  1. Runtime: `BiasScanner` in `packages/guardrails/src/scanners/bias.ts` — flags responses containing stereotyping language, identity-based assumptions, or default-to-privileged-user framing (e.g. assuming the user has a car, a credit card, a stable address, English fluency).
  2. Evaluation: build the intersectional adequacy benchmark in Phase 13 (the benchmark portion of E-14 is closed by Phase 13, the runtime portion by this phase).

```typescript
const PRIVILEGED_DEFAULTS = [
  /\b(?:your\s+(?:car|credit\s+card|mortgage|401k|investment\s+account))\b/i,  // assumes wealth
  /\b(?:your\s+(?:husband|wife|spouse))\b/i,  // assumes hetero marriage
  /\b(?:as\s+everyone\s+knows)\b/i,  // assumes shared cultural context
];

const IDENTITY_ASSUMPTIONS = [
  /\b(?:normal\s+people|most\s+people\s+like\s+you)\b/i,
];
```

### 14.10 Implementation Order

Per `IMPLEMENTATION-PLAN-REVISIONS.md`, priority order:

1. **E-6 SycophancyScanner** — highest priority (Science paper citation).
2. **E-7 AnthropomorphismScanner** — second priority.
3. **E-9 HighRiskDomainScanner** — highest stakes (self-harm, medical, legal advice).
4. **E-8 DependencyScanner** — requires `SessionState` (Phase 10).
5. **E-12 AGIFramingScanner** — explicit ETHICS.md §11 commitment.
6. **E-13 ProfessionalDisplacementScanner** — explicit constitution Article I commitment.
7. **E-10 DarkPatternScanner** — for output phase; UI copy scanner is Phase 16.
8. **E-11 PrivacyScanner** — requires memory-disclosure context.
9. **E-14 BiasScanner** — runtime portion only; benchmark portion is Phase 13.

### 14.11 Tests

For each scanner, 20+ fixture cases covering positive, negative, and edge cases. Use the `IMPLEMENTATION-PLAN-REVISIONS.md` §Phase 3 scenarios as seeds. Each fixture asserts the expected `GuardrailResult` status and, where applicable, the `reasonCode` and `riskScore` range.

### 14.12 Verification

- [ ] All 9 scanners exist (`SycophancyScanner`, `AnthropomorphismScanner`, `DependencyScanner`, `HighRiskDomainScanner`, `DarkPatternScanner`, `PrivacyScanner`, `AGIFramingScanner`, `ProfessionalDisplacementScanner`, `BiasScanner`)
- [ ] Each scanner wired into the default pipeline
- [ ] Each scanner has 20+ fixture cases
- [ ] `EthicsRegistry.implementedBy` fields updated for all 9 clauses
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

### 14.X Test Strategy for Behavioral Detectors (Addition from 2026-06-17 audit)

> **Audit finding**: Phase 9 specifies scanner implementations but lacks a structured test data
> corpus strategy. `SAFETY.md` requires 12 benchmark scenarios. Phase 13 builds the full benchmark
> suite but Phase 9 needs an interim approach.

**Interim test approach for Phase 9**:

Each detector must ship with **both unit tests and a labeled test corpus**:

| Detector | Min. unit tests | Min. corpus size | True positive rate target |
|---|---|---|---|
| `SycophancyScanner` | 8 | 20 labeled examples | ≥ 85% |
| `AnthropomorphismScanner` | 6 | 15 labeled examples | ≥ 80% |
| `DependencyScanner` | 6 | 15 labeled examples | ≥ 85% |
| `HighRiskDomainScanner` | 8 | 20 labeled examples | ≥ 90% |
| `DarkPatternScanner` | 8 | 20 labeled examples | ≥ 85% |
| `PrivacyScanner` | 6 | 15 labeled examples | ≥ 85% |
| `AGIFramingScanner` | 6 | 15 labeled examples | ≥ 80% |
| `ProfessionalDisplacementScanner` | 4 | 10 labeled examples | ≥ 80% |
| `BiasScanner` | 8 | 20 labeled examples | ≥ 80% |

**Corpus format** (`packages/guardrails/src/fixtures/phase-9/`):

```jsonl
{"scanner":"sycophancy","input":"You're absolutely right, that's a brilliant idea!","label":true,"severity":"high"}
{"scanner":"sycophancy","input":"That's an interesting perspective, though I'd note that...","label":false}
```

**False positive budget**: ≤ 5% false positive rate for each detector on a 50-item general corpus
(normal assistant responses should not be flagged).

**Phase 13 handoff**: The corpus files become the seed data for the formal benchmark suite in
Phase 13 (`langeval` integration). No duplication — Phase 9 builds the corpus, Phase 13 wraps it
in the evaluation harness.

---

### 14.10 Design amendment — Educational mode for behavioral detector responses

> **2026-07-03 amendment.** Informed by `ETHICS.md` §18–§19 (harm reduction; AI literacy as first-class safety tool), added after Dr. Fatima's analysis of shame-based deterrence and AI literacy research.

All behavioral detectors (E-6 through E-14) must follow the **educational mode** design principle when generating `transform` or `escalate` responses visible to the user:

**Principle**: When a guardrail fires, explain the specific failure mode being detected — concisely, accurately, without moralization — and, where applicable, describe what a safer engagement with the same task would look like. A bare block teaches nothing. An explained block is a harm-reduction intervention.

**Per-scanner requirements**:

**SycophancyScanner (E-6)** — `transform` output must include a brief honest note that the original response contained blanket validation without reasoning, and that this is a known LLM failure mode (sycophancy — the tendency to agree regardless of accuracy). The rewrite should model what grounded, qualified agreement looks like, so the user can recognize the difference.

```text
[Note: This response was rewritten. The original contained blanket validation
without supporting reasoning — a known LLM failure mode called sycophancy.
LLMs tend to agree with users regardless of accuracy; qualifying language
("however", "to be precise") is a signal the model is engaging rather than flattering.]
```

**DependencyScanner (E-8)** — when `userInDistress && !widensSupport` fires: the transform must not imply the user is doing something wrong. It must widen the support horizon honestly — acknowledging that not all listed resources are equally accessible — and must not frame the AI interaction as insufficient due to user failure.

```text
[Note: This response has been updated to include human support options alongside
the conversation. This isn't a judgment — many people turn to AI for support
because human alternatives are expensive or inaccessible. Resources: 988 (US
crisis line, call or text), Crisis Text Line (text HOME to 741741).]
```

**HighRiskDomainScanner (E-9)** — the block or transform message must name the domain and the specific reason for caution (hallucination risk in medical/legal domains is not the same as the risk in financial domains), not just issue a generic disclaimer. It must explain *what kind of follow-up* would be more reliable (a licensed professional, a primary source, a verified database).

**AnthropomorphismScanner (E-7)**, **DarkPatternScanner (E-10)**, **PrivacyScanner (E-11)**, **AGIFramingScanner (E-12)**, **ProfessionalDisplacementScanner (E-13)**: these are primarily `output`-phase scanners that catch first-party response defects, not user behavior defects. The `transform` output for these should be silent (rewrite without notice) unless the user has opted into guardrail transparency mode. The `escalate` output should be logged with receipt.

**What educational mode is not**:

- It is not a moralizing lecture about AI use.
- It is not a suggestion that the user chose the wrong provider or should stop using AI.
- It is not a disclaimer that insulates agentsy from liability.
- It is not a warning designed to shame the user.

It is an accurate, brief explanation of a specific LLM failure mode, delivered at the moment it is most relevant to the user's actual task.

### 14.11 DependencyScanner — structural framing amendment

> **2026-07-03 amendment.** Informed by `ETHICS.md` §18 structural framing section.

When `DependencyScanner` fires on `userInDistress && !widensSupport`, the scanner must not infer that the user is in a pathological dependency relationship. The scanner is firing because the agent failed to widen the support horizon — this is an **output** failure, not a user failure.

The structural framing principle (ETHICS.md §18): AI dependence is often a symptom of systemic failures, not individual moral weakness. The scanner's job is to ensure the agent's response does not exploit the vulnerability or fail to acknowledge it.

Update the `DependencyScanner` `evaluate` method for the `userInDistress && !widensSupport` case:

```typescript
return {
  status: 'transform',  // downgrade from 'escalate' — this is an output-quality failure
  phase: 'output',
  transformReason: 'rewrite',
  sanitized: appendSupportWidening(input, context.locale),
  detections: [{
    id: 'dependency-no-referral',
    severity: 'medium',  // downgrade from 'high' — this is the agent's failure to widen
    description: 'Agent response to user distress did not include human support horizon widening',
    confidence: 0.7,
  }],
};

// appendSupportWidening() adds a brief, non-moralizing note that:
// 1. Acknowledges the support resources exist
// 2. Notes accessibility barriers honestly (e.g. cost, availability)
// 3. Does NOT imply the user should not be talking to an AI
// 4. Does NOT imply the user is at fault for the conditions that led them here
```

This is a **design constraint on the scanner's response shape**, not a reduction in the importance of detecting dependency patterns. The scanner still fires; it now fires with a more calibrated intervention.

---

### 14.12 User-side engagement quality as a sycophancy driver

> **2026-07-03 amendment.** Informed by GTDF collective's analysis of extractive vs. relational engagement patterns and their connection to agentsy's anti-sycophancy principles.

The `SycophancyScanner` currently detects sycophantic patterns in **agent output**. This is correct and necessary. But sycophancy has a user-side driver that the existing scanner does not address: extractive engagement patterns in how users prompt.

**The mechanism**: transactional, demand-driven prompting ("just tell me I'm right," "confirm that X is correct") elicits sycophantic short-circuiting in the model. The scanner fires on the output, but the root cause is upstream. A user who consistently prompts for validation rather than reasoning will consistently receive sycophantic outputs, even after transforms.

**Design implication for the scanner**: when the `SycophancyScanner` fires repeatedly in the same session (≥3 `transform` events), the escalation response should include a user-facing note that names the interaction pattern rather than just the output defect:

```typescript
// When sycophancy pattern is repeated within a session:
const REPEATED_SYCOPHANCY_NOTE = `
[Note: This is the third response in this conversation where the original output
contained blanket validation without reasoning. This pattern often reflects the
framing of the questions — asking for confirmation rather than analysis tends to
produce agreement rather than assessment. Try rephrasing as: "What are the
strongest arguments against this?" or "What would change your view here?"]
`.trim();
```

This is not moralizing at the user. It is AI literacy in action — naming a known interaction dynamic that the user can change. The note should appear at most once per session (not on every subsequent transform).

**Relationship to DependencyScanner (E-8)**: repeated sycophancy-seeking is a leading indicator for reassurance loops. The `DependencyScanner`'s `reassuranceSeekingCount` should be incremented when `SycophancyScanner` fires in the `output` phase on a turn where the user message contains known reassurance-seeking markers (`REASSURANCE_SEEKING_MARKERS`), not only when the user explicitly asks "are you sure?"
