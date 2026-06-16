# Council Mode Implementation Plan

**Phase:** 15 — Council of Experts Pattern  
**Authority:** `plan/17-GOVERNANCE-QUALITY-GATES.md`  
**Created:** 2026-05-28  
**Status:** Planned

---

## Goal

Implement council mode in `@agentsy/orchestrator` — a multi-model collaboration pattern where N models provide independent opinions, cross-review each other anonymously, and a chairman synthesizes the final answer.

**Design influences:**

- karpathy/llm-council (19.5k stars) — 3-stage: first opinions → anonymized cross-review → chairman synthesis
- ArgusTek/Argus — PM/SE/AP/C four-role collaboration with veto power
- lmcouncil.ai — Pre-curated model councils per domain

---

## Package Structure

```text
packages/orchestrator/src/council/
├── index.ts              # Public barrel
├── types.ts              # CouncilDefinition, CouncilStage, CouncilResult
├── presets.ts            # Pre-configured councils (coding, research, review, architecture)
├── stage1-opinions.ts    # Parallel first opinions from all council members
├── stage2-review.ts      # Anonymized cross-review + ranking aggregation
├── stage3-chairman.ts    # Chairman synthesis with dissenting opinions
├── executor.ts           # Main council executor (orchestrates 3 stages)
└── events.ts             # CouncilEvent type + streaming support
```

---

## TypeScript Types

```typescript
// Council member definition
export interface CouncilMember {
  model: string;
  provider: string;
  role?: string;  // e.g., "architect", "security", "performance"
}

// Council definition
export interface CouncilDefinition {
  name: string;
  description: string;
  members: CouncilMember[];
  chairman: CouncilMember;
  domain: 'coding' | 'research' | 'review' | 'architecture' | 'general';
  maxTokensPerMember?: number;
  timeoutMs?: number;
}

// Council stage results
export interface FirstOpinion {
  member: CouncilMember;
  response: string;
  tokenUsage: { input: number; output: number };
  durationMs: number;
}

export interface ReviewScore {
  reviewer: CouncilMember;
  target: CouncilMember;
  accuracy: number;  // 1-10
  insight: number;   // 1-10
  reasoning: string;
}

export interface CouncilResult {
  finalAnswer: string;
  opinions: FirstOpinion[];
  reviews: ReviewScore[];
  rankings: { member: CouncilMember; avgScore: number }[];
  dissentingOpinions: { member: CouncilMember; opinion: string }[];
  totalTokenUsage: { input: number; output: number };
  totalDurationMs: number;
  chairman: CouncilMember;
}

// Events for streaming
export type CouncilEvent =
  | { type: 'council_started'; councilName: string; memberCount: number }
  | { type: 'stage1_started'; memberCount: number }
  | { type: 'opinion_complete'; member: CouncilMember; tokenUsage: { input: number; output: number } }
  | { type: 'stage1_complete'; opinionCount: number }
  | { type: 'stage2_started'; reviewCount: number }
  | { type: 'review_complete'; reviewer: CouncilMember; target: CouncilMember }
  | { type: 'stage2_complete'; rankings: { member: CouncilMember; avgScore: number }[] }
  | { type: 'stage3_started'; chairman: CouncilMember }
  | { type: 'council_complete'; result: CouncilResult }
  | { type: 'council_error'; error: string };
```

---

## Pre-configured Council Presets

```typescript
export const COUNCIL_PRESETS: Record<string, CouncilDefinition> = {
  coding: {
    name: 'Coding Council',
    description: 'Expert coding assistants for production-ready solutions',
    domain: 'coding',
    members: [
      { model: 'claude-sonnet-4-5', provider: 'anthropic', role: 'architect' },
      { model: 'gpt-4o', provider: 'openai', role: 'implementer' },
      { model: 'gemini-2.0-flash', provider: 'google', role: 'reviewer' },
    ],
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' },
  },

  research: {
    name: 'Research Council',
    description: 'Scientific research assistants for evidence-based analysis',
    domain: 'research',
    members: [
      { model: 'claude-opus', provider: 'anthropic', role: 'analyst' },
      { model: 'gpt-4o', provider: 'openai', role: 'synthesizer' },
      { model: 'gemini-2.0-pro', provider: 'google', role: 'fact-checker' },
    ],
    chairman: { model: 'claude-opus', provider: 'anthropic' },
  },

  review: {
    name: 'Review Council',
    description: 'Multiple reviewers for thorough code/security review',
    domain: 'review',
    members: [
      { model: 'claude-sonnet-4-5', provider: 'anthropic', role: 'security' },
      { model: 'gpt-4o', provider: 'openai', role: 'performance' },
      { model: 'gemini-2.0-flash', provider: 'google', role: 'maintainability' },
    ],
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' },
  },

  architecture: {
    name: 'Architecture Council',
    description: 'Principal engineers for system design decisions',
    domain: 'architecture',
    members: [
      { model: 'claude-opus', provider: 'anthropic', role: 'patterns' },
      { model: 'gpt-4o', provider: 'openai', role: 'scalability' },
      { model: 'gemini-2.0-pro', provider: 'google', role: 'tradeoffs' },
    ],
    chairman: { model: 'claude-opus', provider: 'anthropic' },
  },

  general: {
    name: 'General Council',
    description: 'Balanced council for complex questions',
    domain: 'general',
    members: [
      { model: 'claude-sonnet-4-5', provider: 'anthropic' },
      { model: 'gpt-4o', provider: 'openai' },
      { model: 'gemini-2.0-flash', provider: 'google' },
    ],
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' },
  },
};
```

---

## Implementation Tasks

### TASK-COUNCIL-001: Type definitions

**Effort:** 1h  
**Location:** `packages/orchestrator/src/council/types.ts`

Define all council types (CouncilMember, CouncilDefinition, CouncilResult, CouncilEvent).

### TASK-COUNCIL-002: Council presets

**Effort:** 1h  
**Location:** `packages/orchestrator/src/council/presets.ts`

Define 5 pre-configured councils (coding, research, review, architecture, general).

### TASK-COUNCIL-003: Stage 1 — First opinions

**Effort:** 2h  
**Location:** `packages/orchestrator/src/council/stage1-opinions.ts`

```typescript
export async function collectFirstOpinions(
  council: CouncilDefinition,
  query: string,
  options: { execute: AgentLoopOptions['execute'] }
): Promise<FirstOpinion[]> {
  // Send query to all members in parallel
  const promises = council.members.map(async (member) => {
    const start = Date.now();
    const response = await options.execute({
      model: member.model,
      provider: member.provider,
      messages: [{ role: 'user', content: query }],
    });
    return {
      member,
      response: response.text,
      tokenUsage: response.usage,
      durationMs: Date.now() - start,
    };
  });

  return Promise.all(promises);
}
```

### TASK-COUNCIL-004: Stage 2 — Anonymized cross-review

**Effort:** 2h  
**Location:** `packages/orchestrator/src/council/stage2-review.ts`

```typescript
export async function collectCrossReviews(
  council: CouncilDefinition,
  opinions: FirstOpinion[],
  options: { execute: AgentLoopOptions['execute'] }
): Promise<ReviewScore[]> {
  const reviews: ReviewScore[] = [];

  // Each member reviews all other members' responses (anonymized)
  for (const reviewer of council.members) {
    for (const opinion of opinions) {
      if (opinion.member.model === reviewer.model) continue; // Skip self-review

      // Anonymize: replace model names with generic labels
      const anonymizedOpinions = opinions.map((o, i) => ({
        label: `Response ${i + 1}`,
        content: o.response,
      }));

      const reviewPrompt = buildReviewPrompt(reviewer, anonymizedOpinions, opinion);
      const review = await options.execute({
        model: reviewer.model,
        provider: reviewer.provider,
        messages: [{ role: 'user', content: reviewPrompt }],
      });

      reviews.push({
        reviewer,
        target: opinion.member,
        accuracy: parseScore(review.text, 'accuracy'),
        insight: parseScore(review.text, 'insight'),
        reasoning: extractReasoning(review.text),
      });
    }
  }

  return reviews;
}
```

### TASK-COUNCIL-005: Stage 3 — Chairman synthesis

**Effort:** 2h  
**Location:** `packages/orchestrator/src/council/stage3-chairman.ts`

```typescript
export async function synthesizeFinalAnswer(
  council: CouncilDefinition,
  opinions: FirstOpinion[],
  reviews: ReviewScore[],
  options: { execute: AgentLoopOptions['execute'] }
): Promise<{ finalAnswer: string; dissentingOpinions: { member: CouncilMember; opinion: string }[] }> {
  // Calculate rankings
  const rankings = calculateRankings(reviews);

  // Identify dissenting opinions (lowest-ranked responses with valid reasoning)
  const dissentingOpinions = identifyDissentingOpinions(opinions, rankings);

  // Chairman synthesis prompt
  const synthesisPrompt = buildSynthesisPrompt({
    opinions,
    reviews,
    rankings,
    dissentingOpinions,
  });

  const result = await options.execute({
    model: council.chairman.model,
    provider: council.chairman.provider,
    messages: [{ role: 'user', content: synthesisPrompt }],
  });

  return {
    finalAnswer: result.text,
    dissentingOpinions,
  };
}
```

### TASK-COUNCIL-006: Council executor

**Effort:** 2h  
**Location:** `packages/orchestrator/src/council/executor.ts`

```typescript
export async function executeCouncil(
  council: CouncilDefinition,
  query: string,
  options: CouncilExecutorOptions
): Promise<CouncilResult> {
  const start = Date.now();

  await options.onEvent?.({ type: 'council_started', councilName: council.name, memberCount: council.members.length });

  // Stage 1: Collect first opinions
  await options.onEvent?.({ type: 'stage1_started', memberCount: council.members.length });
  const opinions = await collectFirstOpinions(council, query, options);
  await options.onEvent?.({ type: 'stage1_complete', opinionCount: opinions.length });

  // Stage 2: Cross-review
  await options.onEvent?.({ type: 'stage2_started', reviewCount: opinions.length * (opinions.length - 1) });
  const reviews = await collectCrossReviews(council, opinions, options);
  const rankings = calculateRankings(reviews);
  await options.onEvent?.({ type: 'stage2_complete', rankings });

  // Stage 3: Chairman synthesis
  await options.onEvent?.({ type: 'stage3_started', chairman: council.chairman });
  const { finalAnswer, dissentingOpinions } = await synthesizeFinalAnswer(council, opinions, reviews, options);
  await options.onEvent?.({ type: 'council_complete', result: { finalAnswer, opinions, reviews, rankings, dissentingOpinions, totalTokenUsage: calculateTotalUsage(opinions), totalDurationMs: Date.now() - start, chairman: council.chairman } });

  return { finalAnswer, opinions, reviews, rankings, dissentingOpinions, totalTokenUsage: calculateTotalUsage(opinions), totalDurationMs: Date.now() - start, chairman: council.chairman };
}
```

### TASK-COUNCIL-007: CLI integration

**Effort:** 1.5h  
**Location:** `packages/cli/src/commands/council.ts`

```bash
/council coding "How should I structure this microservice?"
/council review "Review this PR for security issues"
/council list                    # List available councils
/council custom --models claude-sonnet-4-5,gpt-4o,gemini-2.0-flash "question"
```

### TASK-COUNCIL-008: VS Code integration

**Effort:** 1.5h  
**Location:** `packages/vscode/src/council-mode.ts`

- Council mode toggle in chat UI
- Display council results with tabbed opinions
- Show rankings and dissenting opinions

### TASK-COUNCIL-009: Tests

**Effort:** 2h

#### executor.test.ts

- Full council flow (3 stages)
- Custom council definition
- Error handling (member timeout, chairman failure)
- Event emission

#### stage1-opinions.test.ts

- Parallel execution
- Timeout handling
- Token usage tracking

#### stage2-review.test.ts

- Anonymization (model names stripped)
- Cross-review matrix (N*(N-1) reviews)
- Ranking aggregation

#### stage3-chairman.test.ts

- Synthesis prompt construction
- Dissenting opinion identification
- Final answer generation

#### presets.test.ts

- All presets load successfully
- Preset validation (valid models, providers)

---

## Timeline

| Task | Effort | Dependencies |
|------|--------|-------------|
| COUNCIL-001: Type definitions | 1h | None |
| COUNCIL-002: Council presets | 1h | COUNCIL-001 |
| COUNCIL-003: Stage 1 — First opinions | 2h | COUNCIL-001 |
| COUNCIL-004: Stage 2 — Cross-review | 2h | COUNCIL-003 |
| COUNCIL-005: Stage 3 — Chairman synthesis | 2h | COUNCIL-004 |
| COUNCIL-006: Council executor | 2h | COUNCIL-003, COUNCIL-004, COUNCIL-005 |
| COUNCIL-007: CLI integration | 1.5h | COUNCIL-006 |
| COUNCIL-008: VS Code integration | 1.5h | COUNCIL-006 |
| COUNCIL-009: Tests | 2h | COUNCIL-006 |
| **Total** | **~15 hours** | |

---

## Success Criteria

- [ ] Council executor runs all 3 stages successfully
- [ ] First opinions collected in parallel from all members
- [ ] Cross-review anonymizes model identities
- [ ] Rankings aggregated from all reviews
- [ ] Chairman synthesizes final answer with dissenting opinions
- [ ] Council presets load and validate successfully
- [ ] CLI `/council` command works
- [ ] VS Code council mode toggle functional
- [ ] Events emitted for each stage transition
- [ ] Token usage tracked per-member and aggregated
- [ ] All tests pass
- [ ] `pnpm check-types` clean
- [ ] `pnpm lint` clean

---

**Next:** Begin TASK-COUNCIL-001 (type definitions).
