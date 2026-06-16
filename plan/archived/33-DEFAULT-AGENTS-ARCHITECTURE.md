# Agentsy Default Agents — Architecture & Patterns

**Created:** 2026-06-03  
**Document:** Technical reference for multi-agent orchestration patterns

---

## 1. Pattern Mapping: External Frameworks → Agentsy

### gpt-researcher: Planner-Executor Pattern

**Source:** <https://github.com/assafelovic/gpt-researcher>

**Key Pattern:**

```text
User Query
  ↓
[Planner Agent] → Generate sub-queries + strategies
  ↓
[Executor Agent] → Parallel search + scraping
  ↓
[Synthesizer Agent] → Generate report + citations
  ↓
Final Report
```

**Agentsy Mapping:**

- **Planner** → `pre-turn` hook + skill activation (research-planning)
- **Executor** → Parallel `post-skill` hooks for web-search
- **Synthesizer** → Sequential role execution + memory integration
- **Report** → Memory capture + formatted output

**Implementation in Researcher Agent:**

```yaml
layers:
  - role: "query-planner"
    skills: [research-planning, decomposition]
    hooks:
      post-turn:
        - analyze-query
        - generate-sub-queries
        - estimate-search-cost

  - role: "executor"
    skills: [web-search, source-scraping]
    execution: parallel  # All searches concurrent
    hooks:
      pre-skill:
        - validate-query-count
        - check-rate-limits
      post-skill:
        - store-source-chunk
        - track-search-costs

  - role: "synthesizer"
    skills: [source-synthesis, citation-tracking]
    execution: sequential  # After all sources gathered
    hooks:
      pre-turn:
        - load-all-sources
        - analyze-relevance
      post-turn:
        - format-citations
        - validate-claims
```

---

### gpt-pilot: Role Hierarchy Pattern

**Source:** <https://github.com/Pythagora-io/gpt-pilot>

**Key Pattern:**

```text
Requirements
  ↓
[Spec Writer] → Create detailed specs
  ↓
[Architect] → Design solution + patterns
  ↓
[Tech Lead] → Code standards + structure
  ↓
[Developer] → Implementation
  ↓
[Code Monkey] → Testing + refinement
  ↓
Production Code
```

**Agentsy Mapping:**

- Each role = separate layer in YAML
- Token budget per layer (decreasing as quality increases)
- Sequential execution with context passing
- Memory capture at each layer for decision tracking
- Approval gates before destructive operations

**Implementation in Coder Agent:**

```yaml
layers:
  - role: "spec-writer"
    goal: "parse requirements → specifications"
    model: claude-3-sonnet
    token-budget: 8000
    skills: [requirement-analysis, documentation]

  - role: "architect"
    goal: "design solution structure"
    model: claude-3-opus
    token-budget: 6000
    skills: [design-patterns, refactoring]
    depends-on: spec-writer

  - role: "test-engineer"
    goal: "write tests (TDD-first)"
    model: claude-3-haiku
    token-budget: 4000
    skills: [testing, edge-case-analysis]
    depends-on: [spec-writer, architect]

  - role: "implementer"
    goal: "write production code"
    model: gpt-4  # Highest quality for code
    token-budget: 10000
    skills: [code-generation, refactoring, debugging]
    depends-on: [test-engineer, architect]

  - role: "code-reviewer"
    goal: "review and improve"
    model: claude-3-opus
    token-budget: 5000
    skills: [code-review, security-audit]
    depends-on: implementer
    approvers:
      - dangerous: [delete, deploy, migrate-db]
      - requires-human-review: true

hooks:
  pre-init:
    - load-project-context
    - validate-codebase-structure
    - extract-code-patterns

  layer-transition:  # Between roles
    - capture-role-output
    - format-for-next-role
    - validate-token-usage

  pre-skill:
    - check-token-budget
    - validate-file-paths
    - verify-dependencies
```

---

### OpenAgentsControl: YAML Spec + Pattern Learning

**Source:** <https://github.com/darrenhinde/OpenAgentsControl>

**Key Pattern:**

```text
YAML Spec (agent definition)
  ↓
[Pattern Learner] → Extract patterns from similar tasks
  ↓
[Skill Registry] → Discover applicable skills
  ↓
[Cost Optimizer] → Select cheapest viable approach
  ↓
[Executor] → Run with learned patterns
```

**Agentsy Mapping:**

- YAML agent definitions (agentsy/agents/*.yaml)
- Skill metadata registry (cost, latency, success-rate)
- Pattern-based skill activation (pre-skill hook)
- Cost-aware routing with confidence scoring

**Implementation:**

```yaml
# agents/general.yaml
name: "general"
role: "adaptive reasoning and analysis"

skill-registry:
  - name: "web-search"
    cost: 3000-5000 tokens
    latency: 2-10s
    confidence: high
    applicable-to: [research, fact-checking, data-gathering]

  - name: "code-generation"
    cost: 2000-8000 tokens
    latency: 5-15s
    confidence: medium
    applicable-to: [coding, debugging, refactoring]

  - name: "reasoning"
    cost: 500-2000 tokens
    latency: 1-5s
    confidence: high
    applicable-to: [all]

pattern-learner:
  enabled: true
  storage: @agentsy/memory
  strategy: "similarity-based"
  min-relevance: 0.6

hooks:
  pre-skill:
    - learn-similar-patterns
    - select-cheapest-viable-skill
    - calculate-confidence-score

cost-optimizer:
  strategy: "greedy-minimum"  # Prefer cheapest option first
  fallback: "confidence-based"  # If cheap option fails, try expensive
```

---

### oh-my-openagent: Multi-Agent Orchestration (Sisyphus)

**Source:** <https://github.com/code-yeongyu/oh-my-openagent>

**Key Pattern:**

```text
Task Input
  ↓
[Sisyphus Orchestrator] → Decompose into atomic steps
  ↓
[Step Router] → Route to appropriate agent
  ↓
[Parallel Execution] → Execute compatible steps concurrently
  ↓
[State Manager] → Track cross-agent state
  ↓
Task Output
```

**Agentsy Mapping:**

- Task decomposition as pre-init hook
- Sisyphus-style step execution via hook system
- State passing through context + memory
- Cross-agent communication via event hooks

**Implementation in Planner Agent:**

```yaml
name: "planner"
role: "goal decomposition and milestone tracking"

orchestrator: "sisyphus"  # Atomic step execution

layers:
  - role: "goal-analyzer"
    skills: [goal-analysis, constraint-detection]

  - role: "decomposer"
    skills: [task-decomposition, dependency-detection]
    execution-model: "atomic-steps"

  - role: "milestone-tracker"
    skills: [timeline-estimation, progress-tracking]

hooks:
  pre-init:
    - decompose-goal-into-steps
    - detect-dependencies
    - estimate-total-effort

  step-execute:  # Sisyphus atomic step
    - validate-preconditions
    - execute-step-logic
    - capture-step-output
    - update-state

  step-transition:  # Move to next step
    - check-dependencies
    - load-predecessor-outputs
    - validate-state-consistency

  post-turn:
    - aggregate-step-results
    - identify-blockers
    - recommend-pivots

state-manager:
  scope: cross-agent
  storage: @agentsy/memory
  events:
    - step-completed
    - blocker-detected
    - timeline-estimate-updated
```

---

## 2. Hook System Architecture

### Core Hook Events

```text
═══════════════════════════════════════════════════════════════
Agent Lifecycle → Hook Event → Implementations per Agent
═══════════════════════════════════════════════════════════════

INITIALIZATION
├─ pre-init
│  ├─ [Coder] load-project-patterns, validate-codebase
│  ├─ [Researcher] initialize-search-cache, load-sources-db
│  ├─ [Planner] load-historical-timelines
│  └─ [General] initialize-reasoning-state
│
├─ post-init
│  ├─ [All] setup-memory-context
│  ├─ [All] initialize-budget-tracking
│  └─ [All] emit-ready-signal

TURN EXECUTION
├─ pre-turn
│  ├─ [All] retrieve-relevant-memories
│  ├─ [All] load-current-context
│  ├─ [Coder] check-file-modifications
│  ├─ [Researcher] load-previous-searches
│  └─ [Planner] update-milestone-status
│
├─ skill-selection
│  ├─ [All] check-token-budget
│  ├─ [All] learn-pattern-similarity
│  ├─ [OpenAgentsControl-style] compute-cost-score
│  └─ [All] validate-skill-applicability
│
├─ pre-skill
│  ├─ [All] check-token-budget
│  ├─ [All] validate-permissions
│  ├─ [Coder] check-file-access
│  ├─ [Researcher] validate-api-limits
│  └─ [All] log-execution-attempt
│
├─ post-skill
│  ├─ [All] store-skill-output
│  ├─ [All] update-token-usage
│  ├─ [All] update-cost-tracking
│  └─ [All] emit-skill-completed-event
│
├─ post-turn
│  ├─ [All] capture-observations
│  ├─ [All] record-decisions
│  ├─ [Coder] save-code-artifact
│  ├─ [Researcher] save-sources-and-citations
│  ├─ [Planner] update-progress
│  └─ [All] cleanup-temporary-state

ERROR HANDLING
├─ on-error
│  ├─ [All] log-error-details
│  ├─ [All] attempt-recovery
│  └─ [All] emit-error-signal
│
├─ on-retry
│  ├─ [All] update-retry-count
│  ├─ [All] backoff-exponentially
│  └─ [All] log-retry-attempt

FINALIZATION
├─ pre-cleanup
│  ├─ [All] prepare-final-output
│  └─ [All] validate-artifacts
│
└─ post-cleanup
   ├─ [All] persist-session-state
   ├─ [All] release-resources
   └─ [All] emit-done-signal
```

### Hook Registration Pattern

```typescript
// packages/agents/src/hooks/register-agent-hooks.ts

export function registerAgentHooks(
  agentName: string,
  hookRegistry: HookRegistry
): void {
  switch (agentName) {
    case 'coder':
      registerCoderHooks(hookRegistry);
      break;
    case 'researcher':
      registerResearcherHooks(hookRegistry);
      break;
    case 'planner':
      registerPlannerHooks(hookRegistry);
      break;
    case 'general':
      registerGeneralHooks(hookRegistry);
      break;
  }
}

// Coder agent hooks
function registerCoderHooks(registry: HookRegistry) {
  registry.on('pre-init', async (ctx) => {
    ctx.projectContext = await loadProjectPatterns(ctx);
    ctx.codestandards = extractCodeStandards(ctx);
  });

  registry.on('pre-skill', async (ctx) => {
    if (ctx.skill === 'code-generation') {
      await checkTokenBudget(ctx, 'code-generation');
      await validateFileAccess(ctx);
    }
  });

  registry.on('post-turn', async (ctx) => {
    await captureImplementationDetails(ctx);
    await recordArchitecturalDecisions(ctx);
  });
}

// Researcher agent hooks
function registerResearcherHooks(registry: HookRegistry) {
  registry.on('pre-init', async (ctx) => {
    ctx.searchCache = await loadSearchCache(ctx);
    ctx.sourceDB = await initializeSourceDatabase(ctx);
  });

  registry.on('skill-selection', async (ctx) => {
    // Learn from similar research tasks
    const patterns = await ctx.memory.search({
      query: ctx.userQuery,
      type: 'research-pattern',
      limit: 3,
    });
    ctx.learnedPatterns = patterns;
  });

  registry.on('post-turn', async (ctx) => {
    await saveSourcesToMemory(ctx);
    await recordCitationTracking(ctx);
  });
}
```

---

## 3. Agent Composition Patterns

### Sequential Role Execution (Coder Agent)

```text
Requirements
    ↓
[Spec Writer] → outputs: specification
    ↓ (pass spec to next)
[Architect] → outputs: design, patterns, structure
    ↓ (pass design to next)
[Test Engineer] → outputs: test suite, coverage
    ↓ (pass tests to next)
[Implementer] → outputs: code, implementation
    ↓ (pass code to next)
[Code Reviewer] → outputs: feedback, improvements
    ↓
Final Code + Tests
```

**Implementation:**

```typescript
// packages/agents/src/runtime/sequential-executor.ts

async function executeSequential(
  layers: AgentLayer[],
  initialInput: unknown,
  context: AgentContext
): Promise<unknown> {
  let currentOutput = initialInput;

  for (const layer of layers) {
    // 1. Emit layer-transition hook
    await context.hooks.emit('layer-transition', {
      from: layers[layers.indexOf(layer) - 1]?.role,
      to: layer.role,
      input: currentOutput,
    });

    // 2. Execute layer with budget enforcement
    const { output, tokensUsed } = await executeLayer(
      layer,
      currentOutput,
      context
    );

    // 3. Update budget
    context.budget.deduct(layer.role, tokensUsed);

    // 4. Capture state
    await context.memory.capture({
      layerRole: layer.role,
      input: currentOutput,
      output,
      tokensUsed,
      timestamp: Date.now(),
    });

    currentOutput = output;
  }

  return currentOutput;
}

async function executeLayer(
  layer: AgentLayer,
  input: unknown,
  context: AgentContext
): Promise<{ output: unknown; tokensUsed: number }> {
  // 1. Pre-layer hook
  await context.hooks.emit('pre-skill', { layer });

  // 2. Activate skills for this layer
  const activeSkills = await context.skills.activate({
    roleHints: layer.skills,
    context,
  });

  // 3. Execute with LLM
  const messages = buildLayerPrompt(layer, input, activeSkills);
  const result = await context.llm.stream(messages, {
    maxTokens: layer.tokenBudget,
  });

  // 4. Post-skill hook
  await context.hooks.emit('post-skill', {
    layer,
    result,
    tokensUsed: result.usage.total_tokens,
  });

  return {
    output: result.content,
    tokensUsed: result.usage.total_tokens,
  };
}
```

### Parallel Execution (Researcher Agent)

```text
Research Query
    ↓ (decompose)
  / | \
 /  |  \
S1  S2  S3 ... (parallel searches)
 \  |  /
  \ | /
    ↓ (wait for all)
[Aggregate] → sources
    ↓
[Synthesize] → report
    ↓
Final Report
```

**Implementation:**

```typescript
async function executeParallel(
  queries: string[],
  context: AgentContext
): Promise<SourceCollection[]> {
  // 1. Fan-out: Execute all searches in parallel
  const searchPromises = queries.map((q) =>
    executeSearch(q, context).catch((err) => {
      context.hooks.emit('on-error', { query: q, error: err });
      return null;  // Graceful degradation
    })
  );

  // 2. Wait for all to complete
  const results = await Promise.all(searchPromises);

  // 3. Filter nulls and aggregate
  const validResults = results.filter(Boolean);

  // 4. Dedup and rank sources
  const aggregated = await aggregateAndRankSources(
    validResults,
    context
  );

  return aggregated;
}

async function executeSearch(
  query: string,
  context: AgentContext
): Promise<SourceCollection> {
  // 1. Pre-skill check
  await context.hooks.emit('pre-skill', {
    skill: 'web-search',
    query,
  });

  // 2. Execute search
  const sources = await context.skills.execute('web-search', {
    query,
    limit: 5,
  });

  // 3. Post-skill capture
  await context.hooks.emit('post-skill', {
    skill: 'web-search',
    query,
    sourceCount: sources.length,
  });

  return sources;
}
```

### Tree-Based Execution (Planner Agent via Sisyphus)

```text
Goal
  ↓
[Decompose] → Steps + Dependencies
  ↓
  ├─ Step 1 (no deps)
  │   ↓
  │   [Execute]
  │   ↓
  │ ├─ Step 2a (depends on 1)
  │ │   ↓
  │ │   [Execute]
  │ │   ↓
  │ │   Step 5 (depends on 2a, 2b)
  │ │   ↓
  │ │   [Execute]
  │ │
  │ └─ Step 2b (depends on 1)
  │     ↓
  │     [Execute]
  │     ↓
  │     (merged back to 5)
  │
  └─ Step 3 (depends on 1)
      ↓
      [Execute]
      ↓
      (merge with others)

[Aggregate Results] → Final Plan
```

**Implementation (Sisyphus pattern):**

```typescript
async function executeSisyphusSteps(
  steps: TaskStep[],
  context: AgentContext
): Promise<TaskResult> {
  const dependencyGraph = buildDependencyGraph(steps);
  const executed = new Map<string, unknown>();
  const queue = findRootSteps(dependencyGraph);

  while (queue.length > 0) {
    // 1. Execute all ready steps in parallel
    const readySteps = queue.filter(
      (s) => s.dependencies.every((d) => executed.has(d))
    );

    const results = await Promise.all(
      readySteps.map((step) => executeStep(step, context))
    );

    // 2. Store results
    readySteps.forEach((s, i) => {
      executed.set(s.id, results[i]);
    });

    // 3. Emit step-completed events
    await Promise.all(
      readySteps.map((s) =>
        context.hooks.emit('step-completed', {
          stepId: s.id,
          result: executed.get(s.id),
        })
      )
    );

    // 4. Update queue with newly ready steps
    queue = findNextSteps(dependencyGraph, executed);
  }

  return aggregateResults(executed, steps);
}
```

---

## 4. Skill Activation & Composition

### Minimal Disclosure Pattern (OpenAgentsControl-inspired)

```typescript
// agents/skill-activator.ts

export async function activateSkills(
  context: AgentContext,
  hint: string
): Promise<ActivatedSkill[]> {
  // 1. Query skill registry (MINIMAL DISCLOSURE)
  //    Only return skill name + description, NOT implementation
  const availableSkills = await context.skillRegistry.query({
    capabilities: extractCapabilitiesFromHint(hint),
  });

  // 2. Filter by context constraints
  const applicable = availableSkills.filter(
    (s) =>
      s.cost <= context.budget.remaining &&
      s.confidenceScore >= 0.6
  );

  // 3. Rank by cost (prefer cheaper options)
  const ranked = applicable.sort(
    (a, b) => a.cost - b.cost
  );

  // 4. Return top N with confidence scores
  return ranked.slice(0, 3).map((s) => ({
    name: s.name,
    description: s.description,  // Minimal info
    confidence: s.confidenceScore,
    estimatedCost: s.cost,
    // DO NOT include: implementation, model, secret args
  }));
}

// Skill metadata registry (read-only to agent)
export const SKILL_REGISTRY: SkillMetadata[] = [
  {
    name: 'web-search',
    description: 'Search the web for information',
    cost: 3000,  // tokens
    confidenceScore: 0.95,
    applicableTo: ['research', 'fact-checking'],
    // Implementation hidden from agent
  },
  {
    name: 'code-generation',
    description: 'Generate code implementations',
    cost: 5000,
    confidenceScore: 0.85,
    applicableTo: ['coding'],
  },
  // ... more skills
];
```

### Pattern-Based Selection (Learning from History)

```typescript
// agents/pattern-learner.ts

export async function learnPatternSimilarity(
  currentTask: string,
  context: AgentContext
): Promise<LearnedPattern> {
  // 1. Query memory for similar tasks
  const similarTasks = await context.memory.search({
    query: currentTask,
    type: 'task-execution',
    limit: 5,
    minSimilarity: 0.6,
  });

  // 2. Extract common skill sequences
  const commonSequences = extractCommonSequences(similarTasks);

  // 3. Score by success rate
  const scored = commonSequences.map((seq) => ({
    sequence: seq,
    successRate: computeSuccessRate(seq, similarTasks),
    avgCost: computeAverageCost(seq, similarTasks),
  }));

  // 4. Return best pattern
  return scored.sort((a, b) => b.successRate - a.successRate)[0];
}

// Pre-skill hook: Use learned patterns
registry.on('pre-skill', async (ctx) => {
  const pattern = await learnPatternSimilarity(ctx.task, ctx);
  if (pattern.successRate > 0.8) {
    // High confidence in pattern → use it
    ctx.suggestedSkillSequence = pattern.sequence;
    ctx.skipSkillDiscovery = true;
  }
});
```

---

## 5. Token Budget Architecture

### Hierarchical Budget Allocation

```text
Global Session Budget (100,000 tokens)
├─ Coder Agent: 45,000
│  ├─ Spec Writer: 8,000
│  ├─ Architect: 6,000
│  ├─ Test Engineer: 4,000
│  ├─ Implementer: 10,000
│  └─ Reviewer: 5,000
│
├─ Researcher Agent: 30,000
│  ├─ Query Planner: 5,000
│  ├─ Executor: 15,000
│  └─ Synthesizer: 10,000
│
├─ Planner Agent: 20,000
│  ├─ Decomposer: 8,000
│  ├─ Timeline Estimator: 7,000
│  └─ Tracker: 5,000
│
└─ General Agent: 5,000
   └─ Reasoning: 5,000
```

### Budget Enforcement Hooks

```typescript
// packages/runtime/src/hooks/budget-enforcement.ts

export function createBudgetEnforcementHooks(
  registry: HookRegistry
): void {
  // Pre-skill: Check budget availability
  registry.on('pre-skill', async (ctx) => {
    const estimatedCost = ctx.skill.estimatedTokens;
    const remaining = ctx.budget.remainingFor(ctx.agentName);

    if (estimatedCost > remaining) {
      // SOFT LIMIT: Warn, degrade
      if (remaining > remaining * 0.2) {
        ctx.logger.warn(
          `Low budget for ${ctx.agentName}: ${remaining}/${estimatedCost}`
        );
      }

      // HARD LIMIT: Refuse
      if (remaining <= 0) {
        throw new BudgetExhaustedError(ctx.agentName);
      }

      // MIDDLE: Reduce scope
      ctx.skill.parameters.maxResults = 3;  // Reduce scope
    }
  });

  // Post-skill: Deduct actual cost
  registry.on('post-skill', async (ctx) => {
    ctx.budget.deduct(
      ctx.agentName,
      ctx.skill.result.tokensUsed
    );

    // Emit warning if over soft limit
    if (!ctx.budget.isWithinSoftLimit(ctx.agentName)) {
      await ctx.hooks.emit('budget-warning', {
        agent: ctx.agentName,
        remaining: ctx.budget.remainingFor(ctx.agentName),
        original: ctx.budget.allocationFor(ctx.agentName),
      });
    }
  });
}
```

---

## 6. Implementation Summary

| Component | Pattern Source | Agentsy Integration |
|-----------|---|---|
| **Agent Composition** | gpt-pilot role hierarchy | YAML `layers`, sequential executor |
| **Planner-Executor** | gpt-researcher | Pre/post-turn hooks, memory capture |
| **Skill Activation** | OpenAgentsControl pattern learning | Skill registry, pre-skill hook |
| **Task Decomposition** | oh-my-openagent Sisyphus | Step-based hooks, dependency graph |
| **Budget Enforcement** | gpt-researcher + Agentsy | Hierarchical allocation, hard/soft limits |
| **Memory Integration** | Agentsy memory package | Post-turn capture, pre-turn retrieval |
| **Error Recovery** | All frameworks | on-error hooks, retry strategies |
| **Cost Optimization** | OpenAgentsControl | Cost-aware skill selection |
| **Observability** | Agentsy observability | Telemetry hooks, cost tracking |
