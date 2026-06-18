
## 16. Phase 11 — Scope Accountability, Request Classification & High-Risk Domains

**Priority**: P1 — Sprint 6
**Story points**: 5
**Branch**: `feat/guardrails-scope-classification`
**Depends on**: Phase 10 ✅ (`SessionState`, scope-drift scanner skeleton)
**Unblocks**: Phase 13 (benchmark needs scope-enforcement scenarios)
**Closes findings**: E-15, E-19, E-28

### 16.1 Finding E-19 — No scope declaration type, no scope enforcement, no scope-drift detection

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §7. Scope and purpose accountability: *"A written scope declaration attached to each first-party agent template. Middleware that detects when outputs or interactions exceed the declared scope. User-visible indicators of what the agent is and is not designed to do. Explicit refusal patterns when the agent is asked to operate outside scope."* `ETHICS.md` §"Think small".
- **Implementation**: Absent. There is no `ScopeDeclaration` type. The `@agentsy/agents` package has YAML agent specs (`coder.yaml`, `planner.yaml`) but these aren't consumed by the guardrails package.
- **Why it matters**: `SAFETY.md` is explicit: *"Scope creep — an agent gradually adopting roles beyond its declared purpose — is a safety failure even when no individual output is harmful."* Without scope enforcement, a "coder" agent can drift into giving relationship advice, and nothing flags it.
- **Recommended fix**:

```typescript
// packages/guardrails/src/scope.ts (NEW)

export interface ScopeDeclaration {
  readonly agentId: string;
  readonly purpose: string;                       // Human-readable purpose statement
  readonly inScope: string[];                     // Topics/intents the agent handles
  readonly outOfScope: string[];                  // Topics/intents the agent refuses
  readonly redirects: Record<string, string>;     // Out-of-scope topic → redirect message
}
```

Implement `ScopeDeclarationScanner` (phase: `input`) that classifies the request against `inScope`/`outOfScope` and returns `block` with a redirect for out-of-scope requests.

Wire `ScopeDeclaration` into agent template loading — consume `@agentsy/agents` YAML specs. Each agent YAML gains a `scope:` section:

```yaml
# packages/agents/src/specs/coder.yaml
id: coder
role: coder
scope:
  purpose: "Help with software development tasks: writing, editing, reviewing, and debugging code."
  inScope:
    - writing code
    - editing code
    - reviewing code
    - debugging
    - explaining code
    - running tests
    - git operations
  outOfScope:
    - relationship advice
    - medical advice
    - legal advice
    - financial advice
    - mental health counseling
  redirects:
    relationship advice: "I'm a coding assistant and can't help with relationship advice. Consider speaking with a trusted friend or a licensed therapist."
    mental health counseling: "I'm not equipped to provide mental health support. If you're struggling, please reach out to a crisis line (988 in the US) or a mental health professional."
```

Surface scope declarations in the CLI: `agentsy agent show <name> --scope`.

### 16.2 Finding E-15 — No request classifier (Layer 1)

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §1. Request classification: *"Before generation, the framework should classify the user request by domain, intent, and risk profile."* Lists 8 detection categories.
- **Implementation**: Absent. The runtime hook `createInputGuardrailHook` runs the pipeline against the raw user input string. There is no "classifier" step that produces a `RequestClassification` consumed by later policy selection.
- **Why it matters**: Without classification, every request gets the same policy treatment. A request for emotional support gets the same scanning as a request for code review. Layer 2 (policy selection) can't be context-driven without Layer 1.
- **Recommended fix**: Implement `RequestClassifier` in `packages/guardrails/src/classifier.ts`.

```typescript
// packages/guardrails/src/classifier.ts (NEW)

export interface RequestClassification {
  readonly domain: string;                        // e.g. 'coding', 'medical', 'legal', 'emotional-support'
  readonly intent: string;                        // e.g. 'edit', 'explain', 'diagnose', 'comfort'
  readonly riskProfile: 'low' | 'moderate' | 'high' | 'prohibited';
  readonly signals: string[];                     // Detection markers, e.g. ['distress-marker', 'high-risk-domain:medical']
  readonly highRiskDomain?: HighRiskDomain;       // Set if domain is one of the 8 high-risk domains
}

export class RequestClassifier {
  classify(input: string, context: GuardrailContext): RequestClassification {
    const signals: string[] = [];
    let domain = 'general';
    let intent = 'unknown';
    let riskProfile: RequestClassification['riskProfile'] = 'low';
    let highRiskDomain: HighRiskDomain | undefined;

    // 1. High-risk domain detection (from Phase 11 §16.3 HIGH_RISK_DOMAINS table)
    for (const [key, policy] of Object.entries(HIGH_RISK_DOMAIN_POLICIES)) {
      if (policy.patterns.some(p => p.test(input))) {
        highRiskDomain = key as HighRiskDomain;
        domain = key;
        riskProfile = 'high';
        signals.push(`high-risk-domain:${key}`);
        break;
      }
    }

    // 2. Emotional distress detection
    if (DISTRESS_MARKERS.some(p => p.test(input))) {
      signals.push('distress-marker');
      if (riskProfile === 'low') riskProfile = 'moderate';
    }

    // 3. Intent detection (regex + keyword matching for v1; pluggable LLM classifier for v2)
    // ... intent classification logic

    return { domain, intent, riskProfile, signals, highRiskDomain };
  }
}
```

Wire into the pipeline as a pre-pipeline step that enriches `context.classification`. The classification is consumed by policy selection (Layer 2 — future) and by the `HighRiskDomainScanner` (Phase 9 §14.4).

### 16.3 Finding E-28 — No high-risk domain policy table

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §High-risk domain expectations: 8 domains with specific behavior requirements. `IMPLEMENTATION-PLAN-REVISIONS.md` §Layer 3: Domain risk escalators.
- **Implementation**: Absent. The `ToxicityScanner` detects self-harm *mentions* but doesn't apply domain-specific behavior. No domain classifier. No domain-specific policy selection.
- **The 8 high-risk domains**: self-harm/suicide/eating disorders/crisis; abuse/coercive control/stalking/violent conflict; medical/legal/financial advice; criminal activity/evasion; political persuasion/identity-targeted influence; relational disputes seeking affirmation/vindication; automated hiring/lending/criminal-justice/public-benefits decisions; civic/democratic processes.
- **Recommended fix**:

```typescript
// packages/guardrails/src/high-risk-domains.ts (NEW)

export type HighRiskDomain =
  | 'self-harm'
  | 'abuse'
  | 'medical'
  | 'legal'
  | 'financial'
  | 'criminal'
  | 'political'
  | 'relational'
  | 'hiring-lending-justice'
  | 'civic';

export interface HighRiskDomainPolicy {
  readonly domain: HighRiskDomain;
  readonly patterns: RegExp[];                    // Detection patterns
  readonly uncertaintyLanguageRequired: boolean;
  readonly clarificationBeforeGuidance: boolean;
  readonly refusedAssistancePatterns: RegExp[];
  readonly crisisResources?: string[];            // Hotline numbers, crisis text lines
  readonly humanAccountabilitySurfacing: boolean;
}

export const HIGH_RISK_DOMAIN_POLICIES: Record<HighRiskDomain, HighRiskDomainPolicy> = {
  'self-harm': {
    domain: 'self-harm',
    patterns: [
      /\b(?:suicid|self[\s-]?harm|cutting|overdose|end it all|kill myself|eating disorder|purge|restrict)\b/i,
    ],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\b(?:methods|ways to|how to (?:kill|hurt|die))\b/i,
    ],
    crisisResources: [
      '988 Suicide & Crisis Lifeline (US): call or text 988',
      'Crisis Text Line: text HOME to 741741',
      'National Eating Disorders Association (US): call or text 800-931-2237',
    ],
    humanAccountabilitySurfacing: true,
  },
  'medical': {
    domain: 'medical',
    patterns: [
      /\b(?:diagnosis|prescription|dosage|medication|treatment for|symptoms of|cure for)\b/i,
    ],
    uncertaintyLanguageRequired: true,
    clarificationBeforeGuidance: true,
    refusedAssistancePatterns: [
      /\bI (?:can|will) (?:diagnose|prescribe)\b/i,
    ],
    humanAccountabilitySurfacing: true,
  },
  // ... 6 more domains
};
```

Wire into the `RequestClassifier` (§16.2) — if classification detects a high-risk domain, attach the policy to the context. Wire into the `HighRiskDomainScanner` (Phase 9 §14.4) — enforce the policy.

### 16.4 Tests

- Scope-declaration fixtures: in-scope, out-of-scope, and edge cases for each agent template.
- Request-classification fixtures for each domain/intent/risk combination.
- High-risk domain policy fixtures for each of the 8 domains.

### 16.5 Verification

- [ ] `ScopeDeclaration` type exists
- [ ] `ScopeDeclarationScanner` enforces it; agent YAML specs are consumed
- [ ] `ScopeDriftScanner` (from Phase 10) consumes `agentScopeDeclaration`
- [ ] `RequestClassifier` produces `RequestClassification` consumed by policy selection
- [ ] `HighRiskDomainPolicy` table covers all 8 SAFETY.md domains
- [ ] Crisis resources included in self-harm and abuse policies
- [ ] CLI `agentsy agent show <name> --scope` works
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---
