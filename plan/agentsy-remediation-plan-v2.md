# Agentsy: Comprehensive Remediation & Implementation Plan

**Version**: 2.0  
**Date**: 2026-06-16  
**Branch**: `feature/model-tier-routing`  
**Status**: DRAFT — Awaiting approval before Phase 0 begins  
**Supersedes**: v1.0 (2026-06-16)

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
11. [Phase 8 — ACP Agent & Multi-Agent Deployment](#11-phase-8--acp-agent--multi-agent-deployment)
12. [Phase 9 — Missing Capabilities](#12-phase-9--missing-capabilities)
13. [Appendix A — Code Quality Deep-Dive](#appendix-a--code-quality-deep-dive)
14. [Appendix B — Package Consolidation Map](#appendix-b--package-consolidation-map)
15. [Appendix C — IPC Protocol Spec](#appendix-c--ipc-protocol-spec)
16. [Appendix D — ACP Protocol Mapping](#appendix-d--acp-protocol-mapping)

---

## 1. Executive Summary

This plan addresses 9 critical bugs, 7 architectural misalignments, and a fundamental restructuring of Agentsy around a **daemon-centric architecture** with **first-class ACP (Agent Client Protocol) support**. The daemon becomes the single long-lived process that owns agents, subagents, scheduling, workflows, memory, routing, streaming, RAG, connectors, logging, and telemetry. The CLI and TUI become thin IPC clients over Unix domain sockets. Editor integration is achieved through ACP — making Agentsy a native agent that works with Zed, VS Code (via ACP Client extension), and any ACP-compatible editor — eliminating the need for a custom VS Code extension.

### Key v2 Changes from v1

| Area | v1 Decision | v2 Decision | Rationale |
|------|-------------|-------------|-----------|
| **Internal IPC** | JSON-RPC 2.0 over Unix sockets | **JSON-RPC 2.0 over Unix sockets** (confirmed) | Same protocol for both internal and external (ACP); human-readable; no build step; debuggable with `socat`; Zod schemas for validation |
| **Editor integration** | Custom VS Code extension | **ACP Agent** (Zed + VS Code ACP Client extension) | ACP is the emerging standard; zero custom extension code; works with Zed, VS Code, JetBrains; follows Gemini CLI pattern |
| **Process management** | No subprocess management | **SubprocessManager with stall detection** | Daemon manages child processes (tool executors, MCP servers, build runners); kills stalled processes; enforces memory limits |
| **Scope isolation** | Agent-specified memory scopes | **Folder-based scoping** | Scope derived from working directory, not agent-specified; aligns with ACP `session/new` `cwd` parameter; simpler mental model |

### Scope

- **9 critical bug fixes** (fake streaming, lost tool calls, hook short-circuit, quota map, unit mismatch, daemon restart, tool-call ID dedup, transform blocking, cost filter units)
- **1 new package** (`@agentsy/daemon`) — the central powerhouse with ACP agent support
- **8 package consolidations** (workflows → orchestrator, shared → types, scripts → root, etc.)
- **3 major architectural migrations** (gateway → daemon, streaming → daemon, RAG → daemon)
- **2 new subsystems** (background job scheduler, event-driven learning loop)
- **1 new protocol integration** (ACP — Agent Client Protocol, replaces custom VS Code extension)
- **1 new infrastructure component** (SubprocessManager with stall detection and memory limits)
- **1 scope model change** (folder-based scoping aligned with ACP session `cwd`)

### Effort Estimate

| Phase | Description | Hours | Priority |
|-------|-------------|-------|----------|
| 0 | Critical Bug Fixes | ~20 | P0 — Immediate |
| 1 | Daemon Foundation (with ACP + SubprocessManager) | ~80 | P0 — Immediate |
| 2 | Package Consolidation | ~15 | P1 — After Phase 0 |
| 3 | Hook Pipeline Redesign | ~25 | P1 — After Phase 0 |
| 4 | Gateway → Daemon | ~40 | P1 — After Phase 1 |
| 5 | Streaming Architecture | ~35 | P1 — After Phase 4 |
| 6 | RAG as Daemon Service | ~30 | P2 — After Phase 1 |
| 7 | Learning Loop & Background Jobs | ~25 | P2 — After Phase 6 |
| 8 | ACP Agent & Multi-Agent Deployment | ~45 | P2 — After Phase 5 |
| 9 | Missing Capabilities | ~50 | P3 — After Phase 8 |
| | **Total** | **~365** | |

### Dependencies Graph

```text
Phase 0 (Bug Fixes) ──────────────────────────────┐
                                                    ├──▶ Phase 2 (Consolidation)
Phase 1 (Daemon Foundation) ─┬──▶ Phase 4 (Gateway)│
                             ├──▶ Phase 5 (Stream)  │
                             ├──▶ Phase 6 (RAG)     │
                             └──▶ Phase 3 (Hooks) ──┘

Phase 4 + 5 ──▶ Phase 8 (ACP Agent / Multi-Agent)
Phase 6 ──────▶ Phase 7 (Learning Loop)
Phase 8 ──────▶ Phase 9 (Missing Capabilities)
```

---

## 2. Architectural Decisions

### AD-1: Daemon as the Central Process

**Decision**: The daemon (`@agentsy/daemon`) is the single long-lived process that owns all stateful subsystems. The CLI and TUI are thin clients that connect via IPC over Unix domain sockets. Editors connect via ACP (which itself uses JSON-RPC 2.0 over stdio or WebSocket).

**Rationale**: Currently, every CLI invocation spins up its own runtime, memory engine, gateway, and provider connections. This is wasteful, prevents cross-session memory, and makes features like background jobs and scheduled workflows impossible. A persistent daemon solves all of these.

**Implications**:

- The daemon must be crash-resilient (supervisor pattern, auto-restart)
- IPC must be fast enough for streaming tokens (Unix domain sockets, not HTTP)
- All subsystems must support sleep/wake lifecycle
- The daemon must have a built-in CLI display mode (TUI-over-IPC)
- The daemon exposes an ACP Agent interface for editor integration

### AD-2: Hook Transform Composition

**Decision**: Hook transforms compose left-to-right, like Koa/Express middleware. Each hook receives the output of the previous transform. Priority determines execution order.

**Rationale**: The current short-circuit design prevents guardrails and memory from both transforming the same event. Composition is the proven pattern from web frameworks.

### AD-3: Daemon-Centric Streaming

**Decision**: The daemon owns all LLM provider connections. Clients request streams via IPC; the daemon pipes events back as JSON-RPC notifications. For ACP clients, the same events map to ACP `session/update` notifications.

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

### AD-9: JSON-RPC 2.0 over Unix Sockets (NOT gRPC)

**Decision**: Internal daemon IPC uses JSON-RPC 2.0 over Unix domain sockets with newline-delimited JSON. We evaluated gRPC with protobuf and explicitly rejected it.

**Rationale**:

- **Both processes are local Node.js** — there is no cross-language interop requirement that would justify gRPC's complexity.
- **Human-readable, debuggable** — you can inspect traffic with `socat` or `nc` without proto descriptors. This is invaluable during development and production debugging.
- **No build step** — gRPC requires `.proto` file compilation, a protobuf runtime dependency, and a code generation pipeline. JSON-RPC requires none of these.
- **Streaming via notifications** — JSON-RPC 2.0 notifications (messages without an `id` field) are semantically identical to server-sent events. Our `stream.chunk` notification pattern works perfectly. No need for gRPC bidirectional streaming.
- **Type safety via Zod** — instead of protobuf schemas, we use Zod schemas for runtime type validation. This provides both compile-time inference and runtime validation, which is superior to protobuf's compile-time-only guarantees for a local IPC scenario.
- **ACP alignment** — the Agent Client Protocol itself uses JSON-RPC 2.0 over stdio or WebSocket. Using the same wire format internally and externally reduces cognitive overhead and allows sharing validation schemas between the IPC layer and the ACP layer.
- **Future remote access** — if remote access is needed later (server mode), the same JSON-RPC method signatures can be served over HTTP/WebSocket without any protocol change. The method registry is transport-agnostic.

**Implications**:

- All IPC messages are newline-delimited JSON-RPC 2.0
- Zod schemas validate every incoming request and outgoing response
- Streaming uses `stream.chunk` notifications (no ID, no response expected)
- The `IPCServer` and `IPCClient` classes handle framing, parsing, and routing
- Transport abstraction (`IPCTransport`) allows swapping Unix sockets for WebSocket later

### AD-10: ACP (Agent Client Protocol) Agent

**Decision**: The Agentsy daemon becomes an ACP Agent. This replaces the planned custom VS Code extension entirely. The daemon speaks the Agent Client Protocol natively, enabling integration with any ACP-compatible editor.

**Rationale**:

- **ACP is the emerging standard** for editor-agent communication. Zed has native ACP support. VS Code has the ACP Client extension (`formulahendry.acp-client`). JetBrains is adding ACP support. Building a custom extension for each editor is unsustainable.
- **Same wire format as internal IPC** — ACP uses JSON-RPC 2.0, which is exactly what our internal IPC uses. The daemon already speaks JSON-RPC; ACP is just another transport and a set of methods.
- **Zero custom extension code** — instead of maintaining a 75-file VS Code extension, we implement the ACP Agent interface using `@agentclientprotocol/sdk`'s `AgentSideConnection` class. This is ~500 lines of integration code versus ~5000 lines of extension code.
- **Production-proven pattern** — the Gemini CLI agent is a production ACP agent implementation. We can follow its architecture closely.
- **Multi-editor support out of the box** — a single ACP implementation gives us Zed, VS Code, and future JetBrains support simultaneously.

**Implications**:

- The daemon's `acp/` module implements the ACP Agent interface using `@agentclientprotocol/sdk`
- ACP transport is stdio (for CLI integration) or WebSocket (for remote access)
- ACP sessions map to daemon agent instances with folder-based scoping
- ACP `session/update` notifications carry streaming chunks, tool calls, and usage updates
- ACP `fs/*` and `terminal/*` client methods are routed to the daemon's SubprocessManager
- The `@agentsy/vscode` package is removed from the consolidation plan

### AD-11: Subprocess Management with Stall Detection

**Decision**: The daemon manages child processes (tool executors, MCP servers, build runners, etc.) and forcefully terminates them when they stall or exceed resource limits.

**Rationale**:

- **Stalled processes are a real operational problem** — a hung MCP server or a build runner that never completes will block the agent indefinitely without this. Users experience this as "the agent stopped responding" with no way to recover.
- **MCP servers are long-lived children** — the daemon starts MCP servers as child processes. If one stops responding to requests, the daemon must detect this and restart it.
- **Tool execution has resource limits** — some tools (file search, build commands) can consume unbounded memory or run forever. The daemon must enforce limits.
- **ACP terminal integration** — the ACP `terminal/create`, `terminal/output`, `terminal/kill` methods map directly to subprocess management. Each ACP terminal is a managed subprocess.

**Implications**:

- The `SubprocessManager` class tracks all child processes with `SubprocessSpec` and `SubprocessState`
- Stall detection monitors stdout/stderr activity — if nothing received for `stallTimeoutMs`, the process is marked `stalled` and killed
- Memory limits are enforced via periodic RSS checks
- Auto-restart is supported for MCP servers (configurable `maxRestarts`)
- The manager emits events: `process:stalled`, `process:killed`, `process:exited`, `process:restarted`

### AD-12: Folder-Based Scoping

**Decision**: Session scope is determined by the folder (working directory), not agent-specified. This aligns with ACP's `session/new` `cwd` parameter and the user's mental model of "I'm working in this project folder."

**Rationale**:

- **Developers think in folders** — when a user opens a project in their editor or `cd`s into a directory, they expect the agent to be scoped to that project. Agent-specified scopes are an implementation detail that leaks into the user experience.
- **ACP mandates `cwd`** — the ACP `session/new` method requires a `cwd` (working directory) parameter. The scope is naturally derived from this.
- **Simpler mental model** — instead of tracking `project:webapp` or `research:project-id`, the scope is simply `folder:/home/user/projects/webapp`. No scope management UI needed.
- **Multi-root workspaces** — ACP supports `additionalDirectories` for multi-root workspaces, which maps cleanly to our scope isolation model.

**Implications**:

- **TUI mode**: scope = `process.cwd()` when the TUI starts
- **ACP client mode**: scope = `cwd` from `session/new` request
- **Scope key format**: `folder:[sha256-hash-of-absolute-path]` (e.g., `folder:a1b2c3d4`)
- Each folder gets its own memory scope, config, and agent context
- `additionalDirectories` from ACP are accessible but secondary to the primary `cwd` scope

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
**Estimated effort**: ~80 hours (increased from v1's 60h due to ACP + SubprocessManager)  
**Branch**: `feat/daemon-foundation`

This phase creates the `@agentsy/daemon` package — the central long-lived process with dual interfaces: an internal JSON-RPC 2.0 server over Unix sockets for CLI/TUI clients, and an external ACP Agent interface for editor clients.

### 1.1 Package Scaffolding

Create `packages/daemon/` with the following structure:

```text
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
│   ├── acp/
│   │   ├── index.ts                # ACP barrel
│   │   ├── acp-server.ts           # ACP Agent server (AgentSideConnection)
│   │   ├── acp-server.test.ts
│   │   ├── acp-session-bridge.ts   # Maps ACP sessions → daemon agents
│   │   ├── acp-session-bridge.test.ts
│   │   ├── acp-capabilities.ts     # AgentCapabilities declaration
│   │   └── acp-notification-adapter.ts # Maps daemon events → ACP notifications
│   ├── processes/
│   │   ├── index.ts                # Subprocess barrel
│   │   ├── subprocess-manager.ts   # Child process lifecycle + stall detection
│   │   ├── subprocess-manager.test.ts
│   │   ├── terminal-bridge.ts      # ACP terminal/create → subprocess mapping
│   │   └── terminal-bridge.test.ts
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
│   │   ├── agent-host.test.ts
│   │   ├── scope-manager.ts        # Folder-based scope isolation
│   │   └── scope-manager.test.ts
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

The `Daemon` class is the top-level lifecycle manager. It owns all subsystems and coordinates their startup, shutdown, sleep, and wake. Compared to v1, it now includes the ACP server and SubprocessManager.

```typescript
// packages/daemon/src/daemon.ts

import { createMemoryEngine, MemoryEngine } from '@agentsy/memory';
import { createIPCServer, IPCServer } from './ipc/server.js';
import { ACPServer } from './acp/acp-server.js';
import { SubprocessManager } from './processes/subprocess-manager.js';
import { ServiceHost, ServiceState } from './services/service-host.js';
import { AgentHost } from './agents/agent-host.js';
import { ScopeManager } from './agents/scope-manager.js';
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
  readonly acp: ACPServer;
  readonly processes: SubprocessManager;
  readonly services: ServiceHost;
  readonly agents: AgentHost;
  readonly scopes: ScopeManager;
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

    this.processes = new SubprocessManager({
      logger: this.logger.child('processes'),
      metrics: this.metrics,
    });

    this.acp = new ACPServer({
      daemon: this,
      logger: this.logger.child('acp'),
      subprocessManager: this.processes,
    });

    this.services = new ServiceHost({
      logger: this.logger.child('services'),
      metrics: this.metrics,
    });

    this.scopes = new ScopeManager({
      db: this.db,
      logger: this.logger.child('scopes'),
    });

    this.agents = new AgentHost({
      memory: this.memory,
      scopeManager: this.scopes,
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

      // 4. Initialize scope manager
      await this.scopes.initialize();

      // 5. Start agent host
      await this.agents.initialize();

      // 6. Start subprocess manager
      await this.processes.start();

      // 7. Start connectors
      await this.connectors.initialize();

      // 8. Start IPC server for internal clients (CLI/TUI)
      await this.ipc.start();
      this.registerIPCHandlers();

      // 9. Start ACP server for external clients (editors)
      //    ACP can use stdio or WebSocket; for daemon mode, we use WebSocket
      await this.acp.start(this.config.acp);

      // 10. Enable supervisor (watches for crashes)
      this.supervisor.watch(this);

      // 11. Enable sleeper (puts idle subsystems to sleep)
      this.sleeper.watch(this.services);

      this.transition('running');
      this.logger.info('Daemon started', {
        pid: process.pid,
        socket: this.config.ipc.socketPath,
        acp: this.config.acp.enabled ? 'enabled' : 'disabled',
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
      await withTimeout(this.acp.stop(), timeout);             // Stop ACP (no new editor sessions)
      await withTimeout(this.ipc.stop(), timeout);             // Stop IPC (no new CLI clients)
      await withTimeout(this.sleeper.stop(), timeout);         // Stop sleep monitoring
      await withTimeout(this.supervisor.stop(), timeout);      // Stop crash watching
      await withTimeout(this.processes.killAll(), timeout);    // Kill all child processes
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

    // Subprocess management
    this.ipc.handle('process.spawn', (req) => this.processes.spawnProcess(req));
    this.ipc.handle('process.list', () => this.processes.listProcesses());
    this.ipc.handle('process.kill', (req) => this.processes.killProcess(req.processId));
    this.ipc.handle('process.output', (req) => this.processes.getOutput(req.processId));
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
- Same wire format as ACP (reduces cognitive overhead)

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
  | 'display.render'
  // Subprocess management
  | 'process.spawn'
  | 'process.list'
  | 'process.kill'
  | 'process.output';
```

### 1.4 IPC Server Implementation

```typescript
// packages/daemon/src/ipc/server.ts

import { createServer, Socket } from 'net';
import { IPCRequest, IPCResponse, IPCStreamChunk, IPCStreamEnd } from './protocol.js';
import { z } from 'zod';

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

  // ── Broadcast ──────────────────────────────────

  /**
   * Send a notification to ALL connected clients.
   * Used for daemon-wide events (agent spawned, job completed, etc.)
   */
  broadcast(method: string, params: unknown): void {
    const notification = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    for (const [, socket] of this.clients) {
      try {
        socket.write(notification);
      } catch {
        // Client may have disconnected; ignore write errors
      }
    }
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

### 1.5 IPC Client (Thin Client for CLI/TUI)

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

### 1.6 ACP Server Implementation

The ACP server is the daemon's external interface for editor clients. It uses the `@agentclientprotocol/sdk` package's `AgentSideConnection` to handle the ACP protocol, and bridges ACP sessions to daemon agents with folder-based scoping.

```typescript
// packages/daemon/src/acp/acp-server.ts

import { AgentSideConnection } from '@agentclientprotocol/sdk';
import type { Daemon } from '../daemon.js';
import { ACPSessionBridge } from './acp-session-bridge.js';
import { ACPNotificationAdapter } from './acp-notification-adapter.js';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';

export interface ACPServerConfig {
  enabled: boolean;
  transport: 'stdio' | 'websocket';
  websocketPort?: number;
  maxSessions?: number;
}

export interface ACPServerDeps {
  daemon: Daemon;
  logger: Logger;
  subprocessManager: SubprocessManager;
}

export class ACPServer {
  private connection: AgentSideConnection | null = null;
  private sessionBridge: ACPSessionBridge;
  private notificationAdapter: ACPNotificationAdapter;
  private config: ACPServerConfig;
  private activeSessions = new Map<string, ACPSessionBridge>();
  private deps: ACPServerDeps;

  constructor(deps: ACPServerDeps) {
    this.deps = deps;
    this.sessionBridge = new ACPSessionBridge({
      daemon: deps.daemon,
      logger: deps.logger.child('session-bridge'),
    });
    this.notificationAdapter = new ACPNotificationAdapter({
      logger: deps.logger.child('notification-adapter'),
    });
  }

  async start(config: ACPServerConfig): Promise<void> {
    this.config = config;

    if (!config.enabled) {
      this.deps.logger.info('ACP server disabled');
      return;
    }

    // Create the ACP AgentSideConnection
    // This handles the entire ACP protocol handshake, method routing,
    // and notification delivery
    this.connection = new AgentSideConnection({
      // Transport configuration
      transport: config.transport === 'stdio'
        ? { type: 'stdio' }
        : { type: 'websocket', port: config.websocketPort ?? 9380 },

      // Agent metadata
      agentInfo: {
        name: 'Agentsy',
        version: '2.0.0',
        protocolVersion: 1,
        capabilities: AGENT_CAPABILITIES,
      },

      // ── ACP Method Handlers ────────────────────

      // Initialization — negotiate capabilities
      initialize: async (params) => {
        this.deps.logger.info('ACP client initialized', {
          protocolVersion: params.protocolVersion,
          clientName: params.clientInfo?.name,
        });

        return {
          protocolVersion: 1,
          agentCapabilities: AGENT_CAPABILITIES,
          agentInfo: {
            name: 'Agentsy',
            version: '2.0.0',
          },
        };
      },

      // Authentication (optional — local mode doesn't require it)
      authenticate: async (params) => {
        // For local daemon, auth is handled by Unix socket permissions
        // For server mode, validate the token
        if (params.method === 'local') {
          return { success: true };
        }
        // Token-based auth for server mode (future)
        return { success: false, error: 'Authentication method not supported' };
      },

      logout: async () => {
        // Clean up sessions for this client
        this.deps.logger.info('ACP client logged out');
        return {};
      },

      // ── Session Management ─────────────────────

      'session/new': async (params) => {
        const { cwd, additionalDirectories, mcpServers } = params;

        this.deps.logger.info('ACP session/new', { cwd });

        // Create a folder-based scope from the cwd
        const scopeKey = this.deriveScopeKey(cwd);

        // Spawn an agent for this session
        const agent = await this.deps.daemon.agents.spawn({
          id: `acp_${Date.now()}_${uuid().slice(0, 8)}`,
          name: `ACP Session`,
          role: 'general',
          memoryScope: scopeKey,
          additionalDirectories,
          mcpServers: mcpServers ?? [],
        });

        // Create session bridge that maps ACP session to daemon agent
        const bridge = new ACPSessionBridge({
          daemon: this.deps.daemon,
          logger: this.deps.logger.child('session-bridge'),
          agentId: agent.spec.id,
          sessionId: agent.spec.id,
          cwd,
          additionalDirectories,
        });

        this.activeSessions.set(agent.spec.id, bridge);

        // Wire daemon events → ACP notifications
        this.notificationAdapter.wireAgentToSession(agent.spec.id, agent.spec.id);

        return {
          sessionId: agent.spec.id,
          cwd,
          mode: 'code',       // Default mode
          availableCommands: [],
        };
      },

      'session/prompt': async (params) => {
        const { sessionId, prompt, images, embeddedContext } = params;
        const bridge = this.activeSessions.get(sessionId);

        if (!bridge) {
          throw new Error(`Session not found: ${sessionId}`);
        }

        this.deps.logger.info('ACP session/prompt', { sessionId, promptLength: prompt.length });

        // Send prompt to the daemon agent and get the response
        // The bridge handles the streaming → ACP notification mapping
        const result = await bridge.handlePrompt(prompt, {
          images,
          embeddedContext,
          onChunk: (chunk) => {
            // Send ACP session/update notification with agent_message_chunk
            this.connection?.sendNotification('session/update', {
              sessionId,
              update: {
                type: 'agent_message_chunk',
                content: chunk.text,
              },
            });
          },
          onToolCall: (toolCall) => {
            // Send ACP session/update notification with tool_call
            this.connection?.sendNotification('session/update', {
              sessionId,
              update: {
                type: 'tool_call',
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                arguments: toolCall.arguments,
                status: 'running',
              },
            });
          },
          onToolCallUpdate: (update) => {
            // Send ACP session/update notification with tool_call_update
            this.connection?.sendNotification('session/update', {
              sessionId,
              update: {
                type: 'tool_call_update',
                toolCallId: update.toolCallId,
                status: update.status,
                output: update.output,
              },
            });
          },
          onUsage: (usage) => {
            // Send ACP session/update notification with usage_update
            this.connection?.sendNotification('session/update', {
              sessionId,
              update: {
                type: 'usage_update',
                usage,
              },
            });
          },
        });

        return {
          stopReason: result.stopReason, // 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
        };
      },

      'session/load': async (params) => {
        const { sessionId } = params;
        // Load existing session from daemon's session store
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          return {
            sessionId,
            cwd: bridge.cwd,
            mode: 'code',
            availableCommands: [],
          };
        }
        throw new Error(`Session not found: ${sessionId}`);
      },

      'session/list': async () => {
        const sessions = Array.from(this.activeSessions.values()).map(bridge => ({
          sessionId: bridge.sessionId,
          cwd: bridge.cwd,
        }));
        return { sessions };
      },

      'session/close': async (params) => {
        const { sessionId } = params;
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          await bridge.close();
          this.activeSessions.delete(sessionId);
          this.notificationAdapter.unwireSession(sessionId);
        }
        return {};
      },

      'session/delete': async (params) => {
        const { sessionId } = params;
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          await bridge.close();
          this.activeSessions.delete(sessionId);
          this.notificationAdapter.unwireSession(sessionId);
          // Also clean up the agent
          await this.deps.daemon.agents.kill(sessionId);
        }
        return {};
      },

      'session/resume': async (params) => {
        const { sessionId } = params;
        // Resume a closed session — re-create the agent bridge
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          return { sessionId, cwd: bridge.cwd, mode: 'code' };
        }
        throw new Error(`Session not found: ${sessionId}`);
      },

      // session/cancel is a notification (no response)
      'session/cancel': async (params) => {
        const { sessionId } = params;
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          bridge.cancel();
        }
      },

      'session/set_mode': async (params) => {
        const { sessionId, mode } = params;
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          bridge.setMode(mode);
        }
        return {};
      },

      'session/set_config_option': async (params) => {
        const { sessionId, key, value } = params;
        const bridge = this.activeSessions.get(sessionId);
        if (bridge) {
          bridge.setConfigOption(key, value);
        }
        return {};
      },

      // ── Client-side methods the daemon can invoke ──
      // These are registered so the daemon can call them on the ACP client
      // They're not handlers — they're outbound calls
    });

    await this.connection.start();
    this.deps.logger.info('ACP server started', {
      transport: config.transport,
      port: config.websocketPort,
    });
  }

  async stop(): Promise<void> {
    // Close all active sessions
    for (const [id, bridge] of this.activeSessions) {
      await bridge.close();
      this.activeSessions.delete(id);
    }

    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }

    this.deps.logger.info('ACP server stopped');
  }

  /**
   * Derive a folder-based scope key from an absolute path.
   * Format: folder:[sha256-hash-first-12-chars]
   */
  private deriveScopeKey(absolutePath: string): string {
    const hash = createHash('sha256').update(absolutePath).digest('hex');
    return `folder:${hash.slice(0, 12)}`;
  }
}
```

### 1.7 ACP Capabilities Declaration

```typescript
// packages/daemon/src/acp/acp-capabilities.ts

import type { AgentCapabilities } from '@agentclientprotocol/sdk';

/**
 * The capabilities this Agentsy daemon advertises to ACP clients.
 * These determine which ACP methods the client can invoke and
 * which features are available.
 */
export const AGENT_CAPABILITIES: AgentCapabilities = {
  // Session capabilities — what session operations we support
  loadSession: true,
  sessionCapabilities: {
    close: true,
    list: true,
    delete: true,
    resume: true,
    additionalDirectories: true,
  },

  // Prompt capabilities — what input types we accept
  promptCapabilities: {
    image: false,       // Not yet — would require vision model support
    audio: false,       // Not yet — would require ASR pipeline
    embeddedContext: true, // We accept file paths, URLs, etc. as context
  },

  // MCP capabilities — what MCP server types we can connect to
  mcpCapabilities: {
    http: true,         // We support HTTP-based MCP servers
    sse: true,          // We support SSE-based MCP servers
  },
};
```

### 1.8 ACP Session Bridge

The session bridge maps ACP sessions to daemon agents. Each ACP session gets its own agent instance with folder-based scoping.

```typescript
// packages/daemon/src/acp/acp-session-bridge.ts

export interface ACPSessionBridgeDeps {
  daemon: Daemon;
  logger: Logger;
  agentId?: string;
  sessionId?: string;
  cwd?: string;
  additionalDirectories?: string[];
}

export class ACPSessionBridge {
  readonly sessionId: string;
  readonly agentId: string;
  readonly cwd: string;
  readonly additionalDirectories: string[];
  private mode: string = 'code';
  private configOptions = new Map<string, unknown>();
  private abortController: AbortController | null = null;
  private deps: ACPSessionBridgeDeps;

  constructor(deps: ACPSessionBridgeDeps) {
    this.deps = deps;
    this.sessionId = deps.sessionId ?? uuid();
    this.agentId = deps.agentId ?? this.sessionId;
    this.cwd = deps.cwd ?? process.cwd();
    this.additionalDirectories = deps.additionalDirectories ?? [];
  }

  /**
   * Handle a prompt from the ACP client.
   * Streams the response back through the onChunk/onToolCall callbacks.
   */
  async handlePrompt(
    prompt: string,
    callbacks: {
      images?: Array<{ type: string; data: string; mimeType: string }>;
      embeddedContext?: unknown[];
      onChunk: (chunk: { text: string }) => void;
      onToolCall: (toolCall: { id: string; name: string; arguments: string }) => void;
      onToolCallUpdate: (update: { toolCallId: string; status: string; output?: string }) => void;
      onUsage: (usage: { inputTokens: number; outputTokens: number; costUsd?: number }) => void;
    }
  ): Promise<{ stopReason: string }> {
    this.abortController = new AbortController();

    try {
      // Build messages array
      const messages: Message[] = [
        { role: 'user', content: prompt },
      ];

      // Send to the daemon agent via IPC
      // The daemon handles routing, streaming, and tool execution
      const stream = this.deps.daemon.agents.streamMessages(this.agentId, messages, {
        signal: this.abortController.signal,
      });

      let stopReason = 'end_turn';

      for await (const event of stream) {
        if (this.abortController.signal.aborted) {
          stopReason = 'cancelled';
          break;
        }

        switch (event.type) {
          case 'content':
            callbacks.onChunk({ text: event.text });
            break;

          case 'tool_call':
            callbacks.onToolCall({
              id: event.toolCallId,
              name: event.toolName,
              arguments: event.arguments,
            });
            break;

          case 'tool_call_result':
            callbacks.onToolCallUpdate({
              toolCallId: event.toolCallId,
              status: event.success ? 'completed' : 'error',
              output: event.output,
            });
            break;

          case 'usage':
            callbacks.onUsage({
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              costUsd: event.costUsd,
            });
            break;

          case 'done':
            stopReason = event.stopReason;
            break;
        }
      }

      return { stopReason };
    } finally {
      this.abortController = null;
    }
  }

  /** Cancel an in-progress prompt */
  cancel(): void {
    this.abortController?.abort();
  }

  /** Set the session mode (e.g., 'code', 'ask', 'plan') */
  setMode(mode: string): void {
    this.mode = mode;
    this.deps.logger.debug(`Session mode set to "${mode}"`, { sessionId: this.sessionId });
  }

  /** Set a configuration option for this session */
  setConfigOption(key: string, value: unknown): void {
    this.configOptions.set(key, value);
    this.deps.logger.debug(`Config option set`, { sessionId: this.sessionId, key, value });
  }

  /** Close the session */
  async close(): Promise<void> {
    this.cancel();
    this.deps.logger.info('ACP session closed', { sessionId: this.sessionId });
  }
}
```

### 1.9 ACP Notification Adapter

This adapter maps daemon-internal events (streaming chunks, tool calls, usage updates) to ACP `session/update` notifications that are sent to the editor client.

```typescript
// packages/daemon/src/acp/acp-notification-adapter.ts

export interface ACPNotificationAdapterDeps {
  logger: Logger;
}

/**
 * Maps daemon-internal events to ACP session/update notifications.
 * 
 * The daemon's internal event system uses types like StreamChunk, ToolCallEvent,
 * and UsageEvent. The ACP protocol uses SessionUpdate with typed sub-objects
 * like agent_message_chunk, tool_call, usage_update, etc.
 * 
 * This adapter performs that translation.
 */
export class ACPNotificationAdapter {
  private wirings = new Map<string, {
    sessionId: string;
    agentId: string;
  }>();
  private deps: ACPNotificationAdapterDeps;

  constructor(deps: ACPNotificationAdapterDeps) {
    this.deps = deps;
  }

  /**
   * Wire a daemon agent's events to an ACP session's notifications.
   * When the daemon emits events for this agent, they'll be translated
   * to ACP session/update notifications.
   */
  wireAgentToSession(agentId: string, sessionId: string): void {
    this.wirings.set(agentId, { sessionId, agentId });
    this.deps.logger.debug('Wired agent to ACP session', { agentId, sessionId });
  }

  /** Remove the wiring when a session closes */
  unwireSession(sessionId: string): void {
    for (const [agentId, wiring] of this.wirings) {
      if (wiring.sessionId === sessionId) {
        this.wirings.delete(agentId);
        break;
      }
    }
  }

  /**
   * Convert a daemon ContentChunk to an ACP agent_message_chunk SessionUpdate.
   */
  toAgentMessageChunk(sessionId: string, chunk: { text: string }): SessionUpdate {
    return {
      type: 'agent_message_chunk',
      content: chunk.text,
    };
  }

  /**
   * Convert a daemon thinking chunk to an ACP agent_thought_chunk SessionUpdate.
   */
  toAgentThoughtChunk(sessionId: string, chunk: { text: string }): SessionUpdate {
    return {
      type: 'agent_thought_chunk',
      content: chunk.text,
    };
  }

  /**
   * Convert a daemon tool call to an ACP tool_call SessionUpdate.
   */
  toToolCall(toolCall: {
    id: string;
    name: string;
    arguments: string;
    status: string;
  }): SessionUpdate {
    return {
      type: 'tool_call',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      status: toolCall.status,
    };
  }

  /**
   * Convert daemon usage data to an ACP usage_update SessionUpdate.
   */
  toUsageUpdate(usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
  }): SessionUpdate {
    return {
      type: 'usage_update',
      usage,
    };
  }

  /**
   * Create a plan SessionUpdate for multi-step agent execution.
   */
  toPlan(entries: Array<{
    content: string;
    priority: number;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  }>): SessionUpdate {
    return {
      type: 'plan',
      entries,
    };
  }
}

/**
 * ACP SessionUpdate type — represents a single update to be sent
 * via the session/update notification.
 */
export type SessionUpdate =
  | { type: 'user_message_chunk'; content: string }
  | { type: 'agent_message_chunk'; content: string }
  | { type: 'agent_thought_chunk'; content: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; arguments: string; status: string }
  | { type: 'tool_call_update'; toolCallId: string; status: string; output?: string }
  | { type: 'plan'; entries: Array<{ content: string; priority: number; status: string }> }
  | { type: 'usage_update'; usage: { inputTokens: number; outputTokens: number; costUsd?: number } }
  | { type: 'session_info_update'; info: Record<string, unknown> }
  | { type: 'current_mode_update'; mode: string }
  | { type: 'available_commands_update'; commands: string[] };
```

### 1.10 SubprocessManager Implementation

The SubprocessManager tracks all child processes spawned by the daemon (MCP servers, tool executors, build runners, etc.). It monitors for stalls, enforces memory limits, and supports auto-restart for critical processes like MCP servers.

```typescript
// packages/daemon/src/processes/subprocess-manager.ts

import { spawn, ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

// ── Types ────────────────────────────────────────────

export interface SubprocessSpec {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;           // Max runtime before kill (default: 120_000)
  stallTimeoutMs?: number;      // No stdout/stderr for this long = stalled (default: 30_000)
  maxRestarts?: number;         // Auto-restart on crash (default: 0)
  memoryLimitMb?: number;       // RSS limit (default: 512)
}

export interface SubprocessState {
  id: string;
  pid: number;
  status: 'starting' | 'running' | 'stalled' | 'killed' | 'exited' | 'failed';
  exitCode: number | null;
  startedAt: Date;
  lastOutputAt: Date;           // Updated on any stdout/stderr
  restartCount: number;
  memoryUsageMb: number;
}

export type SubprocessEvent =
  | { type: 'process:stalled'; processId: string; pid: number }
  | { type: 'process:killed'; processId: string; pid: number; reason: string }
  | { type: 'process:exited'; processId: string; pid: number; exitCode: number }
  | { type: 'process:restarted'; processId: string; pid: number; restartCount: number }
  | { type: 'process:output'; processId: string; stream: 'stdout' | 'stderr'; data: string };

export interface SubprocessManagerDeps {
  logger: Logger;
  metrics: Metrics;
}

// ── Implementation ───────────────────────────────────

export class SubprocessManager extends EventEmitter {
  private processes = new Map<string, {
    spec: SubprocessSpec;
    child: ChildProcess;
    state: SubprocessState;
    stallTimer: ReturnType<typeof setTimeout> | null;
    timeoutTimer: ReturnType<typeof setTimeout> | null;
    memoryCheckInterval: ReturnType<typeof setInterval> | null;
    outputBuffer: string[];
  }>();

  private deps: SubprocessManagerDeps;

  constructor(deps: SubprocessManagerDeps) {
    super();
    this.deps = deps;
  }

  async start(): Promise<void> {
    this.deps.logger.info('SubprocessManager started');
  }

  // ── Spawn a Process ────────────────────────────

  async spawnProcess(spec: SubprocessSpec): Promise<SubprocessState> {
    if (this.processes.has(spec.id)) {
      throw new Error(`Process "${spec.id}" already exists`);
    }

    const stallTimeoutMs = spec.stallTimeoutMs ?? 30_000;
    const timeoutMs = spec.timeoutMs ?? 120_000;
    const memoryLimitMb = spec.memoryLimitMb ?? 512;

    this.deps.logger.info('Spawning subprocess', {
      id: spec.id,
      command: spec.command,
      args: spec.args,
      cwd: spec.cwd,
    });

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const state: SubprocessState = {
      id: spec.id,
      pid: child.pid!,
      status: 'starting',
      exitCode: null,
      startedAt: new Date(),
      lastOutputAt: new Date(),
      restartCount: 0,
      memoryUsageMb: 0,
    };

    const entry = {
      spec,
      child,
      state,
      stallTimer: null as ReturnType<typeof setTimeout> | null,
      timeoutTimer: null as ReturnType<typeof setTimeout> | null,
      memoryCheckInterval: null as ReturnType<typeof setInterval> | null,
      outputBuffer: [] as string[],
    };

    this.processes.set(spec.id, entry);

    // ── Stdout Handler ───────────────────────────
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      entry.state.lastOutputAt = new Date();
      entry.state.status = 'running';
      entry.outputBuffer.push(text);

      // Reset stall timer on any output
      this.resetStallTimer(spec.id, stallTimeoutMs);

      this.emit('process:output', {
        type: 'process:output',
        processId: spec.id,
        stream: 'stdout',
        data: text,
      });
    });

    // ── Stderr Handler ───────────────────────────
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8');
      entry.state.lastOutputAt = new Date();
      entry.outputBuffer.push(text);

      // Reset stall timer on any output (stderr counts too)
      this.resetStallTimer(spec.id, stallTimeoutMs);

      this.emit('process:output', {
        type: 'process:output',
        processId: spec.id,
        stream: 'stderr',
        data: text,
      });
    });

    // ── Exit Handler ─────────────────────────────
    child.on('exit', (code, signal) => {
      entry.state.exitCode = code;
      entry.state.status = code === 0 ? 'exited' : 'failed';

      // Clear timers
      if (entry.stallTimer) clearTimeout(entry.stallTimer);
      if (entry.timeoutTimer) clearTimeout(entry.timeoutTimer);
      if (entry.memoryCheckInterval) clearInterval(entry.memoryCheckInterval);

      this.emit('process:exited', {
        type: 'process:exited',
        processId: spec.id,
        pid: child.pid!,
        exitCode: code ?? -1,
      });

      this.deps.logger.info('Subprocess exited', {
        id: spec.id,
        exitCode: code,
        signal,
      });

      // Auto-restart if configured
      const maxRestarts = spec.maxRestarts ?? 0;
      if (entry.state.restartCount < maxRestarts && code !== 0) {
        this.restartProcess(spec.id);
      }
    });

    // ── Error Handler ────────────────────────────
    child.on('error', (error) => {
      entry.state.status = 'failed';
      this.deps.logger.error('Subprocess error', { id: spec.id, error });
    });

    // ── Stall Detection ──────────────────────────
    this.resetStallTimer(spec.id, stallTimeoutMs);

    // ── Hard Timeout ─────────────────────────────
    entry.timeoutTimer = setTimeout(() => {
      this.deps.logger.warn('Subprocess exceeded timeout, killing', {
        id: spec.id,
        timeoutMs,
      });
      this.killProcess(spec.id, 'timeout');
    }, timeoutMs);
    entry.timeoutTimer.unref();

    // ── Memory Monitoring ────────────────────────
    entry.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage(spec.id, memoryLimitMb);
    }, 5_000); // Check every 5 seconds
    entry.memoryCheckInterval.unref();

    return state;
  }

  // ── Stall Detection ────────────────────────────

  private resetStallTimer(processId: string, stallTimeoutMs: number): void {
    const entry = this.processes.get(processId);
    if (!entry) return;

    // Clear existing stall timer
    if (entry.stallTimer) {
      clearTimeout(entry.stallTimer);
    }

    // Set new stall timer
    entry.stallTimer = setTimeout(() => {
      this.handleStall(processId);
    }, stallTimeoutMs);
    entry.stallTimer.unref();
  }

  private async handleStall(processId: string): Promise<void> {
    const entry = this.processes.get(processId);
    if (!entry) return;

    this.deps.logger.warn('Subprocess stalled (no output for stallTimeoutMs)', {
      id: processId,
      pid: entry.state.pid,
      lastOutputAt: entry.state.lastOutputAt.toISOString(),
    });

    entry.state.status = 'stalled';

    this.emit('process:stalled', {
      type: 'process:stalled',
      processId,
      pid: entry.state.pid,
    });

    // Kill the stalled process: SIGTERM first, then SIGKILL after 5s
    await this.gracefulKill(processId, 'stall');
  }

  // ── Memory Monitoring ──────────────────────────

  private checkMemoryUsage(processId: string, memoryLimitMb: number): void {
    const entry = this.processes.get(processId);
    if (!entry || entry.state.status !== 'running') return;

    try {
      // Read RSS from /proc/[pid]/status (Linux) or use process.memoryUsage() approximation
      const rssMb = this.getProcessRss(entry.state.pid);
      entry.state.memoryUsageMb = rssMb;

      if (rssMb > memoryLimitMb) {
        this.deps.logger.warn('Subprocess exceeded memory limit, killing', {
          id: processId,
          pid: entry.state.pid,
          rssMb,
          limitMb: memoryLimitMb,
        });

        this.killProcess(processId, 'memory_limit');
      }
    } catch {
      // /proc not available (macOS, Windows) — skip memory check
    }
  }

  private getProcessRss(pid: number): number {
    // Linux: read from /proc/[pid]/status
    try {
      const fs = require('fs');
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
      const vmRssMatch = status.match(/VmRSS:\s*(\d+)\s*kB/);
      if (vmRssMatch) {
        return parseInt(vmRssMatch[1], 10) / 1024; // kB → MB
      }
    } catch {
      // Fallback: not available on macOS/Windows
    }
    return 0;
  }

  // ── Kill / Restart ─────────────────────────────

  async killProcess(processId: string, reason: string = 'manual'): Promise<void> {
    const entry = this.processes.get(processId);
    if (!entry) return;

    await this.gracefulKill(processId, reason);
  }

  private async gracefulKill(processId: string, reason: string): Promise<void> {
    const entry = this.processes.get(processId);
    if (!entry) return;

    const child = entry.child;

    // 1. Send SIGTERM
    try {
      child.kill('SIGTERM');
    } catch {
      // Process may already be dead
    }

    // 2. Wait 5 seconds, then SIGKILL
    await new Promise<void>((resolve) => {
      const forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already dead
        }
        resolve();
      }, 5_000);
      forceKillTimer.unref();

      // If the process exits before the timer, resolve immediately
      child.on('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });

    entry.state.status = 'killed';

    this.emit('process:killed', {
      type: 'process:killed',
      processId,
      pid: entry.state.pid,
      reason,
    });

    this.deps.logger.info('Subprocess killed', { id: processId, reason });
  }

  private async restartProcess(processId: string): Promise<void> {
    const entry = this.processes.get(processId);
    if (!entry) return;

    entry.state.restartCount++;

    this.deps.logger.info('Restarting subprocess', {
      id: processId,
      restartCount: entry.state.restartCount,
    });

    // Remove old entry
    this.processes.delete(processId);

    // Spawn a new process with the same spec
    try {
      await this.spawnProcess(entry.spec);

      this.emit('process:restarted', {
        type: 'process:restarted',
        processId,
        pid: entry.child.pid!,
        restartCount: entry.state.restartCount,
      });
    } catch (error) {
      this.deps.logger.error('Failed to restart subprocess', { id: processId, error });
    }
  }

  // ── Query ──────────────────────────────────────

  listProcesses(): SubprocessState[] {
    return Array.from(this.processes.values()).map(e => e.state);
  }

  getProcess(processId: string): SubprocessState | undefined {
    return this.processes.get(processId)?.state;
  }

  getOutput(processId: string): string[] {
    return this.processes.get(processId)?.outputBuffer ?? [];
  }

  // ── Lifecycle ──────────────────────────────────

  async killAll(): Promise<void> {
    const killPromises = Array.from(this.processes.keys()).map(id =>
      this.killProcess(id, 'daemon_shutdown')
    );
    await Promise.allSettled(killPromises);
    this.processes.clear();
  }
}
```

### 1.11 Terminal Bridge (ACP Terminal → Subprocess Mapping)

The ACP protocol provides `terminal/create`, `terminal/output`, `terminal/kill`, etc. These map directly to the SubprocessManager. Each ACP terminal is a managed subprocess.

```typescript
// packages/daemon/src/processes/terminal-bridge.ts

import { SubprocessManager, SubprocessSpec } from './subprocess-manager.js';

export interface TerminalBridgeDeps {
  subprocessManager: SubprocessManager;
  logger: Logger;
}

/**
 * Maps ACP terminal methods to SubprocessManager operations.
 * Each ACP terminal/create call spawns a new subprocess.
 * Each terminal maps 1:1 to a subprocess entry.
 */
export class TerminalBridge {
  private terminalMap = new Map<string, string>(); // terminalId → subprocessId
  private deps: TerminalBridgeDeps;

  constructor(deps: TerminalBridgeDeps) {
    this.deps = deps;
  }

  /**
   * ACP terminal/create — execute a command in a new terminal.
   * Maps to SubprocessManager.spawnProcess().
   */
  async create(terminalId: string, request: {
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ pid: number }> {
    const spec: SubprocessSpec = {
      id: `terminal_${terminalId}`,
      command: request.command,
      args: request.args ?? [],
      cwd: request.cwd,
      env: request.env,
      timeoutMs: request.timeoutMs ?? 60_000,
      stallTimeoutMs: 30_000,
      maxRestarts: 0, // Terminal commands should not auto-restart
      memoryLimitMb: 256,
    };

    const state = await this.deps.subprocessManager.spawnProcess(spec);
    this.terminalMap.set(terminalId, spec.id);

    return { pid: state.pid };
  }

  /**
   * ACP terminal/output — get accumulated output from a terminal.
   * Maps to SubprocessManager.getOutput().
   */
  getOutput(terminalId: string): string {
    const subprocessId = this.terminalMap.get(terminalId);
    if (!subprocessId) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    const output = this.deps.subprocessManager.getOutput(subprocessId);
    return output.join('');
  }

  /**
   * ACP terminal/wait_for_exit — wait for the terminal command to finish.
   * Returns a promise that resolves when the subprocess exits.
   */
  async waitForExit(terminalId: string, timeoutMs: number = 30_000): Promise<{
    exitCode: number;
    output: string;
  }> {
    const subprocessId = this.terminalMap.get(terminalId);
    if (!subprocessId) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Terminal wait_for_exit timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();

      const handler = (event: SubprocessEvent) => {
        if (event.type === 'process:exited' && event.processId === subprocessId) {
          clearTimeout(timer);
          this.deps.subprocessManager.removeListener('process:exited', handler);
          resolve({
            exitCode: event.exitCode,
            output: this.deps.subprocessManager.getOutput(subprocessId).join(''),
          });
        }
      };

      this.deps.subprocessManager.on('process:exited', handler);

      // Check if already exited
      const state = this.deps.subprocessManager.getProcess(subprocessId);
      if (state && (state.status === 'exited' || state.status === 'failed' || state.status === 'killed')) {
        clearTimeout(timer);
        this.deps.subprocessManager.removeListener('process:exited', handler);
        resolve({
          exitCode: state.exitCode ?? -1,
          output: this.deps.subprocessManager.getOutput(subprocessId).join(''),
        });
      }
    });
  }

  /**
   * ACP terminal/kill — kill the terminal command.
   * Maps to SubprocessManager.killProcess().
   */
  async kill(terminalId: string): Promise<void> {
    const subprocessId = this.terminalMap.get(terminalId);
    if (!subprocessId) {
      throw new Error(`Terminal not found: ${terminalId}`);
    }

    await this.deps.subprocessManager.killProcess(subprocessId, 'terminal_kill');
  }

  /**
   * ACP terminal/release — release the terminal (don't kill, just untrack).
   */
  release(terminalId: string): void {
    this.terminalMap.delete(terminalId);
  }
}
```

### 1.12 Service Host with Sleep/Wake

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

### 1.13 Agent Host (Multi-Agent Lifecycle with Folder Scoping)

The daemon manages multiple concurrent agents with folder-based memory scopes. The scope is derived from the working directory, not agent-specified.

```typescript
// packages/daemon/src/agents/agent-host.ts

import { MemoryEngine } from '@agentsy/memory';
import { ScopeManager } from './scope-manager.js';

export interface AgentSpec {
  id: string;
  name: string;
  role: string;                    // 'coder' | 'researcher' | 'planner' | 'general'
  memoryScope: string;             // Folder-based scope (e.g., 'folder:a1b2c3')
  additionalDirectories?: string[];
  mcpServers?: MCPServerConfig[];
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
    scopeManager: ScopeManager;
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

    // Register agent's folder-based memory scope
    await this.deps.scopeManager.ensureScope(spec.memoryScope);

    // Start MCP servers if provided
    if (spec.mcpServers && spec.mcpServers.length > 0) {
      for (const mcpServer of spec.mcpServers) {
        await this.deps.scopeManager.registerMCPServer(spec.memoryScope, mcpServer);
      }
    }

    this.deps.logger.info('Agent spawned', {
      id: spec.id,
      role: spec.role,
      scope: spec.memoryScope,
      additionalDirs: spec.additionalDirectories?.length ?? 0,
    });
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

  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
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

  /**
   * Stream messages from an agent. This is the main entry point
   * for both IPC and ACP clients.
   */
  async *streamMessages(
    agentId: string,
    messages: Message[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<AgentStreamEvent> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);

    agent.state = 'running';
    agent.lastActivity = new Date();

    try {
      // The actual LLM call happens via the daemon's streaming service
      // This will be fully wired in Phase 5 (Streaming Architecture)
      // For now, yield a placeholder event
      yield {
        type: 'content',
        text: '',
      };
    } finally {
      agent.state = 'idle';
    }
  }

  // ── Shutdown ───────────────────────────────────

  async shutdown(): Promise<void> {
    for (const [id] of this.agents) {
      await this.kill(id);
    }
  }

  async initialize(): Promise<void> {
    this.deps.logger.info('Agent host initialized');
  }
}

interface ActiveStream {
  agentId: string;
  abort: AbortController;
}

type AgentStreamEvent =
  | { type: 'content'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; arguments: string }
  | { type: 'tool_call_result'; toolCallId: string; success: boolean; output: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: 'done'; stopReason: string };
```

### 1.14 Scope Manager (Folder-Based Scoping)

```typescript
// packages/daemon/src/agents/scope-manager.ts

import { createHash } from 'crypto';

export interface ScopeConfig {
  memory: {
    enabled: boolean;
    consolidationThreshold: number;
    decayIntervalMs: number;
  };
}

export interface ScopeManagerDeps {
  db: DatabaseConnection;
  logger: Logger;
}

export class ScopeManager {
  private scopes = new Map<string, {
    key: string;
    absolutePath: string;
    additionalDirectories: string[];
    createdAt: Date;
    mcpServers: MCPServerConfig[];
  }>();

  private deps: ScopeManagerDeps;

  constructor(deps: ScopeManagerDeps) {
    this.deps = deps;
  }

  async initialize(): Promise<void> {
    // Load existing scopes from database
    const rows = await this.deps.db.query<{
      scope_key: string;
      absolute_path: string;
      additional_directories: string;
      created_at: string;
    }>('SELECT * FROM folder_scopes');

    for (const row of rows) {
      this.scopes.set(row.scope_key, {
        key: row.scope_key,
        absolutePath: row.absolute_path,
        additionalDirectories: JSON.parse(row.additional_directories || '[]'),
        createdAt: new Date(row.created_at),
        mcpServers: [],
      });
    }

    this.deps.logger.info('Scope manager initialized', { scopeCount: this.scopes.size });
  }

  /**
   * Derive a scope key from an absolute path.
   * Format: folder:[sha256-hash-first-12-chars]
   */
  static deriveScopeKey(absolutePath: string): string {
    const hash = createHash('sha256').update(absolutePath).digest('hex');
    return `folder:${hash.slice(0, 12)}`;
  }

  /**
   * Ensure a scope exists for the given key. Create it if it doesn't.
   */
  async ensureScope(scopeKey: string): Promise<void> {
    if (this.scopes.has(scopeKey)) return;

    // The scope key was created from a path; we need to store the mapping
    // For now, just register it
    this.deps.logger.info('Creating folder scope', { scopeKey });
  }

  /**
   * Create a scope from an absolute path.
   */
  async createScopeFromPath(absolutePath: string, additionalDirectories: string[] = []): Promise<string> {
    const scopeKey = ScopeManager.deriveScopeKey(absolutePath);

    if (this.scopes.has(scopeKey)) {
      return scopeKey;
    }

    const scope = {
      key: scopeKey,
      absolutePath,
      additionalDirectories,
      createdAt: new Date(),
      mcpServers: [] as MCPServerConfig[],
    };

    this.scopes.set(scopeKey, scope);

    // Persist to database
    await this.deps.db.execute(
      `INSERT INTO folder_scopes (scope_key, absolute_path, additional_directories, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(scope_key) DO NOTHING`,
      [scopeKey, absolutePath, JSON.stringify(additionalDirectories), scope.createdAt.toISOString()]
    );

    this.deps.logger.info('Folder scope created', { scopeKey, absolutePath });
    return scopeKey;
  }

  /**
   * Get the absolute path for a scope key.
   */
  getPathForScope(scopeKey: string): string | undefined {
    return this.scopes.get(scopeKey)?.absolutePath;
  }

  /**
   * Get additional directories for a scope.
   */
  getAdditionalDirectories(scopeKey: string): string[] {
    return this.scopes.get(scopeKey)?.additionalDirectories ?? [];
  }

  /**
   * Register an MCP server for a scope.
   */
  async registerMCPServer(scopeKey: string, config: MCPServerConfig): Promise<void> {
    const scope = this.scopes.get(scopeKey);
    if (!scope) throw new Error(`Scope not found: ${scopeKey}`);

    scope.mcpServers.push(config);

    this.deps.logger.info('MCP server registered for scope', {
      scopeKey,
      serverName: config.name,
    });
  }

  /**
   * Get all MCP servers for a scope.
   */
  getMCPServers(scopeKey: string): MCPServerConfig[] {
    return this.scopes.get(scopeKey)?.mcpServers ?? [];
  }

  /**
   * List all scopes.
   */
  listScopes(): Array<{ key: string; absolutePath: string; additionalDirectories: string[] }> {
    return Array.from(this.scopes.values()).map(s => ({
      key: s.key,
      absolutePath: s.absolutePath,
      additionalDirectories: s.additionalDirectories,
    }));
  }
}

interface MCPServerConfig {
  name: string;
  transport: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}
```

### 1.15 Job Scheduler (Persistent, SQLite-Backed)

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

  getRunningCount(): number {
    // Count active timers
    return this.timers.size;
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

### 1.16 Daemon Configuration Schema

```typescript
// packages/daemon/src/config.ts

export interface DaemonConfig {
  // ── IPC ──────────────────────────────────────
  ipc: {
    socketPath: string;            // Unix socket path
    maxConnections: number;        // Max concurrent clients
    requestTimeoutMs: number;      // Per-request timeout
  };

  // ── ACP ──────────────────────────────────────
  acp: {
    enabled: boolean;              // Enable ACP agent server
    transport: 'stdio' | 'websocket';
    websocketPort: number;         // Port for ACP WebSocket transport
    maxSessions: number;           // Max concurrent ACP sessions
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

  // ── Subprocess Management ─────────────────────
  subprocess: {
    defaultTimeoutMs: number;      // Default max runtime for spawned processes
    defaultStallTimeoutMs: number; // Default stall detection timeout
    defaultMemoryLimitMb: number;  // Default RSS limit
    memoryCheckIntervalMs: number; // How often to check process memory
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
  acp: {
    enabled: true,
    transport: 'websocket',
    websocketPort: 9380,
    maxSessions: 5,
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
  subprocess: {
    defaultTimeoutMs: 120_000,    // 2 minutes
    defaultStallTimeoutMs: 30_000, // 30 seconds
    defaultMemoryLimitMb: 512,
    memoryCheckIntervalMs: 5_000,  // 5 seconds
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

### 1.17 Supervisor (Crash Recovery)

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

### 1.18 CLI Integration

The CLI becomes a thin client. When the user runs `agentsy chat`, the CLI:

1. Checks if the daemon is running
2. If not, starts it in the background
3. Connects via IPC
4. Sends the user's message and streams the response

```typescript
// packages/cli/src/commands/chat.ts (simplified)

import { IPCClient } from '@agentsy/daemon/ipc-client';
import { ScopeManager } from '@agentsy/daemon/scope-manager';

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

    // Determine folder-based scope from current working directory
    const cwd = process.cwd();
    const scopeKey = ScopeManager.deriveScopeKey(cwd);

    // Spawn or reuse an agent for this folder scope
    const agentId = await this.getOrCreateAgent(client, scopeKey, cwd);

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

  private async getOrCreateAgent(client: IPCClient, scopeKey: string, cwd: string): Promise<string> {
    // Check if an agent already exists for this folder
    const agents = await client.request('agent.list') as Array<{ spec: { id: string; memoryScope: string } }>;
    const existing = agents.find(a => a.spec.memoryScope === scopeKey);
    if (existing) return existing.spec.id;

    // Create a new agent for this folder
    const result = await client.request('agent.spawn', {
      id: `cli_${Date.now()}`,
      name: `CLI: ${path.basename(cwd)}`,
      role: 'general',
      memoryScope: scopeKey,
    });

    return (result as { id: string }).id;
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
| `renderers` | 120 | **Keep** | — |
| `ui` | 15 | **Merge** | `renderers` — UI store/bridge is part of the rendering layer |
| `connectors` | 13 | **Merge** | `daemon` — third-party connectors are daemon-hosted |
| `mcp` | 11 | **Merge** | `daemon` — MCP server is daemon-hosted |
| `ecc-integration` | 0 (doesn't exist) | **Skip** | — |
| `vscode` | 75 | **Remove** | — |
| `cli` | 71 | **Keep** | — |

**Note on vscode package removal**: The `@agentsy/vscode` package is eliminated entirely. Editor integration is handled by the daemon's ACP Agent interface (Phase 1, Section 1.6). Any ACP-compatible editor (Zed, VS Code with ACP Client extension) can connect to the daemon without custom extension code.

### Post-Consolidation Package Layout

```text
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
```

**Reduction**: 27 → 23 packages (merge 4, create 1 new, remove 1 vscode, move 1 to root). The `scripts/` package moves to root tooling. The `vscode/` package is deleted entirely.

### Migration Steps

1. Move `packages/shared/src/**` → `packages/types/src/shared/`
2. Move `packages/workflows/IMPLEMENTATION-PLAN.md` → `packages/orchestrator/docs/workflows-plan.md`
3. Move `packages/mcp/src/**` → `packages/daemon/src/mcp/`
4. Move `packages/connectors/src/**` → `packages/daemon/src/connectors/`
5. Move `packages/ui/src/**` → `packages/renderers/src/ui/`
6. Move `packages/scripts/**` → `scripts/` at repo root
7. Delete `packages/vscode/` — replaced by ACP Agent integration
8. Update all `package.json` dependencies and imports (remove references to `@agentsy/vscode`)
9. Update `pnpm-workspace.yaml`
10. Run `pnpm install && pnpm build && pnpm test` — must be green

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

```text
CLI → Runtime → Gateway → Providers → LLM APIs
                  ↑
           (routing, health,
            quota, circuit breaker)
```

### Target Architecture

```text
CLI ─IPC─→ Daemon (owns routing, health, quota, circuit breaker)
                ↓
           Providers → LLM APIs

Editors ─ACP─→ Daemon (same routing, health, quota)
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

```text
┌─────────┐     IPC      ┌──────────────────────────────────┐
│  CLI /   │◄────────────►│           DAEMON                  │
│  TUI     │  stream.     │                                    │
│          │  chunk       │  Routing Service → selects model  │
│          │  stream.     │       ↓                            │
│          │  end         │  Provider Adapter → LLM API        │
│          │              │       ↓                            │
│          │              │  LLMStreamProcessor → events       │
│          │              │       ↓                            │
│          │              │  Hook Pipeline → transforms        │
│          │              │       ↓                            │
│          │              │  IPC Server → stream notifications │
└─────────┘              └──────────────────────────────────┘

┌─────────┐     ACP      ┌──────────────────────────────────┐
│  Zed /   │◄────────────►│           DAEMON                  │
│  VSCode  │  session/    │                                    │
│  ACP     │  update      │  (same pipeline as above)         │
│  Client  │              │       ↓                            │
│          │              │  ACP Notification Adapter           │
│          │              │  → session/update with chunks      │
└─────────┘              └──────────────────────────────────┘
```

The daemon owns the full streaming pipeline. For IPC clients (CLI/TUI), events are sent as `stream.chunk` JSON-RPC notifications. For ACP clients (editors), the same events are mapped to `session/update` notifications with typed `SessionUpdate` payloads. The key insight is that the `LLMStreamProcessor` from `@agentsy/core` already does the heavy lifting — we just need to wire it into the daemon and pipe events over both transports.

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

        // Send chunk notification to IPC client
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

  getActiveStreamCount(): number {
    return this.activeStreams.size;
  }

  get state(): ServiceState { return this._state; }
}
```

### 5.2 Mapping Streaming to ACP Session/Update Notifications

For ACP clients, the `stream.chunk` events from the IPC protocol must be mapped to ACP `session/update` notifications. This mapping is handled by the `ACPNotificationAdapter` (Section 1.9):

| IPC Event | ACP SessionUpdate Type |
|-----------|----------------------|
| `stream.chunk` (content) | `agent_message_chunk` with `content` |
| `stream.chunk` (thinking) | `agent_thought_chunk` with `content` |
| `stream.chunk` (tool_call_start) | `tool_call` with `toolCallId`, `toolName`, `arguments`, `status: "running"` |
| `stream.chunk` (tool_call_result) | `tool_call_update` with `toolCallId`, `status: "completed"`, `output` |
| `stream.end` (usage) | `usage_update` with `inputTokens`, `outputTokens`, `costUsd` |
| `stream.end` | (no additional notification — prompt handler returns `stopReason`) |

This dual-transport streaming means the same daemon pipeline serves both IPC and ACP clients without any duplication of the streaming logic.

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
  | 'service.awake'
  | 'process.stalled'
  | 'process.killed'
  | 'process.exited'
  | 'acp.session.created'
  | 'acp.session.closed';

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

## 11. Phase 8 — ACP Agent & Multi-Agent Deployment

**Priority**: P2 — After Phase 5  
**Estimated effort**: ~45 hours  
**Branch**: `feat/acp-agent-multi-agent`

This phase replaces the v1 plan's VS Code extension work with ACP Agent integration and adds multi-agent scope isolation. The daemon's ACP server was built in Phase 1 (Sections 1.6–1.9); this phase wires it to the streaming pipeline, adds tool execution through ACP's `terminal/*` methods, and implements the full multi-agent deployment model.

### 8.1 ACP Agent Integration: Full Wiring

The ACP server skeleton from Phase 1 needs to be fully connected to the daemon's streaming, routing, and tool execution subsystems.

```typescript
// packages/daemon/src/acp/acp-server.ts (ENHANCED from Phase 1)

// Additional handler implementations beyond the Phase 1 skeleton:

'fs/readTextFile': async (params) => {
  const { path: filePath, sessionId } = params;
  const bridge = this.activeSessions.get(sessionId);
  if (!bridge) throw new Error(`Session not found: ${sessionId}`);

  // Verify the file path is within the session's cwd scope
  const resolvedPath = resolve(bridge.cwd, filePath);
  if (!resolvedPath.startsWith(bridge.cwd)) {
    throw new Error(`Access denied: path outside session scope`);
  }

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return { content };
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
},

'fs/writeTextFile': async (params) => {
  const { path: filePath, content, sessionId } = params;
  const bridge = this.activeSessions.get(sessionId);
  if (!bridge) throw new Error(`Session not found: ${sessionId}`);

  // Verify the file path is within the session's cwd scope
  const resolvedPath = resolve(bridge.cwd, filePath);
  if (!resolvedPath.startsWith(bridge.cwd)) {
    throw new Error(`Access denied: path outside session scope`);
  }

  try {
    await fs.writeFile(resolvedPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to write file: ${error.message}`);
  }
},

'requestPermission': async (params) => {
  const { sessionId, toolName, arguments: args } = params;
  // For daemon mode, we auto-approve based on the agent's capabilities
  // In server mode, this would prompt the user via the ACP client
  return { approved: true };
},
```

### 8.2 ACP Terminal Integration: Tool Execution

When the agent needs to execute a tool that runs a command (e.g., `npm test`, `git status`), it uses the ACP `terminal/*` methods, which are routed through the TerminalBridge to the SubprocessManager:

```typescript
// packages/daemon/src/acp/terminal-integration.ts

export class ACPTerminalIntegration {
  private terminalBridge: TerminalBridge;

  constructor(deps: {
    terminalBridge: TerminalBridge;
    logger: Logger;
  }) {
    this.terminalBridge = deps.terminalBridge;
  }

  /**
   * Execute a command on behalf of an ACP agent.
   * Uses the terminal/create → terminal/output → terminal/wait_for_exit flow.
   */
  async executeCommand(
    sessionId: string,
    command: string,
    args: string[],
    cwd: string,
    options?: {
      timeoutMs?: number;
      env?: Record<string, string>;
    }
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const terminalId = `${sessionId}_${Date.now()}`;

    try {
      // Create the terminal (spawns subprocess)
      const { pid } = await this.terminalBridge.create(terminalId, {
        command,
        args,
        cwd,
        env: options?.env,
        timeoutMs: options?.timeoutMs,
      });

      // Wait for completion
      const result = await this.terminalBridge.waitForExit(terminalId, options?.timeoutMs);

      // Get the full output
      const output = this.terminalBridge.getOutput(terminalId);

      return {
        exitCode: result.exitCode,
        stdout: output,
        stderr: '', // SubprocessManager combines stdout/stderr in output buffer
      };
    } finally {
      // Release the terminal (untrack, don't kill)
      this.terminalBridge.release(terminalId);
    }
  }
}
```

### 8.3 Multi-Agent Scope Isolation with Folder Scoping

Each agent gets an isolated memory scope based on its folder. The scope key is derived from the working directory using `ScopeManager.deriveScopeKey(absolutePath)`:

```typescript
// packages/daemon/src/agents/scope-manager.ts (continued from Phase 1)

export class ScopeManager {
  // ... (methods from Phase 1) ...

  /**
   * Cross-scope memory sharing. An agent in scope A can access
   * shared memories from scope B (e.g., cross-project knowledge).
   * This is used when ACP provides `additionalDirectories`.
   */
  async crossScopeRecall(
    requestingScope: string,
    query: string,
    options: { includeScopes: string[]; minRelevance: number }
  ): Promise<CrossScopeResult[]> {
    const results: CrossScopeResult[] = [];

    for (const scopeId of options.includeScopes) {
      // Resolve scope keys for additional directories
      const scope = this.scopes.get(scopeId);
      if (!scope) continue;

      // Query memory in that scope
      const memories = await this.memory.recall({
        query,
        scope: scopeId,
        minRelevance: options.minRelevance,
        limit: 5,
      });

      results.push({
        scopeId,
        absolutePath: scope.absolutePath,
        memories,
        accessible: true,
      });
    }

    return results;
  }
}
```

### 8.4 Default Agents

Implement the 4 default agents from `plan/32-DEFAULT-AGENTS-IMPLEMENTATION-PLAN.md`. These are now scoped to folders, not project IDs:

```yaml
# Agent definitions are loaded from YAML config
agents:
  coder:
    role: coder
    model_tier: frontier
    memory_scope: "folder:{cwd_hash}"   # Folder-based scope
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
    memory_scope: "folder:{cwd_hash}"
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
    memory_scope: "folder:{cwd_hash}"
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
    memory_scope: "folder:{cwd_hash}"
    capabilities:
      - chat
      - memory_recall
      - memory_capture
    budget:
      max_tokens_per_turn: 4000
      max_tokens_per_session: 25000
```

### 8.5 ACP Client Compatibility Matrix

The following editors and tools work with Agentsy's ACP Agent out of the box:

| Client | ACP Support | How to Connect |
|--------|------------|----------------|
| **Zed** | Native (built-in) | Settings → Agent → Select "Agentsy" → daemon WebSocket URL |
| **VS Code** | ACP Client extension (`formulahendry.acp-client`) | Install extension → Configure agent → `ws://localhost:9380` |
| **JetBrains** | ACP support in development | Future: native integration |
| **CLI** | Not ACP — uses IPC | `agentsy chat` → Unix socket |
| **TUI** | Not ACP — uses IPC | `agentsy tui` → Unix socket |

### 8.6 Server Deployment (Future)

The daemon's IPC and ACP layers are both transport-agnostic. When server deployment is needed, add an HTTP/WS transport on the same method signatures:

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

    // Mount WebSocket for streaming + ACP
    this.server.ws('/stream', this.handleWebSocket);
    this.server.ws('/acp', this.handleACPWebSocket);

    await this.server.listen(this.config.port, this.config.host);
  }
}
```

**Note**: Full server deployment (multi-tenancy, authentication, TLS, rate limiting) is a separate work stream. The daemon architecture supports it, but the implementation is deferred until the local multi-agent mode is stable.

---

## 12. Phase 9 — Missing Capabilities

**Priority**: P3 — After Phase 8  
**Estimated effort**: ~50 hours

These are capabilities that the framework is missing from an AI agent best-practices perspective. They're not bugs — they're features that competing frameworks have and users will expect. The VS Code extension items from v1 have been removed and replaced with ACP-specific capabilities.

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
        memoryScope: a.spec.memoryScope,
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
      subprocesses: this.subprocessManager.listProcesses().map(p => ({
        id: p.id,
        pid: p.pid,
        status: p.status,
        memoryUsageMb: p.memoryUsageMb,
        restartCount: p.restartCount,
      })),
      acp: {
        enabled: this.daemon.acp !== null,
        activeSessions: this.activeACPSessions.size,
      },
    };
  }
}
```

### 9.7 ACP-Specific Capabilities

These capabilities are specific to the ACP integration and must be implemented for full ACP compliance:

**Image Support in Prompts** (`promptCapabilities.image: true`): Currently disabled. To enable, the daemon must accept base64-encoded images from the ACP client, forward them to vision-capable models (e.g., GPT-4V, Claude 3.5 Sonnet), and handle the image content blocks in the streaming pipeline. This requires updating the `UniversalClient.stream()` method to accept image content blocks and the `ACPSessionBridge.handlePrompt()` to pass images through.

**Audio Support in Prompts** (`promptCapabilities.audio: true`): Currently disabled. To enable, integrate the ASR pipeline from `@agentsy/core/asr` (if it exists) or add a new ASR module that transcribes audio before sending to the LLM.

**MCP Server Management via ACP**: When an ACP client provides `mcpServers` in `session/new`, the daemon should start those MCP servers as managed subprocesses using the `SubprocessManager`, connect to them, and make their tools available to the agent for that session.

**ACP Session Persistence**: ACP sessions should survive daemon restarts. When the daemon restarts, it should restore active ACP sessions from the SQLite database, re-create the agent instances, and allow clients to resume. This requires the `session/load` and `session/resume` methods to query persisted session state.

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
       VALUES (?, ?, ?, ?, ?, ?)
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

```text
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
vscode/          (75)   ← DELETE (replaced by ACP Agent)
workflows/       (1)    ← Merge into orchestrator
```

### After (23 packages + root scripts)

```text
agents/          ← Keep
cli/             ← Keep (thin daemon client)
core/            ← Keep
daemon/          ← NEW (absorbs mcp, connectors, acp, processes)
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
orchestrator/    ← Keep (absorbs workflows)

scripts/         ← Root-level tooling (not a package)
```

**Note**: The `vscode/` package is completely removed. Editor integration is handled by the daemon's ACP Agent interface.

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

```text
{"jsonrpc":"2.0","id":"1","method":"agent.list","params":{}}\n
{"jsonrpc":"2.0","id":"1","result":[{"id":"coder-1","role":"coder","state":"idle"}]}\n
```

### Streaming Protocol

```text
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
| -32007 | Process not found |
| -32008 | Process stalled |
| -32009 | ACP session not found |

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

## Appendix D — ACP Protocol Mapping

This appendix maps every ACP method to the corresponding daemon operation, showing how the ACP Agent interface connects to the daemon's internal subsystems.

### ACP Client → Agent Methods (Daemon Handles)

| ACP Method | Daemon Operation | Internal Component | Notes |
|------------|-----------------|-------------------|-------|
| `initialize` | Negotiate capabilities | `ACPServer` | Returns `AGENT_CAPABILITIES` |
| `authenticate` | Validate auth token | `ACPServer` | Local mode: always succeeds; Server mode: JWT validation |
| `logout` | Clean up client sessions | `ACPServer` | Closes all sessions for the client |
| `session/new` | Spawn agent with folder scope | `AgentHost.spawn()` + `ScopeManager.createScopeFromPath()` | Creates agent, derives scope from `cwd` |
| `session/prompt` | Execute agent turn with streaming | `AgentHost.streamMessages()` + `StreamManager.startStream()` | Streams response via `session/update` notifications |
| `session/load` | Load existing session | `SessionStore.load()` | Restores session state from SQLite |
| `session/list` | List active sessions | `ACPServer.activeSessions` | Returns all sessions for this client |
| `session/close` | Close session gracefully | `ACPSessionBridge.close()` | Agent stays alive but session is disconnected |
| `session/delete` | Delete session and agent | `ACPSessionBridge.close()` + `AgentHost.kill()` | Fully removes session and agent |
| `session/resume` | Resume a closed session | `ACPSessionBridge` reconnection | Re-creates bridge from persisted state |
| `session/cancel` (notification) | Cancel in-progress prompt | `ACPSessionBridge.cancel()` | Aborts the `AbortController` |
| `session/set_mode` | Change agent mode | `ACPSessionBridge.setMode()` | Modes: 'code', 'ask', 'plan' |
| `session/set_config_option` | Set session config | `ACPSessionBridge.setConfigOption()` | e.g., model tier, temperature |

### ACP Agent → Client Methods (Daemon Calls)

| ACP Method | Daemon Trigger | Internal Component | Notes |
|------------|---------------|-------------------|-------|
| `fs/readTextFile` | Agent needs to read a file | Tool execution (read_file) | Path must be within session `cwd` |
| `fs/writeTextFile` | Agent needs to write a file | Tool execution (write_file) | Path must be within session `cwd` |
| `requestPermission` | Agent wants to execute a restricted action | SandboxService | Auto-approve in local mode; prompt in server mode |
| `terminal/create` | Agent executes a command | `TerminalBridge.create()` + `SubprocessManager.spawnProcess()` | Each terminal = one subprocess |
| `terminal/output` | Agent reads command output | `TerminalBridge.getOutput()` | Returns accumulated stdout/stderr |
| `terminal/wait_for_exit` | Agent waits for command completion | `TerminalBridge.waitForExit()` | Blocks until subprocess exits or times out |
| `terminal/kill` | Agent kills a running command | `TerminalBridge.kill()` | SIGTERM + SIGKILL after 5s |
| `terminal/release` | Agent releases terminal | `TerminalBridge.release()` | Untracks the subprocess |
| `ext/*` | Extension methods | Extensible via plugins | Reserved for custom functionality |

### ACP Agent → Client Notifications (Daemon Sends)

| Notification | Daemon Event | SessionUpdate Type | Content |
|-------------|-------------|-------------------|---------|
| `session/update` | Stream chunk (content) | `agent_message_chunk` | `{ content: string }` |
| `session/update` | Stream chunk (thinking) | `agent_thought_chunk` | `{ content: string }` |
| `session/update` | User message chunk | `user_message_chunk` | `{ content: string }` |
| `session/update` | Tool call starts | `tool_call` | `{ toolCallId, toolName, arguments, status: "running" }` |
| `session/update` | Tool call completes/updates | `tool_call_update` | `{ toolCallId, status, output }` |
| `session/update` | Execution plan | `plan` | `{ entries: [{ content, priority, status }] }` |
| `session/update` | Token usage update | `usage_update` | `{ usage: { inputTokens, outputTokens, costUsd } }` |
| `session/update` | Session info changed | `session_info_update` | `{ info: Record<string, unknown> }` |
| `session/update` | Mode changed | `current_mode_update` | `{ mode: string }` |
| `session/update` | Commands available | `available_commands_update` | `{ commands: string[] }` |

### AgentCapabilities Advertisement

```typescript
export const AGENT_CAPABILITIES: AgentCapabilities = {
  loadSession: true,
  promptCapabilities: {
    image: false,         // Future: enable when vision models are wired
    audio: false,         // Future: enable when ASR pipeline is added
    embeddedContext: true, // We accept file paths, URLs as context
  },
  mcpCapabilities: {
    http: true,           // HTTP-based MCP servers
    sse: true,            // SSE-based MCP servers
  },
  sessionCapabilities: {
    close: true,
    list: true,
    delete: true,
    resume: true,
    additionalDirectories: true,
  },
};
```

### ACP → Daemon Scope Mapping

| ACP Concept | Daemon Concept | Mapping |
|-------------|---------------|---------|
| `session/new` `cwd` | Folder-based scope key | `ScopeManager.deriveScopeKey(cwd)` → `folder:[hash]` |
| `session/new` `additionalDirectories` | Cross-scope access | `ScopeManager.crossScopeRecall()` with derived keys |
| `session/new` `mcpServers` | Managed MCP subprocesses | `SubprocessManager.spawnProcess()` for each MCP server |
| `session/prompt` `embeddedContext` | Message context blocks | Added to messages before LLM call |
| `session` ID | Agent instance ID | 1:1 mapping — each session is one agent |
| `session/set_mode` | Agent mode | Configures tool access, model tier, and behavior |
| `terminal/create` | Subprocess | `SubprocessManager.spawnProcess()` with terminal spec |
| `fs/readTextFile` | File read with scope check | Verified against `cwd` boundary |

### ACP Transport Configuration

| Mode | Transport | How to Connect | Security |
|------|----------|----------------|----------|
| **CLI mode** | stdio | `agentsy acp` starts daemon with stdio ACP | Process owner only |
| **Daemon mode** | WebSocket | `ws://localhost:9380` | Localhost only (no remote) |
| **Server mode** (future) | WebSocket + TLS | `wss://agentsy.example.com/acp` | JWT authentication |

---

## Implementation Order & Milestones

```text
Week 1-2:  Phase 0 (Critical Bug Fixes) — Must be green before any other work
Week 2-4:  Phase 1 (Daemon Foundation with ACP + SubprocessManager) — Can overlap with Phase 0 testing
Week 3:    Phase 2 (Package Consolidation) — Fast, mostly file moves
Week 3-4:  Phase 3 (Hook Pipeline Redesign) — Independent of daemon
Week 4-5:  Phase 4 (Gateway → Daemon) — Depends on Phase 1
Week 5-6:  Phase 5 (Streaming Architecture) — Depends on Phase 4
Week 5-6:  Phase 6 (RAG as Daemon Service) — Depends on Phase 1, parallel with 5
Week 6-7:  Phase 7 (Learning Loop) — Depends on Phase 6
Week 7-9:  Phase 8 (ACP Agent & Multi-Agent Deployment) — Depends on Phase 5
Week 9+:   Phase 9 (Missing Capabilities) — Depends on Phase 8
```

### Success Criteria

Each phase must pass these gates before the next phase begins:

- **All existing tests pass** (no regressions)
- **New code has >80% test coverage** (critical paths >90%)
- **`pnpm build` succeeds** with zero errors
- **`pnpm check-types` succeeds** with zero errors
- **Manual smoke test**: `agentsy daemon start` → `agentsy chat` → works end-to-end
- **ACP smoke test** (after Phase 8): `agentsy daemon start` → connect from Zed → send prompt → receive streamed response with tool calls

---

## End of Agentsy Remediation Plan v2.0
