# @agentsy/workflows Implementation Plan

**Phase:** 13 — Declarative Workflow Layer  
**Authority:** `plan/20-PHASE-13-WORKFLOWS-IMPLEMENTATION.md`  
**Created:** 2026-05-28  
**Status:** Planned

---

## Executive Summary

Create `@agentsy/workflows` — a declarative YAML workflow layer on top of `@agentsy/orchestrator` that enables deterministic, state-machine-driven AI agent workflows with tool constraints, value propagation, human approval gates, and parallel execution nodes.

**Key design decisions:**

- LLM model switching belongs in `@agentsy/gateway`, not here
- Agent-to-agent communication uses A2A + ACP protocols (not ACP alone)
- YAML for declarative workflow definitions (not Zerolang)
- State machine engine (linear first, DAG later)
- JSONPath for value capture (standard, LLM-understood)

---

## Package Structure

```text
packages/workflows/
├── src/
│   ├── index.ts              # Public barrel
│   ├── types.ts              # WorkflowDefinition, WorkflowState, RuntimeState
│   ├── schema.ts             # Zod validation schema
│   ├── loader.ts             # YAML file loading + validation + caching
│   ├── engine.ts             # Deterministic state machine engine
│   ├── executor.ts           # Bridge: engine → @agentsy/orchestrator
│   ├── nodes/
│   │   ├── types.ts          # Node type definitions
│   │   ├── ai-node.ts        # LLM-driven state (prompt, tool constraints)
│   │   ├── bash-node.ts      # Deterministic shell execution
│   │   ├── gate-node.ts      # Human approval gate (pause/resume)
│   │   └── parallel-node.ts  # Fork/join parallel execution
│   ├── value-capture.ts      # JSONPath extraction + template injection
│   ├── events.ts             # WorkflowEvent type + EventEmitter
│   ├── registry.ts           # Workflow registry (load, match, list)
│   └── triggers.ts           # Trigger matching (keyword, regex, semantic)
├── workflows/
│   ├── defaults/
│   │   ├── bug-fix.yaml
│   │   ├── feature-dev.yaml
│   │   ├── pr-review.yaml
│   │   └── code-refactor.yaml
│   └── schema.json           # JSON Schema for IDE validation
├── test/
│   ├── loader.test.ts
│   ├── engine.test.ts
│   ├── executor.test.ts
│   ├── value-capture.test.ts
│   ├── triggers.test.ts
│   ├── nodes/
│   │   ├── ai-node.test.ts
│   │   ├── bash-node.test.ts
│   │   ├── gate-node.test.ts
│   │   └── parallel-node.test.ts
│   └── fixtures/
│       ├── workflows/
│       │   ├── simple-linear.yaml
│       │   ├── with-capture.yaml
│       │   ├── with-gate.yaml
│       │   ├── with-parallel.yaml
│       │   └── with-bash.yaml
│       └── invalid/
│           ├── missing-states.yaml
│           ├── bad-transition.yaml
│           └── circular-deps.yaml
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## Dependencies

```json
{
  "name": "@agentsy/workflows",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@agentsy/orchestrator": "workspace:*",
    "@agentsy/core": "workspace:*",
    "@agentsy/types": "workspace:*",
    "@agentsy/guardrails": "workspace:*",
    "yaml": "^2.7.0",
    "jsonpath-plus": "^10.0.0",
    "zod": "^4.4.3"
  }
}
```

---

## YAML Schema Specification

### Top-level structure

```yaml
name: bug-fix
version: "1.0"
description: "Investigate and fix a reported bug"
trigger:
  - "bug"
  - "fix bug"
  - "investigate"
  - "debug"

max_steps: 25
max_total_tool_calls: 100

tool_examples:
  todowrite: |
    {"todos": [{"content": "Task 1", "status": "in_progress"}]}

states:
  - id: plan
    type: ai
    instruction: |
      First, write your plan using the todowrite tool.
      Create a todo list with investigation steps.
    required_tools:
      - todowrite
    min_calls: 1
    max_calls: 3
    capture:
      planSteps: "$.todos[*].content"
    next: analyze

  - id: analyze
    type: ai
    instruction: |
      Analyze the bug report. Focus on: {affectedArea}
      Use grep and read to find relevant code.
    required_tools:
      - grep
      - read
    min_calls: 2
    max_calls: 8
    capture:
      affectedFiles: "$.files[*]"
      rootCause: "$.root_cause"
    next: implement

  - id: run-tests
    type: bash
    command: "pnpm test"
    timeout_ms: 120000
    on_failure: retry
    max_retries: 2
    next: review

  - id: review
    type: ai
    instruction: |
      Review the changes. Root cause: {rootCause}
      Affected files: {affectedFiles}
    required_tools:
      - read
      - summary
    min_calls: 1
    max_calls: 3
    next: approve

  - id: approve
    type: gate
    prompt: "Review complete. Approve to create PR?"
    timeout_ms: 3600000
    on_timeout: abort
    next: create-pr

  - id: create-pr
    type: ai
    instruction: |
      Create a pull request with the fix.
      Root cause: {rootCause}
    required_tools:
      - bash
    terminal: true
```

### State schema

```typescript
interface WorkflowState {
  id: string;
  type: 'ai' | 'bash' | 'gate' | 'parallel';

  // AI node fields
  instruction?: string;
  required_tools?: string[];
  min_calls?: number;
  max_calls?: number;
  capture?: Record<string, string>;

  // Bash node fields
  command?: string;
  timeout_ms?: number;
  on_failure?: 'abort' | 'continue' | 'retry';
  max_retries?: number;

  // Gate node fields
  prompt?: string;
  timeout_ms?: number;
  on_timeout?: 'abort' | 'continue';

  // Parallel node fields
  branches?: string[];
  join_mode?: 'all' | 'any';

  // Common
  next?: string;
  terminal?: boolean;
  ignore_errors?: boolean;
  condition?: string;
}
```

---

## Implementation Tasks

### TASK-WF-001: Package scaffold

**Effort:** 30 min

Create `package.json`, `tsconfig.json`, `tsup.config.ts` following monorepo conventions.

- 5 entry points: `index`, `loader`, `engine`, `executor`, `types`
- ESM + CJS output
- External: workspace packages, zod

### TASK-WF-002: Type definitions

**Effort:** 1h

Define all types in `src/types.ts`:

- `WorkflowDefinition` — parsed YAML
- `WorkflowState` — individual state definition
- `WorkflowRuntime` — execution state (current state, tool counts, captured values, history)
- `WorkflowEvent` — observability events (state_enter, state_exit, tool_tracked, value_captured, workflow_paused, workflow_resumed, workflow_complete, workflow_error, workflow_aborted)
- `WorkflowOutcome` — success | aborted | error | timeout | rejected
- `WorkflowExecutorOptions` — bridge to orchestrator

### TASK-WF-003: Zod validation schema

**Effort:** 1h

Zod schema in `src/schema.ts` for runtime validation:

- `WorkflowStateSchema` — validates individual states
- `WorkflowDefinitionSchema` — validates full workflow

Validation rules:

- All `next` references point to existing state IDs
- No circular chains (unless using parallel with join)
- At least one terminal state
- `type: 'ai'` requires `instruction`
- `type: 'bash'` requires `command`
- `type: 'gate'` requires `prompt`
- `type: 'parallel'` requires `branches` with valid state IDs

### TASK-WF-004: YAML loader

**Effort:** 1h

`src/loader.ts` — `WorkflowLoader` class:

- `loadFile(filePath)` — parse + validate + cache
- `loadDirectory(dirPath)` — glob + load all `.yaml` files
- `clearCache()` — invalidate cache
- Returns `LoadedWorkflow` with `definition`, `source`, `valid`, `errors?`

### TASK-WF-005: Value capture engine

**Effort:** 1h

`src/value-capture.ts`:

- `captureValues(captureRules, toolResult)` — JSONPath extraction
- `injectValues(template, values)` — `{variable}` template injection
- Handles missing paths gracefully (no capture, not error)
- Array capture (`$.files[*]`) returns array
- Single value capture returns scalar

### TASK-WF-006: State machine engine

**Effort:** 3h

`src/engine.ts` — `WorkflowEngine` class:

- Constructor takes `WorkflowDefinition` + optional event callback
- `currentState` — returns current `WorkflowState`
- `runtimeState` — returns snapshot of `WorkflowRuntime`
- `processToolCall(toolName, toolResult)` — tracks tool call, captures values, checks transition
- `getInstructionForState()` — returns instruction with tool examples + injected values
- `getRequiredTools()` — returns required tools for current state
- `isComplete()` — checks if workflow is done
- `isPaused()` / `resume()` — gate node support
- Transition logic: total calls >= min_calls → transition; total calls >= max_calls → force transition

### TASK-WF-007: Node implementations

**Effort:** 3h

`src/nodes/`:

#### ai-node.ts

- Wraps `createAgentLoop` with workflow state constraints
- Injects instruction + tool examples into system message
- Tracks tool calls through engine
- Returns `{ outcome, messages }`

#### bash-node.ts

- `exec` with timeout
- Returns `{ success, stdout, stderr, exitCode }`
- Supports `on_failure: abort | continue | retry`

#### gate-node.ts

- Human approval gate with pause/resume
- Returns handle with `approve()`, `reject()`, `isComplete`
- Timeout support with configurable `on_timeout` behavior

#### parallel-node.ts

- `join_mode: 'all'` — `Promise.allSettled`, captures all results
- `join_mode: 'any'` — `Promise.race`, first to complete wins

### TASK-WF-008: Workflow executor (bridge to orchestrator)

**Effort:** 2h

`src/executor.ts` — `executeWorkflow()`:

- Main entry point connecting engine to `createAgentLoop`
- Sequential state execution
- Switch on `state.type` → appropriate node handler
- Emits workflow events (started, complete, error, paused, resumed)
- Returns `AgentLoopHandle` for streaming output

### TASK-WF-009: Workflow registry

**Effort:** 1h

`src/registry.ts` — `WorkflowRegistry` class:

- `loadFromDirectory(dirPath)` — load all workflows from directory
- `register(workflow)` — register inline workflow
- `get(name)` — get workflow by name
- `matchTrigger(input)` — keyword match against triggers (case-insensitive)
- `list()` — list all workflows

### TASK-WF-010: Default workflows

**Effort:** 2h

Create 4 default workflows in `workflows/defaults/`:

#### bug-fix.yaml

plan → analyze → implement → run-tests → complete

#### feature-dev.yaml

plan → implement → test → validate → complete

#### pr-review.yaml

analyze → review → approve

#### code-refactor.yaml

analyze → plan → implement → validate → complete

### TASK-WF-011: Tests

**Effort:** 4h

#### loader.test.ts

- Load valid YAML → parsed definition
- Load invalid YAML → errors array populated
- Load directory → multiple workflows
- Cache hit on second load

#### engine.test.ts

- Linear state progression
- Tool call counting and transition at min_calls
- Force transition at max_calls
- Value capture via JSONPath
- Value injection into instruction template
- Terminal state detection
- Invalid state ID → error

#### value-capture.test.ts

- JSONPath extraction from nested objects
- Array capture
- Single value capture
- Missing path → no capture
- Template injection with `{variable}`
- Missing variable → placeholder preserved

#### executor.test.ts

- AI node → creates agent loop with correct instruction
- Bash node → executes command, returns stdout/stderr
- Bash node failure → abort vs continue vs retry
- Gate node → pauses execution, returns handle
- Workflow completion → emits workflow_complete event

#### triggers.test.ts

- Keyword match → returns matching workflows
- No match → empty array
- Multiple matches → all returned
- Case insensitive

#### nodes/*.test.ts

- ai-node: instruction includes tool examples, tool calls tracked, max calls enforced
- bash-node: successful command, failing command, timeout
- gate-node: approve/reject/timeout behavior
- parallel-node: all mode, any mode, failed branch handling

### TASK-WF-012: JSON Schema for IDE validation

**Effort:** 30 min

Generate JSON Schema from Zod schema for IDE autocomplete in YAML files.

### TASK-WF-013: Package README

**Effort:** 1h

Document:

- Package purpose
- Quick start (load workflows, execute)
- YAML schema reference
- Default workflows
- Integration with `@agentsy/orchestrator`
- API reference

---

## TypeScript Types

```typescript
// Runtime state
interface WorkflowRuntime {
  definition: WorkflowDefinition;
  currentStateId: string;
  toolCallsInState: Map<string, number>;
  totalToolCalls: number;
  capturedValues: Record<string, unknown>;
  stateHistory: string[];
  completed: boolean;
  paused: boolean;
  pauseReason?: string;
}

// Events
type WorkflowEvent =
  | { type: 'workflow_started'; workflowName: string; runId: string }
  | { type: 'state_enter'; stateId: string; runId: string }
  | { type: 'state_exit'; stateId: string; runId: string }
  | { type: 'tool_tracked'; stateId: string; toolName: string; count: number; runId: string }
  | { type: 'value_captured'; stateId: string; key: string; value: unknown; runId: string }
  | { type: 'workflow_paused'; stateId: string; reason: string; runId: string }
  | { type: 'workflow_resumed'; stateId: string; runId: string }
  | { type: 'workflow_complete'; stateId: string; runId: string; outcome: WorkflowOutcome }
  | { type: 'workflow_error'; stateId: string; error: string; runId: string }
  | { type: 'workflow_aborted'; stateId: string; reason: string; runId: string };

type WorkflowOutcome = 'success' | 'aborted' | 'error' | 'timeout' | 'rejected';

// Executor options
interface WorkflowExecutorOptions {
  workflow: WorkflowDefinition;
  execute: AgentLoopOptions['execute'];
  buildToolResultMessages: AgentLoopOptions['buildToolResultMessages'];
  onEvent?: (event: WorkflowEvent) => void | Promise<void>;
  onAgUiEvent?: AgentLoopOptions['onAgUiEvent'];
  maxSteps?: number;
  maxTotalToolCalls?: number;
  initialMessages: unknown[];
  runId?: string;
  threadId?: string;
}
```

---

## Test Coverage Targets

| Module | Target |
|--------|--------|
| `loader.ts` | 100% |
| `engine.ts` | 95%+ |
| `executor.ts` | 90%+ |
| `value-capture.ts` | 100% |
| `nodes/*.ts` | 90%+ each |

---

## Verification Steps

```bash
cd packages/workflows
pnpm build
pnpm check-types
pnpm test
pnpm coverage

pnpm build
pnpm check-types
pnpm test
pnpm lint
```

---

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| JSONPath complexity for nested tool results | Medium | Start with simple paths, document patterns |
| Gate node pause/resume integration with AG-UI | High | Use existing `InterruptController` pattern |
| Parallel node error aggregation | Medium | Use `Promise.allSettled`, capture per-branch errors |
| YAML schema drift from implementation | Low | Zod schema is single source of truth, generate JSON Schema from it |

---

## Timeline

| Task | Effort | Dependencies |
|------|--------|-------------|
| WF-001: Package scaffold | 30 min | None |
| WF-002: Type definitions | 1h | WF-001 |
| WF-003: Zod validation | 1h | WF-002 |
| WF-004: YAML loader | 1h | WF-003 |
| WF-005: Value capture | 1h | WF-002 |
| WF-006: State machine engine | 3h | WF-004, WF-005 |
| WF-007: Node implementations | 3h | WF-006 |
| WF-008: Executor bridge | 2h | WF-006, WF-007 |
| WF-009: Registry | 1h | WF-004 |
| WF-010: Default workflows | 2h | WF-003 |
| WF-011: Tests | 4h | WF-006 through WF-010 |
| WF-012: JSON Schema | 30 min | WF-003 |
| WF-013: README | 1h | All |
| **Total** | **~20 hours** | |

---

## Success Criteria

- [ ] `pnpm test` passes in `packages/workflows` (all node types covered)
- [ ] `pnpm check-types` passes (strict mode, no `any`)
- [ ] `pnpm lint` passes (Biome clean)
- [ ] All 4 default workflows load and validate successfully
- [ ] WorkflowRegistry.matchTrigger returns correct workflows for sample inputs
- [ ] State machine transitions are deterministic and reproducible
- [ ] Value capture via JSONPath works for nested tool results
- [ ] Gate node pauses execution and returns handle for external approval
- [ ] Bash node executes commands with timeout and retry support
- [ ] Monorepo `pnpm test` passes (no regressions)
- [ ] Plan documents updated (INDEX.md, governance, compliance matrix)

---

**Next:** Begin TASK-WF-001 (package scaffold).
