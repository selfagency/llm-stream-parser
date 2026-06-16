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

This plan addresses 9 critical bugs, 7 architectural misalignments, and a fundamental restructuring of Agentsy around a **daemon-centric architecture** with **first-class ACP (Agent Client Protocol) support**. The daemon becomes the single long-lived process that owns agents, subagents, scheduling, workflows, memory, routing, streaming, RAG, connectors, logging, and telemetry. The CLI and TUI become thin IPC clients over Unix domain sockets. Editor integration is achieved through ACP — making Agentsy a native agent that works with Zed, VS Code (via ACP Client extension), and any ACP-compatible editor — eliminating the need for a custom VS Code extension. The existing `@agentsy/vscode` package is preserved as a published integration library for GitHub Copilot Chat; it is consumed by third-party VS Code extensions that integrate language model providers with Copilot Chat and is not the same concern as the custom extension that ACP replaces.

### Key v2 Changes from v1

| Area | v1 Decision | v2 Decision | Rationale |
|------|-------------|-------------|-----------|
| **Internal IPC** | JSON-RPC 2.0 over Unix sockets | **JSON-RPC 2.0 over Unix sockets** (confirmed) | Same protocol for both internal and external (ACP); human-readable; no build step; debuggable with `socat`; Zod schemas for validation |
| **Editor integration** | Custom VS Code extension | **ACP Agent** (Zed + VS Code ACP Client extension) + **preserve `@agentsy/vscode`** | ACP is the emerging standard for agent–editor communication; the existing `@agentsy/vscode` library is preserved as a third-party integration layer for GitHub Copilot Chat — it is consumed by external VS Code plugins that depend on its `BaseLanguageModelChatProvider`, `ApiKeyManager`, stream bridges, and other abstractions |
| **Process management** | No subprocess management | **SubprocessManager with stall detection** | Daemon manages child processes (tool executors, MCP servers, build runners); kills stalled processes; enforces memory limits |
| **Scope isolation** | Agent-specified memory scopes | **Folder-based scoping** | Scope derived from working directory, not agent-specified; aligns with ACP `session/new` `cwd` parameter; simpler mental model |

### Scope

- **9 critical bug fixes** (fake streaming, lost tool calls, hook short-circuit, quota map, unit mismatch, daemon restart, tool-call ID dedup, transform blocking, cost filter units)
- **1 new package** (`@agentsy/daemon`) — the central powerhouse with ACP agent support
- **8 package consolidations** (workflows → orchestrator, shared → types, scripts → root, etc.)
- **3 major architectural migrations** (gateway → daemon, streaming → daemon, RAG → daemon)
- **2 new subsystems** (background job scheduler, event-driven learning loop)
- **1 new protocol integration** (ACP — Agent Client Protocol for agent–editor communication; `@agentsy/vscode` preserved as Copilot Chat integration layer)
- **1 new infrastructure component** (SubprocessManager with stall detection and memory limits)
- **1 scope model change** (folder-based scoping aligned with ACP session `cwd`)

### Effort Estimate

| Phase | Description | Hours | Priority |
|-------|-------------|-------|----------|
| 0 | Critical Bug Fixes | ~20 | P0 — Immediate |
| 1 | Daemon Foundation (with ACP + SubprocessManager + Unified DB) | ~100 | P0 — Immediate |
| 2 | Package Consolidation | ~15 | P1 — After Phase 0 |
| 3 | Hook Pipeline Redesign | ~25 | P1 — After Phase 0 |
| 4 | Gateway → Daemon | ~40 | P1 — After Phase 1 |
| 5 | Streaming Architecture | ~35 | P1 — After Phase 4 |
| 6 | RAG as Daemon Service | ~30 | P2 — After Phase 1 |
| 7 | Learning Loop & Background Jobs | ~25 | P2 — After Phase 6 |
| 8 | ACP Agent & Multi-Agent Deployment | ~45 | P2 — After Phase 5 |
| 9 | Missing Capabilities | ~50 | P3 — After Phase 8 |
| | **Total** | **~385** | |

### Dependencies Graph

```
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
- **Zero custom extension code for agent–editor communication** — instead of building and maintaining a dedicated VS Code extension for agent–editor communication, we implement the ACP Agent interface using `@agentclientprotocol/sdk`'s `AgentSideConnection` class. This is ~500 lines of integration code versus ~5000 lines of extension code. Note: this is separate from `@agentsy/vscode`, which is a published Copilot Chat integration library consumed by third-party extensions — that package is preserved.
- **Production-proven pattern** — the Gemini CLI agent is a production ACP agent implementation. We can follow its architecture closely.
- **Multi-editor support out of the box** — a single ACP implementation gives us Zed, VS Code, and future JetBrains support simultaneously.

**Implications**:
- The daemon's `acp/` module implements the ACP Agent interface using `@agentclientprotocol/sdk`
- ACP transport is stdio (for CLI integration) or WebSocket (for remote access)
- ACP sessions map to daemon agent instances with folder-based scoping
- ACP `session/update` notifications carry streaming chunks, tool calls, and usage updates
- ACP `fs/*` and `terminal/*` client methods are routed to the daemon's SubprocessManager
- The `@agentsy/vscode` package is **preserved** — it is a published integration library consumed by third-party VS Code extensions that integrate models with GitHub Copilot Chat; it is not a custom extension but a shared abstraction layer

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
**Estimated effort**: ~100 hours (increased from v2's 80h due to Piscina pool, Honker queue, unified database consolidation, and SQLite worker integration)  
**Branch**: `feat/daemon-foundation`

This phase creates the `@agentsy/daemon` package — the central long-lived process with dual interfaces: an internal JSON-RPC 2.0 server over Unix sockets for CLI/TUI clients, and an external ACP Agent interface for editor clients. Critically, this phase also **consolidates three separate SQLite databases** (memory, CortexKit, daemon) into a **single unified database** (`agentsy.db`) opened through Honker, eliminating dual-write problems and enabling transactional outbox patterns across all subsystems.

### Design Influences

Phase 1 incorporates battle-tested patterns from six established projects:

| Source | What We Adopt | Where Applied |
|--------|--------------|---------------|
| **Piscina** | Worker thread pool with `runTask()`, configurable min/max threads, AbortSignal cancellation, `Piscina.move()` transferables, custom task queues, runtime statistics | Agent computation pool (`AgentPool`) |
| **Bree** | Cron + interval + one-time scheduling via worker threads, per-job timeout, `hasLagTime` overlap prevention, graceful drain on shutdown | Job scheduler layer on top of Honker |
| **Honker** | Durable SQLite-backed queues with transactional enqueue, `claim`/`ack` semantics, retries with backoff, priority queues, dead letters, NOTIFY/LISTEN-style cross-process wake (~0.7ms p50), streams with per-consumer offsets, time-trigger scheduling with cron support | **Unified database provider** — `agentsy.db` is opened via `honker.open()`, providing queues + streams + pub/sub + scheduling on the same file as all business tables; replaces hand-rolled `JobScheduler`, in-memory pub/sub, in-memory scheduler, and in-memory task queue |
| **Pup** | Config-driven process definitions with restart policies (`always`/`on-failure`), PID file management, structured logging with rotation, REST API for remote control, clustering with load balancer, system service installation | SubprocessManager, daemon lifecycle, REST control API |
| **bgproc** | Agent-friendly CLI with JSON output, port detection (`-w` wait-for-port), log streaming (`--follow`/`--tail`/`--errors`), `clean --all` stale cleanup, `restart` with preserved cwd | CLI commands, TUI integration |
| **sqlite-worker** | SQLite operations offloaded to a dedicated worker thread to avoid blocking the main event loop; tag-template query API (`query\`SELECT *\`) | `db/` subsystem — all SQLite access via the unified `agentsy.db` |

### 1.1 Unified Database Architecture

The most critical architectural decision in Phase 1 is the **consolidation of three separate SQLite databases into a single unified `agentsy.db`** opened through Honker. The current codebase opens three independent database files, each owned by a different package with no shared connection management or transactional consistency across them.

#### The Problem: Three Separate Databases

| Database | Package | Path | Tables | ORM |
|----------|---------|------|--------|-----|
| Memory DB | `@agentsy/memory` | `.agentsy/memory.db` | 18 (memory_items, wiki_*, rag_*, sync_*, fs_*, kv_store, tool_calls) | Drizzle ORM |
| CortexKit DB | `@agentsy/shared` | `~/.local/share/cortexkit/magic-context/context.db` | 4 (project_memories, compartments, session_meta, project_state) | Raw SQL |
| Tokenomics DB | `@agentsy/tokenomics` | Caller-specified | 1 (session_ledger) | Raw SQL |
| Daemon DB (planned) | `@agentsy/daemon` | `~/.agentsy/daemon.db` | New (daemon state, jobs, scopes, processes, sessions) | Raw SQL |

This fragmentation causes several problems:

1. **Dual-write problem** — A memory capture that should also enqueue a consolidation job spans two databases, so the business write and the job enqueue cannot commit atomically. If the enqueue fails after the capture succeeds, the consolidation never runs; if the capture fails after the enqueue succeeds, the job processes stale data.

2. **No transactional outbox** — The "write business data, then queue a side-effect" pattern (send email after order, consolidate after capture, index after wiki edit) requires the queue and the business data in the same transaction. With separate databases, this is impossible — you must choose between at-least-once (duplicate side-effects) or at-most-once (lost side-effects).

3. **Inconsistent sync semantics** — Memory syncs via Turso, CortexKit doesn't sync at all, and the planned daemon state has no sync story. A unified database has a single sync path.

4. **Connection sprawl** — At runtime, a working system opens 5+ SQLite files simultaneously (memory.db, context.db, tokenomics.db, local-sync-server.db, local-replica.db). Each has its own WAL mode, busy timeout, and retry logic, but there is no shared connection pool or central DB registry.

5. **In-memory coordination fallbacks** — Because Honker's native SQLite extension is not yet distributed, the coordination subsystem (pub/sub, task queues, scheduling) currently uses in-memory implementations that are lost on daemon restart. This is precisely the problem the daemon is meant to solve.

#### The Solution: One Database, Opened Through Honker

The unified database (`~/.agentsy/agentsy.db`) is opened through Honker's Node.js binding (`@russellthehippo/honker-node`), which loads the native SQLite extension and provides:

- **Durable queues** — `db.queue('name')` creates a queue in the same file. `q.enqueue(payload)` or `q.enqueueTx(tx, payload)` for transactional enqueue.
- **NOTIFY/LISTEN** — Cross-process wake via SQLite's update hook, achieving ~0.7ms p50 latency without Redis, a broker, or client polling.
- **Streams with per-consumer offsets** — For event-sourced patterns like agent conversation history, where each consumer tracks its own offset.
- **Time-trigger scheduling** — 5-field cron, 6-field cron, and `@every <n><unit>` syntax with leader-elected scheduler.
- **Transactional outbox** — Business writes and queue enqueues share the same SQLite transaction. `INSERT INTO orders` and `queue.enqueue(...)` commit together or roll back together.

When the native extension is not available (e.g., unsupported platform), the system falls back to a pure-JavaScript implementation that still provides the same API surface, backed by `better-sqlite3` directly. This fallback lacks the NOTIFY/LISTEN cross-process wake and must use polling, but all other features (queues, streams, scheduling, transactional enqueue) remain functional.

#### Unified Schema

All tables from the three existing databases are consolidated into `agentsy.db`, organized by schema prefix/namespace:

```
agentsy.db
├── ── Memory (from @agentsy/memory) ──────────────────
│   memory_items, wiki_pages, wiki_page_history,
│   wiki_vectors, wiki_concepts, wiki_backlinks,
│   rag_documents, rag_vectors,
│   sync_state, sync_conflicts
│
├── ── AgentFS (from @agentsy/memory) ─────────────────
│   fs_config, fs_inode, fs_dentry, fs_data,
│   fs_symlink, fs_whiteout, fs_origin, kv_store
│
├── ── Context (from @agentsy/shared/CortexKit) ───────
│   project_memories, compartments,
│   session_meta, project_state
│
├── ── Tokenomics (from @agentsy/tokenomics) ──────────
│   session_ledger
│
├── ── Daemon (new in @agentsy/daemon) ────────────────
│   daemon_state, scopes, agent_instances,
│   subprocess_state, pid_file, connector_state,
│   acp_sessions, acp_session_state
│
├── ── Tool Audit (from @agentsy/memory) ──────────────
│   tool_calls
│
└── ── Honker (auto-managed by extension) ─────────────
    honker_queues, honker_jobs, honker_streams,
    honker_consumers, honker_schedule, honker_locks
    (tables created and managed by Honker's extension;
     never queried directly by application code)
```

The Honker-managed tables are created automatically by `honker.open()` and the `db.queue()` / `db.stream()` calls. Application code never reads or writes these tables directly — they are owned entirely by the Honker extension.

#### Migration Path

Existing databases are migrated on first daemon start:

1. **Detect** — Check if `agentsy.db` already exists. If yes, skip migration.
2. **Create** — Open `agentsy.db` via `honker.open()`, which creates the file and initializes Honker's internal tables.
3. **Migrate** — Run the unified schema migration (all application tables).
4. **Import** — If the old `.agentsy/memory.db` exists, ATTACH it and `INSERT INTO agentsydb.table SELECT * FROM memorydb.table` for each table.
5. **Import** — Same for `~/.local/share/cortexkit/magic-context/context.db`.
6. **Import** — Same for the tokenomics ledger (if a path is configured).
7. **Rename** — Move old database files to `.agentsy/migrated/` (not deleted, for safety).
8. **WAL** — Enable WAL mode on the unified database.

The migration is idempotent — if interrupted and restarted, it detects which tables have already been imported and skips them.

#### API: UnifiedDB

The `UnifiedDB` class replaces both `SQLiteWorkerDB` and the separate database connections in memory/CortexKit/tokenomics packages. It runs in a dedicated worker thread (sqlite-worker pattern) and exposes an async API:

```typescript
// packages/daemon/src/db/unified-db.ts

import { open, type Database as HonkerDB, type Queue as HonkerQueue, type Stream as HonkerStream } from '@russellthehippo/honker-node';

export interface UnifiedDBConfig {
  path: string;                          // ~/.agentsy/agentsy.db
  extensionPath?: string;                // Path to libhonker_ext.so/.dylib
  blake3ExtensionPath?: string;          // Path to libblake3_ext.so/.dylib
  walMode?: boolean;
  busyTimeoutMs?: number;
  logger: Logger;
}

export class UnifiedDB {
  private honker: HonkerDB | null = null;
  private queues = new Map<string, HonkerQueue>();
  private streams = new Map<string, HonkerStream>();
  private config: UnifiedDBConfig;
  private mode: 'native' | 'fallback' = 'fallback';

  constructor(config: UnifiedDBConfig) {
    this.config = config;
  }

  async open(): Promise<void> {
    try {
      this.honker = open(this.config.path, this.config.extensionPath);
      this.mode = 'native';
      this.config.logger.info('UnifiedDB opened with Honker native extension', {
        path: this.config.path, mode: this.mode,
      });
    } catch {
      // Fallback: open with better-sqlite3 directly (no Honker features)
      this.honker = openFallback(this.config.path);
      this.mode = 'fallback';
      this.config.logger.warn('Honker native extension not available, using fallback', {
        path: this.config.path, mode: this.mode,
      });
    }

    // Configure WAL mode and busy timeout
    this.honker.pragma('journal_mode = WAL');
    this.honker.pragma(`busy_timeout = ${this.config.busyTimeoutMs ?? 5000}`);

    // Bootstrap Honker tables (queues, streams, scheduling)
    if (this.mode === 'native') {
      this.honker.bootstrap();
    }
  }

  // ── Queue API (Honker) ──────────────────────────

  queue(name: string): HonkerQueue {
    if (!this.queues.has(name)) {
      const q = this.honker!.queue(name);
      this.queues.set(name, q);
    }
    return this.queues.get(name)!;
  }

  // ── Stream API (Honker) ─────────────────────────

  stream(name: string): HonkerStream {
    if (!this.streams.has(name)) {
      const s = this.honker!.stream(name);
      this.streams.set(name, s);
    }
    return this.streams.get(name)!;
  }

  // ── Transaction API ─────────────────────────────

  transaction(): HonkerTransaction {
    return this.honker!.transaction();
  }

  // ── Query API (worker-thread-safe) ──────────────

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> { ... }
  async execute(sql: string, params: unknown[] = []): Promise<void> { ... }
  async querySingle<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> { ... }

  // ── Migration API ───────────────────────────────

  async migrate(): Promise<void> { ... }
  async migrateFromLegacy(legacyPaths: { memory?: string; cortexkit?: string; tokenomics?: string }): Promise<void> { ... }

  // ── Lifecycle ───────────────────────────────────

  async close(): Promise<void> {
    this.queues.clear();
    this.streams.clear();
    this.honker?.close();
    this.honker = null;
  }

  get isNative(): boolean { return this.mode === 'native'; }
}
```

All subsystems receive a reference to the same `UnifiedDB` instance. The `@agentsy/memory` package no longer opens its own database — it accepts a `db: UnifiedDB` dependency. The same applies to `@agentsy/session` (for CortexKit tables) and `@agentsy/tokenomics` (for the ledger table). This dependency injection ensures that every subsystem writes to the same file, and that Honker's transactional outbox pattern works across subsystem boundaries.

#### Key Benefit: Transactional Outbox

With the unified database, any subsystem can atomically write business data and enqueue a side-effect:

```typescript
// Memory capture + consolidation job in one transaction
const tx = db.transaction();
tx.execute('INSERT INTO memory_items (id, tier, kind, content, ...) VALUES (?, ?, ?, ?, ...)', [...]);
db.queue('maintenance').enqueueTx(tx, { type: 'memory.consolidate', scopeId, tier: 'sensory_buffer' }, { retries: 3 });
tx.commit();
// If the commit succeeds, both the capture and the job are durable.
// If it fails, neither exists — no orphaned data, no lost jobs.
```

This pattern replaces the current approach where memory capture and job enqueue are separate operations that can diverge on failure. The same pattern applies to wiki edits + indexing jobs, agent actions + notification publishing, and session state changes + stream events.

### 1.2 Package Scaffolding

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
│   ├── config.ts                   # Daemon configuration schema (Zod)
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
│   ├── pool/
│   │   ├── index.ts                # Pool barrel
│   │   ├── agent-pool.ts           # Piscina-backed agent computation pool
│   │   ├── agent-pool.test.ts
│   │   ├── worker-entry.ts         # Worker thread entry point (Piscina filename)
│   │   ├── worker-entry.test.ts
│   │   └── task-types.ts           # Task definition types
│   ├── processes/
│   │   ├── index.ts                # Subprocess barrel
│   │   ├── subprocess-manager.ts   # Child process lifecycle + stall detection (Pup patterns)
│   │   ├── subprocess-manager.test.ts
│   │   ├── terminal-bridge.ts      # ACP terminal/create → subprocess mapping
│   │   └── terminal-bridge.test.ts
│   ├── lifecycle/
│   │   ├── index.ts
│   │   ├── supervisor.ts           # Crash recovery & auto-restart (Pup restart policies)
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
│   │   ├── index.ts                # Jobs barrel
│   │   ├── honker-queue.ts         # Honker-backed durable queue adapter
│   │   ├── honker-queue.test.ts
│   │   ├── bree-scheduler.ts       # Bree cron/interval scheduler (layered on Honker)
│   │   ├── bree-scheduler.test.ts
│   │   ├── job-definitions.ts      # Typed job definitions & handlers
│   │   └── job-definitions.test.ts
│   ├── db/
│   │   ├── index.ts                # DB barrel
│   │   ├── unified-db.ts           # UnifiedDB — Honker-backed single-database accessor
│   │   ├── unified-db.test.ts
│   │   ├── db-worker-entry.ts      # Worker thread entry for async query execution
│   │   ├── db-worker-entry.test.ts
│   │   ├── schema.ts               # Unified schema definitions (all tables)
│   │   ├── migrations.ts           # Schema migrations + legacy import
│   │   └── migrations.test.ts
│   ├── connectors/
│   │   ├── index.ts
│   │   ├── connector-host.ts       # Third-party connector manager
│   │   └── connector-host.test.ts
│   ├── api/
│   │   ├── index.ts                # REST API barrel (Pup pattern)
│   │   ├── rest-server.ts          # HTTP REST control API
│   │   └── rest-server.test.ts
│   ├── display/
│   │   ├── index.ts
│   │   ├── tui-bridge.ts           # TUI display over IPC
│   │   └── tui-bridge.test.ts
│   └── cli/
│       ├── index.ts
│       ├── start.ts                # `agentsy daemon start`
│       ├── stop.ts                 # `agentsy daemon stop`
│       ├── status.ts               # `agentsy daemon status` (bgproc JSON output)
│       ├── restart.ts              # `agentsy daemon restart`
│       ├── logs.ts                 # `agentsy daemon logs` (bgproc log streaming)
│       └── clean.ts                # `agentsy daemon clean` (bgproc stale cleanup)
```

### 1.3 Core Daemon Class

The `Daemon` class is the top-level lifecycle manager. It owns all subsystems and coordinates their startup, shutdown, sleep, and wake. Compared to v2, it now includes the Piscina-backed `AgentPool`, the **unified Honker-backed database** (`UnifiedDB`) that consolidates all SQLite access, Honker queues/streams/scheduling on the same file, and the Bree `JobScheduler` layered on top.

```typescript
// packages/daemon/src/daemon.ts

import { createMemoryEngine, MemoryEngine } from '@agentsy/memory';
import { createIPCServer, IPCServer } from './ipc/server.js';
import { ACPServer } from './acp/acp-server.js';
import { AgentPool } from './pool/agent-pool.js';
import { SubprocessManager } from './processes/subprocess-manager.js';
import { ServiceHost, ServiceState } from './services/service-host.js';
import { AgentHost } from './agents/agent-host.js';
import { ScopeManager } from './agents/scope-manager.js';
import { HonkerQueue } from './jobs/honker-queue.js';
import { BreeScheduler } from './jobs/bree-scheduler.js';
import { ConnectorHost } from './connectors/connector-host.js';
import { DaemonConfig, resolveConfig } from './config.js';
import { Supervisor, SupervisorPolicy } from './lifecycle/supervisor.js';
import { Sleeper, SleepPolicy } from './lifecycle/sleeper.js';
import { UnifiedDB } from './db/unified-db.js';
import { RestServer } from './api/rest-server.js';

export interface DaemonDeps {
  config: Partial<DaemonConfig>;
  // Optional overrides for testing
  memoryEngine?: MemoryEngine;
  ipcServer?: IPCServer;
  db?: UnifiedDB;
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
  readonly pool: AgentPool;           // Piscina-backed
  readonly processes: SubprocessManager;
  readonly services: ServiceHost;
  readonly agents: AgentHost;
  readonly scopes: ScopeManager;
  readonly jobs: HonkerQueue;          // Honker-backed durable queue (from UnifiedDB)
  readonly scheduler: BreeScheduler;   // Bree cron/interval layer
  readonly connectors: ConnectorHost;
  readonly supervisor: Supervisor;
  readonly sleeper: Sleeper;
  readonly db: UnifiedDB;               // Unified Honker-backed database
  readonly api: RestServer;            // REST control API (Pup pattern)

  // ── Infrastructure ─────────────────────────────
  private readonly config: DaemonConfig;
  private readonly logger: DaemonLogger;
  private readonly metrics: DaemonMetrics;

  constructor(deps: DaemonDeps) {
    this.config = resolveConfig(deps.config);

    // Core infrastructure — UnifiedDB is the single database, opened via Honker
    this.logger = createDaemonLogger(this.config.logging);
    this.metrics = createDaemonMetrics(this.config.metrics);
    this.db = deps.db ?? new UnifiedDB({
      path: this.config.database.path,
      extensionPath: this.config.database.honkerExtensionPath,
      blake3ExtensionPath: this.config.database.blake3ExtensionPath,
      walMode: this.config.database.walMode,
      busyTimeoutMs: this.config.database.busyTimeoutMs,
      logger: this.logger.child('db'),
    });

    // Subsystems
    this.memory = deps.memoryEngine ?? createMemoryEngine({
      db: this.db,
      logger: this.logger.child('memory'),
    });

    this.ipc = deps.ipcServer ?? createIPCServer({
      socketPath: this.config.ipc.socketPath,
      logger: this.logger.child('ipc'),
    });

    // Piscina-backed agent pool
    this.pool = new AgentPool({
      filename: new URL('./pool/worker-entry.js', import.meta.url),
      minThreads: this.config.pool.minThreads,
      maxThreads: this.config.pool.maxThreads,
      idleTimeoutMs: this.config.pool.idleTimeoutMs,
      maxQueueSize: this.config.pool.maxQueueSize,
      concurrentTasksPerWorker: this.config.pool.concurrentTasksPerWorker,
      resourceLimits: this.config.pool.resourceLimits,
      logger: this.logger.child('pool'),
      metrics: this.metrics,
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
      pool: this.pool,
      logger: this.logger.child('agents'),
      metrics: this.metrics,
    });

    // Honker-backed durable job queue (uses queues from the same UnifiedDB)
    this.jobs = new HonkerQueue({
      db: this.db,                       // Same database, not a separate file
      logger: this.logger.child('jobs'),
      metrics: this.metrics,
    });

    // Bree cron/interval scheduler layered on top of Honker
    this.scheduler = new BreeScheduler({
      queue: this.jobs,
      root: this.config.jobs.jobDirectory,
      logger: this.logger.child('scheduler'),
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

    // REST control API (Pup pattern)
    this.api = new RestServer({
      port: this.config.api.port,
      authToken: this.config.api.authToken,
      daemon: this,
      logger: this.logger.child('api'),
    });
  }

  // ── Lifecycle ──────────────────────────────────

  async start(): Promise<void> {
    if (this._state !== 'stopped') {
      throw new Error(`Cannot start daemon in state "${this._state}"`);
    }

    this.transition('starting');

    try {
      // 1. Open unified database (Honker-backed, worker thread for async queries)
      await this.db.open();
      await this.db.migrate();
      // Migrate from legacy databases if they exist (idempotent)
      await this.db.migrateFromLegacy({
        memory: path.join(os.homedir(), '.agentsy', 'memory.db'),
        cortexkit: path.join(os.homedir(), '.local', 'share', 'cortexkit', 'magic-context', 'context.db'),
      });

      // 2. Start memory engine (uses same UnifiedDB — no separate database)
      await this.memory.initialize();
      this.services.register('memory', this.memory);

      // 3. Initialize Honker durable queues (from the same UnifiedDB instance)
      await this.jobs.start();
      this.services.register('jobs', this.jobs);

      // 4. Start Bree scheduler (cron/interval jobs)
      await this.scheduler.start();
      this.services.register('scheduler', this.scheduler);

      // 5. Initialize scope manager
      await this.scopes.initialize();

      // 6. Start agent host (with Piscina pool)
      await this.agents.initialize();

      // 7. Start subprocess manager
      await this.processes.start();

      // 8. Start connectors
      await this.connectors.initialize();

      // 9. Start IPC server for internal clients (CLI/TUI)
      await this.ipc.start();
      this.registerIPCHandlers();

      // 10. Start ACP server for external clients (editors)
      await this.acp.start(this.config.acp);

      // 11. Start REST API for remote control (Pup pattern)
      await this.api.start();

      // 12. Enable supervisor (watches for crashes)
      this.supervisor.watch(this);

      // 13. Enable sleeper (puts idle subsystems to sleep)
      this.sleeper.watch(this.services);

      this.transition('running');
      this.logger.info('Daemon started', {
        pid: process.pid,
        socket: this.config.ipc.socketPath,
        acp: this.config.acp.enabled ? 'enabled' : 'disabled',
        api: `http://localhost:${this.config.api.port}`,
        db: this.config.database.path,
        dbMode: this.db.isNative ? 'honker-native' : 'fallback',
        poolThreads: this.pool.threads.length,
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
      await withTimeout(this.api.stop(), timeout);
      await withTimeout(this.acp.stop(), timeout);
      await withTimeout(this.ipc.stop(), timeout);
      await withTimeout(this.sleeper.stop(), timeout);
      await withTimeout(this.supervisor.stop(), timeout);
      await withTimeout(this.scheduler.stop(), timeout);
      await withTimeout(this.processes.killAll(), timeout);
      await withTimeout(this.pool.destroy(), timeout);          // Drain Piscina pool
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

    // Streaming
    this.ipc.handle('stream.start', (req) => this.agents.startStream(req));
    this.ipc.handle('stream.cancel', (req) => this.agents.cancelStream(req.streamId));

    // Job scheduling (Honker-backed)
    this.ipc.handle('jobs.enqueue', (req) => this.jobs.enqueue(req));
    this.ipc.handle('jobs.list', () => this.jobs.list());
    this.ipc.handle('jobs.cancel', (req) => this.jobs.cancel(req.jobId));
    this.ipc.handle('jobs.claim', (req) => this.jobs.claim(req.workerId));
    this.ipc.handle('jobs.ack', (req) => this.jobs.ack(req.jobId));

    // Scheduler (Bree)
    this.ipc.handle('scheduler.schedule', (req) => this.scheduler.schedule(req));
    this.ipc.handle('scheduler.list', () => this.scheduler.list());
    this.ipc.handle('scheduler.cancel', (req) => this.scheduler.cancel(req.scheduleId));

    // Health & status
    this.ipc.handle('daemon.status', () => this.getStatus());
    this.ipc.handle('daemon.shutdown', () => this.stop());

    // Pool stats (Piscina)
    this.ipc.handle('pool.stats', () => this.pool.stats());

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

### 1.4 Piscina-Backed Agent Pool

The `AgentPool` wraps Piscina to provide a managed worker thread pool for CPU-intensive agent computations. This replaces the previous approach where agent work ran directly on the main thread, which could block the event loop during heavy processing.

**Key Piscina patterns adopted:**

- **`runTask()` with AbortSignal** — Tasks can be cancelled mid-execution. When a user cancels an ACP prompt or the daemon shuts down, we abort the corresponding Piscina task rather than letting it run to completion.
- **`Piscina.move()` for transferables** — When returning large ArrayBuffer results (e.g., RAG embeddings, file content), we transfer ownership instead of cloning, avoiding expensive structured clone operations.
- **Custom task queue** — Piscina supports pluggable task queues. We use a priority-aware queue that gives interactive ACP sessions priority over background batch jobs.
- **Pool size configuration** — `minThreads` keeps warm workers ready (avoiding cold-start latency for interactive sessions), while `maxThreads` prevents resource exhaustion. Idle threads beyond `minThreads` are terminated after `idleTimeoutMs`.
- **Runtime statistics** — `pool.stats()` exposes `utilization`, `waitTime`, and `runTime` metrics, feeding into the daemon's metrics pipeline.
- **`resourceLimits`** — Per-worker memory limits that cause the worker to be terminated and restarted if exceeded, preventing a single runaway agent from consuming all daemon memory.

```typescript
// packages/daemon/src/pool/agent-pool.ts

import Piscina from 'piscina';
import type { AgentPoolConfig, PoolStats, TaskResult } from './task-types.js';

export class AgentPool {
  private piscina: Piscina;

  constructor(private config: AgentPoolConfig) {
    this.piscina = new Piscina({
      filename: config.filename,
      minThreads: config.minThreads ?? 2,
      maxThreads: config.maxThreads ?? navigator.hardwareConcurrency ?? 4,
      idleTimeoutMs: config.idleTimeoutMs ?? 30_000,
      maxQueueSize: config.maxQueueSize ?? 100,
      concurrentTasksPerWorker: config.concurrentTasksPerWorker ?? 1,
      resourceLimits: config.resourceLimits ?? {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 64,
      },
      // Custom priority-aware task queue
      queue: new PriorityTaskQueue(),
    });
  }

  async runTask<T = unknown>(
    task: { type: string; payload: unknown },
    options?: { signal?: AbortSignal; priority?: 'high' | 'normal' | 'low'; transferList?: Transferable[] }
  ): Promise<T> {
    return this.piscina.run(task, {
      signal: options?.signal,
      transferList: options?.transferList,
      name: task.type,
    });
  }

  stats(): PoolStats {
    return {
      threads: this.piscina.threads.length,
      queueSize: this.piscina.queueSize,
      completed: this.piscina.completed,
      utilization: this.piscina.utilization,
      waitTime: this.piscina.waitTime,
      runTime: this.piscina.runTime,
      duration: this.piscina.duration,
    };
  }

  async destroy(): Promise<void> {
    await this.piscina.destroy();
  }
}

/**
 * Priority-aware task queue for Piscina.
 * Interactive ACP sessions get 'high' priority; background jobs get 'low'.
 */
class PriorityTaskQueue {
  private highQueue: any[] = [];
  private normalQueue: any[] = [];
  private lowQueue: any[] = [];

  get size(): number {
    return this.highQueue.length + this.normalQueue.length + this.lowQueue.length;
  }

  shift(): any | null {
    return this.highQueue.shift() ?? this.normalQueue.shift() ?? this.lowQueue.shift() ?? null;
  }

  push(task: any): void {
    const priority = task.priority ?? 'normal';
    switch (priority) {
      case 'high': this.highQueue.push(task); break;
      case 'low': this.lowQueue.push(task); break;
      default: this.normalQueue.push(task); break;
    }
  }

  remove(task: any): void {
    for (const queue of [this.highQueue, this.normalQueue, this.lowQueue]) {
      const idx = queue.indexOf(task);
      if (idx !== -1) { queue.splice(idx, 1); return; }
    }
  }
}
```

### 1.5 Worker Thread Entry Point

The worker entry point is the code that runs inside each Piscina worker thread. It exports named handler functions for each task type. This follows Piscina's convention of a single default export that routes to the appropriate handler.

```typescript
// packages/daemon/src/pool/worker-entry.ts

import { move } from 'piscina';

export default function (task: { type: string; payload: unknown }): Promise<unknown> {
  switch (task.type) {
    case 'agent.compute': return handleAgentCompute(task.payload);
    case 'embedding.generate': return handleEmbedding(task.payload);
    case 'rag.index': return handleRagIndex(task.payload);
    case 'rag.query': return handleRagQuery(task.payload);
    case 'memory.consolidate': return handleMemoryConsolidate(task.payload);
    default:
      throw new Error(`Unknown task type: ${task.type}`);
  }
}

async function handleAgentCompute(payload: any): Promise<unknown> {
  const result = await performComputation(payload);
  if (result instanceof ArrayBuffer || result instanceof SharedArrayBuffer) {
    return move(result);
  }
  return result;
}

async function handleEmbedding(payload: any): Promise<unknown> {
  const { texts, model } = payload;
  const embeddings = await generateEmbeddings(texts, model);
  return move(new Float32Array(embeddings).buffer);
}

async function handleRagIndex(payload: any): Promise<unknown> {
  return indexDocuments(payload);
}

async function handleRagQuery(payload: any): Promise<unknown> {
  return queryIndex(payload);
}

async function handleMemoryConsolidate(payload: any): Promise<unknown> {
  return consolidateMemories(payload);
}

// Placeholder implementations — wired to real packages in later phases
async function performComputation(_p: any) { return {}; }
async function generateEmbeddings(_t: any, _m: any) { return []; }
async function indexDocuments(_p: any) { return {}; }
async function queryIndex(_p: any) { return {}; }
async function consolidateMemories(_p: any) { return {}; }
```

### 1.6 Honker-Backed Durable Job Queue

The `HonkerQueue` replaces the hand-rolled `JobScheduler` from v2 and the in-memory `createInMemoryTaskQueue()` fallback. It uses the queues provided by the `UnifiedDB` instance (which is itself opened through Honker), so job data and business data live in the same `agentsy.db` file. This means `INSERT INTO memory_items` and `queue.enqueue(...)` commit in the same transaction — rollbacks drop both, eliminating the dual-write problem.

**Key Honker patterns adopted:**

- **Transactional enqueue** — Business writes and job enqueues share the same SQLite transaction. If the business write rolls back, the job is never queued.
- **`claim`/`ack` semantics** — Workers claim a job (making it invisible to other workers), process it, then ack it. If the worker crashes, the job becomes visible again after a timeout.
- **Retries with backoff** — Jobs can be configured with retry counts and per-retry delays. Failed jobs move to a dead letter queue after max retries.
- **Priority queues** — Jobs can have priority levels. Higher-priority jobs are claimed first.
- **Delayed jobs** — Jobs can be scheduled for future execution with `runAt` timestamps.
- **NOTIFY/LISTEN wake** — Cross-process wake via SQLite's update hook, achieving ~0.7ms p50 latency without client polling or a separate broker.
- **Streams with per-consumer offsets** — For event-sourced patterns (e.g., agent conversation history), Honker provides durable streams where each consumer tracks its own offset.

```typescript
// packages/daemon/src/jobs/honker-queue.ts

import type { Queue as HonkerQueue } from '@russellthehippo/honker-node';
import type { UnifiedDB } from '../db/unified-db.js';

export interface HonkerQueueConfig {
  db: UnifiedDB;                         // Shared unified database — not a separate file
  logger: Logger;
  metrics: Metrics;
}

export interface EnqueueOptions {
  queue?: string;
  priority?: number;
  retries?: number;
  retryDelayMs?: number;
  runAt?: Date;
  expiresAt?: Date;
  timeoutMs?: number;
  tx?: unknown;                // Honker transaction for transactional enqueue
}

export interface Job {
  id: string;
  queue: string;
  payload: unknown;
  priority: number;
  retries: number;
  retryCount: number;
  runAt: Date | null;
  expiresAt: Date | null;
  claimedBy: string | null;
  createdAt: Date;
}

export class HonkerQueueAdapter {
  private db: UnifiedDB;
  private queues = new Map<string, HonkerQueue>();
  private config: HonkerQueueConfig;

  constructor(config: HonkerQueueConfig) {
    this.config = config;
    this.db = config.db;
  }

  async start(): Promise<void> {
    // Queues are obtained from the already-open UnifiedDB (same agentsy.db file)
    await this.ensureQueue('default');
    await this.ensureQueue('agents');
    await this.ensureQueue('maintenance');
    await this.ensureQueue('indexing');
    await this.ensureQueue('notifications');

    this.config.logger.info('Honker queue started', {
      dbPath: this.db.path,
      mode: this.db.isNative ? 'native' : 'fallback',
      queues: Array.from(this.queues.keys()),
    });
  }

  private async ensureQueue(name: string): Promise<void> {
    if (!this.queues.has(name)) {
      const q = this.db.queue(name);          // Delegates to UnifiedDB.queue()
      this.queues.set(name, q);
    }
  }

  /**
   * Enqueue a job. Supports transactional enqueue when a Honker
   * transaction is provided (business write + enqueue commit together
   * or roll back together).
   */
  async enqueue(
    payload: unknown,
    options: EnqueueOptions = {}
  ): Promise<string> {
    const queueName = options.queue ?? 'default';
    const q = this.queues.get(queueName);
    if (!q) throw new Error(`Queue not found: ${queueName}`);

    const enqueueOpts: Record<string, unknown> = {};
    if (options.priority) enqueueOpts.priority = options.priority;
    if (options.retries !== undefined) enqueueOpts.retries = options.retries;
    if (options.retryDelayMs) enqueueOpts.retryDelay = options.retryDelayMs;
    if (options.runAt) enqueueOpts.runAt = options.runAt.getTime();
    if (options.expiresAt) enqueueOpts.expiresAt = options.expiresAt.getTime();
    if (options.timeoutMs) enqueueOpts.timeoutS = Math.ceil(options.timeoutMs / 1000);

    if (options.tx) {
      const jobId = q.enqueueTx(options.tx, payload, enqueueOpts);
      this.config.metrics.increment('daemon.job.enqueue', { queue: queueName });
      return jobId;
    }

    const jobId = q.enqueue(payload, enqueueOpts);
    this.config.metrics.increment('daemon.job.enqueue', { queue: queueName });
    return jobId;
  }

  /**
   * Claim a job for processing (Honker claim/ack pattern).
   */
  async claim(workerId: string, queueName: string = 'default'): Promise<Job | null> {
    const q = this.queues.get(queueName);
    if (!q) throw new Error(`Queue not found: ${queueName}`);

    const job = q.claimOne(workerId);
    if (!job) return null;

    this.config.metrics.increment('daemon.job.claim', { queue: queueName });
    return this.mapJob(job, queueName);
  }

  async ack(jobId: string): Promise<void> {
    this.config.metrics.increment('daemon.job.ack');
  }

  async cancel(jobId: string): Promise<void> {
    this.config.metrics.increment('daemon.job.cancel');
  }

  async list(queueName: string = 'default'): Promise<Job[]> {
    const q = this.queues.get(queueName);
    if (!q) return [];
    return [];
  }

  /**
   * Start a worker loop using Honker's async claimWaker for
   * low-latency wake (~0.7ms p50 cross-process).
   */
  async startWorker(
    workerId: string,
    queueName: string,
    handler: (job: Job) => Promise<void>
  ): Promise<void> {
    const q = this.queues.get(queueName);
    if (!q) throw new Error(`Queue not found: ${queueName}`);

    const waker = q.claimWaker();

    while (true) {
      try {
        const job = await waker.next(workerId);
        if (!job) continue;

        const mapped = this.mapJob(job, queueName);
        await handler(mapped);
        job.ack();
      } catch (error) {
        this.config.logger.error('Job worker error', { workerId, queueName, error });
      }
    }
  }

  private mapJob(raw: any, queue: string): Job {
    return {
      id: raw.id,
      queue,
      payload: raw.payload,
      priority: raw.priority ?? 0,
      retries: raw.retries ?? 3,
      retryCount: raw.retryCount ?? 0,
      runAt: raw.runAt ? new Date(raw.runAt) : null,
      expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : null,
      claimedBy: raw.claimedBy ?? null,
      createdAt: new Date(raw.createdAt),
    };
  }

  async stop(): Promise<void> {
    this.config.logger.info('Honker queue stopping');
  }
}
```

### 1.7 Bree Scheduler (Cron/Interval Layer)

The `BreeScheduler` provides cron, interval, and one-time scheduling on top of Honker's durable queue. Bree handles the scheduling logic (when to run), while Honker handles the execution logic (claim, process, ack, retry).

**Key Bree patterns adopted:**

- **Worker thread per job execution** — Each scheduled job runs in its own worker thread, providing full isolation.
- **Per-job timeout** — Bree's `timeout` option kills workers that run too long.
- **`hasLagTime` overlap prevention** — If a job is still running when its next scheduled time arrives, Bree can skip the new run.
- **Graceful drain** — On shutdown, Bree waits for running workers to complete before destroying the pool.
- **Job definition schema** — Each job has a clear definition with `name`, `path`, `interval`/`cron`, `timeout`.

```typescript
// packages/daemon/src/jobs/bree-scheduler.ts

import Bree from 'bree';
import { HonkerQueueAdapter } from './honker-queue.js';

export interface ScheduleDefinition {
  id: string;
  name: string;
  type: 'cron' | 'interval' | 'one_time';
  schedule: string;
  handler: string;
  timeout?: number;
  interval?: number;
  hasLagTime?: boolean;
  params?: Record<string, unknown>;
  scope?: string;
  enabled: boolean;
}

export class BreeScheduler {
  private bree: Bree | null = null;
  private queue: HonkerQueueAdapter;
  private definitions = new Map<string, ScheduleDefinition>();

  constructor(private config: {
    queue: HonkerQueueAdapter;
    root: string;
    logger: Logger;
    metrics: Metrics;
  }) {
    this.queue = config.queue;
  }

  async start(): Promise<void> {
    this.bree = new Bree({
      root: this.config.root,
      jobs: [],
      killTimeout: 10_000,
      timeout: 30_000,
      removeCompleted: true,
      workerMessageHandler: ({ name, message }) => {
        this.config.logger.debug(`Bree job "${name}" sent message`, { message });
      },
    });

    await this.bree.start();
    this.config.logger.info('Bree scheduler started');
  }

  async schedule(def: Omit<ScheduleDefinition, 'id' | 'enabled'>): Promise<string> {
    const id = uuid();
    const full: ScheduleDefinition = { ...def, id, enabled: true };
    this.definitions.set(id, full);

    const breeJob: any = {
      name: `job_${id}`,
      path: def.handler,
      timeout: def.timeout ?? 30_000,
      hasLagTime: def.hasLagTime ?? true,
    };

    if (def.type === 'cron') {
      breeJob.cron = def.schedule;
    } else if (def.type === 'interval') {
      breeJob.interval = def.schedule;
    }

    this.bree?.add(breeJob);

    this.config.logger.info('Job scheduled', {
      id, name: def.name, type: def.type, schedule: def.schedule,
    });

    return id;
  }

  async cancel(scheduleId: string): Promise<void> {
    this.bree?.remove(`job_${scheduleId}`);
    this.definitions.delete(scheduleId);
  }

  async list(): Promise<ScheduleDefinition[]> {
    return Array.from(this.definitions.values());
  }

  async stop(): Promise<void> {
    await this.bree?.stop();
    this.config.logger.info('Bree scheduler stopped');
  }
}
```

### 1.8 SQLite Worker (Non-Blocking Database Access)

All SQLite operations are offloaded to a dedicated worker thread, following the sqlite-worker pattern. This ensures that database queries (which can be slow for large datasets) never block the daemon's main event loop. The worker thread is embedded within the `UnifiedDB` class — the `db/` subsystem is the single entry point for all database access across the entire daemon.

**Key sqlite-worker patterns adopted:**

- **Worker thread for all SQLite I/O** — The main thread sends query requests via `postMessage()` and receives results asynchronously.
- **Tag-template query API** — A tagged template literal API that automatically handles parameter binding.
- **Connection lifecycle management** — The worker manages opening, WAL mode configuration, migrations, and closing.
- **Migration system** — Migrations run in the worker thread on startup, including the import of legacy database tables.
- **Honker coexistence** — The worker thread opens the database through Honker's `open()` when the native extension is available, falling back to `better-sqlite3` when it isn't. Either way, the same `agentsy.db` file is used for everything — queues, streams, business tables, and Honker's internal tables all coexist in one file.

```typescript
// packages/daemon/src/db/db-worker-entry.ts
// Worker thread entry point for async query execution

import Database from 'better-sqlite3';

let db: Database.Database | null = null;

process.on('message', async (msg: { id: number; method: string; params: any }) => {
  const { id, method, params } = msg;

  try {
    switch (method) {
      case 'open': {
        db = new Database(params.path);
        db.pragma('journal_mode = WAL');
        db.pragma(`busy_timeout = ${params.busyTimeoutMs ?? 5000}`);
        // If Honker native extension is available, load it
        if (params.extensionPath) {
          db.loadExtension(params.extensionPath);
          db.exec('SELECT honker_bootstrap()');
        }
        process.send!({ id, result: { opened: true } });
        break;
      }
      case 'migrate': {
        // Run unified schema migrations
        for (const migration of params.migrations) {
          db!.exec(migration.sql);
        }
        process.send!({ id, result: { migrated: true } });
        break;
      }
      case 'migrateFromLegacy': {
        // ATTACH legacy databases and import data
        const { memory, cortexkit, tokenomics } = params;
        if (memory) {
          db!.exec(`ATTACH DATABASE '${memory}' AS legacy_memory`);
          // Import each table from legacy_memory
          for (const table of params.memoryTables) {
            db!.exec(`INSERT OR IGNORE INTO main.${table} SELECT * FROM legacy_memory.${table}`);
          }
          db!.exec('DETACH DATABASE legacy_memory');
        }
        if (cortexkit) {
          db!.exec(`ATTACH DATABASE '${cortexkit}' AS legacy_cortexkit`);
          for (const table of params.cortexkitTables) {
            db!.exec(`INSERT OR IGNORE INTO main.${table} SELECT * FROM legacy_cortexkit.${table}`);
          }
          db!.exec('DETACH DATABASE legacy_cortexkit');
        }
        process.send!({ id, result: { imported: true } });
        break;
      }
      case 'query': {
        const stmt = db!.prepare(params.sql);
        const rows = stmt.all(...(params.params ?? []));
        process.send!({ id, result: rows });
        break;
      }
      case 'execute': {
        db!.exec(params.sql);
        process.send!({ id, result: { executed: true } });
        break;
      }
      case 'close': {
        db?.close();
        db = null;
        process.send!({ id, result: { closed: true } });
        break;
      }
      default:
        process.send!({ id, error: `Unknown method: ${method}` });
    }
  } catch (error: any) {
    process.send!({ id, error: error.message });
  }
});
```

### 1.9 SubprocessManager (Pup-Inspired Restart Policies)

The SubprocessManager tracks all child processes spawned by the daemon. Compared to v2, it now incorporates Pup's restart policy model, where each process definition includes a structured restart policy (`always`, `on-failure`, or `never`) with configurable backoff.

**Key Pup patterns adopted:**

- **Config-driven process definitions** — Each managed process is defined by a structured configuration object, specifying the command, restart policy, logging, and resource limits.
- **Restart policies** — `always` (restart on any exit), `on-failure` (restart only on non-zero exit code), `never` (no restart).
- **Exponential backoff with jitter** — Pup uses exponential backoff with random jitter to prevent restart storms when multiple processes fail simultaneously.
- **Structured logging with rotation** — Per-process log capture with rotation by size.
- **PID file management** — Process state persisted to SQLite for recovery after daemon restart.

```typescript
// packages/daemon/src/processes/subprocess-manager.ts (key changes from v2)

export type RestartPolicy = 'always' | 'on-failure' | 'never';

export interface SubprocessSpec {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stallTimeoutMs?: number;
  // Pup-inspired restart policy (replaces simple maxRestarts)
  restartPolicy?: RestartPolicy;   // Default: 'never'
  maxRestarts?: number;            // Max restarts within restartWindowMs (default: 5)
  restartWindowMs?: number;        // Time window for restart counting (default: 60_000)
  backoffBaseMs?: number;          // Initial restart delay (default: 1_000)
  backoffMaxMs?: number;           // Max restart delay (default: 30_000)
  backoffJitter?: boolean;         // Add random jitter (default: true, Pup pattern)
  memoryLimitMb?: number;
  // Pup-inspired logging configuration
  logging?: {
    stdout?: string;
    stderr?: string;
    maxFileSizeBytes?: number;
    maxFiles?: number;
  };
}

export class SubprocessManager extends EventEmitter {
  // ... (same structure as v2, with restart logic updated)

  /**
   * Pup-inspired restart policy evaluation.
   */
  private shouldRestart(spec: SubprocessSpec, exitCode: number | null): boolean {
    const policy = spec.restartPolicy ?? 'never';
    if (policy === 'never') return false;
    if (policy === 'always') return true;
    if (policy === 'on-failure') return exitCode !== 0;
    return false;
  }

  /**
   * Pup-inspired exponential backoff with jitter.
   * Prevents restart storms when multiple processes fail simultaneously.
   */
  private calculateBackoff(entry: {
    spec: SubprocessSpec;
    restartTimestamps: number[];
  }): number {
    const now = Date.now();
    const windowMs = entry.spec.restartWindowMs ?? 60_000;
    const maxRestarts = entry.spec.maxRestarts ?? 5;

    entry.restartTimestamps = entry.restartTimestamps.filter(t => t >= now - windowMs);

    if (entry.restartTimestamps.length >= maxRestarts) {
      return -1; // Don't restart
    }

    entry.restartTimestamps.push(now);
    const attempt = entry.restartTimestamps.length;

    const baseMs = entry.spec.backoffBaseMs ?? 1_000;
    const maxMs = entry.spec.backoffMaxMs ?? 30_000;
    let delay = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);

    // Add jitter (Pup pattern)
    if (entry.spec.backoffJitter !== false) {
      delay += Math.random() * delay * 0.25;
    }

    return Math.floor(delay);
  }
}
```

### 1.10 REST Control API (Pup Pattern)

Pup exposes a REST API for remote control and monitoring. We adopt the same pattern, providing a lightweight HTTP API that mirrors the IPC methods. This is useful for remote daemon monitoring, integration with external tools, health checks for containerized deployments, and TUI access.

```typescript
// packages/daemon/src/api/rest-server.ts

import { createServer, IncomingMessage, ServerResponse } from 'http';

export interface RestServerConfig {
  port: number;
  authToken?: string;
  daemon: Daemon;
  logger: Logger;
}

export class RestServer {
  private server: ReturnType<typeof createServer> | null = null;
  private config: RestServerConfig;

  constructor(config: RestServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      // Auth check
      if (this.config.authToken) {
        const auth = req.headers['authorization'];
        if (auth !== `Bearer ${this.config.authToken}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      const route = this.matchRoute(req.method ?? 'GET', req.url ?? '/');
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      try {
        const body = await this.readBody(req);
        const result = await route.handler(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (error) {
        this.config.logger.error('REST API error', { url: req.url, error });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: (error as Error).message }));
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, () => resolve());
    });

    this.config.logger.info('REST API started', { port: this.config.port });
  }

  private matchRoute(method: string, url: string): Route | null {
    const routes: Route[] = [
      { method: 'GET', path: '/api/v1/status', handler: () => this.config.daemon.getStatus() },
      { method: 'POST', path: '/api/v1/shutdown', handler: () => this.config.daemon.stop() },
      { method: 'GET', path: '/api/v1/agents', handler: () => this.config.daemon.agents.list() },
      { method: 'POST', path: '/api/v1/agents/spawn', handler: (b) => this.config.daemon.agents.spawn(b) },
      { method: 'POST', path: '/api/v1/agents/kill', handler: (b) => this.config.daemon.agents.kill(b.agentId) },
      { method: 'GET', path: '/api/v1/jobs', handler: () => this.config.daemon.jobs.list() },
      { method: 'POST', path: '/api/v1/jobs/enqueue', handler: (b) => this.config.daemon.jobs.enqueue(b.payload, b.options) },
      { method: 'GET', path: '/api/v1/schedules', handler: () => this.config.daemon.scheduler.list() },
      { method: 'POST', path: '/api/v1/schedules', handler: (b) => this.config.daemon.scheduler.schedule(b) },
      { method: 'GET', path: '/api/v1/pool/stats', handler: () => this.config.daemon.pool.stats() },
      { method: 'GET', path: '/api/v1/processes', handler: () => this.config.daemon.processes.listProcesses() },
      { method: 'POST', path: '/api/v1/processes/kill', handler: (b) => this.config.daemon.processes.killProcess(b.processId) },
    ];

    return routes.find(r => r.method === method && r.path === url) ?? null;
  }

  private async readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }
}

interface Route {
  method: string;
  path: string;
  handler: (body: Record<string, unknown>) => Promise<unknown>;
}
```

### 1.11 IPC Protocol

The IPC protocol uses JSON-RPC 2.0 over Unix domain sockets (or named pipes on Windows). Same as v2 with additional methods for Honker jobs, Bree scheduler, and Piscina pool stats.

```typescript
// packages/daemon/src/ipc/protocol.ts

// ── Base Protocol ────────────────────────────────

export interface IPCRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface IPCResponse {
  jsonrpc: '2.0';
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ── Streaming ────────────────────────────────────

export interface IPCStreamChunk {
  jsonrpc: '2.0';
  method: 'stream.chunk';
  params: {
    streamId: string;
    chunk: StreamChunk;
    index: number;
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
      recoverable: boolean;
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
  // Jobs (Honker-backed)
  | 'jobs.enqueue'
  | 'jobs.list'
  | 'jobs.cancel'
  | 'jobs.claim'
  | 'jobs.ack'
  // Scheduler (Bree)
  | 'scheduler.schedule'
  | 'scheduler.list'
  | 'scheduler.cancel'
  // Routing
  | 'route.select'
  | 'route.health'
  // RAG
  | 'rag.index'
  | 'rag.query'
  // Health
  | 'daemon.status'
  | 'daemon.shutdown'
  // Pool (Piscina)
  | 'pool.stats'
  // Display
  | 'display.render'
  // Subprocess management
  | 'process.spawn'
  | 'process.list'
  | 'process.kill'
  | 'process.output';
```

### 1.12 IPC Server Implementation

(Same as v2 Section 1.4 — the IPC server implementation is unchanged except for the additional handler methods listed above.)

### 1.13 IPC Client (Thin Client for CLI/TUI)

(Same as v2 Section 1.5 — unchanged.)

### 1.14 ACP Server, Capabilities, Session Bridge, Notification Adapter

(Same as v2 Sections 1.6–1.9 — the ACP implementation is unchanged.)

### 1.15 Terminal Bridge (ACP Terminal → Subprocess Mapping)

(Same as v2 Section 1.11 — unchanged.)

### 1.16 Service Host with Sleep/Wake

(Same as v2 Section 1.12 — unchanged.)

### 1.17 Agent Host (Multi-Agent Lifecycle with Piscina Pool)

The AgentHost now delegates CPU-intensive computation to the Piscina-backed AgentPool. Agent lifecycle management (spawn, kill, scope assignment) remains the same, but when processing a prompt, the heavy lifting runs in a worker thread.

```typescript
// packages/daemon/src/agents/agent-host.ts (key changes)

export class AgentHost {
  private agents = new Map<string, AgentInstance>();
  private streams = new Map<string, ActiveStream>();

  constructor(private deps: {
    memory: MemoryEngine;
    scopeManager: ScopeManager;
    pool: AgentPool;              // NEW: Piscina-backed pool
    logger: Logger;
    metrics: Metrics;
  }) {}

  async spawn(spec: AgentSpec): Promise<AgentInstance> {
    // ... same as v2
  }

  /**
   * Stream messages from an agent. CPU-intensive work is offloaded
   * to the Piscina pool via this.deps.pool.runTask().
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
      // Offload to Piscina worker pool with AbortSignal support
      const result = await this.deps.pool.runTask(
        { type: 'agent.compute', payload: { agentId, messages } },
        { signal: options?.signal, priority: 'high' }
      );

      yield { type: 'content', text: '' };
    } finally {
      agent.state = 'idle';
    }
  }

  // ... kill(), list(), count() same as v2
}
```

### 1.18 Scope Manager (Folder-Based Scoping)

(Same as v2 Section 1.14 — unchanged.)

### 1.19 Supervisor (Crash Recovery — Pup-Inspired)

The Supervisor now uses Pup-style restart policies with exponential backoff and jitter.

```typescript
// packages/daemon/src/lifecycle/supervisor.ts

export interface SupervisorPolicy {
  restartPolicy: 'always' | 'on-failure' | 'never';
  maxRestarts: number;
  restartWindowMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  backoffJitter: boolean;
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
        `Daemon exceeded ${this.deps.policy.maxRestarts} crashes. Giving up.`
      );
      process.exit(1);
    }

    const attempt = this.restartTimestamps.length;
    let delay = Math.min(
      this.deps.policy.backoffBaseMs * Math.pow(2, attempt - 1),
      this.deps.policy.backoffMaxMs
    );

    // Add jitter (Pup pattern)
    if (this.deps.policy.backoffJitter) {
      delay += Math.random() * delay * 0.25;
    }

    this.deps.logger.warn(`Daemon crashed. Restarting in ${Math.round(delay)}ms (attempt ${attempt})`);

    await sleep(Math.round(delay));

    try {
      await daemon.stop(false);
      await daemon.start();
      this.deps.logger.info('Daemon restarted successfully');
    } catch (error) {
      this.deps.logger.error('Daemon restart failed', error);
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

### 1.20 Daemon Configuration Schema

Extended to include Piscina pool, Honker queue, Bree scheduler, REST API, unified database, and SQLite worker settings.

```typescript
// packages/daemon/src/config.ts

export interface DaemonConfig {
  ipc: {
    socketPath: string;
    maxConnections: number;
    requestTimeoutMs: number;
  };

  acp: {
    enabled: boolean;
    transport: 'stdio' | 'websocket';
    websocketPort: number;
    maxSessions: number;
  };

  database: {
    path: string;                         // Unified database path (~/.agentsy/agentsy.db)
    honkerExtensionPath?: string;         // Path to libhonker_ext.so/.dylib
    blake3ExtensionPath?: string;         // Path to libblake3_ext.so/.dylib
    walMode: boolean;
    busyTimeoutMs: number;
  };

  // NEW: Piscina agent pool
  pool: {
    minThreads: number;
    maxThreads: number;
    idleTimeoutMs: number;
    maxQueueSize: number;
    concurrentTasksPerWorker: number;
    resourceLimits: {
      maxOldGenerationSizeMb: number;
      maxYoungGenerationSizeMb: number;
    };
  };

  // NEW: Honker job queue
  jobs: {
    jobDirectory: string;
    defaultRetries: number;
    defaultRetryDelayMs: number;
    defaultTimeoutMs: number;
    queues: string[];
  };

  // NEW: REST API (Pup pattern)
  api: {
    port: number;
    authToken?: string;
    enabled: boolean;
  };

  memory: {
    enabled: boolean;
    syncMode: 'local-only' | 'remote-shadow';
    tursoUrl?: string;
    tursoAuthToken?: string;
    consolidationThreshold: number;
    decayIntervalMs: number;
  };

  sleep: {
    idleTimeoutMs: number;
    wakeTimeoutMs: number;
    minActiveMs: number;
  };

  supervisor: {
    restartPolicy: 'always' | 'on-failure' | 'never';
    maxRestarts: number;
    restartWindowMs: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    backoffJitter: boolean;
  };

  subprocess: {
    defaultTimeoutMs: number;
    defaultStallTimeoutMs: number;
    defaultMemoryLimitMb: number;
    memoryCheckIntervalMs: number;
    defaultRestartPolicy: 'always' | 'on-failure' | 'never';
  };

  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
    maxSizeBytes: number;
    maxFiles: number;
  };

  metrics: {
    enabled: boolean;
    otelEndpoint?: string;
  };

  connectors: {
    discord?: { token: string };
    slack?: { token: string };
    telegram?: { token: string };
  };

  shutdownTimeoutMs: number;
}

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
    path: path.join(os.homedir(), '.agentsy', 'agentsy.db'),
    honkerExtensionPath: undefined,         // Auto-detect or configure explicitly
    blake3ExtensionPath: undefined,         // Auto-detect or configure explicitly
    walMode: true,
    busyTimeoutMs: 5000,
  },
  pool: {
    minThreads: 2,
    maxThreads: os.cpus().length,
    idleTimeoutMs: 30_000,
    maxQueueSize: 100,
    concurrentTasksPerWorker: 1,
    resourceLimits: {
      maxOldGenerationSizeMb: 256,
      maxYoungGenerationSizeMb: 64,
    },
  },
  jobs: {
    jobDirectory: path.join(os.homedir(), '.agentsy', 'jobs'),
    defaultRetries: 3,
    defaultRetryDelayMs: 1000,
    defaultTimeoutMs: 30_000,
    queues: ['default', 'agents', 'maintenance', 'indexing'],
  },
  api: {
    port: 9381,
    enabled: true,
  },
  memory: {
    enabled: true,
    syncMode: 'local-only',
    consolidationThreshold: 0.7,
    decayIntervalMs: 60_000,
  },
  sleep: {
    idleTimeoutMs: 5 * 60_000,
    wakeTimeoutMs: 5_000,
    minActiveMs: 30_000,
  },
  supervisor: {
    restartPolicy: 'always',
    maxRestarts: 5,
    restartWindowMs: 60_000,
    backoffBaseMs: 1_000,
    backoffMaxMs: 30_000,
    backoffJitter: true,
  },
  subprocess: {
    defaultTimeoutMs: 120_000,
    defaultStallTimeoutMs: 30_000,
    defaultMemoryLimitMb: 512,
    memoryCheckIntervalMs: 5_000,
    defaultRestartPolicy: 'on-failure',
  },
  logging: {
    level: 'info',
    maxSizeBytes: 10 * 1024 * 1024,
    maxFiles: 3,
  },
  metrics: {
    enabled: true,
  },
  connectors: {},
  shutdownTimeoutMs: 30_000,
};

export function resolveConfig(partial: Partial<DaemonConfig>): DaemonConfig {
  return deepMerge(DEFAULT_CONFIG, partial);
}
```

### 1.21 CLI Integration (bgproc-Inspired)

The CLI becomes a thin client inspired by bgproc's agent-friendly design. Key bgproc patterns adopted:

- **JSON output on stdout** — All commands produce machine-readable JSON on stdout, errors on stderr.
- **Port detection with wait** — `daemon start -w` waits until the daemon's REST API port is detected.
- **Log streaming** — `daemon logs --follow`, `--tail N`, `--errors` mirror bgproc's log streaming.
- **Clean stale processes** — `daemon clean --all` removes stale state.
- **Restart with preserved cwd** — `daemon restart` preserves configuration.

```typescript
// packages/cli/src/commands/daemon-start.ts

export class DaemonStartCommand extends Command {
  static flags = {
    wait: Flags.boolean({ char: 'w', description: 'Wait for daemon API port' }),
    force: Flags.boolean({ char: 'f', description: 'Kill existing and restart' }),
  };

  async run(): Promise<void> {
    const { wait, force } = await this.parse(DaemonStartCommand).flags;
    const socketPath = getSocketPath();

    if (force && isDaemonRunning(socketPath)) {
      await stopDaemon(socketPath);
    }

    if (!isDaemonRunning(socketPath)) {
      this.logToStderr('Starting daemon...');
      await startDaemon();
    }

    if (wait) {
      const port = await waitForDaemonPort(10_000);
      // bgproc pattern: JSON with port to stdout
      this.log(JSON.stringify({
        name: 'agentsy-daemon',
        pid: getDaemonPid(),
        running: true,
        port,
        socket: socketPath,
      }));
    }
  }
}

// packages/cli/src/commands/daemon-logs.ts

export class DaemonLogsCommand extends Command {
  static flags = {
    follow: Flags.boolean({ description: 'Stream logs in real time' }),
    tail: Flags.integer({ description: 'Show last N lines', default: 50 }),
    errors: Flags.boolean({ description: 'Show stderr only' }),
  };

  async run(): Promise<void> {
    const { follow, tail, errors } = await this.parse(DaemonLogsCommand).flags;
    const logPath = getDaemonLogPath();

    if (follow) {
      const tailProc = spawn('tail', ['-f', logPath]);
      tailProc.stdout?.pipe(process.stdout);
      tailProc.stderr?.pipe(errors ? process.stderr : process.stdout);
    } else {
      const content = await readLastNLines(logPath, tail);
      this.log(content);
    }
  }
}

// packages/cli/src/commands/daemon-clean.ts

export class DaemonCleanCommand extends Command {
  static flags = {
    all: Flags.boolean({ description: 'Clean all stale daemon state' }),
  };

  async run(): Promise<void> {
    const { all } = await this.parse(DaemonCleanCommand).flags;
    if (all) {
      await cleanStaleDaemonState();
      this.log(JSON.stringify({ cleaned: true }));
    }
  }
}
```

### 1.22 Dependency Summary

New runtime dependencies introduced in this phase:

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `piscina` | ^4.x | Worker thread pool for agent computation | Custom worker management |
| `bree` | ^9.x | Cron/interval/one-time job scheduling | Custom timer-based scheduler |
| `@russellthehippo/honker-node` | ^0.x | Honker native extension binding — durable queues, streams, pub/sub, scheduling on SQLite | Custom SQLite job table, in-memory pub/sub, in-memory task queue, in-memory scheduler |
| `better-sqlite3` | ^11.x | Synchronous SQLite in worker thread (fallback when Honker extension unavailable) | (already a dependency) |

These dependencies are all well-maintained and specifically designed for the use cases we need. The Honker Node binding (`@russellthehippo/honker-node`) wraps the native SQLite loadable extension (`libhonker_ext`) and provides durable queues, streams, NOTIFY/LISTEN cross-process wake, and time-trigger scheduling — all on the same `agentsy.db` file as the application's business tables. When the native extension is not available, the system falls back to `better-sqlite3` with a polling-based queue implementation.

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
| `vscode` | 75 | **Keep** | — | Published integration library for GitHub Copilot Chat; consumed by third-party VS Code extensions |
| `cli` | 71 | **Keep** | — | Distinct deployment boundary (becomes thin daemon client) |

**Note on `@agentsy/vscode` preservation**: The `@agentsy/vscode` package is **kept**. It is not a custom VS Code extension — it is a published npm library (`@agentsy/vscode` on npm) that provides reusable abstractions (`BaseLanguageModelChatProvider`, `ApiKeyManager`, `VSCodeStreamBridge`, `McpServerRegistry`, message conversion, usage tracking, etc.) for third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat. Several existing VS Code plugins depend on this package. ACP and `@agentsy/vscode` serve complementary purposes: ACP handles agent–editor communication (daemon ↔ editor), while `@agentsy/vscode` handles model provider integration within VS Code extensions (provider ↔ Copilot Chat API).

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
├── vscode/        ← Copilot Chat integration library (published, used by third-party extensions)
├── cli/           ← Thin daemon client + TUI
```

**Reduction**: 27 → 24 packages (merge 4, create 1 new, move 1 to root). The `scripts/` package moves to root tooling. The `vscode/` package is preserved as a published Copilot Chat integration library.

### Migration Steps

1. Move `packages/shared/src/**` → `packages/types/src/shared/`
2. Move `packages/workflows/IMPLEMENTATION-PLAN.md` → `packages/orchestrator/docs/workflows-plan.md`
3. Move `packages/mcp/src/**` → `packages/daemon/src/mcp/`
4. Move `packages/connectors/src/**` → `packages/daemon/src/connectors/`
5. Move `packages/ui/src/**` → `packages/renderers/src/ui/`
6. Move `packages/scripts/**` → `scripts/` at repo root
7. ~~Delete `packages/vscode/`~~ **Preserved** — `@agentsy/vscode` is a published Copilot Chat integration library used by third-party VS Code extensions
8. Update all `package.json` dependencies and imports (ensure `@agentsy/vscode` continues to export stable API surface)
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

```
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

This phase replaces the v1 plan's custom VS Code extension work with ACP Agent integration and adds multi-agent scope isolation. The `@agentsy/vscode` package is preserved as a Copilot Chat integration library (distinct from the custom extension that ACP replaces). The daemon's ACP server was built in Phase 1 (Sections 1.6–1.9); this phase wires it to the streaming pipeline, adds tool execution through ACP's `terminal/*` methods, and implements the full multi-agent deployment model.

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

These are capabilities that the framework is missing from an AI agent best-practices perspective. They're not bugs — they're features that competing frameworks have and users will expect. The custom VS Code extension items from v1 have been removed and replaced with ACP-specific capabilities. The `@agentsy/vscode` library (Copilot Chat integration layer) is preserved separately.

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
vscode/          (75)   ← Keep (published Copilot Chat integration library)
workflows/       (1)    ← Merge into orchestrator
```

### After (24 packages + root scripts)

```
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

vscode/          ← Keep (Copilot Chat integration library, published, used by third-party extensions)

scripts/         ← Root-level tooling (not a package)
```

**Note**: The `vscode/` package is preserved. It is a published npm integration library (`@agentsy/vscode`) consumed by third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat. ACP (agent–editor communication) and `@agentsy/vscode` (provider–Copilot Chat integration) are complementary, not overlapping.

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

```
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

*End of Agentsy Remediation Plan v2.0*
