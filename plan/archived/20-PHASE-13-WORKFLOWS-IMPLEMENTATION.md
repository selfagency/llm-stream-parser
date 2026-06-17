# Implementation Plan: @agentsy/workflows

**Phase:** 13 — Declarative Workflow Layer  
**Authority:** `plan/17-GOVERNANCE-QUALITY-GATES.md`, `plan/INDEX.md`  
**Created:** 2026-05-28  
**Status:** Draft — awaiting review

---

## Goal

Create `@agentsy/workflows` — a declarative YAML workflow layer on top of `@agentsy/orchestrator` that enables deterministic, state-machine-driven AI agent workflows with tool constraints, value propagation, human approval gates, and parallel execution nodes.

**Note:** LLM model switching belongs in `@agentsy/gateway`, not here. Agent-to-agent communication uses A2A + ACP protocols (not ACP alone).

---

## Current Context

### What exists

- **`@agentsy/orchestrator`** — `createAgentLoop()` with async generator, `AgentLoopOptions` (hooks, stop conditions, tool approval, AG-UI events), `AgentLoopState`, `AgentLoopHandle`
- **`@agentsy/guardrails`** — `QuotaExceededError`, `RetrievalBlockedError` (minimal, needs expansion for workflow-level guardrails)
- **`@agentsy/core`** — `LLMStreamProcessor`, `StreamChunk`, `OutputPart`, `ProcessedOutput`
- **`@agentsy/runtime`** — AG-UI protocol, `InterruptController`
- **`@agentsy/memory`** — Three-tier memory (event log, wiki, vector)
- **`@agentsy/session`** — Session management
- **`@agentsy/connectors`** — Discord, Slack, Telegram platform adapters

### What's missing

- Declarative workflow definitions (YAML)
- State machine engine for tool-call-based transitions
- Value capture and propagation between states
- Human approval gates (pause/resume)
- Deterministic nodes (bash, tests, git ops)
- Parallel node execution
- Workflow registry and trigger matching

### Design influences

- **Archon** (coleam00/Archon) — YAML DAG workflows, git worktree isolation, human gates, platform adapters
- **Declarative YAML Workflow System** (Nedim Fakić) — State machine with tool constraints, JSONPath value capture, progress enforcement
- **@agentsy orchestrator** — Existing `createAgentLoop` with hooks, tool approval, AG-UI events

---

## Proposed Architecture

### Package identity

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

### Dependencies

```json
{
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

- `yaml` — Parse YAML workflow definitions
- `jsonpath-plus` — JSONPath value extraction from tool results
- `zod` — Runtime validation (already in orchestrator, consistent)

---

## YAML Schema Specification

### Top-level structure

```yaml
# .agentsy/workflows/bug-fix.yaml
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

# Tool formatting guidance injected per state
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
    timeout_ms: 3600000  # 1 hour
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
  min_calls?: number;       // default: 1
  max_calls?: number;       // default: Infinity
  capture?: Record<string, string>;  // JSONPath expressions

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
  branches?: string[];  // State IDs to run in parallel
  join_mode?: 'all' | 'any';

  // Common
  next?: string;         // Next state ID (required unless terminal)
  terminal?: boolean;    // Final state
  ignore_errors?: boolean;
  condition?: string;    // JSONPath condition to skip state
}
```

### Workflow definition schema

```typescript
interface WorkflowDefinition {
  name: string;
  version: string;
  description: string;
  trigger: string | string[];
  max_steps?: number;          // default: 25
  max_total_tool_calls?: number; // default: 100
  tool_examples?: Record<string, string>;
  states: WorkflowState[];
}
```

---

## Step-by-Step Implementation Plan

### TASK-WF-001: Package scaffold

**Location:** `packages/workflows/`

Create package.json, tsconfig.json, tsup.config.ts following monorepo conventions:

```json
{
  "name": "@agentsy/workflows",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./loader": { "types": "./dist/loader.d.ts", "import": "./dist/loader.js", "require": "./dist/loader.cjs" },
    "./engine": { "types": "./dist/engine.d.ts", "import": "./dist/engine.js", "require": "./dist/engine.cjs" },
    "./executor": { "types": "./dist/executor.d.ts", "import": "./dist/executor.js", "require": "./dist/executor.cjs" },
    "./types": { "types": "./dist/types.d.ts", "import": "./dist/types.js", "require": "./dist/types.cjs" }
  }
}
```

**Dependencies to add:**

- `yaml` ^2.7.0 (parse)
- `jsonpath-plus` ^10.0.0 (value extraction)
- `zod` ^4.4.3 (already in orchestrator, workspace consistent)

**tsup.config.ts** — 4 entry points: `index`, `loader`, `engine`, `executor`, `types`

---

### TASK-WF-002: Type definitions

**Location:** `packages/workflows/src/types.ts`

Define all types:

```typescript
// WorkflowDefinition — parsed YAML
export interface WorkflowDefinition { ... }

// WorkflowState — individual state definition
export interface WorkflowState { ... }

// WorkflowRuntime — execution state
export interface WorkflowRuntime {
  definition: WorkflowDefinition;
  currentStateId: string;
  toolCallsInState: Map<string, number>;
  totalToolCalls: number;
  capturedValues: Record<string, unknown>;
  stateHistory: string[];
  completed: boolean;
  paused: boolean;        // For gate nodes
  pauseReason?: string;
}

// WorkflowEvent — observability
export type WorkflowEvent =
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

export type WorkflowOutcome = 'success' | 'aborted' | 'error' | 'timeout' | 'rejected';

// WorkflowExecutorOptions — bridge to orchestrator
export interface WorkflowExecutorOptions {
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

### TASK-WF-003: Zod validation schema

**Location:** `packages/workflows/src/schema.ts`

Zod schema for runtime validation of loaded workflows:

```typescript
import { z } from 'zod';

export const WorkflowStateSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['ai', 'bash', 'gate', 'parallel']).default('ai'),
  instruction: z.string().optional(),
  required_tools: z.array(z.string()).optional(),
  min_calls: z.number().int().min(0).default(1).optional(),
  max_calls: z.number().int().min(1).optional(),
  capture: z.record(z.string()).optional(),
  command: z.string().optional(),
  timeout_ms: z.number().int().min(1).optional(),
  on_failure: z.enum(['abort', 'continue', 'retry']).default('abort').optional(),
  max_retries: z.number().int().min(0).default(0).optional(),
  prompt: z.string().optional(),
  on_timeout: z.enum(['abort', 'continue']).default('abort').optional(),
  branches: z.array(z.string()).optional(),
  join_mode: z.enum(['all', 'any']).default('all').optional(),
  next: z.string().optional(),
  terminal: z.boolean().default(false).optional(),
  ignore_errors: z.boolean().default(false).optional(),
  condition: z.string().optional(),
}).refine(validateStateTransitions, { message: 'Invalid state configuration' });

export const WorkflowDefinitionSchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  description: z.string().default(''),
  trigger: z.union([z.string(), z.array(z.string())]),
  max_steps: z.number().int().min(1).default(25).optional(),
  max_total_tool_calls: z.number().int().min(1).default(100).optional(),
  tool_examples: z.record(z.string()).optional(),
  states: z.array(WorkflowStateSchema).min(1),
}).refine(validateWorkflowGraph, { message: 'Invalid workflow graph' });
```

Validation rules in `validateWorkflowGraph`:

- All `next` references point to existing state IDs
- No circular chains (unless using parallel with join)
- At least one terminal state
- `type: 'ai'` requires `instruction`
- `type: 'bash'` requires `command`
- `type: 'gate'` requires `prompt`
- `type: 'parallel'` requires `branches` with valid state IDs

---

### TASK-WF-004: YAML loader

**Location:** `packages/workflows/src/loader.ts`

```typescript
import { parse } from 'yaml';
import { WorkflowDefinitionSchema } from './schema.js';
import type { WorkflowDefinition } from './types.js';

interface LoadedWorkflow {
  definition: WorkflowDefinition;
  source: string;       // File path
  valid: boolean;
  errors?: string[];
}

export class WorkflowLoader {
  private cache = new Map<string, LoadedWorkflow>();

  async loadFile(filePath: string): Promise<LoadedWorkflow> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const source = await readFile(filePath, 'utf-8');
    const parsed = parse(source) as Record<string, unknown>;
    const result = WorkflowDefinitionSchema.safeParse(parsed);

    const workflow: LoadedWorkflow = result.success
      ? { definition: result.data, source: filePath, valid: true }
      : { definition: parsed as WorkflowDefinition, source: filePath, valid: false, errors: result.error.errors.map(e => e.message) };

    this.cache.set(filePath, workflow);
    return workflow;
  }

  async loadDirectory(dirPath: string): Promise<LoadedWorkflow[]> {
    const files = await glob('**/*.yaml', { cwd: dirPath });
    return Promise.all(files.map(f => this.loadFile(join(dirPath, f))));
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

---

### TASK-WF-005: Value capture engine

**Location:** `packages/workflows/src/value-capture.ts`

JSONPath extraction + template injection:

```typescript
import { JSONPath } from 'jsonpath-plus';

export function captureValues(
  captureRules: Record<string, string>,
  toolResult: unknown
): Record<string, unknown> {
  const captured: Record<string, unknown> = {};

  for (const [key, jsonpath] of Object.entries(captureRules)) {
    const result = JSONPath({ path: jsonpath, json: toolResult as object });
    if (result.length > 0) {
      captured[key] = result.length === 1 ? result[0] : result;
    }
  }

  return captured;
}

export function injectValues(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}
```

---

### TASK-WF-006: State machine engine

**Location:** `packages/workflows/src/engine.ts`

Core deterministic state machine:

```typescript
import type { WorkflowDefinition, WorkflowState, WorkflowRuntime, WorkflowEvent } from './types.js';
import { captureValues, injectValues } from './value-capture.js';

export class WorkflowEngine {
  private runtime: WorkflowRuntime;
  private onEvent?: (event: WorkflowEvent) => void | Promise<void>;

  constructor(definition: WorkflowDefinition, onEvent?: (event: WorkflowEvent) => void) {
    this.runtime = {
      definition,
      currentStateId: definition.states[0].id,
      toolCallsInState: new Map(),
      totalToolCalls: 0,
      capturedValues: {},
      stateHistory: [definition.states[0].id],
      completed: false,
      paused: false
    };
    this.onEvent = onEvent;
  }

  get currentState(): WorkflowState {
    return this.runtime.definition.states.find(s => s.id === this.runtime.currentStateId)!;
  }

  get runtimeState(): WorkflowRuntime {
    return { ...this.runtime, toolCallsInState: new Map(this.runtime.toolCallsInState) };
  }

  async processToolCall(toolName: string, toolResult: unknown): Promise<{
    transition: boolean;
    nextStateId?: string;
    capturedValues: Record<string, unknown>;
  }> {
    const state = this.currentState;
    const { capturedValues } = state.capture
      ? captureValues(state.capture, toolResult)
      : { capturedValues: {} };

    // Update captured values
    Object.assign(this.runtime.capturedValues, capturedValues);

    // Track tool call
    const currentCount = this.runtime.toolCallsInState.get(toolName) ?? 0;
    this.runtime.toolCallsInState.set(toolName, currentCount + 1);
    this.runtime.totalToolCalls++;

    // Emit events
    await this.emit({ type: 'tool_tracked', stateId: state.id, toolName, count: currentCount + 1, runId: '' });
    for (const [key, value] of Object.entries(capturedValues)) {
      await this.emit({ type: 'value_captured', stateId: state.id, key, value, runId: '' });
    }

    // Check transition conditions
    const totalCalls = this.getTotalCallsInState();
    const minCalls = state.min_calls ?? 1;
    const maxCalls = state.max_calls ?? Infinity;

    if (totalCalls >= minCalls && totalCalls < maxCalls) {
      // Transition to next state
      const nextStateId = state.next;
      if (nextStateId) {
        await this.transitionTo(nextStateId);
        return { transition: true, nextStateId, capturedValues };
      }
    }

    if (totalCalls >= maxCalls) {
      // Force transition
      const nextStateId = state.next;
      if (nextStateId) {
        await this.transitionTo(nextStateId);
        return { transition: true, nextStateId, capturedValues };
      }
    }

    return { transition: false, capturedValues };
  }

  getInstructionForState(): string {
    const state = this.currentState;
    let instruction = state.instruction ?? '';

    // Inject tool examples
    const toolExamples = this.runtime.definition.tool_examples;
    if (toolExamples && state.required_tools) {
      const examples = state.required_tools
        .map(tool => toolExamples[tool])
        .filter(Boolean)
        .join('\n\n');
      if (examples) {
        instruction += `\n\n## Tool formatting examples\n\n${examples}`;
      }
    }

    // Inject captured values
    return injectValues(instruction, this.runtime.capturedValues);
  }

  getRequiredTools(): string[] {
    return this.currentState.required_tools ?? [];
  }

  isComplete(): boolean {
    return this.runtime.completed || this.runtime.currentState.terminal === true;
  }

  isPaused(): boolean {
    return this.runtime.paused;
  }

  resume(): void {
    if (!this.runtime.paused) return;
    this.runtime.paused = false;
    this.runtime.pauseReason = undefined;
  }

  private async transitionTo(stateId: string): Promise<void> {
    const prevState = this.runtime.currentStateId;
    await this.emit({ type: 'state_exit', stateId: prevState, runId: '' });

    this.runtime.currentStateId = stateId;
    this.runtime.toolCallsInState.clear();
    this.runtime.stateHistory.push(stateId);

    const state = this.currentState;
    if (state.terminal) {
      this.runtime.completed = true;
    }

    await this.emit({ type: 'state_enter', stateId, runId: '' });
  }

  private getTotalCallsInState(): number {
    let total = 0;
    for (const count of this.runtime.toolCallsInState.values()) {
      total += count;
    }
    return total;
  }

  private async emit(event: WorkflowEvent): Promise<void> {
    if (this.onEvent) {
      await Promise.resolve(this.onEvent(event));
    }
  }
}
```

---

### TASK-WF-007: Node implementations

**Location:** `packages/workflows/src/nodes/`

#### ai-node.ts

Wraps `createAgentLoop` with workflow state constraints:

```typescript
import { createAgentLoop } from '@agentsy/orchestrator/agent';
import type { WorkflowState, WorkflowRuntime } from '../types.js';
import type { WorkflowEngine } from '../engine.js';

export async function executeAiNode(
  state: WorkflowState,
  engine: WorkflowEngine,
  options: {
    execute: AgentLoopOptions['execute'];
    buildToolResultMessages: AgentLoopOptions['buildToolResultMessages'];
    initialMessages: unknown[];
    onEvent: (event: WorkflowEvent) => void | Promise<void>;
  }
): Promise<{ outcome: 'complete' | 'max_calls_reached'; messages: unknown[] }> {
  const instruction = engine.getInstructionForState();
  const requiredTools = engine.getRequiredTools();

  // Create a system message with the workflow instruction
  const workflowMessages = [
    ...options.initialMessages,
    { role: 'system', content: instruction }
  ];

  let toolCallCount = 0;
  const maxCalls = state.max_calls ?? Infinity;

  const loop = createAgentLoop({
    execute: options.execute,
    buildToolResultMessages: options.buildToolResultMessages,
    stopWhen: (state) => {
      // Stop when no more tool calls or max reached
      return state.toolCallCount >= maxCalls;
    },
    onStep: async (result) => {
      toolCallCount += result.toolCalls.length;

      // Process each tool call through the engine
      for (const toolCall of result.toolCalls) {
        const toolResult = result.output; // Simplified — actual result from tool execution
        await engine.processToolCall(toolCall.name, toolResult);
      }
    },
    maxSteps: maxCalls
  });

  const parts: OutputPart[] = [];
  for await (const part of loop.run(workflowMessages)) {
    parts.push(part);
  }

  return {
    outcome: toolCallCount >= maxCalls ? 'max_calls_reached' : 'complete',
    messages: workflowMessages
  };
}
```

#### bash-node.ts

Deterministic shell execution:

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);

export async function executeBashNode(
  state: WorkflowState,
  capturedValues: Record<string, unknown>
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
  const command = injectValues(state.command!, capturedValues);
  const timeout = state.timeout_ms ?? 60000;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout });
    return { success: true, stdout, stderr, exitCode: 0 };
  } catch (error) {
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return { success: false, stdout: '', stderr: 'Command output exceeded buffer', exitCode: -1 };
    }
    return { success: false, stdout: '', stderr: error.message, exitCode: error.exitCode ?? -1 };
  }
}
```

#### gate-node.ts

Human approval gate with pause/resume:

```typescript
export function createGateNode(
  state: WorkflowState,
  capturedValues: Record<string, unknown>
): {
  prompt: string;
  isComplete: boolean;
  approve: () => void;
  reject: () => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
} {
  const prompt = injectValues(state.prompt!, capturedValues);
  let complete = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeout = state.timeout_ms ?? 3600000; // 1 hour default
  timeoutHandle = setTimeout(() => {
    if (!complete && state.on_timeout === 'abort') {
      complete = true;
    }
  }, timeout);

  return {
    prompt,
    get isComplete() { return complete; },
    approve() { complete = true; },
    reject() { complete = true; },
    get timeoutHandle() { return timeoutHandle; }
  };
}
```

#### parallel-node.ts

Fork/join parallel execution:

```typescript
export async function executeParallel(
  branches: string[],
  executeBranch: (stateId: string) => Promise<unknown>,
  joinMode: 'all' | 'any' = 'all'
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  if (joinMode === 'any') {
    // Race: first to complete wins
    const promises = branches.map(async (branchId) => {
      const result = await executeBranch(branchId);
      return { branchId, result };
    });
    const first = await Promise.race(promises);
    results[first.branchId] = first.result;
  } else {
    // All: wait for all branches
    const resultsArray = await Promise.allSettled(
      branches.map(async (branchId) => ({
        branchId,
        result: await executeBranch(branchId)
      }))
    );
    for (const entry of resultsArray) {
      if (entry.status === 'fulfilled') {
        results[entry.value.branchId] = entry.value.result;
      }
    }
  }

  return results;
}
```

---

### TASK-WF-008: Workflow executor (bridge to orchestrator)

**Location:** `packages/workflows/src/executor.ts`

Main entry point — connects engine to `createAgentLoop`:

```typescript
import { createAgentLoop } from '@agentsy/orchestrator/agent';
import type { AgentLoopOptions, AgentLoopHandle, OutputPart } from '@agentsy/orchestrator/agent';
import { WorkflowEngine } from './engine.js';
import type { WorkflowDefinition, WorkflowEvent, WorkflowExecutorOptions } from './types.js';
import { executeAiNode } from './nodes/ai-node.js';
import { executeBashNode } from './nodes/bash-node.js';
import { createGateNode } from './nodes/gate-node.js';
import { executeParallel } from './nodes/parallel-node.js';

export async function executeWorkflow(
  options: WorkflowExecutorOptions
): Promise<AgentLoopHandle> {
  const { workflow, execute, buildToolResultMessages, initialMessages } = options;
  const engine = new WorkflowEngine(workflow, options.onEvent);

  await options.onEvent?.({
    type: 'workflow_started',
    workflowName: workflow.name,
    runId: options.runId ?? ''
  });

  // Execute states sequentially
  let currentMessages = initialMessages;

  while (!engine.isComplete()) {
    const state = engine.currentState;

    switch (state.type) {
      case 'ai': {
        const result = await executeAiNode(state, engine, {
          execute,
          buildToolResultMessages,
          initialMessages: currentMessages,
          onEvent: options.onEvent ?? (() => {})
        });
        currentMessages = result.messages;
        break;
      }

      case 'bash': {
        const result = await executeBashNode(state, engine.runtimeState.capturedValues);
        if (!result.success && state.on_failure === 'abort') {
          await options.onEvent?.({
            type: 'workflow_error',
            stateId: state.id,
            error: result.stderr,
            runId: options.runId ?? ''
          });
          throw new Error(`Bash node failed: ${result.stderr}`);
        }
        break;
      }

      case 'gate': {
        const gate = createGateNode(state, engine.runtimeState.capturedValues);
        await options.onEvent?.({
          type: 'workflow_paused',
          stateId: state.id,
          reason: gate.prompt,
          runId: options.runId ?? ''
        });

        // Wait for approval (external caller must invoke gate.approve/reject)
        // This returns a handle that the caller can use
        return {
          abort: () => {},
          run: async function* () {
            while (!gate.isComplete) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (gate.timeoutHandle) clearTimeout(gate.timeoutHandle);
          }
        };
      }

      case 'parallel': {
        const results = await executeParallel(
          state.branches!,
          async (stateId) => {
            // Execute each branch state
            const branchState = workflow.states.find(s => s.id === stateId)!;
            // ... recursive execution
          },
          state.join_mode
        );
        break;
      }
    }

    if (engine.isComplete()) break;
  }

  await options.onEvent?.({
    type: 'workflow_complete',
    stateId: engine.currentState.id,
    runId: options.runId ?? '',
    outcome: 'success'
  });

  // Return standard agent loop handle for streaming output
  return {
    abort: () => {},
    run: async function* () {
      yield { type: 'text', text: `Workflow "${workflow.name}" complete` };
    }
  };
}
```

---

### TASK-WF-009: Workflow registry

**Location:** `packages/workflows/src/registry.ts`

```typescript
import { WorkflowLoader } from './loader.js';
import type { WorkflowDefinition, LoadedWorkflow } from './types.js';

export class WorkflowRegistry {
  private loader = new WorkflowLoader();
  private workflows = new Map<string, LoadedWorkflow>();

  async loadFromDirectory(dirPath: string): Promise<void> {
    const loaded = await this.loader.loadDirectory(dirPath);
    for (const workflow of loaded) {
      if (workflow.valid) {
        this.workflows.set(workflow.definition.name, workflow);
      }
    }
  }

  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.name, { definition: workflow, source: 'inline', valid: true });
  }

  get(name: string): LoadedWorkflow | undefined {
    return this.workflows.get(name);
  }

  matchTrigger(input: string): LoadedWorkflow[] {
    const matches: LoadedWorkflow[] = [];
    const lowerInput = input.toLowerCase();

    for (const workflow of this.workflows.values()) {
      if (!workflow.valid) continue;
      const triggers = Array.isArray(workflow.definition.trigger)
        ? workflow.definition.trigger
        : [workflow.definition.trigger];

      for (const trigger of triggers) {
        if (lowerInput.includes(trigger.toLowerCase())) {
          matches.push(workflow);
          break;
        }
      }
    }

    return matches;
  }

  list(): LoadedWorkflow[] {
    return Array.from(this.workflows.values());
  }
}
```

---

### TASK-WF-010: Default workflows

**Location:** `packages/workflows/workflows/defaults/`

Create 4 default workflows:

#### bug-fix.yaml

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
states:
  - id: plan
    type: ai
    instruction: "Create a todo list with investigation steps."
    required_tools: ["todowrite"]
    min_calls: 1
    next: analyze
  - id: analyze
    type: ai
    instruction: "Analyze the bug. Use grep and read to find relevant code."
    required_tools: ["grep", "read", "aft_search"]
    min_calls: 2
    max_calls: 8
    capture:
      affectedFiles: "$.files[*]"
      rootCause: "$.root_cause"
    next: implement
  - id: implement
    type: ai
    instruction: "Fix the bug at: {affectedFiles}. Root cause: {rootCause}"
    required_tools: ["edit", "write"]
    min_calls: 1
    max_calls: 5
    next: run-tests
  - id: run-tests
    type: bash
    command: "pnpm test"
    timeout_ms: 120000
    on_failure: retry
    max_retries: 2
    next: complete
  - id: complete
    type: ai
    instruction: "Summarize the bug, root cause, and fix."
    terminal: true
```

#### feature-dev.yaml

```yaml
name: feature-dev
version: "1.0"
description: "Plan and implement a new feature"
trigger:
  - "feature"
  - "implement"
  - "build"
  - "create"
max_steps: 40
states:
  - id: plan
    type: ai
    instruction: "Explore the codebase and create an implementation plan."
    required_tools: ["aft_search", "aft_outline", "todowrite"]
    min_calls: 2
    max_calls: 6
    capture:
      planSteps: "$.todos[*].content"
    next: implement
  - id: implement
    type: ai
    instruction: "Implement the feature following the plan."
    required_tools: ["edit", "write", "bash"]
    min_calls: 1
    max_calls: 15
    next: test
  - id: test
    type: ai
    instruction: "Write tests for the new feature."
    required_tools: ["write", "bash"]
    min_calls: 1
    max_calls: 5
    next: validate
  - id: validate
    type: bash
    command: "pnpm check-types && pnpm test && pnpm lint"
    timeout_ms: 180000
    on_failure: retry
    max_retries: 3
    next: complete
  - id: complete
    type: ai
    instruction: "Feature implementation complete. Summarize what was built."
    terminal: true
```

#### pr-review.yaml

```yaml
name: pr-review
version: "1.0"
description: "Review a pull request"
trigger:
  - "review"
  - "pr review"
  - "code review"
max_steps: 15
states:
  - id: analyze
    type: ai
    instruction: "Read the PR diff and analyze the changes."
    required_tools: ["bash", "read", "aft_search"]
    min_calls: 2
    max_calls: 6
    capture:
      changedFiles: "$.files[*]"
      riskLevel: "$.risk"
    next: review
  - id: review
    type: ai
    instruction: "Review changes in: {changedFiles}. Risk level: {riskLevel}"
    required_tools: ["read", "aft_zoom"]
    min_calls: 1
    max_calls: 5
    next: approve
  - id: approve
    type: gate
    prompt: "Review complete. Approve PR?"
    timeout_ms: 3600000
    on_timeout: continue
    terminal: true
```

#### code-refactor.yaml

```yaml
name: code-refactor
version: "1.0"
description: "Safely refactor code"
trigger:
  - "refactor"
  - "clean up"
  - "simplify"
max_steps: 20
states:
  - id: analyze
    type: ai
    instruction: "Analyze the code for refactoring opportunities."
    required_tools: ["aft_search", "aft_outline", "read"]
    min_calls: 2
    max_calls: 5
    capture:
      refactoringTargets: "$.targets[*]"
    next: plan
  - id: plan
    type: ai
    instruction: "Create a refactoring plan for: {refactoringTargets}"
    required_tools: ["todowrite"]
    min_calls: 1
    next: implement
  - id: implement
    type: ai
    instruction: "Refactor the code. Preserve behavior."
    required_tools: ["edit"]
    min_calls: 1
    max_calls: 10
    next: validate
  - id: validate
    type: bash
    command: "pnpm check-types && pnpm test"
    timeout_ms: 180000
    on_failure: abort
    next: complete
  - id: complete
    type: ai
    instruction: "Refactoring complete. Summarize changes."
    terminal: true
```

---

### TASK-WF-011: Tests

**Location:** `packages/workflows/test/`

#### loader.test.ts

- Load valid YAML file → parsed definition
- Load invalid YAML → errors array populated
- Load directory → multiple workflows
- Cache hit on second load of same file

#### engine.test.ts

- Linear state progression (plan → analyze → implement)
- Tool call counting and transition at min_calls
- Force transition at max_calls
- Value capture via JSONPath
- Value injection into instruction template
- Terminal state detection
- Invalid state ID → error

#### value-capture.test.ts

- JSONPath extraction from nested objects
- Array capture (`$.files[*]`)
- Single value capture
- Missing path → no capture (not error)
- Template injection with `{variable}` syntax
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

#### nodes/ai-node.test.ts

- Instruction includes tool examples
- Tool calls tracked by engine
- Max calls enforced

#### nodes/bash-node.test.ts

- Successful command → exitCode 0
- Failing command → exitCode non-zero
- Timeout enforced

#### nodes/gate-node.test.ts

- Gate starts incomplete
- approve() → complete
- reject() → complete
- Timeout → complete (if on_timeout: continue)

#### nodes/parallel-node.test.ts

- all mode → waits for all branches
- any mode → returns first completed
- Failed branch in all mode → captured in results

---

### TASK-WF-012: JSON Schema for IDE validation

**Location:** `packages/workflows/workflows/schema.json`

Generate JSON Schema from Zod schema for IDE autocomplete in YAML files:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Agentsy Workflow Definition",
  "type": "object",
  "required": ["name", "version", "states"],
  "properties": {
    "name": { "type": "string", "description": "Unique workflow identifier" },
    "version": { "type": "string", "description": "Semantic version" },
    "description": { "type": "string" },
    "trigger": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "max_steps": { "type": "integer", "default": 25 },
    "states": {
      "type": "array",
      "items": { "$ref": "#/definitions/WorkflowState" }
    }
  },
  "definitions": {
    "WorkflowState": { ... }
  }
}
```

---

### TASK-WF-013: Package README

**Location:** `packages/workflows/README.md`

Document:

- Package purpose
- Quick start (load workflows, execute)
- YAML schema reference
- Default workflows
- Integration with `@agentsy/orchestrator`
- API reference (WorkflowLoader, WorkflowEngine, executeWorkflow, WorkflowRegistry)

---

## Files Likely to Change

| File | Change |
|------|--------|
| `packages/workflows/*` | **New** — entire package |
| `pnpm-workspace.yaml` | No change needed (already `packages/*`) |
| `package.json` (root) | Add `@agentsy/workflows` to workspace deps if needed |
| `plan/INDEX.md` | Add Phase 13 entry |
| `plan/17-GOVERNANCE-QUALITY-GATES.md` | Add workflow quality gates |
| `plan/15-PHASE-12-HARDENING-RELEASE.md` | Add workflow checks to release checklist |
| `plan/IMPLEMENTATION-COMPLIANCE-MATRIX.md` | Add workflows package status |

---

## Tests / Validation

### Verification steps

```bash
# Package-level
cd packages/workflows
pnpm build
pnpm check-types
pnpm test
pnpm coverage

# Monorepo-level
pnpm build
pnpm check-types
pnpm test
pnpm lint
```

### Test coverage targets

- `loader.ts` — 100% (parse, validate, cache)
- `engine.ts` — 95%+ (state transitions, value capture, events)
- `executor.ts` — 90%+ (all node types, error paths)
- `value-capture.ts` — 100% (JSONPath, template injection)
- `nodes/*.ts` — 90%+ each

---

## Risks, Tradeoffs, and Open Questions

### Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| JSONPath complexity for nested tool results | Medium | Start with simple paths, document patterns |
| Gate node pause/resume integration with AG-UI | High | Use existing `InterruptController` pattern |
| Parallel node error aggregation | Medium | Use `Promise.allSettled`, capture per-branch errors |
| YAML schema drift from implementation | Low | Zod schema is single source of truth, generate JSON Schema from it |

### Tradeoffs

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State machine vs DAG | State machine (linear) first | Simpler, covers 80% of use cases; DAG can be added later |
| JSONPath vs custom capture | JSONPath | Standard, well-tested, LLMs understand it |
| YAML vs JSON | YAML | Human-readable, diffable, industry standard for workflows |
| Inline vs subprocess execution | Inline (via orchestrator) | No subprocess overhead, shares streaming/memory/runtime |

### Open Questions

1. **Should workflows be loaded from `.agentsy/workflows/` or `packages/workflows/workflows/`?** — Both. Default workflows ship in the package; user workflows live in `.agentsy/workflows/` with override semantics.
2. **How does the executor integrate with AG-UI events?** — The executor wraps `createAgentLoop` which already emits AG-UI events. Workflow events are emitted alongside.
3. **Should gate nodes support Slack/Telegram approval?** — Yes, via `@agentsy/connectors`. The gate returns a handle; connectors can call `approve()`/`reject()` from platform messages.
4. **What happens when a workflow references a non-existent tool?** — The AI node's `required_tools` is guidance, not enforcement. The orchestrator's tool approval system handles actual tool availability.

---

## Timeline Estimate

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

**Next:** Review this plan, approve, then begin TASK-WF-001 (package scaffold).
