# Agentsy: Comprehensive Remediation & Implementation Plan

**Version**: 1.0  
**Date**: 2026-06-16  
**Branch**: `feature/model-tier-routing`  
**Status**: DRAFT — Awaiting approval before Phase 0 begins

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architectural Decisions](#2-architectural-decisions)
3. [Phase 0 — Critical Bug Fixes](#3-phase-0--critical-bug-fixes)
4. [Phase 1 — Daemon Foundation](#4-phase-1--daemon-foundation)
5. [Phase 2 — Package Consolidation](#5-phase-2--package-consolidation)
6. [Phase 3 — Hook Pipeline Redesign](#6-phase-3--hook-pipeline-redesign)
7. [Phase 4 — Gateway → Daemon Migration](#7-phase-4--gateway--daemon-migration)
8. [Phase 5 — Streaming Architecture](#8-phase-5--streaming-architecture)
9. [Phase 6 — RAG as Daemon Service](#9-phase-6--rag-as-daemon-service)
10. [Phase 7 — Learning Loop & Background Jobs](#10-phase-7--learning-loop--background-jobs)
11. [Phase 8 — Multi-Agent & Deployment](#11-phase-8--multi-agent--deployment)
12. [Phase 9 — Missing Capabilities](#12-phase-9--missing-capabilities)
13. [Appendix A — Code Quality Deep-Dive](#appendix-a--code-quality-deep-dive)
14. [Appendix B — Package Consolidation Map](#appendix-b--package-consolidation-map)
15. [Appendix C — IPC Protocol Spec](#appendix-c--ipc-protocol-spec)

---

## 1. Executive Summary

This plan addresses 9 critical bugs, 7 architectural misalignments, and a fundamental restructuring of Agentsy around a **daemon-centric architecture**. The daemon becomes the single long-lived process that owns agents, subagents, scheduling, workflows, memory, routing, streaming, RAG, connectors, logging, and telemetry. The CLI, TUI, and VS Code extension become thin IPC clients.

### Scope

- **9 critical bug fixes** (fake streaming, lost tool calls, hook short-circuit, quota map, unit mismatch, daemon restart, tool-call ID dedup, transform blocking, cost filter units)
- **1 new package** (`@agentsy/daemon`) — the central powerhouse
- **8 package consolidations** (workflows → orchestrator, shared → types, scripts → root, etc.)
- **3 major architectural migrations** (gateway → daemon, streaming → daemon, RAG → daemon)
- **2 new subsystems** (background job scheduler, event-driven learning loop)
- **1 deployment evolution** (local multi-agent → server mode)

### Effort Estimate

| Phase | Description | Hours | Priority |
|-------|-------------|-------|----------|
| 0 | Critical Bug Fixes | ~20 | P0 — Immediate |
| 1 | Daemon Foundation | ~60 | P0 — Immediate |
| 2 | Package Consolidation | ~15 | P1 — After Phase 0 |
| 3 | Hook Pipeline Redesign | ~25 | P1 — After Phase 0 |
| 4 | Gateway → Daemon | ~40 | P1 — After Phase 1 |
| 5 | Streaming Architecture | ~35 | P1 — After Phase 4 |
| 6 | RAG as Daemon Service | ~30 | P2 — After Phase 1 |
| 7 | Learning Loop & Background Jobs | ~25 | P2 — After Phase 6 |
| 8 | Multi-Agent & Deployment | ~45 | P2 — After Phase 5 |
| 9 | Missing Capabilities | ~50 | P3 — After Phase 8 |
| | **Total** | **~345** | |

### Dependencies Graph

```
Phase 0 (Bug Fixes) ──────────────────────────────┐
                                                    ├──▶ Phase 2 (Consolidation)
Phase 1 (Daemon Foundation) ─┬──▶ Phase 4 (Gateway)│
                             ├──▶ Phase 5 (Stream)  │
                             ├──▶ Phase 6 (RAG)     │
                             └──▶ Phase 3 (Hooks) ──┘
                                                       
Phase 4 + 5 ──▶ Phase 8 (Multi-Agent/Deploy)
Phase 6 ──────▶ Phase 7 (Learning Loop)
Phase 8 ──────▶ Phase 9 (Missing Capabilities)
```

---

## 2. Architectural Decisions

### AD-1: Daemon as the Central Process

**Decision**: The daemon (`@agentsy/daemon`) is the single long-lived process that owns all stateful subsystems. The CLI, TUI, and VS Code extension are thin clients that connect via IPC.

**Rationale**: Currently, every CLI invocation spins up its own runtime, memory engine, gateway, and provider connections. This is wasteful, prevents cross-session memory, and makes features like background jobs and scheduled workflows impossible. A persistent daemon solves all of these.

**Implications**:
- The daemon must be crash-resilient (supervisor pattern, auto-restart)
- IPC must be fast enough for streaming tokens (Unix domain sockets, not HTTP)
- All subsystems must support sleep/wake lifecycle
- The daemon must have a built-in CLI display mode (TUI-over-IPC)

### AD-2: Hook Transform Composition

**Decision**: Hook transforms compose left-to-right, like Koa/Express middleware. Each hook receives the output of the previous transform. Priority determines execution order.

**Rationale**: The current short-circuit design prevents guardrails and memory from both transforming the same event. Composition is the proven pattern from web frameworks.

### AD-3: Daemon-Centric Streaming

**Decision**: The daemon owns all LLM provider connections. Clients request streams via IPC; the daemon pipes SSE events back.

**Rationale**: Centralizing streaming enables daemon-level prompt caching, cost tracking, retry orchestration, and circuit breaking. It also avoids the fake-streaming bug in UniversalClient.

### AD-4: Merge Small Packages, Keep Big Separate

**Decision**: Packages with <20 source files and no independent deployment boundary merge into a related package. Packages with substantial code stay separate. Everything gets implemented.

### AD-5: Gateway Into Daemon

**Decision**: Gateway routing, health, quota, and circuit breaking move into the daemon. The `@agentsy/gateway` package becomes a thin client that communicates with the daemon's routing service.

**Rationale**: With daemon-centric streaming, the daemon must own routing decisions. Duplicating routing logic in the gateway package would be a maintenance burden.

### AD-6: Daemon-Internal RAG

**Decision**: RAG becomes a daemon-internal service. The daemon runs background indexing, maintains the vector store, and serves retrieval requests via MCP.

**Rationale**: RAG requires persistent state (vector indices, embedding caches). Running it in the daemon enables background indexing without CLI startup, cross-session index reuse, and the wiki invariant (index synthesized pages, not raw events).

### AD-7: Background + Event-Driven Learning

**Decision**: The learning loop runs as a daemon background job on a configurable schedule AND is triggered by specific events (canary detection, observation threshold).

**Rationale**: Pure timer-based learning wastes resources when there's nothing to learn. Pure event-driven learning can miss patterns that emerge over time. Combining both gives the best of both worlds.

### AD-8: Multi-Agent with Isolated Scopes → Server Mode

**Decision**: The daemon starts as a local multi-agent system with memory scope isolation. It evolves to support server deployment with authentication, rate limiting, and multi-tenancy.

**Rationale**: Multi-agent is needed immediately (coder + researcher + planner running simultaneously). Server deployment is a future goal that should inform architectural decisions but not block v1.

---

## 3. Phase 0 — Critical Bug Fixes

**Priority**: P0 — Must be completed before any architectural work begins.  
**Estimated effort**: ~20 hours  
**Branch**: `fix/phase0-critical-bugs` (branched from `feature/model-tier-routing`)

These fixes must land on the current architecture first. Migrating broken code into the daemon would bake in the bugs.

### 0.1 Fix Fake Streaming in UniversalClient

**File**: `packages/providers/src/universal-client/client.ts`

**Problem**: `stream()` buffers ALL chunks into an array before creating a `ReadableStream`. The consumer receives all data at once after the stream completes — this is not streaming at all, it's deferred batch delivery. For large responses (code generation, document writing), this introduces multi-second latency before the first token appears.

**Fix**: Return the underlying async iterator directly, wrapped in a proper `ReadableStream` that emits chunks as they arrive:

```typescript
// BEFORE (broken):
async *stream(messages: Message[], options?: StreamOptions): AsyncIterable<StreamChunk> {
  const providerRequest = this.buildRequest(messages, options);
  const adapter = this.getAdapter(providerRequest.provider);

  const chunks: StreamChunk[] = [];
  for await (const rawChunk of adapter.stream(providerRequest)) {
    const chunk = this.normalizeChunk(rawChunk, providerRequest.provider);
    chunks.push(chunk); // ← BUFFERS EVERYTHING
  }

  // Creates a ReadableStream from already-complete array
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

// AFTER (true streaming):
async *stream(messages: Message[], options?: StreamOptions): AsyncGenerator<StreamChunk, void, undefined> {
  const providerRequest = this.buildRequest(messages, options);
  const adapter = this.getAdapter(providerRequest.provider);

  for await (const rawChunk of adapter.stream(providerRequest)) {
    // Yield each chunk immediately as it arrives from the provider
    yield this.normalizeChunk(rawChunk, providerRequest.provider);
  }
}

// For consumers that need a ReadableStream:
toReadableStream(messages: Message[], options?: StreamOptions): ReadableStream<StreamChunk> {
  const self = this;
  return new ReadableStream<StreamChunk>({
    async start(controller) {
      try {
        for await (const chunk of self.stream(messages, options)) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}
```

**Important**: This changes the return type from `AsyncIterable<StreamChunk>` to `AsyncGenerator<StreamChunk, void, undefined>`. Consumers using `for await...of` will work unchanged. Consumers using the `ReadableStream` API should switch to `toReadableStream()`.

**Test**: Add a test that verifies the first chunk arrives before the stream completes:

```typescript
it('should yield chunks incrementally, not batch', async () => {
  const client = createUniversalClient({ /* ... */ });
  const chunks: StreamChunk[] = [];
  let firstChunkTime = 0;
  let streamEndTime = 0;

  for await (const chunk of client.stream(messages)) {
    if (chunks.length === 0) firstChunkTime = Date.now();
    chunks.push(chunk);
  }
  streamEndTime = Date.now();

  // First chunk should arrive well before stream end
  expect(firstChunkTime).toBeLessThan(streamEndTime);
  expect(chunks.length).toBeGreaterThan(1);
});
```

### 0.2 Fix Tool Calls Lost from Conversation History

**File**: `packages/runtime/src/loop/simple-turn.ts`

**Problem**: After processing a stream, only the accumulated text (`accText`) is stored in the conversation history. Tool calls extracted from chunks are silently discarded. On the next turn, the model cannot see its own tool calls, breaking multi-step tool use.

**Fix**: Store both the assistant message (with tool calls) and the tool result messages:

```typescript
// AFTER the stream processing loop, replace the history append:

// Current (broken):
this.messages.push({ role: 'assistant', content: accText });

// Fixed:
const assistantMessage: Message = {
  role: 'assistant',
  content: accText || undefined,
};

// Attach tool calls if any were extracted
if (extractedToolCalls.length > 0) {
  assistantMessage.tool_calls = extractedToolCalls.map(tc => ({
    id: tc.id ?? `call_${Date.now()}_${tc.name}`,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments: typeof tc.parameters === 'string' 
        ? tc.parameters 
        : JSON.stringify(tc.parameters),
    },
  }));
}

// If the assistant only made tool calls with no text content,
// OpenAI expects content to be null
if (!assistantMessage.content && (assistantMessage.tool_calls?.length ?? 0) > 0) {
  assistantMessage.content = null;
}

this.messages.push(assistantMessage);

// Append tool result messages (required by OpenAI API)
// These should come from the tool execution step that follows
// The tool executor should push results like:
// this.messages.push({
//   role: 'tool',
//   tool_call_id: tc.id,
//   content: JSON.stringify(toolResult),
// });
```

**Important**: This fix requires coordinating with the tool execution flow. After the assistant message with tool calls is appended, the tool executor must:
1. Execute each tool call
2. Append a `{ role: 'tool', tool_call_id, content }` message for each result
3. Re-invoke the model with the updated history

If tool execution is handled elsewhere (e.g., in the runtime hooks), ensure the tool results are also appended to `this.messages`.

### 0.3 Fix Hook Registry Transform Short-Circuit

**File**: `packages/runtime/src/hooks/registry.ts`

**Problem**: `fire()` returns immediately on the first `transform` result. If both a guardrail hook and a memory hook transform the same event, only the first-registered one wins. This silently drops transformations.

**This is a deep architectural fix that will be fully addressed in Phase 3 (Hook Pipeline Redesign).** For Phase 0, we apply a minimal patch to prevent silent data loss:

```typescript
// Phase 0 minimal patch: warn instead of silently dropping

fire<T extends HookEventName>(
  event: T,
  context: HookContext<T>
): HookResult {
  let currentPayload = context;
  const handlers = this.getHandlersForEvent(event);

  for (const handler of handlers) {
    try {
      const result = handler.handler(currentPayload);

      if (result && typeof result === 'object') {
        if ('transform' in result) {
          // WARN: Multiple transforms will be handled in Phase 3
          // For now, compose by replacing the payload
          if (currentPayload !== context) {
            // A previous transform already modified the payload
            this.logger?.warn(
              `Hook transform collision on event "${event}": ` +
              `handler "${handler.id}" overwrites previous transform. ` +
              `This will be fixed in Phase 3 (Hook Pipeline Redesign).`
            );
          }
          currentPayload = { ...currentPayload, ...result.transform };
        }
        if ('stop' in result && result.stop) {
          break;
        }
      }
    } catch (error) {
      this.logger?.error(`Hook "${handler.id}" threw on event "${event}":`, error);
      // Continue to next handler — don't let one bad hook break the chain
    }
  }

  if (currentPayload !== context) {
    return { transform: currentPayload };
  }
  return {};
}
```

### 0.4 Fix Gateway Cost Filter Unit Mismatch

**File**: `packages/gateway/src/selector.ts`

**Problem**: `maxUsdPer1KInput` compares against `inputPer1MTokens` — a 1000x unit mismatch. A budget of $0.01 per 1K tokens would incorrectly match models costing $10 per 1M tokens.

**Fix**: Normalize to a common unit (per-1M tokens, which is what the model registry stores):

```typescript
// BEFORE (broken):
if (constraints.maxUsdPer1KInput !== undefined) {
  candidates = candidates.filter(
    m => m.pricing.inputPer1MTokens <= constraints.maxUsdPer1KInput
  );
}

// AFTER (correct — convert user-facing per-1K to internal per-1M):
if (constraints.maxUsdPer1KInput !== undefined) {
  const maxPer1M = constraints.maxUsdPer1KInput * 1000; // per-1K → per-1M
  candidates = candidates.filter(
    m => m.pricing.inputPer1MTokens <= maxPer1M
  );
}

// Same for output:
if (constraints.maxUsdPer1KOutput !== undefined) {
  const maxPer1M = constraints.maxUsdPer1KOutput * 1000; // per-1K → per-1M
  candidates = candidates.filter(
    m => m.pricing.outputPer1MTokens <= maxPer1M
  );
}
```

**Test**:

```typescript
it('should correctly filter by cost constraints (per-1K vs per-1M)', () => {
  const models: ModelEntry[] = [
    { id: 'cheap', pricing: { inputPer1MTokens: 0.30, outputPer1MTokens: 0.60 } },  // $0.0003/1K in
    { id: 'mid', pricing: { inputPer1MTokens: 3.00, outputPer1MTokens: 6.00 } },    // $0.003/1K in
    { id: 'pricey', pricing: { inputPer1MTokens: 30.00, outputPer1MTokens: 60.00 } }, // $0.03/1K in
  ];

  const result = selectModelForTier(models, {
    tier: 'mid',
    maxUsdPer1KInput: 0.005,  // $5 per 1M tokens = $0.005 per 1K
  });

  expect(result.map(m => m.id)).toEqual(['cheap', 'mid']);
  expect(result).not.toContainEqual(expect.objectContaining({ id: 'pricey' }));
});
```

### 0.5 Fix Gateway Retry Quota Map Bug

**File**: `packages/gateway/src/retry.ts`

**Problem**: `orderProviders()` builds a `quotaMap` where every provider entry maps to the same quota snapshot (`context.quota.getUsageSnapshot()`). All providers appear to have identical quota usage, so quota-aware ordering is meaningless.

**Fix**: Use per-provider quota trackers:

```typescript
// BEFORE (broken):
const quotaMap = new Map(
  entries.map(entry => [entry.id, context.quota.getUsageSnapshot()])
);

// AFTER (correct):
const quotaMap = new Map(
  entries.map(entry => [
    entry.id,
    context.quotaRegistry?.getTracker(entry.id)?.getUsageSnapshot() 
      ?? context.quota.getUsageSnapshot() // fallback to shared tracker
  ])
);
```

**This requires adding `quotaRegistry` to the retry context type:**

```typescript
export interface RetryContext {
  // ... existing fields ...
  quota: QuotaTracker;
  quotaRegistry?: QuotaRegistry; // NEW: per-provider quota trackers
  health: HealthRegistry;
  strategy: SelectionStrategy;
}
```

### 0.6 Fix Daemon Restart Orphan Server

**File**: `packages/memory/src/mcp/daemon.ts`

**Problem**: In `runWithRestart()`, after a crash, a new engine and server are created but the new server is never started. The closure variable `server` still references the old (crashed) server.

**Fix**: The restart logic must fully replace the server in the closure:

```typescript
// AFTER: Proper restart wiring
private async runWithRestart(
  engine: MemoryEngine,
  server: MCPServer,
  config: DaemonConfig,
  restartTimestamps: number[]
): Promise<void> {
  try {
    await server.start();
    // ... normal operation ...
  } catch (error) {
    if (!isRestartable(error)) throw error;

    const now = Date.now();
    restartTimestamps.push(now);
    cleanOldRestartTimestamps(restartTimestamps, now);

    if (restartTimestamps.length > MAX_RESTARTS_IN_WINDOW) {
      throw new Error(
        `Daemon exceeded ${MAX_RESTARTS_IN_WINDOW} restarts in ` +
        `${RESTART_WINDOW_MS / 1000}s. Last error: ${error}`
      );
    }

    // Create fresh engine and server
    const newEngine = await createMemoryEngine(/* config */);
    const newServer = createMemoryMCPServer(newEngine, {
      transport: config.transport,
      logLevel: config.logLevel,
    });

    // Start the NEW server BEFORE recursing
    // Recurse with NEW references — the old ones are dead
    return this.runWithRestart(newEngine, newServer, config, restartTimestamps);
  }
}
```

### 0.7 Fix Tool Call ID Dedup in stream-to-events

**File**: `packages/core/src/stream-to-events.ts`

**Problem**: `emitToolCallsEvent` uses `tc.function?.name` as the dedup key for `tool-call-start` events. If two tool calls have the same function name (e.g., calling `read_file` twice with different arguments), the second won't emit a start event.

**Fix**: Use the provider-assigned `tc.id` as the dedup key:

```typescript
// BEFORE (broken):
const id = tc.function?.name ?? `tool_${Date.now()}`;
if (seenToolCallIds.has(id)) continue;
seenToolCallIds.add(id);

// AFTER (correct):
const toolCallId = tc.id ?? `${tc.function?.name}_${Date.now()}`;
if (seenToolCallIds.has(toolCallId)) continue;
seenToolCallIds.add(toolCallId);
```

### 0.8 Add Retry Jitter to Core Retry

**File**: `packages/core/src/retry/index.ts`

**Problem**: No jitter in exponential backoff. Multiple concurrent retries all fire at the same time, causing thundering herd against the provider.

**Fix**:

```typescript
// Add full jitter: random between 0 and the calculated delay
function jitteredDelay(baseDelay: number): number {
  return Math.random() * baseDelay;
}

// In the delay calculation:
const baseDelay = initialDelay * Math.pow(backoffFactor, state.attempt - 1);
const delay = jitteredDelay(Math.min(baseDelay, maxDelay));

await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, delay);
  timer.unref(); // Don't prevent process exit
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new AbortError('Retry aborted'));
  }, { once: true });
});
```

### 0.9 Fix Provider Error Classification

**File**: `packages/gateway/src/retry.ts`

**Problem**: `classifyReason()` checks `error.message.toLowerCase().includes('rate')` — this matches any error containing "rate" (e.g., "iterate at a fast rate"), not just rate-limit errors.

**Fix**: Use more specific pattern matching:

```typescript
function classifyReason(error: unknown): RetryReason {
  const msg = error instanceof Error ? error.message : String(error).toLowerCase();

  // Check for HTTP status codes first (most reliable)
  if (hasStatus(error, 429)) return 'rate_limit';
  if (hasStatus(error, 503)) return 'service_unavailable';
  if (hasStatus(error, 500)) return 'server_error';

  // Then check for known error patterns — be specific, not substring
  const lower = msg.toLowerCase();
  if (/rate[\s_-]?limit/.test(lower) || /too[\s_-]?many[\s_-]?requests/.test(lower)) {
    return 'rate_limit';
  }
  if (/quota[\s_-]?exceeded/.test(lower) || /usage[\s_-]?limit/.test(lower)) {
    return 'quota_exceeded';
  }
  if (/timeout|timed?\s*out|deadline\s*exceeded/.test(lower)) {
    return 'timeout';
  }
  if (/connection[\s_-]?refused|econnreset|econnrefused/.test(lower)) {
    return 'connection_error';
  }

  return 'unknown';
}
```

---

## 4. Phase 1 — Daemon Foundation

**Priority**: P0 — Can begin in parallel with Phase 0 bug fixes  
**Estimated effort**: ~60 hours  
**Branch**: `feat/daemon-foundation`

This phase creates the `@agentsy/daemon` package — the central long-lived process.

### 1.1 Package Scaffolding

Create `packages/daemon/` with the following structure:

```
packages/daemon/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts                    # Public API barrel
│   ├── daemon.ts                   # Main Daemon class — lifecycle manager
│   ├── daemon.test.ts
│   ├── config.ts                   # Daemon configuration schema
│   ├── config.test.ts
│   ├── ipc/
│   │   ├── index.ts                # IPC barrel
│   │   ├── server.ts               # Unix socket / named pipe server
│   │   ├── server.test.ts
│   │   ├── client.ts               # Thin client for IPC communication
│   │   ├── client.test.ts
│   │   ├── protocol.ts             # Message types & serialization
│   │   └── protocol.test.ts
│   ├── lifecycle/
│   │   ├── index.ts
│   │   ├── supervisor.ts           # Crash recovery & auto-restart
│   │   ├── supervisor.test.ts
│   │   ├── sleeper.ts              # Sleep/wake for idle subsystems
│   │   └── sleeper.test.ts
│   ├── services/
│   │   ├── index.ts                # Service registry
│   │   ├── service-host.ts         # Generic service host with sleep/wake
│   │   └── service-host.test.ts
│   ├── agents/
│   │   ├── index.ts
│   │   ├── agent-host.ts           # Multi-agent lifecycle manager
│   │   └── agent-host.test.ts
│   ├── jobs/
│   │   ├── index.ts
│   │   ├── scheduler.ts            # Cron + one-time job scheduler
│   │   ├── scheduler.test.ts
│   │   ├── job-queue.ts            # Persistent job queue (SQLite-backed)
│   │   └── job-queue.test.ts
│   ├── connectors/
│   │   ├── index.ts
│   │   ├── connector-host.ts       # Third-party connector manager
│   │   └── connector-host.test.ts
│   ├── display/
│   │   ├── index.ts
│   │   ├── tui-bridge.ts           # TUI display over IPC
│   │   └── tui-bridge.test.ts
│   └── cli/
│       ├── index.ts
│       ├── start.ts                # `agentsy daemon start`
│       ├── stop.ts                 # `agentsy daemon stop`
│       ├── status.ts               # `agentsy daemon status`
│       └── restart.ts              # `agentsy daemon restart`
```

### 1.2 Core Daemon Class

The `Daemon` class is the top-level lifecycle manager. It owns all subsystems and coordinates their startup, shutdown, sleep, and wake.

```typescript
// packages/daemon/src/daemon.ts

import { createMemoryEngine, MemoryEngine } from '@agentsy/memory';
import { createIPCServer, IPCServer } from './ipc/server.js';
import { ServiceHost, ServiceState } from './services/service-host.js';
import { AgentHost } from './agents/agent-host.js';
import { JobScheduler } from './jobs/scheduler.js';
import { ConnectorHost } from './connectors/connector-host.js';
import { DaemonConfig, resolveConfig } from './config.js';
import { Supervisor, SupervisorPolicy } from './lifecycle/supervisor.js';
import { Sleeper, SleepPolicy } from './lifecycle/sleeper.js';

export interface DaemonDeps {
  config: Partial<DaemonConfig>;
  // Optional overrides for testing
  memoryEngine?: MemoryEngine;
  ipcServer?: IPCServer;
}

export type DaemonState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export class Daemon {
  // ── State ──────────────────────────────────────
  private _state: DaemonState = 'stopped';
  private _stateListeners = new Set<(state: DaemonState) => void>();

  // ── Subsystems ─────────────────────────────────
  readonly memory: MemoryEngine;
  readonly ipc: IPCServer;
  readonly services: ServiceHost;
  readonly agents: AgentHost;
  readonly jobs: JobScheduler;
  readonly connectors: ConnectorHost;
  readonly supervisor: Supervisor;
  readonly sleeper: Sleeper;

  // ── Infrastructure ─────────────────────────────
  private readonly config: DaemonConfig;
  private readonly db: DatabaseConnection;
  private readonly logger: DaemonLogger;
  private readonly metrics: DaemonMetrics;

  constructor(deps: DaemonDeps) {
    this.config = resolveConfig(deps.config);

    // Core infrastructure
    this.logger = createDaemonLogger(this.config.logging);
    this.metrics = createDaemonMetrics(this.config.metrics);
    this.db = createDatabaseConnection(this.config.database);

    // Subsystems
    this.memory = deps.memoryEngine ?? createMemoryEngine({
      db: this.db,
      logger: this.logger.child('memory'),
    });

    this.ipc = deps.ipcServer ?? createIPCServer({
      socketPath: this.config.ipc.socketPath,
      logger: this.logger.child('ipc'),
    });

    this.services = new ServiceHost({
      logger: this.logger.child('services'),
      metrics: this.metrics,
    });

    this.agents = new AgentHost({
      memory: this.memory,
      logger: this.logger.child('agents'),
      metrics: this.metrics,
    });

    this.jobs = new JobScheduler({
      db: this.db,
      logger: this.logger.child('jobs'),
      metrics: this.metrics,
    });

    this.connectors = new ConnectorHost({
      logger: this.logger.child('connectors'),
      config: this.config.connectors,
    });

    this.supervisor = new Supervisor({
      policy: this.config.supervisor,
      logger: this.logger.child('supervisor'),
    });

    this.sleeper = new Sleeper({
      policy: this.config.sleep,
      logger: this.logger.child('sleeper'),
    });
  }

  // ── Lifecycle ──────────────────────────────────

  async start(): Promise<void> {
    if (this._state !== 'stopped') {
      throw new Error(`Cannot start daemon in state "${this._state}"`);
    }

    this.transition('starting');

    try {
      // 1. Initialize database
      await this.db.migrate();

      // 2. Start memory engine (core subsystem)
      await this.memory.initialize();
      this.services.register('memory', this.memory);

      // 3. Start job scheduler (needs DB for persistence)
      await this.jobs.start();
      this.services.register('jobs', this.jobs);

      // 4. Start agent host
      await this.agents.initialize();

      // 5. Start connectors
      await this.connectors.initialize();

      // 6. Start IPC server LAST (only accept clients when fully ready)
      await this.ipc.start();
      this.registerIPCHandlers();

      // 7. Enable supervisor (watches for crashes)
      this.supervisor.watch(this);

      // 8. Enable sleeper (puts idle subsystems to sleep)
      this.sleeper.watch(this.services);

      this.transition('running');
      this.logger.info('Daemon started', {
        pid: process.pid,
        socket: this.config.ipc.socketPath,
        agents: this.agents.count(),
        services: this.services.count(),
      });
    } catch (error) {
      this.transition('crashed');
      this.logger.error('Daemon failed to start', error);
      throw error;
    }
  }

  async stop(graceful = true): Promise<void> {
    if (this._state !== 'running') return;

    this.transition('stopping');
    const timeout = graceful ? this.config.shutdownTimeoutMs : 5000;

    try {
      // Shutdown in reverse order of startup
      await withTimeout(this.ipc.stop(), timeout);          // Stop accepting new clients
      await withTimeout(this.sleeper.stop(), timeout);      // Stop sleep monitoring
      await withTimeout(this.supervisor.stop(), timeout);   // Stop crash watching
      await withTimeout(this.connectors.shutdown(), timeout);
      await withTimeout(this.agents.shutdown(), timeout);
      await withTimeout(this.jobs.stop(), timeout);
      await withTimeout(this.memory.shutdown(), timeout);
      await withTimeout(this.db.close(), timeout);

      this.transition('stopped');
      this.logger.info('Daemon stopped');
    } catch (error) {
      this.transition('crashed');
      this.logger.error('Daemon error during shutdown', error);
      throw error;
    }
  }

  // ── State Management ───────────────────────────

  get state(): DaemonState {
    return this._state;
  }

  onStateChange(listener: (state: DaemonState) => void): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  private transition(state: DaemonState): void {
    const prev = this._state;
    this._state = state;
    this.logger.debug(`Daemon state: ${prev} → ${state}`);
    for (const listener of this._stateListeners) {
      try { listener(state); } catch { /* don't let listeners crash daemon */ }
    }
  }

  // ── IPC Handlers ───────────────────────────────

  private registerIPCHandlers(): void {
    // Agent management
    this.ipc.handle('agent.spawn', (req) => this.agents.spawn(req));
    this.ipc.handle('agent.list', () => this.agents.list());
    this.ipc.handle('agent.kill', (req) => this.agents.kill(req.agentId));
    this.ipc.handle('agent.send', (req) => this.agents.send(req.agentId, req.message));

    // Memory operations
    this.ipc.handle('memory.recall', (req) => this.memory.recall(req));
    this.ipc.handle('memory.capture', (req) => this.memory.ingest(req));
    this.ipc.handle('memory.search', (req) => this.memory.search(req));

    // Streaming (daemon owns LLM connections)
    this.ipc.handle('stream.start', (req) => this.agents.startStream(req));
    this.ipc.handle('stream.cancel', (req) => this.agents.cancelStream(req.streamId));

    // Job scheduling
    this.ipc.handle('jobs.schedule', (req) => this.jobs.schedule(req));
    this.ipc.handle('jobs.list', () => this.jobs.list());
    this.ipc.handle('jobs.cancel', (req) => this.jobs.cancel(req.jobId));

    // Health & status
    this.ipc.handle('daemon.status', () => this.getStatus());
    this.ipc.handle('daemon.shutdown', () => this.stop());

    // TUI display
    this.ipc.handle('display.render', (req) => this.handleDisplay(req));
  }

  // ... getStatus(), handleDisplay() implementations
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms).unref()
    ),
  ]);
}
```

### 1.3 IPC Protocol

The IPC protocol uses JSON-RPC 2.0 over Unix domain sockets (or named pipes on Windows). This gives us:
- Standardized request/response semantics
- Built-in support for streaming (via notifications)
- Easy to debug (human-readable JSON)
- Simple to add new methods

```typescript
// packages/daemon/src/ipc/protocol.ts

// ── Base Protocol ────────────────────────────────

export interface IPCRequest {
  jsonrpc: '2.0';
  id: string;                    // UUID for correlating responses
  method: string;                // e.g., 'agent.spawn', 'memory.recall'
  params?: Record<string, unknown>;
}

export interface IPCResponse {
  jsonrpc: '2.0';
  id: string;                    // Matches request ID
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ── Streaming ────────────────────────────────────

// Streaming uses JSON-RPC notifications (no ID, no response expected)
// The server sends a sequence of notifications, terminated by a final one

export interface IPCStreamChunk {
  jsonrpc: '2.0';
  method: 'stream.chunk';
  params: {
    streamId: string;
    chunk: StreamChunk;          // Reuses @agentsy/core StreamChunk type
    index: number;               // Sequential chunk index for ordering
  };
}

export interface IPCStreamEnd {
  jsonrpc: '2.0';
  method: 'stream.end';
  params: {
    streamId: string;
    usage?: TokenUsage;
    totalChunks: number;
  };
}

export interface IPCStreamError {
  jsonrpc: '2.0';
  method: 'stream.error';
  params: {
    streamId: string;
    error: {
      code: number;
      message: string;
      recoverable: boolean;       // If true, client can retry
    };
  };
}

// ── Method Registry ──────────────────────────────

export type IPCMethod =
  // Agent lifecycle
  | 'agent.spawn'
  | 'agent.list'
  | 'agent.kill'
  | 'agent.send'
  // Streaming
  | 'stream.start'
  | 'stream.cancel'
  // Memory
  | 'memory.recall'
  | 'memory.capture'
  | 'memory.search'
  // Jobs
  | 'jobs.schedule'
  | 'jobs.list'
  | 'jobs.cancel'
  // Routing (delegated from gateway)
  | 'route.select'
  | 'route.health'
  // RAG
  | 'rag.index'
  | 'rag.query'
  // Health
  | 'daemon.status'
  | 'daemon.shutdown'
  // Display
  | 'display.render';
```

### 1.4 IPC Server Implementation

```typescript
// packages/daemon/src/ipc/server.ts

import { createServer, Socket } from 'net';
import { IPCRequest, IPCResponse, IPCStreamChunk, IPCStreamEnd } from './protocol.js';

export interface IPCServerConfig {
  socketPath: string;             // Unix domain socket path
  maxConnections?: number;        // Default: 10
  requestTimeoutMs?: number;      // Default: 30000
  logger: Logger;
}

export class IPCServer {
  private server: ReturnType<typeof createServer> | null = null;
  private clients = new Map<string, Socket>();
  private handlers = new Map<string, RequestHandler>();
  private config: Required<IPCServerConfig>;

  constructor(config: IPCServerConfig) {
    this.config = {
      maxConnections: 10,
      requestTimeoutMs: 30000,
      ...config,
    };
  }

  async start(): Promise<void> {
    // Remove stale socket file
    try { await fs.unlink(this.config.socketPath); } catch { /* doesn't exist, fine */ }

    this.server = createServer((socket) => {
      const clientId = uuid();

      if (this.clients.size >= this.config.maxConnections) {
        this.config.logger.warn('Max connections reached, rejecting client', { clientId });
        socket.destroy();
        return;
      }

      this.clients.set(clientId, socket);
      this.setupClient(clientId, socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.config.socketPath, () => resolve());
      this.server!.on('error', reject);
    });
  }

  private setupClient(clientId: string, socket: Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString('utf-8');

      // Parse newline-delimited JSON
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (line.trim()) {
          this.handleMessage(clientId, line, socket).catch((error) => {
            this.config.logger.error('Error handling IPC message', { clientId, error });
          });
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  private async handleMessage(clientId: string, raw: string, socket: Socket): Promise<void> {
    const request: IPCRequest = JSON.parse(raw);

    const handler = this.handlers.get(request.method);
    if (!handler) {
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      });
      return;
    }

    try {
      const result = await handler(request.params ?? {}, {
        clientId,
        socket,
        sendNotification: (method: string, params: unknown) => {
          this.sendNotification(socket, { jsonrpc: '2.0', method, params });
        },
      });

      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id,
        result,
      });
    } catch (error) {
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: error.code ?? -32603,
          message: error.message ?? 'Internal error',
        },
      });
    }
  }

  // ── Handler Registration ───────────────────────

  handle(method: string, handler: RequestHandler): void {
    this.handlers.set(method, handler);
  }

  // ── Wire Protocol ──────────────────────────────

  private sendResponse(socket: Socket, response: IPCResponse): void {
    socket.write(JSON.stringify(response) + '\n');
  }

  private sendNotification(socket: Socket, notification: object): void {
    socket.write(JSON.stringify(notification) + '\n');
  }

  // ── Lifecycle ──────────────────────────────────

  async stop(): Promise<void> {
    // Close all client connections
    for (const [id, socket] of this.clients) {
      socket.destroy();
      this.clients.delete(id);
    }

    // Close server
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }

    // Clean up socket file
    try { await fs.unlink(this.config.socketPath); } catch { /* fine */ }
  }
}

export type RequestHandler = (
  params: Record<string, unknown>,
  context: {
    clientId: string;
    socket: Socket;
    sendNotification: (method: string, params: unknown) => void;
  }
) => Promise<unknown>;
```

### 1.5 IPC Client (Thin Client for CLI/TUI/VS Code)

```typescript
// packages/daemon/src/ipc/client.ts

import { connect, Socket } from 'net';
import { IPCRequest, IPCResponse, IPCStreamChunk, IPCStreamEnd } from './protocol.js';

export class IPCClient {
  private socket: Socket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private streamListeners = new Map<string, StreamListener>();
  private buffer = '';

  async connect(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = connect(socketPath, () => resolve());

      this.socket.on('data', (data) => {
        this.buffer += data.toString('utf-8');
        this.processBuffer();
      });

      this.socket.on('error', reject);
    });
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = uuid();
    const request: IPCRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket!.write(JSON.stringify(request) + '\n');

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`IPC request timeout: ${method}`));
        }
      }, 30000).unref();
    });
  }

  // ── Streaming ──────────────────────────────────

  async *stream(method: string, params?: Record<string, unknown>): AsyncGenerator<StreamChunk> {
    const streamId = uuid();

    // Register stream listener before sending request
    const listener = new StreamListener(streamId);
    this.streamListeners.set(streamId, listener);

    // Send the stream start request
    await this.request(method, { ...params, streamId });

    // Yield chunks as they arrive
    try {
      for await (const chunk of listener) {
        if ('error' in chunk) {
          throw new Error(chunk.error.message);
        }
        if ('end' in chunk) {
          return; // Stream complete
        }
        yield chunk;
      }
    } finally {
      this.streamListeners.delete(streamId);
    }
  }

  // ── Buffer Processing ──────────────────────────

  private processBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        // Response to a pending request
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
        }

        // Streaming notification
        if (message.method === 'stream.chunk') {
          const { streamId, chunk } = message.params;
          this.streamListeners.get(streamId)?.push(chunk);
        }
        if (message.method === 'stream.end') {
          const { streamId } = message.params;
          this.streamListeners.get(streamId)?.end();
        }
        if (message.method === 'stream.error') {
          const { streamId, error } = message.params;
          this.streamListeners.get(streamId)?.error(error);
        }
      } catch (error) {
        console.error('Failed to parse IPC message:', error);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
  }
}

// Helper: async iterator adapter for stream chunks
class StreamListener implements AsyncIterable<StreamChunk | { end: true } | { error: Error }> {
  private queue: (StreamChunk | { end: true } | { error: Error })[] = [];
  private waiting: ((value: IteratorResult<StreamChunk>) => void) | null = null;
  private done = false;

  constructor(private streamId: string) {}

  push(chunk: StreamChunk): void {
    if (this.done) return;
    if (this.waiting) {
      this.waiting({ value: chunk, done: false });
      this.waiting = null;
    } else {
      this.queue.push(chunk);
    }
  }

  end(): void {
    this.done = true;
    if (this.waiting) {
      this.waiting({ value: undefined, done: true });
      this.waiting = null;
    } else {
      this.queue.push({ end: true });
    }
  }

  error(error: Error): void {
    this.done = true;
    if (this.waiting) {
      this.waiting(Promise.reject(error) as any);
      this.waiting = null;
    } else {
      this.queue.push({ error });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamChunk> {
    return {
      next: (): Promise<IteratorResult<StreamChunk>> => {
        if (this.queue.length > 0) {
          const item = this.queue.shift()!;
          if ('end' in item) return Promise.resolve({ value: undefined, done: true });
          if ('error' in item) return Promise.reject(item.error);
          return Promise.resolve({ value: item as StreamChunk, done: false });
        }
        if (this.done) return Promise.resolve({ value: undefined, done: true });

        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },
    };
  }
}
```

### 1.6 Service Host with Sleep/Wake

Components that aren't being used should go to sleep to conserve resources, but wake up instantly when needed.

```typescript
// packages/daemon/src/services/service-host.ts

export type ServiceState = 'active' | 'sleeping' | 'starting' | 'stopping' | 'error';

export interface Service {
  readonly name: string;
  readonly state: ServiceState;
  start(): Promise<void>;
  stop(): Promise<void>;
  wakeup(): Promise<void>;       // Fast wake from sleep
  sleep(): Promise<void>;        // Gentle sleep (preserve state)
  healthCheck(): Promise<ServiceHealth>;
}

export interface SleepPolicy {
  idleTimeoutMs: number;          // Time before idle service sleeps (default: 5min)
  wakeTimeoutMs: number;          // Max time to wake a sleeping service (default: 5s)
  minActiveMs: number;            // Minimum time awake before allowing sleep (default: 30s)
}

export class ServiceHost {
  private services = new Map<string, Service>();
  private activityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private policy: SleepPolicy;

  constructor(private deps: {
    logger: Logger;
    metrics: Metrics;
    sleepPolicy?: Partial<SleepPolicy>;
  }) {
    this.policy = {
      idleTimeoutMs: 5 * 60 * 1000,
      wakeTimeoutMs: 5000,
      minActiveMs: 30 * 1000,
      ...deps.sleepPolicy,
    };
  }

  register(name: string, service: Service): void {
    this.services.set(name, service);
    this.resetIdleTimer(name);
  }

  // ── Activity Tracking ──────────────────────────

  /** Call this whenever the service is used. Resets the idle timer. */
  touch(name: string): void {
    this.resetIdleTimer(name);
  }

  private resetIdleTimer(name: string): void {
    // Clear existing timer
    const existing = this.activityTimers.get(name);
    if (existing) clearTimeout(existing);

    const service = this.services.get(name);
    if (!service || service.state !== 'active') return;

    // Set new idle timer
    const timer = setTimeout(async () => {
      try {
        await this.putToSleep(name);
      } catch (error) {
        this.deps.logger.error(`Failed to sleep service "${name}"`, error);
      }
    }, this.policy.idleTimeoutMs);

    timer.unref(); // Don't prevent process exit
    this.activityTimers.set(name, timer);
  }

  // ── Sleep/Wake ─────────────────────────────────

  private async putToSleep(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service || service.state !== 'active') return;

    this.deps.logger.debug(`Service "${name}" going to sleep (idle)`);
    await service.sleep();
    this.deps.metrics.increment('daemon.service.sleep', { service: name });
  }

  async wakeup(name: string): Promise<Service> {
    const service = this.services.get(name);
    if (!service) throw new Error(`Unknown service: ${name}`);

    if (service.state === 'active') {
      this.touch(name);
      return service;
    }

    if (service.state === 'sleeping') {
      this.deps.logger.debug(`Waking service "${name}"`);
      const start = Date.now();
      await service.wakeup();
      const wakeMs = Date.now() - start;

      this.deps.metrics.histogram('daemon.service.wake_ms', wakeMs, { service: name });
      this.touch(name);
      return service;
    }

    throw new Error(`Cannot wake service "${name}" in state "${service.state}"`);
  }

  // ── Query ──────────────────────────────────────

  count(): number {
    return this.services.size;
  }

  getState(name: string): ServiceState | undefined {
    return this.services.get(name)?.state;
  }

  listStates(): Record<string, ServiceState> {
    const result: Record<string, ServiceState> = {};
    for (const [name, service] of this.services) {
      result[name] = service.state;
    }
    return result;
  }
}
```

### 1.7 Agent Host (Multi-Agent Lifecycle)

The daemon manages multiple concurrent agents with isolated memory scopes:

```typescript
// packages/daemon/src/agents/agent-host.ts

import { MemoryEngine } from '@agentsy/memory';

export interface AgentSpec {
  id: string;
  name: string;
  role: string;                    // 'coder' | 'researcher' | 'planner' | 'general'
  memoryScope: string;             // Isolated memory scope (e.g., 'project:webapp')
  modelTier?: ModelTier;           // Preferred model tier
  maxConcurrentTurns?: number;     // Max parallel tool calls
  budget?: TokenBudget;            // Per-agent token budget
}

export interface AgentInstance {
  spec: AgentSpec;
  state: 'idle' | 'running' | 'waiting_approval' | 'error';
  currentTask?: string;
  turnsCompleted: number;
  tokensUsed: number;
  lastActivity: Date;
}

export class AgentHost {
  private agents = new Map<string, AgentInstance>();
  private streams = new Map<string, ActiveStream>();

  constructor(private deps: {
    memory: MemoryEngine;
    logger: Logger;
    metrics: Metrics;
  }) {}

  async spawn(spec: AgentSpec): Promise<AgentInstance> {
    if (this.agents.has(spec.id)) {
      throw new Error(`Agent "${spec.id}" already exists`);
    }

    const instance: AgentInstance = {
      spec,
      state: 'idle',
      turnsCompleted: 0,
      tokensUsed: 0,
      lastActivity: new Date(),
    };

    this.agents.set(spec.id, instance);

    // Register agent's memory scope
    await this.deps.memory.createScope(spec.memoryScope);

    this.deps.logger.info('Agent spawned', { id: spec.id, role: spec.role });
    this.deps.metrics.increment('daemon.agent.spawn', { role: spec.role });

    return instance;
  }

  async kill(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);

    // Cancel any active streams
    for (const [streamId, stream] of this.streams) {
      if (stream.agentId === agentId) {
        stream.abort.abort();
        this.streams.delete(streamId);
      }
    }

    this.agents.delete(agentId);
    this.deps.logger.info('Agent killed', { id: agentId });
  }

  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  count(): number {
    return this.agents.size;
  }

  // ── Streaming ──────────────────────────────────

  async startStream(request: {
    agentId: string;
    messages: Message[];
    modelTier?: ModelTier;
    streamId?: string;
  }, context: {
    sendNotification: (method: string, params: unknown) => void;
  }): Promise<string> {
    const agent = this.agents.get(request.agentId);
    if (!agent) throw new Error(`Agent "${request.agentId}" not found`);

    const streamId = request.streamId ?? uuid();
    const abort = new AbortController();

    this.streams.set(streamId, { agentId: request.agentId, abort });

    // The actual LLM call happens here in the daemon
    // This will be fully wired in Phase 5 (Streaming Architecture)
    agent.state = 'running';
    agent.lastActivity = new Date();

    return streamId;
  }

  async cancelStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) throw new Error(`Stream "${streamId}" not found`);

    stream.abort.abort();
    this.streams.delete(streamId);

    const agent = this.agents.get(stream.agentId);
    if (agent) agent.state = 'idle';
  }

  // ── Shutdown ───────────────────────────────────

  async shutdown(): Promise<void> {
    // Kill all agents
    for (const [id] of this.agents) {
      await this.kill(id);
    }
  }
}

interface ActiveStream {
  agentId: string;
  abort: AbortController;
}
```

### 1.8 Job Scheduler (Persistent, SQLite-Backed)

```typescript
// packages/daemon/src/jobs/scheduler.ts

export interface JobDefinition {
  id: string;
  name: string;
  type: 'cron' | 'fixed_rate' | 'one_time';
  schedule: string;               // Cron expression, ISO duration, or epoch millis
  handler: string;                // Name of registered handler
  params?: Record<string, unknown>;
  scope?: string;                 // Memory scope for the job
  enabled: boolean;
}

export interface JobExecution {
  id: string;
  jobId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  result?: unknown;
}

export class JobScheduler {
  private handlers = new Map<string, JobHandler>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private db: DatabaseConnection;

  constructor(private deps: {
    db: DatabaseConnection;
    logger: Logger;
    metrics: Metrics;
  }) {
    this.db = deps.db;
  }

  async start(): Promise<void> {
    // Load persisted jobs from SQLite and schedule them
    const jobs = await this.db.query<JobDefinition>(
      'SELECT * FROM scheduled_jobs WHERE enabled = 1'
    );

    for (const job of jobs) {
      this.scheduleJob(job);
    }

    this.deps.logger.info('Job scheduler started', { jobCount: jobs.length });
  }

  async schedule(def: Omit<JobDefinition, 'id' | 'enabled'>): Promise<string> {
    const id = uuid();
    const job: JobDefinition = { ...def, id, enabled: true };

    // Persist to SQLite
    await this.db.execute(
      `INSERT INTO scheduled_jobs (id, name, type, schedule, handler, params, scope, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, job.name, job.type, job.schedule, job.handler, JSON.stringify(job.params), job.scope ?? null]
    );

    this.scheduleJob(job);
    return id;
  }

  registerHandler(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async cancel(jobId: string): Promise<void> {
    const timer = this.timers.get(jobId);
    if (timer) clearTimeout(timer);

    await this.db.execute(
      'UPDATE scheduled_jobs SET enabled = 0 WHERE id = ?',
      [jobId]
    );
  }

  async list(): Promise<JobDefinition[]> {
    return this.db.query<JobDefinition>('SELECT * FROM scheduled_jobs');
  }

  // ── Internal ───────────────────────────────────

  private scheduleJob(job: JobDefinition): void {
    const handler = this.handlers.get(job.handler);
    if (!handler) {
      this.deps.logger.error(`No handler registered for job "${job.handler}"`, { jobId: job.id });
      return;
    }

    const nextRun = this.getNextRunTime(job);
    if (!nextRun) return;

    const delay = Math.max(0, nextRun.getTime() - Date.now());
    const timer = setTimeout(async () => {
      try {
        await this.executeJob(job, handler);
        // Reschedule recurring jobs
        if (job.type !== 'one_time') {
          this.scheduleJob(job);
        }
      } catch (error) {
        this.deps.logger.error(`Job "${job.name}" failed`, { jobId: job.id, error });
        this.deps.metrics.increment('daemon.job.failed', { handler: job.handler });
      }
    }, delay);

    timer.unref();
    this.timers.set(job.id, timer);
  }

  private async executeJob(job: JobDefinition, handler: JobHandler): Promise<void> {
    const execution: JobExecution = {
      id: uuid(),
      jobId: job.id,
      startedAt: new Date(),
      status: 'running',
    };

    try {
      const result = await handler(job.params ?? {}, { scope: job.scope });
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.result = result;
    } catch (error) {
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await this.db.execute(
        `INSERT INTO job_executions (id, job_id, started_at, completed_at, status, error, result)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [execution.id, execution.jobId, execution.startedAt.toISOString(),
         execution.completedAt?.toISOString() ?? null, execution.status,
         execution.error, JSON.stringify(execution.result)]
      );
    }
  }

  private getNextRunTime(job: JobDefinition): Date | null {
    switch (job.type) {
      case 'one_time':
        return new Date(parseInt(job.schedule, 10));
      case 'cron':
        return parseCron(job.schedule).next();
      case 'fixed_rate':
        return new Date(Date.now() + parseDuration(job.schedule));
      default:
        return null;
    }
  }

  async stop(): Promise<void> {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

export type JobHandler = (
  params: Record<string, unknown>,
  context: { scope?: string }
) => Promise<unknown>;
```

### 1.9 Daemon Configuration Schema

```typescript
// packages/daemon/src/config.ts

export interface DaemonConfig {
  // ── IPC ──────────────────────────────────────
  ipc: {
    socketPath: string;            // Unix socket path
    maxConnections: number;        // Max concurrent clients
    requestTimeoutMs: number;      // Per-request timeout
  };

  // ── Database ─────────────────────────────────
  database: {
    path: string;                  // SQLite database path
    walMode: boolean;              // Enable WAL (default: true)
  };

  // ── Memory ───────────────────────────────────
  memory: {
    enabled: boolean;
    syncMode: 'local-only' | 'remote-shadow';
    tursoUrl?: string;
    tursoAuthToken?: string;
    consolidationThreshold: number; // 0.0–1.0, tier utilization to trigger promotion
    decayIntervalMs: number;       // How often awaken() runs
  };

  // ── Sleep Policy ─────────────────────────────
  sleep: {
    idleTimeoutMs: number;         // Time before idle service sleeps
    wakeTimeoutMs: number;         // Max time to wake a sleeping service
    minActiveMs: number;           // Min time awake before allowing sleep
  };

  // ── Supervisor ───────────────────────────────
  supervisor: {
    maxRestarts: number;           // Max auto-restarts in window
    restartWindowMs: number;       // Time window for restart counting
    backoffBaseMs: number;         // Initial restart delay
    backoffMaxMs: number;          // Max restart delay
  };

  // ── Logging ──────────────────────────────────
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;                 // Log file path (default: stderr)
    maxSizeBytes: number;          // Max log file size before rotation
    maxFiles: number;              // Max rotated log files
  };

  // ── Metrics ──────────────────────────────────
  metrics: {
    enabled: boolean;
    otelEndpoint?: string;         // OpenTelemetry exporter endpoint
  };

  // ── Connectors ───────────────────────────────
  connectors: {
    discord?: { token: string };
    slack?: { token: string };
    telegram?: { token: string };
  };

  // ── Shutdown ─────────────────────────────────
  shutdownTimeoutMs: number;       // Graceful shutdown timeout (default: 30s)
}

// ── Defaults ──────────────────────────────────────

const DEFAULT_CONFIG: DaemonConfig = {
  ipc: {
    socketPath: path.join(os.homedir(), '.agentsy', 'daemon.sock'),
    maxConnections: 10,
    requestTimeoutMs: 30000,
  },
  database: {
    path: path.join(os.homedir(), '.agentsy', 'daemon.db'),
    walMode: true,
  },
  memory: {
    enabled: true,
    syncMode: 'local-only',
    consolidationThreshold: 0.7,
    decayIntervalMs: 60_000, // 1 minute
  },
  sleep: {
    idleTimeoutMs: 5 * 60_000, // 5 minutes
    wakeTimeoutMs: 5_000,
    minActiveMs: 30_000,
  },
  supervisor: {
    maxRestarts: 5,
    restartWindowMs: 60_000,
    backoffBaseMs: 1_000,
    backoffMaxMs: 30_000,
  },
  logging: {
    level: 'info',
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    maxFiles: 3,
  },
  metrics: {
    enabled: true,
  },
  connectors: {},
  shutdownTimeoutMs: 30_000,
};

export function resolveConfig(partial: Partial<DaemonConfig>): DaemonConfig {
  // Deep merge with defaults
  return deepMerge(DEFAULT_CONFIG, partial);
}
```

### 1.10 Supervisor (Crash Recovery)

```typescript
// packages/daemon/src/lifecycle/supervisor.ts

export interface SupervisorPolicy {
  maxRestarts: number;
  restartWindowMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export class Supervisor {
  private restartTimestamps: number[] = [];
  private watching = false;

  constructor(private deps: {
    policy: SupervisorPolicy;
    logger: Logger;
  }) {}

  watch(daemon: Daemon): void {
    this.watching = true;

    daemon.onStateChange(async (state) => {
      if (state === 'crashed' && this.watching) {
        await this.handleCrash(daemon);
      }
    });
  }

  private async handleCrash(daemon: Daemon): Promise<void> {
    const now = Date.now();
    this.restartTimestamps.push(now);
    this.cleanOldTimestamps(now);

    if (this.restartTimestamps.length > this.deps.policy.maxRestarts) {
      this.deps.logger.error(
        `Daemon exceeded ${this.deps.policy.maxRestarts} crashes in ` +
        `${this.deps.policy.restartWindowMs / 1000}s. Giving up.`
      );
      process.exit(1); // Let systemd/launchd handle it
    }

    // Exponential backoff
    const attempt = this.restartTimestamps.length;
    const delay = Math.min(
      this.deps.policy.backoffBaseMs * Math.pow(2, attempt - 1),
      this.deps.policy.backoffMaxMs
    );

    this.deps.logger.warn(`Daemon crashed. Restarting in ${delay}ms (attempt ${attempt})`);

    await sleep(delay);

    try {
      await daemon.stop(false); // Force stop
      await daemon.start();
      this.deps.logger.info('Daemon restarted successfully');
    } catch (error) {
      this.deps.logger.error('Daemon restart failed', error);
      // The state change to 'crashed' will trigger handleCrash again
    }
  }

  private cleanOldTimestamps(now: number): void {
    const windowStart = now - this.deps.policy.restartWindowMs;
    this.restartTimestamps = this.restartTimestamps.filter(t => t >= windowStart);
  }

  stop(): void {
    this.watching = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref());
}
```

### 1.11 CLI Integration

The CLI becomes a thin client. When the user runs `agentsy chat`, the CLI:
1. Checks if the daemon is running
2. If not, starts it in the background
3. Connects via IPC
4. Sends the user's message and streams the response

```typescript
// packages/cli/src/commands/chat.ts (simplified)

import { IPCClient } from '@agentsy/daemon/ipc-client';

export class ChatCommand extends Command {
  async run(): Promise<void> {
    const client = new IPCClient();

    // Ensure daemon is running
    const socketPath = getSocketPath();
    if (!isDaemonRunning(socketPath)) {
      this.log('Starting daemon...');
      await startDaemon();
      await waitForDaemon(socketPath, 10_000); // 10s startup timeout
    }

    // Connect to daemon
    await client.connect(socketPath);

    // Spawn or reuse an agent
    const agentId = await this.getOrCreateAgent(client);

    // Interactive loop
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {
      const userInput = await rl.question('> ');
      if (userInput.trim() === '/quit') break;

      // Stream response from daemon
      process.stdout.write('\n');
      for await (const chunk of client.stream('agent.send', {
        agentId,
        message: userInput,
      })) {
        if (chunk.type === 'content') {
          process.stdout.write(chunk.text);
        } else if (chunk.type === 'tool_call') {
          process.stdout.write(`\n[Tool: ${chunk.name}]\n`);
        }
      }
      process.stdout.write('\n\n');
    }

    await client.disconnect();
  }
}
```

---

## 5. Phase 2 — Package Consolidation

**Priority**: P1 — After Phase 0  
**Estimated effort**: ~15 hours  
**Branch**: `refactor/package-consolidation`

### Consolidation Map

| Current Package | File Count | Action | Merge Target |
|----------------|------------|--------|-------------|
| `workflows` | 1 (plan only) | **Merge** | `orchestrator` — workflows are orchestrated task sequences |
| `shared` | 10 | **Merge** | `types` — shared utilities belong with type definitions |
| `scripts` | 20 | **Merge** | Root `scripts/` — build/release scripts don't need a package |
| `renderers` | 120 | **Keep** | — | Large enough to stand alone, TUI rendering is a distinct concern |
| `ui` | 15 | **Merge** | `renderers` — UI store/bridge is part of the rendering layer |
| `connectors` | 13 | **Merge** | `daemon` — third-party connectors are daemon-hosted |
| `mcp` | 11 | **Merge** | `daemon` — MCP server is daemon-hosted |
| `ecc-integration` | 0 (doesn't exist) | **Skip** | — |
| `vscode` | 75 | **Keep** | — | Distinct deployment boundary (VS Code extension) |
| `cli` | 71 | **Keep** | — | Distinct deployment boundary (becomes thin daemon client) |

### Post-Consolidation Package Layout

```
packages/
├── daemon/        ← NEW: Central process (absorbs mcp, connectors)
├── core/          ← Stream processing, SSE, tool calls, retry
├── providers/     ← LLM provider adapters (stays — 14 providers)
├── gateway/       ← Becomes thin daemon client (Phase 4)
├── memory/        ← Cognitive memory engine (260 files, stays)
├── orchestrator/  ← Absorbs workflows; council, hooks, routing
├── runtime/       ← Agent turn loop, hooks execution
├── tokenomics/    ← Token management, quotas, frustration signals
├── types/         ← Absorbs shared; shared type definitions
├── renderers/     ← Absorbs ui; Ink/TUI rendering
├── models/        ← Model selector/profiles
├── tools/         ← Tool registry + builtins
├── secrets/       ← Secret injection/providers
├── guardrails/    ← Safety/policy/PII
├── observability/ ← OTel/tracing/cost
├── session/       ← Session management
├── retrieval/     ← Search/indexing (Phase 6 moves into daemon)
├── testing/       ← Test helpers/MSW/aimock
├── agents/        ← Agent runtime/specs
├── plugins/       ← Plugin system
├── prompts/       ← Prompt layering
├── cli/           ← Thin daemon client + TUI
├── vscode/        ← VS Code extension
```

**Reduction**: 27 → 24 packages (merge 4, create 1 new). The `scripts/` package moves to root tooling.

### Migration Steps

1. Move `packages/shared/src/**` → `packages/types/src/shared/`
2. Move `packages/workflows/IMPLEMENTATION-PLAN.md` → `packages/orchestrator/docs/workflows-plan.md`
3. Move `packages/mcp/src/**` → `packages/daemon/src/mcp/`
4. Move `packages/connectors/src/**` → `packages/daemon/src/connectors/`
5. Move `packages/ui/src/**` → `packages/renderers/src/ui/`
6. Move `packages/scripts/**` → `scripts/` at repo root
7. Update all `package.json` dependencies and imports
8. Update `pnpm-workspace.yaml`
9. Run `pnpm install && pnpm build && pnpm test` — must be green

---

## 6. Phase 3 — Hook Pipeline Redesign

**Priority**: P1 — After Phase 0  
**Estimated effort**: ~25 hours  
**Branch**: `feat/hook-pipeline-redesign`

### Current Problem

The hook registry's `fire()` method returns immediately when a hook returns a `transform`. This means:
- A guardrail hook that sanitizes the prompt prevents the memory hook from injecting context
- A memory hook that injects context prevents guardrails from checking it
- Only the first-registered transform wins — silently

### New Design: Middleware-Style Composition

```typescript
// packages/runtime/src/hooks/registry.ts (REDESIGNED)

export type HookTransformFn<T> = (payload: T) => T | Promise<T>;
export type HookResult<T> =
  | { action: 'continue' }
  | { action: 'stop'; reason?: string }
  | { action: 'transform'; transform: HookTransformFn<T> };

export interface HookHandler<T = unknown> {
  id: string;
  event: HookEventName;
  priority: number;               // Lower = runs first
  handler: (payload: T) => HookResult<T> | Promise<HookResult<T>>;
}

export class RuntimeHookRegistry {
  private handlers = new Map<string, HookHandler[]>();

  /**
   * Fire an event through the hook pipeline.
   * Transforms compose left-to-right (lower priority first).
   * A 'stop' result short-circuits the pipeline.
   */
  async fire<T extends HookEventName>(
    event: T,
    payload: HookContext<T>
  ): Promise<{ payload: HookContext<T>; stopped: boolean; stoppedBy?: string }> {
    const handlers = this.getHandlersForEvent(event);
    let currentPayload = payload;
    const transformChain: Array<{ id: string; fn: HookTransformFn<HookContext<T>> }> = [];

    // Phase 1: Collect all results (don't short-circuit on transform)
    for (const handler of handlers) {
      try {
        const result = await handler.handler(currentPayload);

        if (result.action === 'stop') {
          return {
            payload: currentPayload,
            stopped: true,
            stoppedBy: handler.id,
          };
        }

        if (result.action === 'transform') {
          // Apply the transform immediately to update payload for subsequent hooks
          currentPayload = await result.transform(currentPayload);
          transformChain.push({ id: handler.id, fn: result.transform });
        }
        // 'continue' — do nothing, pass through
      } catch (error) {
        this.logger.error(`Hook "${handler.id}" threw on event "${event}"`, error);
        // Continue to next handler — one bad hook doesn't break the chain
      }
    }

    return {
      payload: currentPayload,
      stopped: false,
    };
  }

  // ... register, unregister, getHandlersForEvent remain the same
}
```

### Updated Hook Implementations

With the new composition model, the memory pre-turn hook and guardrail hook both transform the payload, and their transforms compose:

```typescript
// Memory pre-turn hook (priority 20 — runs after guardrails)
export function createMemoryPreTurnHook(deps: MemoryHookDeps): HookHandler {
  return {
    id: 'memory-pre-turn',
    event: 'UserPromptSubmit',
    priority: 20,
    handler: async (payload) => {
      try {
        const memories = await deps.memory.recall({
          query: payload.prompt,
          scope: payload.scope,
          limit: 5,
          minRelevance: deps.minRelevance ?? 0.6,
        });

        if (memories.length === 0) {
          return { action: 'continue' };
        }

        // Return a transform that APPENDS memory context to whatever payload exists
        return {
          action: 'transform',
          transform: (p) => ({
            ...p,
            prompt: p.prompt + '\n\n' + formatMemoryContext(memories),
            // OR: add a separate field that the context assembler reads
            memoryContext: memories,
          }),
        };
      } catch (error) {
        deps.logger.error('Memory pre-turn hook failed', error);
        return { action: 'continue' }; // Don't block on memory failure
      }
    },
  };
}

// Guardrail hook (priority 10 — runs first)
export function createGuardrailHook(deps: GuardrailHookDeps): HookHandler {
  return {
    id: 'guardrail',
    event: 'UserPromptSubmit',
    priority: 10,  // Lower = runs first
    handler: async (payload) => {
      const violations = await deps.guardrails.check(payload.prompt);

      if (violations.length === 0) {
        return { action: 'continue' };
      }

      if (violations.some(v => v.severity === 'block')) {
        return { action: 'stop', reason: 'Guardrail blocked prompt' };
      }

      // Sanitize the prompt (e.g., redact PII)
      return {
        action: 'transform',
        transform: (p) => ({
          ...p,
          prompt: deps.guardrails.sanitize(p.prompt, violations),
        }),
      };
    },
  };
}
```

**Execution order** for `UserPromptSubmit`:
1. Guardrail (priority 10) checks and potentially sanitizes the prompt
2. Memory pre-turn (priority 20) appends memory context to the (possibly sanitized) prompt
3. Both transforms compose — the model sees a sanitized prompt with memory context

---

## 7. Phase 4 — Gateway → Daemon Migration

**Priority**: P1 — After Phase 1  
**Estimated effort**: ~40 hours  
**Branch**: `feat/gateway-daemon-migration`

### Current Architecture

```
CLI → Runtime → Gateway → Providers → LLM APIs
                  ↑
           (routing, health,
            quota, circuit breaker)
```

### Target Architecture

```
CLI ─IPC─→ Daemon (owns routing, health, quota, circuit breaker)
                ↓
           Providers → LLM APIs
```

The gateway package becomes a thin client that communicates with the daemon's routing service over IPC.

### 4.1 Move Routing Logic into Daemon

Create a routing service inside the daemon:

```typescript
// packages/daemon/src/services/routing-service.ts

import {
  ModelRegistry,
  ReplicaSelector,
  ReplicaRegistry,
  HealthRegistry,
  QuotaTracker,
  QuotaRegistry,
  CircuitBreaker,
  SelectionStrategy,
} from '@agentsy/gateway';

export class RoutingService implements Service {
  readonly name = 'routing';
  private _state: ServiceState = 'stopped';

  private modelRegistry: ModelRegistry;
  private replicaRegistry: ReplicaRegistry;
  private replicaSelector: ReplicaSelector;
  private healthRegistry: HealthRegistry;
  private quotaRegistry: QuotaRegistry;
  private strategy: SelectionStrategy;

  // ── Service Lifecycle ──────────────────────────

  async start(): Promise<void> {
    this._state = 'starting';

    // Initialize registries from config
    this.modelRegistry = new ModelRegistry();
    this.replicaRegistry = new ReplicaRegistry();
    this.healthRegistry = new HealthRegistry();
    this.quotaRegistry = new QuotaRegistry();
    this.strategy = new ScoreBasedStrategy();

    // Load model definitions
    await this.loadModels();

    this._state = 'active';
  }

  async sleep(): Promise<void> {
    // Keep registries in memory but stop health probes
    this._state = 'sleeping';
  }

  async wakeup(): Promise<void> {
    // Resume health probes
    this._state = 'active';
  }

  async stop(): Promise<void> {
    this._state = 'stopped';
  }

  // ── Routing API ────────────────────────────────

  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    this.deps.serviceHost.touch('routing'); // Reset idle timer

    // 1. Filter models by tier, capabilities, cost constraints
    const candidates = this.modelRegistry.filter({
      tier: request.tier,
      capabilities: request.capabilities,
      maxCostPer1KInput: request.maxCostPer1KInput,
    });

    // 2. Get healthy replicas with per-provider quota
    const scored = candidates.map(model => {
      const replicas = this.replicaRegistry.getReplicas(model.id);
      const healthyReplicas = replicas.filter(r =>
        this.healthRegistry.isHealthy(r.providerId) &&
        this.quotaRegistry.getTracker(r.providerId).hasCapacity()
      );

      return {
        model,
        replicas: healthyReplicas,
        score: this.strategy.score(model, {
          health: this.healthRegistry.getHealth(model.id),
          quota: this.quotaRegistry.getTracker(model.id).getUsageSnapshot(),
          latency: this.healthRegistry.getLatency(model.id),
        }),
      };
    });

    // 3. Sort by score, apply tie-breaking with jitter
    scored.sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) < 0.01) {
        // Tie-breaking: add small random jitter to avoid thundering herd
        return Math.random() - 0.5;
      }
      return diff;
    });

    // 4. Select best model + replica
    const selected = scored[0];
    if (!selected || selected.replicas.length === 0) {
      // Try spillover
      return this.spillover(request, scored);
    }

    const replica = this.replicaSelector.select(selected.replicas);

    return {
      model: selected.model,
      replica,
      tier: request.tier,
      spillover: false,
    };
  }

  // ... spillover(), loadModels(), healthCheck()
}
```

### 4.2 Gateway Package Becomes Thin Client

```typescript
// packages/gateway/src/client.ts (REDESIGNED)

import { IPCClient } from '@agentsy/daemon/ipc-client';

export class ModelGatewayClient {
  private ipcClient: IPCClient | null = null;

  constructor(private config: GatewayClientConfig) {}

  async connect(): Promise<void> {
    if (this.config.daemonMode) {
      this.ipcClient = new IPCClient();
      await this.ipcClient.connect(this.config.socketPath);
    }
    // Fallback: direct mode (no daemon) uses local routing
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.ipcClient) {
      // Daemon mode: delegate routing to daemon
      return this.ipcClient.request('route.complete', request);
    }

    // Direct mode: use local routing (current behavior, for backward compat)
    return this.directComplete(request);
  }

  async *stream(request: StreamRequest): AsyncGenerator<StreamChunk> {
    if (this.ipcClient) {
      // Daemon mode: stream from daemon
      yield* this.ipcClient.stream('route.stream', request);
      return;
    }

    // Direct mode
    yield* this.directStream(request);
  }

  // ... private directComplete(), directStream()
}
```

### 4.3 Per-Provider Quota Registry

Fix the critical quota bug by introducing per-provider quota trackers:

```typescript
// packages/gateway/src/quota/registry.ts (NEW)

export class QuotaRegistry {
  private trackers = new Map<string, QuotaTracker>();

  register(providerId: string, config: QuotaConfig): void {
    this.trackers.set(providerId, new QuotaTracker(config));
  }

  getTracker(providerId: string): QuotaTracker {
    const tracker = this.trackers.get(providerId);
    if (!tracker) {
      // Return a permissive default tracker
      return QuotaTracker.unlimited();
    }
    return tracker;
  }

  getAllSnapshots(): Map<string, QuotaSnapshot> {
    const result = new Map<string, QuotaSnapshot>();
    for (const [id, tracker] of this.trackers) {
      result.set(id, tracker.getUsageSnapshot());
    }
    return result;
  }
}
```

---

## 8. Phase 5 — Streaming Architecture

**Priority**: P1 — After Phase 4  
**Estimated effort**: ~35 hours  
**Branch**: `feat/daemon-streaming`

### Architecture

```
┌─────────┐     IPC      ┌──────────────────────────────────┐
│  CLI /   │◄────────────►│           DAEMON                  │
│  TUI /   │  stream.     │                                    │
│  VSCode  │  chunk       │  Routing Service → selects model  │
│          │  stream.     │       ↓                            │
│          │  end         │  Provider Adapter → LLM API        │
│          │              │       ↓                            │
│          │              │  LLMStreamProcessor → events       │
│          │              │       ↓                            │
│          │              │  Hook Pipeline → transforms        │
│          │              │       ↓                            │
│          │              │  IPC Server → stream notifications │
└─────────┘              └──────────────────────────────────┘
```

The daemon owns the full streaming pipeline. The key insight is that the `LLMStreamProcessor` from `@agentsy/core` already does the heavy lifting — we just need to wire it into the daemon and pipe events over IPC.

### 5.1 Daemon Stream Manager

```typescript
// packages/daemon/src/services/stream-manager.ts

import { createLLMStreamProcessor } from '@agentsy/core';
import { createUniversalClient } from '@agentsy/providers';
import { RoutingService } from './routing-service.js';
import { HookPipeline } from '@agentsy/runtime';

export class StreamManager implements Service {
  readonly name = 'streaming';
  private _state: ServiceState = 'stopped';

  private activeStreams = new Map<string, ActiveStream>();
  private providerClient: UniversalClient;
  private routing: RoutingService;
  private hooks: HookPipeline;

  // ── Start a Stream ─────────────────────────────

  async startStream(
    request: StreamStartRequest,
    notify: (method: string, params: unknown) => void
  ): Promise<string> {
    const streamId = uuid();
    const abort = new AbortController();

    // 1. Route to best model
    const routing = await this.routing.selectModel({
      tier: request.modelTier,
      capabilities: request.capabilities,
    });

    // 2. Create stream processor
    const processor = createLLMStreamProcessor({
      provider: routing.replica.providerId,
      model: routing.model.id,
    });

    // 3. Fire pre-stream hooks
    const hookResult = await this.hooks.fire('ModelCallStart', {
      model: routing.model.id,
      messages: request.messages,
      tools: request.tools,
    });

    // 4. Start the provider stream
    const providerStream = this.providerClient.stream(
      hookResult.payload.messages,
      {
        model: routing.model.id,
        provider: routing.replica.providerId,
        tools: hookResult.payload.tools,
        signal: abort.signal,
      }
    );

    // 5. Process and forward chunks
    const activeStream: ActiveStream = {
      streamId,
      agentId: request.agentId,
      abort,
      processor,
      routing,
      startTime: Date.now(),
    };
    this.activeStreams.set(streamId, activeStream);

    // Process in background — forward events over IPC
    this.processStream(
      streamId,
      providerStream,
      processor,
      notify,
      abort.signal
    ).catch((error) => {
      notify('stream.error', {
        streamId,
        error: { code: -1, message: error.message, recoverable: false },
      });
      this.activeStreams.delete(streamId);
    });

    return streamId;
  }

  private async processStream(
    streamId: string,
    providerStream: AsyncIterable<StreamChunk>,
    processor: LLMStreamProcessor,
    notify: (method: string, params: unknown) => void,
    signal: AbortSignal
  ): Promise<void> {
    let chunkIndex = 0;

    for await (const rawChunk of providerStream) {
      if (signal.aborted) break;

      // Process through LLMStreamProcessor (handles thinking, XML, tool calls)
      const processed = processor.processChunk(rawChunk);

      for (const event of processed.events) {
        // Fire per-chunk hooks
        const hookResult = await this.hooks.fire('ModelResponseChunk', {
          event,
          streamId,
        });

        // Send chunk notification to client
        notify('stream.chunk', {
          streamId,
          chunk: hookResult.payload.event,
          index: chunkIndex++,
        });
      }
    }

    // Finalize
    const output = processor.getProcessedOutput();

    // Fire post-stream hooks (memory capture, etc.)
    await this.hooks.fire('ModelResponseComplete', {
      streamId,
      output,
    });

    // Send stream end
    notify('stream.end', {
      streamId,
      usage: output.usage,
      totalChunks: chunkIndex,
    });

    this.activeStreams.delete(streamId);
  }

  // ── Cancel ─────────────────────────────────────

  cancelStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.abort.abort();
      this.activeStreams.delete(streamId);
    }
  }

  // ── Service Lifecycle ──────────────────────────

  async start(): Promise<void> { this._state = 'active'; }
  async sleep(): Promise<void> { this._state = 'sleeping'; }
  async wakeup(): Promise<void> { this._state = 'active'; }
  async stop(): Promise<void> {
    for (const [id] of this.activeStreams) {
      this.cancelStream(id);
    }
    this._state = 'stopped';
  }
  get state(): ServiceState { return this._state; }
}
```

---

## 9. Phase 6 — RAG as Daemon Service

**Priority**: P2 — After Phase 1  
**Estimated effort**: ~30 hours  
**Branch**: `feat/daemon-rag`

### Current State

The RAG pipeline exists in `@agentsy/memory/src/retrieval/rag/` with proper structure (index manager, hybrid retriever, query planner, reranker) but the advanced features (HyDE, RRF, lost-in-middle mitigation) are missing. The retrieval package (`@agentsy/retrieval`) duplicates some of this.

### Plan: Correct Basics First

Rather than building the full planned RAG pipeline, we first make the existing pipeline correct and tested, then enhance it.

### 6.1 Fix Existing Retrieval

```typescript
// packages/memory/src/retrieval/rag/retriever.ts (ENHANCED)

export class HybridRetriever {
  /**
   * Retrieve relevant documents using combined vector + keyword search.
   *
   * Current implementation: basic vector search only.
   * This fix adds:
   * 1. Proper embedding generation (was using placeholder)
   * 2. Combined vector + FTS5 keyword search
   * 3. Simple score normalization (not RRF yet — that's Phase 6.2)
   * 4. Context packing with relevance scores
   */

  async retrieve(query: string, options: RetrieveOptions): Promise<RetrievalResult> {
    // 1. Generate query embedding
    const queryEmbedding = await this.embeddingProvider.embed(query);

    // 2. Vector search (cosine similarity)
    const vectorResults = await this.db.query<{
      id: string; content: string; score: number; metadata: string;
    }>(
      `SELECT id, content, score, metadata
       FROM wiki_vectors
       WHERE embedding MATCH ? AND k = ?
       ORDER BY score DESC`,
      [JSON.stringify(queryEmbedding), options.limit ?? 10]
    );

    // 3. Keyword search (FTS5)
    const keywordResults = await this.db.query<{
      id: string; content: string; rank: number; metadata: string;
    }>(
      `SELECT id, content, rank, metadata
       FROM wiki_pages
       WHERE wiki_pages MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [query, options.limit ?? 10]
    );

    // 4. Combine results (simple union for now, RRF in Phase 6.2)
    const combined = this.combineResults(vectorResults, keywordResults);

    // 5. Filter by minimum relevance
    const filtered = combined.filter(r => r.score >= (options.minRelevance ?? 0.5));

    // 6. Pack context with XML tags
    const context = this.packContext(filtered);

    return {
      documents: filtered,
      context,
      totalRetrieved: combined.length,
      totalFiltered: filtered.length,
    };
  }

  private combineResults(
    vector: VectorResult[],
    keyword: KeywordResult[]
  ): CombinedResult[] {
    const seen = new Map<string, CombinedResult>();

    // Normalize vector scores to 0-1
    const maxVecScore = Math.max(...vector.map(v => v.score), 1);
    for (const v of vector) {
      seen.set(v.id, {
        id: v.id,
        content: v.content,
        score: v.score / maxVecScore,
        source: 'vector',
        metadata: JSON.parse(v.metadata),
      });
    }

    // Normalize keyword scores to 0-1 (FTS5 rank is negative, lower = better)
    const maxKeyRank = Math.max(...keyword.map(k => Math.abs(k.rank)), 1);
    for (const k of keyword) {
      const normalizedScore = Math.abs(k.rank) / maxKeyRank;
      if (seen.has(k.id)) {
        // Boost documents that appear in both results
        const existing = seen.get(k.id)!;
        existing.score = (existing.score + normalizedScore) / 2 * 1.5; // Boost factor
        existing.source = 'both';
      } else {
        seen.set(k.id, {
          id: k.id,
          content: k.content,
          score: normalizedScore,
          source: 'keyword',
          metadata: JSON.parse(k.metadata),
        });
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  }

  private packContext(docs: CombinedResult[]): string {
    if (docs.length === 0) return '';

    const parts = docs.map((doc, i) =>
      `<memory_item index="${i + 1}" relevance="${doc.score.toFixed(3)}" source="${doc.source}">\n${doc.content}\n</memory_item>`
    );

    return `<memory_context count="${docs.length}">\n${parts.join('\n')}\n</memory_context>`;
  }
}
```

### 6.2 RAG as Daemon Service

The RAG service runs inside the daemon as a background-indexing, on-demand retrieval service:

```typescript
// packages/daemon/src/services/rag-service.ts

export class RAGService implements Service {
  readonly name = 'rag';
  private _state: ServiceState = 'stopped';

  private retriever: HybridRetriever;
  private indexer: IndexManager;
  private embeddingProvider: EmbeddingProvider;

  // Background indexing job
  private indexingJobId?: string;

  async start(): Promise<void> {
    this._state = 'starting';

    // Initialize embedding provider (can sleep when idle)
    this.embeddingProvider = await this.createEmbeddingProvider();

    // Initialize retriever
    this.retriever = new HybridRetriever({
      db: this.deps.db,
      embeddingProvider: this.embeddingProvider,
    });

    // Initialize indexer
    this.indexer = new IndexManager({
      db: this.deps.db,
      embeddingProvider: this.embeddingProvider,
    });

    // Register background indexing job
    this.indexingJobId = await this.deps.jobScheduler.schedule({
      name: 'rag-background-index',
      type: 'fixed_rate',
      schedule: 'PT5M', // Every 5 minutes
      handler: 'rag.index',
      params: { incremental: true },
    });

    this.deps.jobScheduler.registerHandler('rag.index', async (params) => {
      await this.indexer.indexPending(params);
    });

    this._state = 'active';
  }

  async query(request: RAGQueryRequest): Promise<RAGQueryResult> {
    this.deps.serviceHost.touch('rag'); // Reset idle timer

    return this.retriever.retrieve(request.query, {
      limit: request.limit ?? 10,
      minRelevance: request.minRelevance ?? 0.5,
      scope: request.scope,
    });
  }

  async index(documents: RAGDocument[]): Promise<void> {
    // Queue documents for indexing
    await this.indexer.queueDocuments(documents);
  }

  async sleep(): Promise<void> {
    // Pause indexing but keep retriever ready for fast wake
    this._state = 'sleeping';
  }

  async wakeup(): Promise<void> {
    this._state = 'active';
  }

  async stop(): Promise<void> {
    if (this.indexingJobId) {
      await this.deps.jobScheduler.cancel(this.indexingJobId);
    }
    this._state = 'stopped';
  }

  get state(): ServiceState { return this._state; }
}
```

### 6.3 Future Enhancement: HyDE, RRF, Lost-in-Middle

These are planned for after the basics are correct:

- **HyDE (Hypothetical Document Embeddings)**: Generate a hypothetical answer using a small model, embed that answer, and use the embedding for retrieval. Improves semantic matching.
- **Reciprocal Rank Fusion (RRF)**: Replace the simple score combination with RRF: `score = Σ 1/(k + rank_i)` where k=60. More robust than normalized score averaging.
- **Lost-in-Middle Reordering**: Place the most relevant documents at the beginning and end of the context window, with less relevant ones in the middle. Models attend more to edges.

Each of these will be implemented as a separate enhancement with its own tests.

---

## 10. Phase 7 — Learning Loop & Background Jobs

**Priority**: P2 — After Phase 6  
**Estimated effort**: ~25 hours  
**Branch**: `feat/learning-loop`

### Current State

The learning loop (`observation → canary detection → dialectic resolution → solidification`) runs synchronously inside `awaken()` with no integration tests, no error isolation, and no persistence of partial results.

### New Design: Background + Event-Driven

```typescript
// packages/daemon/src/services/learning-service.ts

export class LearningService implements Service {
  readonly name = 'learning';
  private _state: ServiceState = 'stopped';

  private loop: LearningLoopOrchestrator;
  private observationThreshold = 10; // Trigger after N new observations
  private pendingObservations = 0;

  // Scheduled learning job
  private scheduledJobId?: string;

  // Event subscriptions
  private unsubscribers: (() => void)[] = [];

  async start(): Promise<void> {
    this._state = 'starting';

    this.loop = new LearningLoopOrchestrator({
      memory: this.deps.memory,
      logger: this.deps.logger.child('learning'),
    });

    // 1. Register periodic learning job (timer-based)
    this.scheduledJobId = await this.deps.jobScheduler.schedule({
      name: 'learning-cycle',
      type: 'fixed_rate',
      schedule: 'PT30M', // Every 30 minutes
      handler: 'learning.runCycle',
    });

    this.deps.jobScheduler.registerHandler('learning.runCycle', async () => {
      await this.runCycle('scheduled');
    });

    // 2. Subscribe to events (event-driven triggers)
    const unsub1 = this.deps.eventBus.subscribe('memory.ingested', (event) => {
      this.pendingObservations++;
      if (this.pendingObservations >= this.observationThreshold) {
        this.runCycle('event-driven:observation_threshold');
        this.pendingObservations = 0;
      }
    });

    const unsub2 = this.deps.eventBus.subscribe('memory.canary_detected', (event) => {
      // Canary detected — run learning immediately
      this.runCycle('event-driven:canary');
    });

    const unsub3 = this.deps.eventBus.subscribe('memory.contradiction_found', (event) => {
      // Contradiction found — run dialectic resolution
      this.runDialectic(event);
    });

    this.unsubscribers = [unsub1, unsub2, unsub3];
    this._state = 'active';
  }

  private async runCycle(trigger: string): Promise<void> {
    const startTime = Date.now();

    try {
      this.deps.logger.info('Learning cycle started', { trigger });

      const result = await this.loop.runCycle({
        maxObservations: 50,
        maxDurationMs: 60_000, // 1 minute time limit
      });

      this.deps.metrics.increment('daemon.learning.cycle', {
        trigger,
        observations: result.observationsProcessed,
        canaries: result.canariesDetected,
        resolutions: result.resolutionsCompleted,
        solidifications: result.solidificationsCompleted,
      });

      this.deps.metrics.histogram(
        'daemon.learning.cycle_duration_ms',
        Date.now() - startTime,
        { trigger }
      );

    } catch (error) {
      this.deps.logger.error('Learning cycle failed', { trigger, error });
      this.deps.metrics.increment('daemon.learning.cycle_failed', { trigger });
      // Don't crash — learning is non-critical
    }
  }

  private async runDialectic(event: ContradictionEvent): Promise<void> {
    try {
      const resolver = new DialecticResolver(this.deps.memory);
      await resolver.resolve(event.contradiction);
    } catch (error) {
      this.deps.logger.error('Dialectic resolution failed', { error });
    }
  }

  async sleep(): Promise<void> {
    this._state = 'sleeping';
  }

  async wakeup(): Promise<void> {
    this._state = 'active';
  }

  async stop(): Promise<void> {
    for (const unsub of this.unsubscribers) unsub();
    if (this.scheduledJobId) {
      await this.deps.jobScheduler.cancel(this.scheduledJobId);
    }
    this._state = 'stopped';
  }

  get state(): ServiceState { return this._state; }
}
```

### 7.1 Event Bus

The daemon needs an internal event bus for cross-service communication:

```typescript
// packages/daemon/src/event-bus.ts

export type EventName =
  | 'memory.ingested'
  | 'memory.canary_detected'
  | 'memory.contradiction_found'
  | 'memory.scope_created'
  | 'agent.spawned'
  | 'agent.killed'
  | 'agent.turn_complete'
  | 'stream.started'
  | 'stream.completed'
  | 'stream.failed'
  | 'job.started'
  | 'job.completed'
  | 'job.failed'
  | 'connector.connected'
  | 'connector.disconnected'
  | 'service.sleeping'
  | 'service.awake';

export interface DaemonEvent {
  name: EventName;
  timestamp: number;
  payload: unknown;
  source: string; // Service that emitted the event
}

export class EventBus {
  private subscribers = new Map<EventName, Set<EventHandler>>();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  subscribe(event: EventName, handler: EventHandler): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event)!.add(handler);

    return () => this.subscribers.get(event)?.delete(handler);
  }

  emit(event: EventName, payload: unknown, source: string): void {
    const handlers = this.subscribers.get(event);
    if (!handlers || handlers.size === 0) return;

    const daemonEvent: DaemonEvent = {
      name: event,
      timestamp: Date.now(),
      payload,
      source,
    };

    for (const handler of handlers) {
      try {
        handler(daemonEvent);
      } catch (error) {
        this.logger.error(`Event handler error for "${event}"`, { source, error });
      }
    }
  }
}

export type EventHandler = (event: DaemonEvent) => void | Promise<void>;
```

---

## 11. Phase 8 — Multi-Agent & Deployment

**Priority**: P2 — After Phase 5  
**Estimated effort**: ~45 hours  
**Branch**: `feat/multi-agent-deployment`

### 8.1 Multi-Agent Scope Isolation

Each agent gets an isolated memory scope but shares the same daemon:

```typescript
// packages/daemon/src/agents/scope-manager.ts

export class ScopeManager {
  private scopes = new Map<string, MemoryScope>();

  createScope(scopeId: string, config: ScopeConfig): MemoryScope {
    if (this.scopes.has(scopeId)) {
      throw new Error(`Scope "${scopeId}" already exists`);
    }

    const scope: MemoryScope = {
      id: scopeId,
      engine: createMemoryEngine({
        db: this.db,
        scopePrefix: scopeId,
        config: config.memory,
      }),
      agents: new Set(),
      createdAt: new Date(),
    };

    this.scopes.set(scopeId, scope);
    return scope;
  }

  /**
   * Cross-scope memory sharing. An agent in scope A can access
   * shared memories from scope B (e.g., cross-project knowledge).
   */
  async crossScopeRecall(
    requestingScope: string,
    query: string,
    options: { includeScopes: string[]; minRelevance: number }
  ): Promise<CrossScopeResult[]> {
    const results: CrossScopeResult[] = [];

    for (const scopeId of options.includeScopes) {
      const scope = this.scopes.get(scopeId);
      if (!scope) continue;

      const memories = await scope.engine.recall({
        query,
        scope: scopeId,
        minRelevance: options.minRelevance,
        limit: 5,
      });

      results.push({
        scopeId,
        memories,
        accessible: true,
      });
    }

    return results;
  }
}
```

### 8.2 Default Agents

Implement the 4 default agents from `plan/32-DEFAULT-AGENTS-IMPLEMENTATION-PLAN.md`:

```yaml
# Agent definitions are loaded from YAML config
agents:
  coder:
    role: coder
    model_tier: frontier
    memory_scope: "project:{project_id}"
    capabilities:
      - read_file
      - write_file
      - execute_command
      - search_code
    sub_roles:
      - spec_writer
      - architect
      - test_engineer
      - implementer
      - reviewer
    budget:
      max_tokens_per_turn: 32000
      max_tokens_per_session: 200000

  researcher:
    role: researcher
    model_tier: mid
    memory_scope: "research:{project_id}"
    capabilities:
      - web_search
      - read_url
      - memory_search
      - rag_query
    budget:
      max_tokens_per_turn: 16000
      max_tokens_per_session: 100000

  planner:
    role: planner
    model_tier: small
    memory_scope: "planning:{project_id}"
    capabilities:
      - task_decompose
      - dependency_graph
      - schedule_create
      - memory_recall
    budget:
      max_tokens_per_turn: 8000
      max_tokens_per_session: 50000

  general:
    role: general
    model_tier: micro
    memory_scope: "general:{project_id}"
    capabilities:
      - chat
      - memory_recall
      - memory_capture
    budget:
      max_tokens_per_turn: 4000
      max_tokens_per_session: 25000
```

### 8.3 Server Deployment (Future)

The daemon's IPC layer is designed to be transport-agnostic. When server deployment is needed, add an HTTP/WS transport:

```typescript
// packages/daemon/src/ipc/http-transport.ts (FUTURE)

export class HTTPTransport implements IPCTransport {
  private server: HTTPServer;

  constructor(private config: {
    port: number;
    host: string;
    auth: AuthProvider;
    rateLimit: RateLimitConfig;
    tls?: TLSConfig;
  }) {
    this.server = createServer();
  }

  async start(): Promise<void> {
    // Add authentication middleware
    this.server.use(authMiddleware(this.config.auth));

    // Add rate limiting
    this.server.use(rateLimitMiddleware(this.config.rateLimit));

    // Add CORS for browser-based clients
    this.server.use(corsMiddleware());

    // Mount JSON-RPC endpoint
    this.server.post('/rpc', this.handleRequest);

    // Mount WebSocket for streaming
    this.server.ws('/stream', this.handleWebSocket);

    await this.server.listen(this.config.port, this.config.host);
  }
}
```

**Note**: Full server deployment (multi-tenancy, authentication, TLS, rate limiting) is a separate work stream. The daemon architecture supports it, but the implementation is deferred until the local multi-agent mode is stable.

---

## 12. Phase 9 — Missing Capabilities

**Priority**: P3 — After Phase 8  
**Estimated effort**: ~50 hours  

These are capabilities that the framework is missing from an AI agent best-practices perspective. They're not bugs — they're features that competing frameworks have and users will expect.

### 9.1 Structured Output with Schema Validation

The `@agentsy/core` structured output module exists but lacks integration with the streaming pipeline. The daemon should validate all structured outputs against their JSON schemas before returning them to the client.

```typescript
// packages/daemon/src/services/output-validator.ts

export class OutputValidator {
  /**
   * Validate and auto-repair structured output.
   * Uses the existing auto-repair logic from @agentsy/core/structured,
   * but adds daemon-level enforcement.
   */
  async validate<T>(
    output: string,
    schema: JSONSchema,
    options: { autoRepair: boolean; maxRepairAttempts: number }
  ): Promise<ValidationResult<T>> {
    // 1. Parse JSON
    let parsed = parseJSON(output);

    // 2. If parsing fails and auto-repair is enabled, try repair
    if (!parsed.success && options.autoRepair) {
      for (let attempt = 0; attempt < options.maxRepairAttempts; attempt++) {
        const repaired = autoRepair(output, schema, attempt);
        parsed = parseJSON(repaired);
        if (parsed.success) break;
      }
    }

    if (!parsed.success) {
      return { valid: false, error: parsed.error };
    }

    // 3. Validate against schema
    const validation = validateJSONSchema(parsed.data, schema);
    if (!validation.valid) {
      return { valid: false, error: validation.errors };
    }

    return { valid: true, data: parsed.data as T };
  }
}
```

### 9.2 Conversation Checkpointing & Recovery

Agents need the ability to save and restore conversation state. This is partially implemented in `@agentsy/runtime/src/checkpoint.ts` but not integrated with the daemon.

```typescript
// Checkpoint manager runs inside the daemon
export class CheckpointManager {
  /**
   * Create a named checkpoint of an agent's current state.
   * Includes: message history, memory state, tool call stack, token budget.
   */
  async createCheckpoint(agentId: string, name: string): Promise<string> {
    const agent = this.agentHost.getAgent(agentId);
    const memorySnapshot = await this.memory.snapshot(agent.spec.memoryScope);

    const checkpoint: AgentCheckpoint = {
      id: uuid(),
      agentId,
      name,
      timestamp: new Date(),
      messageHistory: agent.messages,
      memorySnapshot,
      tokenBudget: agent.budget,
      metadata: {
        turnsCompleted: agent.turnsCompleted,
        tokensUsed: agent.tokensUsed,
      },
    };

    await this.db.execute(
      `INSERT INTO agent_checkpoints (id, agent_id, name, timestamp, data)
       VALUES (?, ?, ?, ?, ?)`,
      [checkpoint.id, agentId, name, checkpoint.timestamp.toISOString(),
       JSON.stringify(checkpoint)]
    );

    return checkpoint.id;
  }

  /**
   * Restore an agent to a previous checkpoint.
   * Creates a NEW agent instance — the original is unaffected.
   */
  async restoreCheckpoint(checkpointId: string): Promise<string> {
    const row = await this.db.querySingle<AgentCheckpoint>(
      'SELECT * FROM agent_checkpoints WHERE id = ?', [checkpointId]
    );

    if (!row) throw new Error(`Checkpoint "${checkpointId}" not found`);

    const checkpoint = JSON.parse(row.data);

    // Spawn a new agent with the checkpoint's state
    const newAgentId = await this.agentHost.spawn({
      ...checkpoint,
      id: `${checkpoint.agentId}_restored_${Date.now()}`,
    });

    // Restore memory state
    await this.memory.restoreSnapshot(checkpoint.memorySnapshot);

    return newAgentId;
  }
}
```

### 9.3 Tool Execution Sandbox

The daemon must sandbox tool execution to prevent arbitrary code execution:

```typescript
// packages/daemon/src/services/sandbox-service.ts

export class SandboxService implements Service {
  readonly name = 'sandbox';

  /**
   * Execute a tool in an isolated environment.
   * Uses the existing virtual sandbox from @agentsy/runtime/sandbox
   * but managed by the daemon.
   */
  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    // 1. Verify tool is registered and agent has permission
    const tool = this.toolRegistry.get(request.toolName);
    if (!tool) throw new Error(`Unknown tool: ${request.toolName}`);

    const agent = this.agentHost.getAgent(request.agentId);
    if (!agent.spec.capabilities.includes(request.toolName)) {
      throw new Error(`Agent "${request.agentId}" lacks capability: ${request.toolName}`);
    }

    // 2. Check budget
    if (agent.budget && agent.tokensUsed >= agent.budget.max_tokens_per_session) {
      throw new Error(`Agent "${request.agentId}" exceeded token budget`);
    }

    // 3. Execute in sandbox
    const result = await this.virtualSandbox.execute({
      tool,
      args: request.args,
      agentId: request.agentId,
      timeout: tool.timeout ?? 30_000,
      secrets: this.secretsGuard.getAllowedSecrets(request.agentId),
    });

    // 4. Audit trail
    await this.audit(request, result);

    return result;
  }
}
```

### 9.4 Cross-Session Memory Persistence

The daemon's persistent nature enables cross-session memory that doesn't disappear when the CLI exits:

```typescript
// This is already supported by the memory engine, but the daemon
// adds a cross-session aggregation layer

export class CrossSessionMemory {
  /**
   * Get memories from ALL sessions for a given scope.
   * The CLI only sees one session at a time, but the daemon
   * accumulates knowledge across all sessions.
   */
  async getCrossSessionInsights(scope: string): Promise<CrossSessionInsight[]> {
    // Query memories from all sessions in this scope
    const memories = await this.memory.recall({
      query: '*', // Get everything
      scope,
      kind: 'semantic', // Only synthesized knowledge, not raw events
      limit: 100,
    });

    // Group by topic/category
    const grouped = this.groupByTopic(memories);

    // Generate insights
    return grouped.map(group => ({
      topic: group.key,
      memoryCount: group.items.length,
      earliestMemory: group.items[group.items.length - 1].timestamp,
      latestMemory: group.items[0].timestamp,
      confidence: this.calculateConfidence(group.items),
      summary: this.summarize(group.items),
    }));
  }
}
```

### 9.5 Graceful Degradation & Circuit Breaking

When providers fail, the daemon should gracefully degrade rather than crash:

```typescript
// packages/daemon/src/services/resilience-service.ts

export class ResilienceService implements Service {
  readonly name = 'resilience';

  private circuitBreakers = new Map<string, CircuitBreaker>();
  private fallbackChain: ModelTier[] = ['frontier', 'mid', 'small', 'micro'];

  /**
   * Execute a model call with full resilience:
   * 1. Circuit breaker (per provider)
   * 2. Failover to next provider in tier
   * 3. Tier escalation (spillover)
   * 4. Graceful degradation to cheaper model
   * 5. Cached response (if available)
   */
  async resilientCall(request: ModelCallRequest): Promise<ModelCallResult> {
    const providerId = request.routing.replica.providerId;
    const cb = this.getOrCreateCircuitBreaker(providerId);

    // 1. Check circuit breaker
    if (cb.state === 'open') {
      this.logger.warn(`Circuit breaker open for ${providerId}, trying failover`);
      return this.failoverCall(request);
    }

    try {
      // 2. Try the primary provider
      const result = await cb.execute(async () => {
        return this.streamManager.executeCall(request);
      });
      return result;

    } catch (error) {
      // 3. Circuit breaker recorded the failure, try failover
      this.logger.warn(`Primary call failed, trying failover`, { providerId, error });
      return this.failoverCall(request);
    }
  }

  private async failoverCall(request: ModelCallRequest): Promise<ModelCallResult> {
    // Try spillover to same tier, then escalate
    const spilloverResult = await this.routingService.spillover(request.routing);

    if (spilloverResult) {
      return this.resilientCall({ ...request, routing: spilloverResult });
    }

    // Tier escalation — try cheaper model
    const currentTierIdx = this.fallbackChain.indexOf(request.routing.tier);
    for (let i = currentTierIdx + 1; i < this.fallbackChain.length; i++) {
      const fallbackTier = this.fallbackChain[i];
      const fallbackRouting = await this.routingService.selectModel({
        tier: fallbackTier,
      });

      if (fallbackRouting) {
        this.logger.info(`Degrading from ${request.routing.tier} to ${fallbackTier}`);
        return this.resilientCall({ ...request, routing: fallbackRouting });
      }
    }

    // All options exhausted — return cached response or error
    const cached = await this.tryCache(request);
    if (cached) {
      this.logger.info('Returning cached response (all providers failed)');
      return { ...cached, fromCache: true };
    }

    throw new AllProvidersExhaustedError('All model providers are unavailable');
  }
}
```

### 9.6 Telemetry & Diagnostics

The daemon should expose a rich diagnostics API for debugging and monitoring:

```typescript
// packages/daemon/src/services/diagnostics-service.ts

export class DiagnosticsService implements Service {
  readonly name = 'diagnostics';

  /**
   * Get a comprehensive health snapshot of the daemon and all subsystems.
   */
  async getHealthReport(): Promise<DaemonHealthReport> {
    return {
      daemon: {
        state: this.daemon.state,
        uptime: process.uptime(),
        pid: process.pid,
        memory: process.memoryUsage(),
      },
      services: this.serviceHost.listStates(),
      agents: this.agentHost.list().map(a => ({
        id: a.spec.id,
        role: a.spec.role,
        state: a.state,
        tokensUsed: a.tokensUsed,
        turnsCompleted: a.turnsCompleted,
      })),
      routing: {
        modelsRegistered: this.routingService.getModelCount(),
        healthyProviders: this.routingService.getHealthyProviderCount(),
        totalProviders: this.routingService.getTotalProviderCount(),
      },
      memory: {
        scopes: this.memory.getScopeCount(),
        totalItems: await this.memory.getTotalItemCount(),
        lastConsolidation: this.memory.getLastConsolidationTime(),
      },
      jobs: {
        scheduled: await this.jobScheduler.list(),
        running: this.jobScheduler.getRunningCount(),
      },
      streams: {
        active: this.streamManager.getActiveStreamCount(),
      },
    };
  }
}
```

---

## Appendix A — Code Quality Deep-Dive

### LLMStreamProcessor: God Class Decomposition

The `llm-stream-processor.ts` at 1253 lines is a God Class that handles thinking parsing, XML filtering, tool call accumulation, conversation lifecycle, event emission, and stats tracking. It should be decomposed into:

| Extracted Class | Responsibility | Approx. Lines |
|---|---|---|
| `ThinkingParser` | Already exists in `@agentsy/core/thinking` — use it | ~100 |
| `XMLStreamFilter` | Already exists in `@agentsy/core/xml-filter` — use it | ~150 |
| `ToolCallAccumulator` | Accumulate and deduplicate tool calls from chunks | ~200 |
| `StreamEventEmitter` | Emit typed events (content, thinking, tool-call, done) | ~150 |
| `StreamStatsTracker` | Track tokens, chunks, latency, tool call counts | ~100 |
| `LLMStreamProcessor` | Orchestrate the above components; own the lifecycle | ~300 |

### Providers: Missing Test Coverage

The `@agentsy/providers` package has 14 provider profiles but minimal integration testing. The `@agentsy/testing` package provides `MSW` handlers for HTTP mocking, but `providers` doesn't use them. Every provider adapter should have:

1. **MSW-based unit tests**: Mock the provider's API, test request normalization and response parsing
2. **Error classification tests**: Test that each provider's error format is correctly classified
3. **Streaming tests**: Test that each provider's streaming format is correctly parsed
4. **Capability tests**: Test that capability detection works for each provider

### Observability: Redaction Not Wired

The `RedactionPolicy` in `@agentsy/observability` is defined but never connected to any exporter. Sensitive data (API keys, PII) flows into traces/logs without redaction. Fix:

```typescript
// packages/observability/src/redaction/wiring.ts

export function wireRedactionToExporter(
  policy: RedactionPolicy,
  exporter: SpanExporter
): SpanExporter {
  return {
    export(spans, resultCallback) {
      const redactedSpans = spans.map(span =>
        applyRedactionPolicy(span, policy)
      );
      exporter.export(redactedSpans, resultCallback);
    },
    shutdown() {
      return exporter.shutdown();
    },
    forceFlush() {
      return exporter.forceFlush();
    },
  };
}

function applyRedactionPolicy(span: ReadableSpan, policy: RedactionPolicy): ReadableSpan {
  // Apply rules: regex patterns, field paths, PII detectors
  for (const rule of policy.rules) {
    if (rule.type === 'regex') {
      span = redactByRegex(span, rule.pattern, rule.replacement);
    } else if (rule.type === 'field') {
      span = redactField(span, rule.fieldPath, rule.replacement);
    } else if (rule.type === 'pii') {
      span = redactPII(span, rule.piiTypes, rule.replacement);
    }
  }
  return span;
}
```

### Session: Missing Persistence Adapters

The `@agentsy/session` package defines an in-memory session store but has no SQLite or PostgreSQL adapters. The daemon needs SQLite-backed session persistence:

```typescript
// packages/session/src/adapters/sqlite-session-store.ts

export class SQLiteSessionStore implements SessionStore {
  constructor(private db: DatabaseConnection) {}

  async save(session: Session): Promise<void> {
    await this.db.execute(
      `INSERT INTO sessions (id, agent_id, scope, state, created_at, updated_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state=?, updated_at=?, data=?`,
      [session.id, session.agentId, session.scope, session.state,
       session.createdAt.toISOString(), new Date().toISOString(),
       JSON.stringify(session),
       session.state, new Date().toISOString(), JSON.stringify(session)]
    );
  }

  async load(sessionId: string): Promise<Session | null> {
    const row = await this.db.querySingle<{ data: string }>(
      'SELECT data FROM sessions WHERE id = ?', [sessionId]
    );
    return row ? JSON.parse(row.data) : null;
  }

  async listForAgent(agentId: string): Promise<Session[]> {
    const rows = await this.db.query<{ data: string }>(
      'SELECT data FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC',
      [agentId]
    );
    return rows.map(r => JSON.parse(r.data));
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.execute('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }
}
```

---

## Appendix B — Package Consolidation Map

### Before (27 packages)

```
agents/          (39)   ← Keep
cli/             (71)   ← Keep (becomes thin daemon client)
connectors/      (13)   ← Merge into daemon
core/            (95)   ← Keep
ecc-integration  (0)    ← Doesn't exist
gateway/         (68)   ← Keep (becomes thin daemon client)
guardrails/      (49)   ← Keep
mcp/             (11)   ← Merge into daemon
memory/          (260)  ← Keep
models/          (25)   ← Keep
observability/   (29)   ← Keep
plugins/         (43)   ← Keep
prompts/         (16)   ← Keep (small but distinct concern)
providers/       (68)   ← Keep
renderers/       (120)  ← Keep (absorbs ui)
retrieval/       (25)   ← Keep (Phase 6 moves logic into daemon, types stay)
runtime/         (89)   ← Keep
scripts/         (20)   ← Move to root tooling
secrets/         (58)   ← Keep
session/         (34)   ← Keep
shared/          (10)   ← Merge into types
testing/         (36)   ← Keep
tokenomics/      (84)   ← Keep
tools/           (22)   ← Keep
types/           (27)   ← Keep (absorbs shared)
ui/              (15)   ← Merge into renderers
vscode/          (75)   ← Keep
workflows/       (1)    ← Merge into orchestrator
```

### After (24 packages + root scripts)

```
agents/          ← Keep
cli/             ← Keep (thin daemon client)
core/            ← Keep
daemon/          ← NEW (absorbs mcp, connectors)
gateway/         ← Keep (thin daemon client)
guardrails/      ← Keep
memory/          ← Keep
models/          ← Keep
observability/   ← Keep
plugins/         ← Keep
prompts/         ← Keep
providers/       ← Keep
renderers/       ← Keep (absorbs ui)
retrieval/       ← Keep
runtime/         ← Keep
secrets/         ← Keep
session/         ← Keep
testing/         ← Keep
tokenomics/      ← Keep
tools/           ← Keep
types/           ← Keep (absorbs shared)
vscode/          ← Keep
orchestrator/    ← Keep (absorbs workflows)

scripts/         ← Root-level tooling (not a package)
```

---

## Appendix C — IPC Protocol Spec

### Socket Location

| Platform | Default Path |
|----------|-------------|
| macOS | `~/.agentsy/daemon.sock` |
| Linux | `~/.agentsy/daemon.sock` |
| Windows | `\\.\pipe\agentsy-daemon` |

### Message Format

Newline-delimited JSON-RPC 2.0:

```
{"jsonrpc":"2.0","id":"1","method":"agent.list","params":{}}\n
{"jsonrpc":"2.0","id":"1","result":[{"id":"coder-1","role":"coder","state":"idle"}]}\n
```

### Streaming Protocol

```
Client:  {"jsonrpc":"2.0","id":"2","method":"stream.start","params":{"agentId":"coder-1","messages":[...]}}
Server:  {"jsonrpc":"2.0","id":"2","result":{"streamId":"s-abc123"}}
Server:  {"jsonrpc":"2.0","method":"stream.chunk","params":{"streamId":"s-abc123","chunk":{"type":"content","text":"Hello"},"index":0}}
Server:  {"jsonrpc":"2.0","method":"stream.chunk","params":{"streamId":"s-abc123","chunk":{"type":"content","text":" world"},"index":1}}
Server:  {"jsonrpc":"2.0","method":"stream.end","params":{"streamId":"s-abc123","usage":{"inputTokens":42,"outputTokens":5},"totalChunks":2}}
```

### Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error (invalid JSON) |
| -32600 | Invalid request (missing required field) |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32001 | Agent not found |
| -32002 | Stream not found |
| -32003 | Routing failure (no model available) |
| -32004 | Budget exceeded |
| -32005 | Guardrail blocked |
| -32006 | Service sleeping (retry after wakeup) |

### Authentication (Future — Server Mode)

For local mode, Unix socket permissions provide security (only the owning user can connect). For server mode:

```typescript
// JWT-based authentication for server mode
interface AuthToken {
  sub: string;          // User ID
  scope: string[];      // Allowed memory scopes
  agents: string[];     // Allowed agent IDs
  exp: number;          // Expiration timestamp
  iat: number;          // Issued at
}
```

---

## Implementation Order & Milestones

```
Week 1-2:  Phase 0 (Critical Bug Fixes) — Must be green before any other work
Week 2-3:  Phase 1 (Daemon Foundation) — Can overlap with Phase 0 testing
Week 3:    Phase 2 (Package Consolidation) — Fast, mostly file moves
Week 3-4:  Phase 3 (Hook Pipeline Redesign) — Independent of daemon
Week 4-5:  Phase 4 (Gateway → Daemon) — Depends on Phase 1
Week 5-6:  Phase 5 (Streaming Architecture) — Depends on Phase 4
Week 5-6:  Phase 6 (RAG as Daemon Service) — Depends on Phase 1, parallel with 5
Week 6-7:  Phase 7 (Learning Loop) — Depends on Phase 6
Week 7-8:  Phase 8 (Multi-Agent & Deployment) — Depends on Phase 5
Week 9+:   Phase 9 (Missing Capabilities) — Depends on Phase 8
```

### Success Criteria

Each phase must pass these gates before the next phase begins:

- **All existing tests pass** (no regressions)
- **New code has >80% test coverage** (critical paths >90%)
- **`pnpm build` succeeds** with zero errors
- **`pnpm check-types` succeeds** with zero errors
- **Manual smoke test**: `agentsy daemon start` → `agentsy chat` → works end-to-end
