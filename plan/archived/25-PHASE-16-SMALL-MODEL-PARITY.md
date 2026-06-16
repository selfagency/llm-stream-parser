# Phase 16 — Small Model Parity

**Authority:** `plan/17-GOVERNANCE-QUALITY-GATES.md`
**Created:** 2026-05-28
**Status:** Planned
**Effort:** ~40 hours

---

## Goal

Make locally running small models (7B-14B) as capable as hosted cloud models by implementing proven optimization patterns across the @agentsy stack. This is not about replacing frontier models — it's about owning the "cheap, fast, good enough" layer of the agent stack.

---

## Design Philosophy

Small models don't reward clever prompts. They reward **clear contracts**.

From 8 authoritative sources (StarMorph, XDA Developers, Ollama Tuning Guide, DEV Community, dasRoot, Lunatech, Medium, Google Research), the consensus is:

1. **Decomposition > brute force** — break complex tasks into simpler sub-tasks
2. **Context engineering > tool count** — 4 well-chosen tools beat 40 bloated ones
3. **Format contracts > free-form** — treat output format as a hard contract
4. **Repair loops > first-try perfection** — small models need multi-turn correction
5. **Inference tuning > default settings** — defaults are conservative; tuned settings transform output quality

---

## Adoption 1: Inference Profile System

**Source:** XDA Developers, Ollama Tuning Guide, StarMorph
**Target packages:** `@agentsy/gateway`, `@agentsy/providers`

### TASK-SM-001: Model inference profiles

**Effort:** 4h
**Location:** `packages/gateway/src/inference-profiles.ts`

Per-model, per-task inference parameter profiles that replace hardcoded defaults:

```typescript
export interface InferenceProfile {
  modelSize: '3b' | '7b' | '14b' | '30b' | '70b';
  taskType: 'code' | 'factual' | 'creative' | 'reasoning' | 'structured';

  // Sampling parameters
  temperature: number;        // 0.1-0.2 code/facts, 0.7-0.8 creative
  minP: number;               // 0.05-0.1 (better than top-p for small models)
  topK?: number;              // fallback if min-p unsupported
  topP?: number;              // fallback if min-p unsupported

  // Repetition control
  repetitionPenalty: number;  // 1.05-1.15
  presencePenalty: number;    // 0.0-0.5
  repeatLastN: number;        // window for repetition penalty

  // Context
  contextLength: number;      // 8192-32768 (not 2048!)
  kvCacheQuantization: 'fp16' | 'q8_0' | 'q4_0';  // q8_0 saves 50% VRAM
  flashAttention: boolean;    // always true for context > 4K

  // Thinking mode
  enableThinking: boolean;    // disable for simple tasks to save tokens
}

export const SMALL_MODEL_PROFILES: Record<string, InferenceProfile> = {
  'code-7b': {
    modelSize: '7b',
    taskType: 'code',
    temperature: 0.2,
    minP: 0.05,
    repetitionPenalty: 1.1,
    presencePenalty: 0.0,
    repeatLastN: 64,
    contextLength: 16384,
    kvCacheQuantization: 'q8_0',
    flashAttention: true,
    enableThinking: false,
  },
  'reasoning-7b': {
    modelSize: '7b',
    taskType: 'reasoning',
    temperature: 0.3,
    minP: 0.08,
    repetitionPenalty: 1.0,
    presencePenalty: 1.5,  // Qwen3.5 official guidance
    repeatLastN: 64,
    contextLength: 32768,
    kvCacheQuantization: 'q8_0',
    flashAttention: true,
    enableThinking: true,
  },
  // ... more profiles
};
```

### TASK-SM-002: Chat template validation

**Effort:** 2h
**Location:** `packages/providers/src/chat-template-validator.ts`

Wrong chat template = model ignores instructions. Validate templates match model expectations:

```typescript
export interface ChatTemplateCheck {
  modelFamily: string;  // 'llama3', 'qwen', 'mistral', 'glm'
  expectedFormat: 'chatml' | 'llama3' | 'alpaca';
  thinkingKwargs?: Record<string, unknown>;  // enable_thinking, etc.
}

export async function validateChatTemplate(
  modelFamily: string,
  template: string
): Promise<{ valid: boolean; issues: string[] }>;
```

---

## Adoption 2: Micro-Task Decomposition Engine

**Source:** DEV Community (7B Playbook), Google Research (Decomposition)
**Target packages:** `@agentsy/orchestrator`, `@agentsy/workflows`

### TASK-SM-003: Task complexity estimator

**Effort:** 3h
**Location:** `packages/orchestrator/src/task-complexity.ts`

Route tasks to the right model size based on estimated complexity:

```typescript
export interface TaskComplexity {
  score: number;           // 0-100
  recommendedModelSize: '3b' | '7b' | '14b' | '30b' | '70b' | 'frontier';
  shouldDecompose: boolean;
  estimatedSteps: number;
}

export function estimateTaskComplexity(userQuery: string): TaskComplexity {
  // Heuristic: count constraints, steps, domain specificity
  // Small models handle: 1-2 constraints, single domain, <3 steps
  // Frontier models needed: 5+ constraints, cross-domain, 5+ steps
}
```

### TASK-SM-004: Micro-task skeleton builder

**Effort:** 4h
**Location:** `packages/orchestrator/src/microtask-builder.ts`

Decompose complex prompts into the rigid scaffolding 7B models need:

```typescript
export interface MicroTask {
  role: string;           // "You are a Python developer"
  task: string;           // Single concrete output
  constraints: string[];  // MUST list (short, explicit)
  format: string;         // Output format contract
  context: string;        // Injected facts (FACTS block)
  examples?: string[];    // 1-3 few-shot examples (not 5-10)
}

export function buildMicroTaskSkeleton(
  complexPrompt: string
): MicroTask[];
```

### TASK-SM-005: Two-stage decomposition (Google pattern)

**Effort:** 5h
**Location:** `packages/orchestrator/src/two-stage-decomposition.ts`

Google's proven pattern: Stage 1 summarizes pieces independently, Stage 2 extracts intent from summaries:

```typescript
export interface DecomposedWorkflow {
  stage1: {
    // Independent piece summaries
    pieces: string[];
    prompt: (piece: string) => string;  // "What is the context? What happened? Speculate."
  };
  stage2: {
    // Intent extraction from summaries (speculations dropped)
    summaries: string[];
    prompt: (summaries: string[]) => string;
  };
}

export async function runTwoStageDecomposition(
  input: string,
  model: SmallModelAdapter
): Promise<string>;
```

---

## Adoption 3: Format Contract System

**Source:** DEV Community (7B Playbook), StarMorph
**Target packages:** `@agentsy/core`, `@agentsy/gateway`

### TASK-SM-006: Format contract prompt generator

**Effort:** 3h
**Location:** `packages/core/src/format-contract.ts`

Generate rigid format contracts that small models can follow:

```typescript
export interface FormatContract {
  schema: JSONSchema;
  example: string;          // Single matching example
  failureBehavior: string;  // "If missing info, output INSUFFICIENT_DATA"
  stopSequences?: string[]; // Stop after closing brace
  fallbackFormat: 'json' | 'markdown-table' | 'key-value';  // Degrade gracefully
}

export function buildFormatContract(
  schema: JSONSchema,
  options?: { example?: string; fallbackFormat?: string }
): string;  // Returns the full prompt block
```

### TASK-SM-007: Multi-turn repair loop

**Effort:** 4h
**Location:** `packages/core/src/repair-loop.ts`

Small models need "unit tests for text" — targeted correction of only broken parts:

```typescript
export interface RepairIssue {
  type: 'missing-field' | 'format-error' | 'constraint-violation' | 'hallucination';
  field?: string;
  description: string;
}

export async function runRepairLoop(
  output: string,
  contract: FormatContract,
  issues: RepairIssue[],
  model: SmallModelAdapter,
  maxAttempts: number = 3
): Promise<{ output: string; repaired: boolean }>;

// Reusable repair prompt:
// "You did not follow the contract.
//  Fix ONLY the following issues:
//  - Missing: <field>
//  - Format error: <what broke>
//  - Constraint violation: <too long / invented numbers / wrong tone>
//  Return the corrected output only."
```

---

## Adoption 4: Context Injection System

**Source:** DEV Community (7B Playbook), Google Research
**Target packages:** `@agentsy/memory`, `@agentsy/core`

### TASK-SM-008: Fact injection blocks

**Effort:** 2h
**Location:** `packages/core/src/context-injection.ts`

Narrow the search space to reduce hallucination:

```typescript
export function buildFactInjection(facts: string[]): string {
  return `FACTS (use only these):
${facts.map(f => `- ${f}`).join('\n')}

IMPORTANT: Do not invent information not listed above.
If you need information not provided, use [PLACEHOLDER].`;
}
```

### TASK-SM-009: Memory distillation for small context windows

**Effort:** 4h
**Location:** `packages/memory/src/distillation.ts`

Extract reusable facts from session history, prioritizing most relevant memories for small context windows:

```typescript
export interface DistilledMemory {
  facts: string[];       // Extracted atomic facts
  skills: string[];      // Learned patterns
  context: string;       // Compressed relevant context
}

export async function distillSessionMemory(
  sessionId: string,
  maxFacts: number = 20,  // Small models can't handle 100+ facts
  relevanceQuery?: string
): Promise<DistilledMemory>;
```

---

## Adoption 5: Small Model Scorecard

**Source:** DEV Community (7B Playbook)
**Target packages:** `@agentsy/testing`

### TASK-SM-010: Lightweight evaluation scorecard

**Effort:** 3h
**Location:** `packages/testing/src/small-model-scorecard.ts`

Measure improvements, not just "feels better":

```typescript
export interface ScorecardResult {
  adherence: number;       // % of MUST requirements satisfied
  factuality: number;      // % of statements matching provided facts
  formatPassRate: number;  // % of outputs that parse correctly
  variance: number;        // % of key decisions stable across runs
  avgTokens: number;
  p50Latency: number;
  p95Latency: number;
}

export function runScorecard(
  prompts: string[],
  model: string,
  config: InferenceProfile
): Promise<ScorecardResult>;

// Rubric:
// Green: >=95% adherence + >=95% format pass-rate
// Yellow: 80-95% (acceptable for drafts)
// Red: <80% (under-specifying)
```

---

## Adoption 6: Minimal Tool Philosophy

**Source:** StarMorph (Pi/Mario Zechner), Ollama Tuning Guide
**Target packages:** `@agentsy/tools`, `@agentsy/orchestrator`

### TASK-SM-011: Tool cost accounting

**Effort:** 3h
**Location:** `packages/tools/src/tool-cost-tracker.ts`

Track token cost of tool definitions in system prompts:

```typescript
export interface ToolCost {
  name: string;
  tokenCost: number;        // Tokens consumed by tool definition
  contextPercentage: number; // % of context window used
}

// Pi's argument: 21 tools = 13.7k tokens = 7-9% of context before work begins
// Solution: load tools on-demand, read README only when needed
export class ToolCostTracker {
  getTotalToolTokenCost(tools: ToolDefinition[]): number;
  getRecommendedToolLimit(contextWindow: number): number;  // ~4 for 8K context
}
```

### TASK-SM-012: On-demand tool loading

**Effort:** 3h
**Location:** `packages/tools/src/on-demand-loader.ts`

Load tools only when the task needs them (progressive loading):

```typescript
export class OnDemandToolLoader {
  async loadRelevantTools(
    userQuery: string,
    registry: ToolRegistry,
    maxTokenBudget: number = 2000  // Don't exceed 2k tokens for tool defs
  ): Promise<ToolDefinition[]>;
}
```

---

## Timeline

| Task | Effort | Dependencies |
|------|--------|-------------|
| SM-001: Inference profiles | 4h | None |
| SM-002: Chat template validation | 2h | SM-001 |
| SM-003: Task complexity estimator | 3h | None |
| SM-004: Micro-task skeleton builder | 4h | SM-003 |
| SM-005: Two-stage decomposition | 5h | SM-004 |
| SM-006: Format contract generator | 3h | None |
| SM-007: Multi-turn repair loop | 4h | SM-006 |
| SM-008: Fact injection blocks | 2h | None |
| SM-009: Memory distillation | 4h | SM-008 |
| SM-010: Small model scorecard | 3h | SM-001 |
| SM-011: Tool cost accounting | 3h | None |
| SM-012: On-demand tool loading | 3h | SM-011 |
| **Total** | **~40 hours** | |

---

## Success Criteria

- [ ] Inference profiles auto-configure optimal parameters per model size + task type
- [ ] Chat templates validated against model family expectations
- [ ] Task complexity estimator routes to appropriate model size
- [ ] Micro-task decomposition breaks complex prompts into single-job units
- [ ] Two-stage decomposition produces better output than end-to-end for 7B models
- [ ] Format contracts achieve >=95% parse pass-rate on 7B models
- [ ] Repair loop fixes format/constraint errors in <=3 attempts
- [ ] Fact injection reduces hallucination rate by >=50%
- [ ] Memory distillation fits relevant context into 8K window
- [ ] Scorecard provides measurable improvement tracking
- [ ] Tool definitions stay under 10% of context window
- [ ] On-demand tool loading reduces initial context by >=60%
- [ ] All tests pass
- [ ] `pnpm check-types` clean
- [ ] `pnpm lint` clean

---

## Integration Points

This phase integrates with existing infrastructure:

- **`@agentsy/gateway`** — Inference profiles plug into model selection and request building
- **`@agentsy/orchestrator`** — Task complexity + decomposition plug into the agent loop
- **`@agentsy/core`** — Format contracts + repair loops extend structured output system
- **`@agentsy/memory`** — Memory distillation extends the tiered memory system
- **`@agentsy/tools`** — Tool cost tracking extends the tool registry
- **`@agentsy/testing`** — Scorecard provides evaluation infrastructure

---

**Next:** Begin TASK-SM-001 (inference profiles) — highest leverage, lowest risk starting point.
