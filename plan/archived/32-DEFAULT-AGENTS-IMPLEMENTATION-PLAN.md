# Agentsy Default Agents Plan

**Created:** 2026-06-03  
**Status:** Planning Phase  
**Goal:** Design and implement 4 core default agents (Coding, Research, Planning, General) leveraging Agentsy patterns and external frameworks

## Quick Summary

Create 4 production-ready agent implementations using:

- **Pattern source:** gpt-researcher (planner/executor), gpt-pilot (role hierarchy), OpenAgentsControl (yaml specs + pattern learning), oh-my-openagent (multi-agent orchestration)
- **Agentsy integration:** Hook system, YAML agent specifications, skill activation, tokenomics, memory capture
- **Delivery:** Agent definitions + hook implementations + CLI commands + demo scenarios

---

## Phase Breakdown

### Phase 1: Research & Architecture (4 hours)

- [ ] Analyze gpt-researcher planner-executor pattern
- [ ] Extract gpt-pilot role hierarchy (spec→architect→tech-lead→developer→monkey)
- [ ] Study OpenAgentsControl YAML agent spec + pattern registry
- [ ] Document oh-my-openagent task decomposition + Sisyphus orchestration
- [ ] Map Agentsy hooks to agent lifecycle (pre-turn, post-turn, skill-activation, etc.)
- [ ] Create AGENTS.md reference architecture

### Phase 2: YAML Agent Specifications (6 hours)

- [ ] Design YAML schema for agent definition (name, role, goals, skills, constraints, hooks)
- [ ] Build loader/parser for agent YAMLs
- [ ] Create 4 default agent specs:
  - [ ] **Coder**: Multi-role (spec/test/architect/impl), code generation, file ops, git integration
  - [ ] **Researcher**: Planner/executor, web search, synthesis, citation tracking
  - [ ] **Planner**: Task decomposition, goal tracking, milestone definition, progress reporting
  - [ ] **General**: Reasoning, explanation, analysis, adaptation to task

### Phase 3: Hook System Integration (8 hours)

- [ ] Wire skill activation hooks per agent
- [ ] Implement memory pre/post-turn hooks (capture observations)
- [ ] Add tokenomics enforcement hooks (budget per agent/skill)
- [ ] Create approval-gate hooks (deny-by-default for destructive ops)
- [ ] Implement error recovery hooks (retry strategies)
- [ ] Add observability hooks (cost tracking, tracing)

### Phase 4: Skill Bindings (6 hours)

- [ ] Map skills to each agent's capabilities
- [ ] Build skill discovery + activation logic
- [ ] Create skill metadata registry (cost, latency, confidence)
- [ ] Test skill composition (multiple skills per turn)

### Phase 5: Runtime Implementation (10 hours)

- [ ] Create AgentSession wrapper for orchestrator
- [ ] Implement agent composition patterns (sequential, parallel, tree-based)
- [ ] Add state machine for agent lifecycle (init→ready→running→pause→resume→done)
- [ ] Build messaging protocol between agents
- [ ] Implement context passing (shared memory, budget tracking)

### Phase 6: CLI & Demo (8 hours)

- [ ] Implement `agentsy agent list` command
- [ ] Implement `agentsy agent run <name> <task>` command
- [ ] Create demo scenarios for each agent
- [ ] Build interactive REPL for agent testing
- [ ] Add plan-only mode (dry run)

### Phase 7: Testing & Validation (6 hours)

- [ ] Unit tests for YAML parsing
- [ ] Integration tests for hook system
- [ ] End-to-end tests for each agent type
- [ ] Performance benchmarks (token usage, latency)
- [ ] Dogfood validation (use agents on real tasks)

---

## Key Design Decisions

### 1. YAML Agent Specification

```yaml
# agents/coder.yaml
name: "coder"
role: "code generation and refactoring"
description: "Multi-role agent for writing, testing, and reviewing code"

layers:
  - role: "spec-writer"
    goal: "translate requirements into specifications"
    skills: [analysis, planning, documentation]
    token-budget: 8000

  - role: "architect"
    goal: "design solution structure"
    skills: [design-patterns, architecture, analysis]
    token-budget: 6000

  - role: "test-engineer"
    goal: "write comprehensive tests"
    skills: [testing, code-generation, analysis]
    token-budget: 4000

  - role: "implementer"
    goal: "write production code"
    skills: [code-generation, refactoring, debugging]
    token-budget: 10000

  - role: "reviewer"
    goal: "code review and improvement"
    skills: [code-review, security-audit, testing]
    token-budget: 5000

constraints:
  - "Always write tests before implementation"
  - "Follow project code standards"
  - "Ask for approval before destructive operations"
  - "Track token usage against budget"

hooks:
  pre-init:
    - load-project-patterns
    - validate-environment

  pre-turn:
    - retrieve-relevant-memories
    - load-context

  post-turn:
    - capture-implementation-details
    - record-decisions
    - update-cost-tracking

  pre-skill:
    - check-token-budget
    - validate-skill-applicability

  post-skill:
    - store-skill-output
    - update-telemetry

skills:
  - code-generation:
      model: gpt-4
      cost: 3000-5000 tokens
      confidence: high
  - code-review:
      model: claude-opus
      cost: 2000-4000 tokens
      confidence: high
  - testing:
      model: claude-opus
      cost: 2000-3000 tokens
      confidence: medium
```

### 2. Hook System Mapping

```text
Agent Lifecycle               Hook Event            Implementation
─────────────────────────────────────────────────────────────────────
Initialize agent        → pre-init              Load patterns, validate env
Prepare context         → pre-turn              Retrieve memory, load context
Select skill            → pre-skill             Budget check, applicability
Execute skill           → skill:execute        Actual tool invocation
Process results         → post-skill            Store output, update telemetry
Complete turn           → post-turn             Memory capture, decision logging
Cleanup                 → post-cleanup          Persist state, release resources
Error recovery          → on-error              Retry, fallback, notify
```

### 3. Multi-Agent Coordination

```typescript
// Parallel role execution for coder agent
await Promise.all([
  executeRole('spec-writer', requirements),
  executeRole('architect', requirements),
  executeRole('test-engineer', spec),
]).then(([spec, design, tests]) => {
  return executeRole('implementer', { spec, design, tests });
});
```

### 4. Token Budget Enforcement

- Global session budget (e.g., 100K tokens)
- Per-agent allocation (e.g., coder: 45K, researcher: 30K, planner: 20K, general: 5K)
- Per-role within agent (see YAML above)
- Per-skill enforcement (pre-execution check)
- Soft/hard limits with priority queue

### 5. Skill Activation Strategy

Inspired by gpt-researcher & OpenAgentsControl:

1. **Minimal disclosure** - Only describe available skills, don't expose implementation
2. **Pattern-based selection** - Learn from similar past tasks
3. **Cost-aware routing** - Prefer cheaper skills when equal quality
4. **Confidence scoring** - Track skill success rate per task type
5. **Approval gating** - Dangerous skills (file delete, deploy) require approval

---

## Agent Specifications

### 1. Coder Agent

## Multi-layer code generation with role hierarchy

Source patterns:

- gpt-pilot: spec→architect→dev→code-monkey progression
- Agentsy: skill composition, code-generation framework, testing hooks

Responsibilities:

- Parse requirements → specifications
- Design architecture and patterns
- Write tests (TDD-first)
- Implement code
- Code review and refinement

Skills:

- code-generation (gpt-4)
- code-review (claude)
- testing (claude)
- refactoring (claude)
- security-audit (claude)
- debug (gpt-4)

Budget: 45,000 tokens/session

---

### 2. Researcher Agent

## Planner-executor pattern for deep research

Source patterns:

- gpt-researcher: planner formulates queries → executor gathers sources → synthesizer writes report
- Agentsy: memory integration, citation tracking, confidence scoring

Responsibilities:

- Analyze research topic → decompose into sub-queries
- Execute web searches concurrently
- Scrape and synthesize sources
- Generate cited report
- Validate with source extraction

Skills:

- research-planning (claude)
- web-search (web-api)
- source-synthesis (gpt-4)
- citation-tracking (claude)
- fact-checking (claude)
- report-generation (gpt-4)

Budget: 30,000 tokens/session

---

### 3. Planner Agent

## Goal decomposition and milestone tracking

Source patterns:

- planning-with-files: phase tracking, progress checkpoints
- gpt-pilot: sequential task breakdown
- Agentsy: memory for decision tracking

Responsibilities:

- Parse goal → hierarchical task breakdown
- Define phases and milestones
- Create verification checkpoints
- Track progress and dependencies
- Recommend pivots if off-track

Skills:

- goal-analysis (claude)
- task-decomposition (claude)
- timeline-estimation (claude)
- dependency-detection (claude)
- progress-tracking (claude)
- milestone-definition (claude)

Budget: 20,000 tokens/session

---

### 4. General Agent

## Reasoning and adaptation for miscellaneous tasks

Source patterns:

- oh-my-openagent: Sisyphus task orchestration
- Agentsy: hook-based adaptation, observation capture

Responsibilities:

- Analyze task → route to appropriate agent or handle directly
- Explain concepts and reasoning
- Adapt approach based on feedback
- Synthesize multi-agent outputs
- Learn from successful patterns

Skills:

- reasoning (claude)
- explanation (gpt-4)
- adaptation (claude)
- synthesis (claude)
- reflection (claude)

Budget: 5,000 tokens/session (may delegate to specialized agents)

---

## Implementation Checklist

### Deliverables

- [ ] `packages/agents/` package created with:
  - [ ] `src/specs/` — YAML agent definitions
  - [ ] `src/loader/` — Agent loader/parser
  - [ ] `src/hooks/` — Agent-specific hook implementations
  - [ ] `src/runtime/` — Agent session orchestration
  - [ ] `src/cli/` — CLI commands

- [ ] New hook implementations:
  - [ ] `packages/runtime/src/hooks/agent-*.ts` (pre-init, post-skill, etc.)
  - [ ] Hook registry updates in orchestrator

- [ ] CLI commands:
  - [ ] `agentsy agent list`
  - [ ] `agentsy agent run <name> <task>`
  - [ ] `agentsy agent explain <name>`
  - [ ] `agentsy agent demo <name>`

- [ ] Tests:
  - [ ] YAML parsing tests
  - [ ] Hook execution tests
  - [ ] Agent orchestration tests
  - [ ] Integration tests for each agent type

- [ ] Documentation:
  - [ ] Agent architecture guide
  - [ ] YAML specification reference
  - [ ] Hook system guide
  - [ ] Agent usage examples
  - [ ] Skill composition patterns

---

## Success Criteria

1. **Specification Complete** — All 4 agents have complete YAML definitions
2. **Hooks Functional** — All agent lifecycle hooks execute without error
3. **Skills Compose** — Agents can activate and sequence 3+ skills per turn
4. **Budget Enforced** — Token limits respected; soft/hard limits tested
5. **CLI Responsive** — Agent commands complete in <500ms (excluding execution)
6. **Dogfood Tested** — Each agent completes a real scenario successfully
7. **No Token Leaks** — Cost tracking accurate within ±5%
8. **Error Recovery** — Agents gracefully handle failures and retry

---

## Timeline Estimate

Total effort: **~38 hours**

- Phase 1 (Research): 4h
- Phase 2 (YAML specs): 6h
- Phase 3 (Hooks): 8h
- Phase 4 (Skills): 6h
- Phase 5 (Runtime): 10h
- Phase 6 (CLI): 8h
- Phase 7 (Testing): 6h
- Buffer (documentation, fixes): 4h

**Sprint planning:** 2-3 week effort at 8-10h/week allocation

---

## References

- gpt-researcher: Planner-executor + source synthesis
- gpt-pilot: Role hierarchy (spec/architect/dev/monkey)
- OpenAgentsControl: YAML agent specs + pattern learning
- oh-my-openagent: Multi-agent orchestration (Sisyphus)
- Agentsy: Hook system, skill activation, tokenomics, memory
- agent-architect skill: Genuine agent identity + SOUL.md patterns
- planning-with-files skill: Phase tracking + checkpoint validation
