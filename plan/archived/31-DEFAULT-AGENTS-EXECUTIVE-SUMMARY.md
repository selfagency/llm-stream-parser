# Agentsy Default Agents — Executive Summary & Implementation Plan

**Date:** 2026-06-03  
**Status:** Planning Phase Complete  
**Effort Estimate:** 38 hours across 7 phases  
**Delivery:** 4 production-ready agents + full hook integration + CLI tooling

---

## Overview

This plan synthesizes best practices from 4 leading agent frameworks into a cohesive Agentsy integration:

| Framework | Key Pattern | Agentsy Use |
|-----------|---|---|
| **gpt-researcher** | Planner → Executor → Synthesizer | Researcher Agent |
| **gpt-pilot** | Sequential role hierarchy (spec→arch→dev→test→monkey) | Coder Agent |
| **OpenAgentsControl** | YAML specs + pattern learning + cost optimization | Skill activation + General Agent |
| **oh-my-openagent** | Sisyphus atomic step execution + dependency graphs | Planner Agent |

**Unifying Principle:** All agents leverage Agentsy's hook system, YAML specs, skill registry, tokenomics, and memory integration.

---

## Four Default Agents

### 1. **Coder Agent** (45K tokens/session)

## Multi-role code generation with sequential role hierarchy

Architecture:

- Spec Writer → Architect → Test Engineer → Implementer → Code Reviewer
- Follows gpt-pilot's sequential progression pattern
- Token budget allocated by role (highest for implementation, lowest for initial specs)

Key Capabilities:

- Parse requirements → detailed specifications
- Design architecture with patterns and trade-offs
- Write tests first (TDD)
- Generate production code
- Code review and refinement
- Security audits

Skills: code-generation, code-review, testing, refactoring, security-audit, debugging

Hooks:

- pre-init: load-project-patterns, validate-codebase
- layer-transition: capture-output, format-for-next-role
- pre-skill: check-token-budget, validate-file-paths
- post-skill: store-output, update-telemetry
- post-turn: save-code-artifact, record-decisions

---

### 2. **Researcher Agent** (30K tokens/session)

## Planner-Executor pattern for deep research with source synthesis

Architecture:

- Query Planner (analyze topic, decompose into sub-queries)
- Executor (parallel web searches, concurrent scraping)
- Synthesizer (aggregate sources, generate cited report)

Follows gpt-researcher's three-phase architecture pattern.

Key Capabilities:

- Analyze research topic → hierarchical query decomposition
- Execute parallel searches (cost-aware, rate-limited)
- Scrape and synthesize sources
- Generate cited reports with claim validation
- Track citation sources and confidence scores

Skills: research-planning, web-search, source-scraping, synthesis, citation-tracking, fact-checking

Hooks:

- pre-init: initialize-search-cache, load-sources-db
- pre-turn: load-previous-searches
- post-skill: store-source-chunk, track-costs
- post-turn: save-sources-and-citations, validate-claims

---

### 3. **Planner Agent** (20K tokens/session)

## Goal decomposition and milestone tracking with Sisyphus orchestration

Architecture:

- Goal Analyzer → Task Decomposer → Milestone Tracker
- Sisyphus-style atomic step execution with dependency graphs
- Supports parallel execution of independent steps

Follows oh-my-openagent's step-based decomposition pattern.

Key Capabilities:

- Parse goal → hierarchical task breakdown
- Detect dependencies and parallel opportunities
- Estimate timelines per task/phase
- Create verification checkpoints
- Track progress with live updates
- Recommend pivots if off-track

Skills: goal-analysis, task-decomposition, timeline-estimation, dependency-detection, progress-tracking, milestone-definition

Hooks:

- pre-init: decompose-goal, detect-dependencies, estimate-effort
- step-execute: validate-preconditions, execute-logic, capture-output
- step-transition: check-dependencies, load-outputs, validate-state
- post-turn: aggregate-results, identify-blockers

---

### 4. **General Agent** (5K tokens/session, delegates as needed)

## Adaptive reasoning and task routing with pattern learning

Architecture:

- Task Router (analyze → route to specialized agent or handle directly)
- Reasoning engine (explanation, adaptation, reflection)
- Pattern Learner (from similar past tasks)
- Cost Optimizer (prefer cheaper viable skills)

Combines oh-my-openagent's routing with OpenAgentsControl's pattern learning.

Key Capabilities:

- Analyze task → route to appropriate agent or handle directly
- Explain concepts and reasoning
- Adapt approach based on feedback
- Synthesize multi-agent outputs
- Learn from successful patterns (cost, success-rate)

Skills: reasoning, explanation, adaptation, synthesis, reflection

Hooks:

- pre-skill: learn-pattern-similarity, compute-cost-score
- post-skill: update-pattern-success-rate
- post-turn: capture-observations, record-learned-patterns

---

## Architecture Components

### 1. YAML Agent Specification Format

```yaml
name: "agent-name"
role: "agent role"
description: "what this agent does"

layers:  # Sequential execution
  - role: "role-name"
    goal: "what this role does"
    model: gpt-4  # optional: per-role model selection
    token-budget: 8000
    skills: [skill1, skill2]
    depends-on: [previous-role]  # optional
    execution: [sequential|parallel]  # default: sequential

constraints:
  - "Constraint 1"
  - "Constraint 2"

hooks:
  pre-init:
    - hook-name
  pre-turn:
    - hook-name
  pre-skill:
    - hook-name
  post-skill:
    - hook-name
  post-turn:
    - hook-name

skill-registry:  # Optional: inline skill metadata
  - name: skill-name
    cost: 5000 tokens
    confidence: high
    applicable-to: [use-case1, use-case2]
```

### 2. Hook System Architecture

**Core Hook Events:**

```text
├─ pre-init         → Load context, initialize state
├─ post-init        → Setup memory, initialize budget
├─ pre-turn         → Retrieve memories, load context
├─ skill-selection  → Learn patterns, compute costs
├─ pre-skill        → Check budget, validate permissions
├─ post-skill       → Store output, update telemetry
├─ post-turn        → Capture observations, record decisions
├─ on-error         → Log, attempt recovery
├─ on-retry         → Update retry count, backoff
├─ pre-cleanup      → Prepare final output, validate
└─ post-cleanup     → Persist state, release resources
```

**Per-Agent Hook Implementations:**

- Each agent registers agent-specific hooks in `registerAgentHooks(agentName)`
- Hooks execute in priority order (customizable per agent)
- Hooks can emit events that trigger other hooks

### 3. Skill Activation & Composition

**Minimal Disclosure Pattern:**

- Agent sees only skill name + description
- Implementation details hidden from agent
- Cost and confidence scores drive selection

**Pattern-Based Learning:**

- Memory search for similar past tasks
- Extract common skill sequences
- Score by success rate
- High confidence (>80%) → reuse pattern

**Cost-Aware Routing:**

- Greedy minimum: prefer cheapest option first
- Confidence-based fallback: try expensive if cheap fails
- Budget enforcement: pre-skill checks + hard limits

### 4. Token Budget Enforcement

**Hierarchical Allocation:**

```text
Global Budget: 100,000 tokens
├─ Coder:      45,000 (spec 8K, arch 6K, test 4K, impl 10K, review 5K, buffer 12K)
├─ Researcher: 30,000 (planner 5K, executor 15K, synthesizer 10K)
├─ Planner:    20,000 (decomposer 8K, estimator 7K, tracker 5K)
└─ General:     5,000 (reasoning 5K)
```

**Enforcement Strategy:**

- Pre-skill: estimate cost, check budget, validate applicability
- Soft limit (80%): warn, degrade scope
- Hard limit (100%): refuse execution
- Post-skill: deduct actual cost, emit telemetry

---

## Implementation Roadmap

### Phase 1: Research & Architecture (4 hours) ✅ COMPLETE

- [x] Analyze all 4 frameworks
- [x] Extract pattern mappings
- [x] Create AGENTS.md reference
- [x] Document hook system

### Phase 2: YAML Agent Specifications (6 hours)

- [ ] Design YAML schema
- [ ] Implement loader/parser
- [ ] Create 4 agent YAML files
- [ ] Add spec validation

### Phase 3: Hook System Integration (8 hours)

- [ ] Implement agent-specific hooks
- [ ] Wire skill activation hooks
- [ ] Add memory pre/post-turn hooks
- [ ] Create tokenomics enforcement hooks
- [ ] Add approval-gate hooks
- [ ] Implement error recovery hooks

### Phase 4: Skill Bindings (6 hours)

- [ ] Map skills to agents
- [ ] Build skill discovery logic
- [ ] Create skill metadata registry
- [ ] Test skill composition

### Phase 5: Runtime Implementation (10 hours)

- [ ] AgentSession wrapper
- [ ] Sequential executor (Coder, Researcher, Planner)
- [ ] Parallel executor (Researcher searches)
- [ ] Sisyphus step executor (Planner)
- [ ] State machine + messaging

### Phase 6: CLI & Demo (8 hours)

- [ ] `agentsy agent list`
- [ ] `agentsy agent run <name> <task>`
- [ ] `agentsy agent explain <name>`
- [ ] `agentsy agent demo <name>`
- [ ] Interactive REPL
- [ ] Plan-only mode

### Phase 7: Testing & Validation (6 hours)

- [ ] Unit tests (YAML parsing)
- [ ] Integration tests (hooks)
- [ ] E2E tests (each agent)
- [ ] Performance benchmarks
- [ ] Dogfood validation

**Buffer:** 4 hours (documentation, fixes, edge cases)

**Total:** 38 hours over 2-3 weeks at 8-10h/week allocation

---

## Key Design Decisions

### 1. YAML-First Agent Definition

✅ Provides introspectable agent structure
✅ Enables pattern discovery from metadata
✅ Separates configuration from runtime logic
✅ Supports version control and diffs

### 2. Hook-Based Composition

✅ Decouples agent logic from orchestration
✅ Enables extensibility without code changes
✅ Supports cross-agent communication via events
✅ Integrates with existing Agentsy hook system

### 3. Budget-Driven Skill Selection

✅ Cost-aware: prefer cheaper viable skills
✅ Confidence-scoring: learn from history
✅ Pattern-based: reuse successful sequences
✅ Approval-gated: deny-by-default for dangerous ops

### 4. Sequential vs Parallel vs Sisyphus

| Agent | Pattern | Why |
|-------|---------|-----|
| Coder | Sequential | Layers build on each other |
| Researcher | Parallel | Search queries are independent |
| Planner | Sisyphus | Dependency graph enables smart scheduling |
| General | Routing | Routes to specialized agents |

### 5. Per-Agent vs Global Hooks

- **Pre-init, Pre-turn, Post-turn:** Global hooks (all agents)
- **Pre-skill, Post-skill:** Per-agent customization
- **Layer-transition, Step-execute:** Agent-specific hooks
- **Error handling, Budget enforcement:** Global + per-agent

---

## Success Criteria

| Criterion | Measurement |
|-----------|---|
| **Specification Complete** | All 4 agents have complete YAML defs |
| **Hooks Functional** | All lifecycle hooks execute without error |
| **Skills Compose** | Agents activate 3+ skills per turn |
| **Budget Enforced** | Token limits respected, ±5% accuracy |
| **CLI Responsive** | Commands <500ms (excluding execution) |
| **Dogfood Tested** | Each agent completes real scenario |
| **Token Tracking** | Cost tracking accurate within ±5% |
| **Error Recovery** | Agents gracefully handle failures + retry |
| **Memory Integrated** | Pre-turn retrieval + post-turn capture works |
| **Pattern Learning** | General agent learns and reuses patterns |

---

## Deliverables Checklist

### Code

- [ ] `packages/agents/` package
  - [ ] `src/specs/` — YAML agent definitions (4 files)
  - [ ] `src/loader/` — YAML loader + parser + validator
  - [ ] `src/hooks/` — Agent-specific hook implementations
  - [ ] `src/runtime/` — Executors (sequential, parallel, sisyphus)
  - [ ] `src/cli/` — CLI commands
  - [ ] `src/skills/` — Skill registry + activation logic

### Hook Implementations

- [ ] `packages/runtime/src/hooks/`
  - [ ] `agent-pre-init.ts`
  - [ ] `agent-pre-turn.ts`
  - [ ] `agent-post-turn.ts`
  - [ ] `agent-pre-skill.ts`
  - [ ] `agent-post-skill.ts`
  - [ ] `agent-error-recovery.ts`
  - [ ] `budget-enforcement.ts`

### CLI Commands

- [ ] `agentsy agent list`
- [ ] `agentsy agent run`
- [ ] `agentsy agent explain`
- [ ] `agentsy agent demo`

### Documentation

- [ ] Architecture guide (agent design patterns)
- [ ] YAML specification reference
- [ ] Hook system guide
- [ ] Skill composition patterns
- [ ] Usage examples (per agent)
- [ ] Troubleshooting guide

### Tests

- [ ] Unit tests (YAML parsing, hooks)
- [ ] Integration tests (agent orchestration)
- [ ] E2E tests (complete agent workflows)
- [ ] Performance tests (token usage, latency)

---

## Integration Points

### With Existing Agentsy Packages

| Package | Integration |
|---------|---|
| `@agentsy/orchestrator` | Agents register in hook registry |
| `@agentsy/runtime` | Executors, hook dispatch, session mgmt |
| `@agentsy/context` | Budget enforcement, compression strategies |
| `@agentsy/memory` | Pre-turn retrieval, post-turn capture |
| `@agentsy/plugins` | Plugin system for skill registration |
| `@agentsy/skills` | Skill metadata, activation logic |
| `@agentsy/tokenomics` | Cost tracking, budget allocation |
| `@agentsy/cli` | New agent commands |
| `@agentsy/models` | Per-layer model selection |
| `@agentsy/observability` | Telemetry, tracing, cost metrics |

---

## Risk Mitigation

| Risk | Mitigation |
|------|---|
| Hook ordering issues | Explicit priority system, topological sort |
| Budget overrun | Pre-skill checks, hard limits, graceful degradation |
| Skill not available | Fallback skills, error handling, user notification |
| Memory not initialized | Pre-init validation, fallback initialization |
| Circular dependencies | DAG validation in Planner, cycle detection |
| Token leak | Comprehensive cost tracking, post-turn audit |
| Model API outage | Retry logic, alternative models, local fallback |

---

## References & Sources

**Pattern Frameworks:**

- gpt-researcher: <https://github.com/assafelovic/gpt-researcher>
- gpt-pilot: <https://github.com/Pythagora-io/gpt-pilot>
- OpenAgentsControl: <https://github.com/darrenhinde/OpenAgentsControl>
- oh-my-openagent: <https://github.com/code-yeongyu/oh-my-openagent>

**Agentsy Documentation:**

- Plan: `~/Developer/agentsy/plan/`
- Packages: `~/Developer/agentsy/packages/`
- Orchestrator: `packages/orchestrator/src/core/engine.ts`
- Hooks: `packages/runtime/src/hooks/`
- Context: `packages/context/BOUNDARIES.md`

**Skills Used in Planning:**

- agent-architect: Genuine agent identity + SOUL.md patterns
- planning-with-files: Phase tracking + checkpoint validation
- architecting-solutions: Technical design patterns

---

## Next Steps

1. **Approve Plan** → Get confirmation to proceed with Phase 2
2. **Phase 2 Kickoff** → Design YAML schema, start parser implementation
3. **Phase 3 Integration** → Wire hooks into Agentsy runtime
4. **Phase 5 Runtime** → Build executors (sequential, parallel, sisyphus)
5. **Phase 6 CLI** → Dogfood agent commands
6. **Phase 7 Testing** → Full validation + release

**Estimated Start Date:** Next sprint (when approved)  
**Estimated Completion:** 2-3 weeks at 8-10h/week allocation
