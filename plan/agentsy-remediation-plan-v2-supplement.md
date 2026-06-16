# Agentsy Remediation Plan — v2 Supplement

**Version**: 2.0  
**Date**: 2026-06-16  
**Supersedes**: Sections 1.1, 1.3, 1.4, 1.5, 1.7, 1.11, 5, 8, 11, Appendix B, Appendix C of v1  
**Status**: DRAFT

This document amends the v1 remediation plan (`agentsy-remediation-plan.md`) with four major architectural changes:

1. **gRPC for internal daemon IPC** — Replace JSON-RPC over Unix sockets with gRPC + protobuf
2. **First-class ACP support** — Daemon speaks the Agent Client Protocol natively; drop custom VS Code extension
3. **Subprocess management** — Daemon manages child processes, kills stalled ones
4. **Directory-based scope isolation** — Memory scopes derived from working directory or ACP client context

---

## Table of Contents

1. [Change Summary](#1-change-summary)
2. [Revised Architecture](#2-revised-architecture)
3. [gRPC Internal IPC](#3-grpc-internal-ipc)
4. [ACP Integration](#4-acp-integration)
5. [Subprocess Management](#5-subprocess-management)
6. [Directory-Based Scope Isolation](#6-directory-based-scope-isolation)
7. [Revised Package Consolidation](#7-revised-package-consolidation)
8. [Revised Effort Estimates](#8-revised-effort-estimates)

---

## 1. Change Summary

| Area | v1 Decision | v2 Decision | Rationale |
|------|-------------|-------------|-----------|
| **Internal IPC** | JSON-RPC 2.0 over Unix sockets | **gRPC with protobuf** | Strong typing, bidirectional streaming, code generation, ~10x lower latency for token streaming |
| **Editor integration** | Custom VS Code extension | **ACP-first** (Zed + VS Code ACP Client extension) | ACP is the emerging standard (Zed + JetBrains); avoids maintaining a custom extension; instant editor support |
| **Subprocess mgmt** | None | **Daemon manages child processes** with stall detection + kill | Agent tools run as subprocesses; daemon must detect hangs (no stdout for N seconds) and SIGKILL |
| **Scope isolation** | Explicit `memoryScope` string | **Working directory-based** (`project:hash(cwd)`) with ACP context override | Natural mapping — each project folder is its own scope; ACP clients pass their own context |
| **VS Code extension** | Keep `packages/vscode/` (75 files) | **Drop it** — replace with ACP agent compliance | The ACP Client extension for VS Code handles the editor side; Agentsy only needs to be an ACP-compliant agent |

### What Stays the Same

All v1 decisions remain unchanged unless explicitly overridden here:
- Phase 0 (Critical Bug Fixes) — unchanged
- Phase 3 (Hook Pipeline Redesign) — unchanged
- Phase 4 (Gateway → Daemon) — unchanged
- Phase 6 (RAG as Daemon Service) — unchanged
- Phase 7 (Learning Loop) — unchanged
- Phase 9 (Missing Capabilities) — unchanged

---

## 2. Revised Architecture

### High-Level Topology

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│   Zed Editor │────►│              │     │                          │
│   (ACP stdio)│     │              │     │   AGENTSY DAEMON         │
└──────────────┘     │   ACP Bus    │     │                          │
                     │   (stdio +   │────►│   ┌─────────────────┐   │
┌──────────────┐     │    internal) │     │   │  Agent Host     │   │
│  VS Code +   │────►│              │     │   │  (multi-agent)  │   │
│  ACP Client  │     │              │     │   └────────┬────────┘   │
│  Extension   │     └──────────────┘     │            │            │
└──────────────┘                           │   ┌────────▼────────┐   │
                                           │   │  Subprocess Mgr │   │
┌──────────────┐     ┌──────────────┐     │   │  (spawn/kill)   │   │
│   CLI / TUI  │────►│   gRPC       │     │   └────────┬────────┘   │
│   (Ink)      │◄────│   Server     │◄────│            │            │
└──────────────┘     └──────────────┘     │   ┌────────▼────────┐   │
                                           │   │  Tool Executor  │   │
                                           │   │  (sandboxed)    │   │
                                           │   └────────┬────────┘   │
                                           │            │            │
                                           │   ┌────────▼────────┐   │
                                           │   │  Memory Engine  │   │
                                           │   │  (5-tier cog.)  │   │
                                           │   └────────┬────────┘   │
                                           │            │            │
                                           │   ┌────────▼────────┐   │
                                           │   │  Routing / GW   │   │
                                           │   │  (providers)    │   │
                                           │   └────────┬────────┘   │
                                           │            │            │
                                           │   ┌────────▼────────┐   │
                                           │   │  RAG Service    │   │
                                           │   │  (background)   │   │
                                           │   └─────────────────┘   │
                                           │                          │
                                           │   ┌─────────────────┐   │
                                           │   │  Job Scheduler  │   │
                                           │   │  (SQLite-backed)│   │
                                           │   └─────────────────┘   │
                                           └──────────────────────────┘
```

### Dual Transport Model

The daemon exposes **two transport endpoints**:

| Transport | Protocol | Clients | Use Case |
|-----------|----------|---------|----------|
| **gRPC** | Protobuf over Unix socket | CLI, TUI (Ink) | Low-latency streaming, typed RPC, bidirectional |
| **ACP** | JSON-RPC 2.0 over stdio | Zed, VS Code + ACP Client ext | Standard editor↔agent protocol |

Both transports funnel into the same daemon core. The daemon is transport-agnostic — it registers handlers that are invoked regardless of which transport the request came from.

---

## 3. gRPC Internal IPC

### Why gRPC Instead of JSON-RPC

| Criterion | JSON-RPC over Unix socket | gRPC over Unix socket |
|-----------|--------------------------|----------------------|
| **Type safety** | Runtime only (manual validation) | Compile-time (protobuf codegen) |
| **Streaming** | Manual (newline-delimited JSON) | Native bidirectional streaming |
| **Token streaming perf** | ~200µs per chunk (JSON parse) | ~20µs per chunk (protobuf decode) |
| **Code generation** | None — hand-write types | Auto-generate client/server stubs |
| **Service definition** | Scattered across handlers | Single `.proto` file — living docs |
| **Error handling** | Custom error codes | Standard gRPC status codes |
| **Deadline/timeout** | Manual timeout logic | Built-in deadline propagation |
| **Backpressure** | Manual (ReadableStream) | Built-in flow control |

### Proto Service Definitions

```protobuf
// packages/daemon/proto/agentsy.proto

syntax = "proto3";
package agentsy;

// ── Common Messages ──────────────────────────────

message Empty {}

message DaemonStatus {
  DaemonState state = 1;
  int32 pid = 2;
  double uptime_seconds = 3;
  int32 active_agents = 4;
  int32 active_streams = 5;
  int32 active_subprocesses = 6;
  map<string, string> service_states = 7; // name → "active"|"sleeping"|"error"
}

enum DaemonState {
  DAEMON_STATE_UNSPECIFIED = 0;
  STARTING = 1;
  RUNNING = 2;
  STOPPING = 3;
  STOPPED = 4;
  CRASHED = 5;
}

// ── Agent Management ─────────────────────────────

message SpawnAgentRequest {
  string agent_id = 1;
  string role = 2;            // coder, researcher, planner, general
  string scope = 3;           // Memory scope (auto-derived from cwd if empty)
  string model_tier = 4;      // micro, small, mid, frontier
  int64 max_tokens_per_session = 5;
  int64 max_tokens_per_turn = 6;
  repeated string capabilities = 7;
}

message SpawnAgentResponse {
  string agent_id = 1;
  AgentState state = 2;
}

message ListAgentsRequest {}

message ListAgentsResponse {
  repeated AgentInfo agents = 1;
}

message KillAgentRequest {
  string agent_id = 1;
  bool force = 2;             // SIGKILL instead of graceful
}

message KillAgentResponse {}

message AgentInfo {
  string agent_id = 1;
  string role = 2;
  string scope = 3;
  AgentState state = 4;
  string current_task = 5;
  int32 turns_completed = 6;
  int64 tokens_used = 7;
  int64 last_activity_epoch_ms = 8;
  int32 active_subprocesses = 9;
}

enum AgentState {
  AGENT_STATE_UNSPECIFIED = 0;
  IDLE = 1;
  RUNNING = 2;
  WAITING_APPROVAL = 3;
  ERROR = 4;
  STOPPED = 5;
}

// ── Streaming (LLM Token Stream) ─────────────────

message StartStreamRequest {
  string agent_id = 1;
  string prompt = 2;
  repeated Message messages = 3;
  string model_tier = 4;
  repeated ToolDef tools = 5;
  int64 timeout_ms = 6;
}

message StreamChunk {
  string stream_id = 1;
  oneof event {
    ContentEvent content = 2;
    ThinkingEvent thinking = 3;
    ToolCallEvent tool_call = 4;
    ToolResultEvent tool_result = 5;
    DoneEvent done = 6;
    ErrorEvent error = 7;
  }
  int32 index = 8;
}

message ContentEvent {
  string text = 1;
}

message ThinkingEvent {
  string text = 1;
}

message ToolCallEvent {
  string call_id = 1;
  string name = 2;
  string arguments_json = 3;
}

message ToolResultEvent {
  string call_id = 1;
  string result_json = 2;
  bool is_error = 3;
}

message DoneEvent {
  TokenUsage usage = 1;
  int32 total_chunks = 2;
}

message ErrorEvent {
  int32 code = 1;
  string message = 2;
  bool recoverable = 3;
}

message CancelStreamRequest {
  string stream_id = 1;
}

message CancelStreamResponse {}

message Message {
  string role = 1;            // system, user, assistant, tool
  string content = 2;
  string name = 3;            // For tool role
  string tool_call_id = 4;
  repeated ToolCall tool_calls = 5;
}

message ToolCall {
  string id = 1;
  string name = 2;
  string arguments_json = 3;
}

message ToolDef {
  string name = 1;
  string description = 2;
  string parameters_json_schema = 3;
}

message TokenUsage {
  int64 input_tokens = 1;
  int64 output_tokens = 2;
  int64 total_tokens = 3;
  int64 reasoning_tokens = 4;
}

// ── Memory Operations ────────────────────────────

message RecallRequest {
  string query = 1;
  string scope = 2;
  int32 limit = 3;
  double min_relevance = 4;
}

message RecallResponse {
  repeated MemoryItem items = 1;
  string context_xml = 2;     // Pre-packed XML context
  int32 total_retrieved = 3;
}

message CaptureRequest {
  string content = 1;
  string scope = 2;
  string kind = 3;            // semantic, episodic, procedural, sensory
  map<string, string> metadata = 4;
}

message CaptureResponse {
  string item_id = 1;
  string fingerprint = 2;
  string tier = 3;
}

message SearchRequest {
  string query = 1;
  string scope = 2;
  int32 limit = 3;
  SearchMode mode = 4;
}

enum SearchMode {
  SEARCH_MODE_UNSPECIFIED = 0;
  HYBRID = 1;                 // Vector + keyword
  VECTOR_ONLY = 2;
  KEYWORD_ONLY = 3;
}

message SearchResponse {
  repeated SearchResult results = 1;
}

message SearchResult {
  string id = 1;
  string content = 2;
  double score = 3;
  string source = 4;          // vector, keyword, both
}

message MemoryItem {
  string id = 1;
  string content = 2;
  double importance = 3;
  double relevance = 4;
  string tier = 5;
  string kind = 6;
  int64 timestamp_epoch_ms = 7;
}

// ── Job Scheduling ───────────────────────────────

message ScheduleJobRequest {
  string name = 1;
  string type = 2;            // cron, fixed_rate, one_time
  string schedule = 3;        // Cron expression, ISO duration, or epoch millis
  string handler = 4;
  string params_json = 5;
  string scope = 6;
}

message ScheduleJobResponse {
  string job_id = 1;
}

message ListJobsRequest {}

message ListJobsResponse {
  repeated JobInfo jobs = 1;
}

message CancelJobRequest {
  string job_id = 1;
}

message CancelJobResponse {}

message JobInfo {
  string job_id = 1;
  string name = 2;
  string type = 3;
  string schedule = 4;
  string handler = 5;
  bool enabled = 6;
  int64 last_run_epoch_ms = 7;
  string last_status = 8;
}

// ── Subprocess Management ────────────────────────

message SpawnSubprocessRequest {
  string agent_id = 1;
  string command = 2;
  repeated string args = 3;
  map<string, string> env = 4;
  string cwd = 5;
  int64 timeout_ms = 6;       // Max runtime before stall detection
  int64 stall_timeout_ms = 7; // No-stdout timeout (default: 30s)
}

message SpawnSubprocessResponse {
  string subprocess_id = 1;
  int32 pid = 2;
}

message SubprocessOutput {
  string subprocess_id = 1;
  oneof output {
    StdoutData stdout = 2;
    StderrData stderr = 3;
    ExitData exit = 4;
    StallWarning stall = 5;
  }
}

message StdoutData {
  bytes data = 1;
}

message StderrData {
  bytes data = 1;
}

message ExitData {
  int32 exit_code = 1;
  string signal = 2;          // SIGTERM, SIGKILL, etc.
  int64 duration_ms = 3;
}

message StallWarning {
  int64 silent_ms = 1;        // How long since last stdout
  int64 timeout_ms = 2;       // When it will be killed
}

message KillSubprocessRequest {
  string subprocess_id = 1;
  bool force = 2;             // SIGKILL instead of SIGTERM
}

message KillSubprocessResponse {}

message ListSubprocessesRequest {
  string agent_id = 1;        // Filter by agent, empty = all
}

message ListSubprocessesResponse {
  repeated SubprocessInfo processes = 1;
}

message SubprocessInfo {
  string subprocess_id = 1;
  string agent_id = 2;
  int32 pid = 3;
  string command = 4;
  SubprocessState state = 5;
  int64 started_epoch_ms = 6;
  int64 last_output_epoch_ms = 7;
}

enum SubprocessState {
  SUBPROCESS_STATE_UNSPECIFIED = 0;
  SPAWNING = 1;
  RUNNING = 2;
  STALLED = 3;
  EXITED = 4;
  KILLED = 5;
}

// ── RAG Operations ───────────────────────────────

message RAGQueryRequest {
  string query = 1;
  string scope = 2;
  int32 limit = 3;
  double min_relevance = 4;
}

message RAGQueryResponse {
  repeated RAGResult results = 1;
  string packed_context = 2;  // XML-packed context for injection
}

message RAGResult {
  string id = 1;
  string content = 2;
  double score = 3;
  string source = 4;
  map<string, string> metadata = 5;
}

message RAGIndexRequest {
  string scope = 1;
  bool incremental = 2;       // Only index new/changed documents
}

message RAGIndexResponse {
  int32 documents_indexed = 1;
  int32 vectors_created = 2;
  int64 duration_ms = 3;
}

// ── Routing ──────────────────────────────────────

message RouteRequest {
  string tier = 1;
  repeated string capabilities = 2;
  double max_cost_per_1k_input = 3;
  double max_cost_per_1k_output = 4;
}

message RouteResponse {
  string model_id = 1;
  string provider_id = 2;
  string replica_id = 3;
  string tier = 4;
  bool spillover = 5;
  double estimated_cost_per_1k_input = 6;
}

// ── Diagnostics ──────────────────────────────────

message HealthReportRequest {}

message HealthReportResponse {
  DaemonStatus daemon = 1;
  repeated AgentInfo agents = 2;
  RoutingHealth routing = 3;
  MemoryHealth memory = 4;
  repeated JobInfo jobs = 5;
}

message RoutingHealth {
  int32 models_registered = 1;
  int32 healthy_providers = 2;
  int32 total_providers = 3;
}

message MemoryHealth {
  int32 scope_count = 1;
  int64 total_items = 2;
  int64 last_consolidation_epoch_ms = 3;
}

// ══════════════════════════════════════════════════
// Service Definitions
// ══════════════════════════════════════════════════

service AgentService {
  rpc SpawnAgent(SpawnAgentRequest) returns (SpawnAgentResponse);
  rpc ListAgents(ListAgentsRequest) returns (ListAgentsResponse);
  rpc KillAgent(KillAgentRequest) returns (KillAgentResponse);
}

service StreamService {
  // Bidirectional streaming: client sends StartStreamRequest, 
  // server streams back StreamChunks
  rpc StartStream(StartStreamRequest) returns (stream StreamChunk);
  rpc CancelStream(CancelStreamRequest) returns (CancelStreamResponse);
}

service MemoryService {
  rpc Recall(RecallRequest) returns (RecallResponse);
  rpc Capture(CaptureRequest) returns (CaptureResponse);
  rpc Search(SearchRequest) returns (SearchResponse);
}

service JobService {
  rpc ScheduleJob(ScheduleJobRequest) returns (ScheduleJobResponse);
  rpc ListJobs(ListJobsRequest) returns (ListJobsResponse);
  rpc CancelJob(CancelJobRequest) returns (CancelJobResponse);
}

service SubprocessService {
  // Bidirectional: client sends spawn request, server streams stdout/stderr/exit
  rpc Spawn(SpawnSubprocessRequest) returns (stream SubprocessOutput);
  rpc Kill(KillSubprocessRequest) returns (KillSubprocessResponse);
  rpc ListSubprocesses(ListSubprocessesRequest) returns (ListSubprocessesResponse);
}

service RAGService {
  rpc Query(RAGQueryRequest) returns (RAGQueryResponse);
  rpc TriggerIndexing(RAGIndexRequest) returns (RAGIndexResponse);
}

service RoutingService {
  rpc SelectModel(RouteRequest) returns (RouteResponse);
}

service DiagnosticsService {
  rpc GetHealth(HealthReportRequest) returns (HealthReportResponse);
}

service DaemonService {
  rpc GetStatus(Empty) returns (DaemonStatus);
  rpc Shutdown(Empty) returns (Empty);
}
```

### gRPC Server Implementation

```typescript
// packages/daemon/src/grpc/server.ts

import { createServer, ServerCredentials } from '@grpc/grpc-js';
import { loadProto } from './proto-loader.js';

export class GRPCServer {
  private server: ReturnType<typeof createServer> | null = null;
  private services: Map<string, object> = new Map();

  constructor(private config: {
    socketPath: string;
    logger: Logger;
  }) {}

  async start(handlers: ServiceHandlers): Promise<void> {
    const proto = loadProto(require.resolve('../proto/agentsy.proto'));

    this.server = createServer();

    // Register all services
    this.server.addService(proto.AgentService.service, {
      spawnAgent: handlers.agents.spawn.bind(handlers.agents),
      listAgents: handlers.agents.list.bind(handlers.agents),
      killAgent: handlers.agents.kill.bind(handlers.agents),
    });

    this.server.addService(proto.StreamService.service, {
      startStream: handlers.streaming.start.bind(handlers.streaming),
      cancelStream: handlers.streaming.cancel.bind(handlers.streaming),
    });

    this.server.addService(proto.MemoryService.service, {
      recall: handlers.memory.recall.bind(handlers.memory),
      capture: handlers.memory.capture.bind(handlers.memory),
      search: handlers.memory.search.bind(handlers.memory),
    });

    this.server.addService(proto.SubprocessService.service, {
      spawn: handlers.subprocess.spawn.bind(handlers.subprocess),
      kill: handlers.subprocess.kill.bind(handlers.subprocess),
      listSubprocesses: handlers.subprocess.list.bind(handlers.subprocess),
    });

    this.server.addService(proto.RAGService.service, {
      query: handlers.rag.query.bind(handlers.rag),
      triggerIndexing: handlers.rag.triggerIndexing.bind(handlers.rag),
    });

    this.server.addService(proto.RoutingService.service, {
      selectModel: handlers.routing.selectModel.bind(handlers.routing),
    });

    this.server.addService(proto.DiagnosticsService.service, {
      getHealth: handlers.diagnostics.getHealth.bind(handlers.diagnostics),
    });

    this.server.addService(proto.DaemonService.service, {
      getStatus: handlers.daemon.getStatus.bind(handlers.daemon),
      shutdown: handlers.daemon.shutdown.bind(handlers.daemon),
    });

    // Remove stale socket
    try { await fs.unlink(this.config.socketPath); } catch { /* doesn't exist */ }

    await new Promise<void>((resolve, reject) => {
      this.server!.bind(
        `unix://${this.config.socketPath}`,
        ServerCredentials.createInsecure()
      );
      this.server!.start();
      resolve();
    });

    this.config.logger.info('gRPC server started', {
      socket: this.config.socketPath,
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) =>
        this.server!.tryShutdown(() => resolve())
      );
      this.server = null;
    }
    try { await fs.unlink(this.config.socketPath); } catch { /* fine */ }
  }
}
```

### gRPC Client (for CLI/TUI)

```typescript
// packages/daemon/src/grpc/client.ts

import { credentials, Client } from '@grpc/grpc-js';
import { loadProto } from './proto-loader.js';

export class DaemonGRPCClient {
  private agentService: any;
  private streamService: any;
  private memoryService: any;
  private subprocessService: any;
  private ragService: any;
  private routingService: any;
  private diagnosticsService: any;
  private daemonService: any;

  async connect(socketPath: string): Promise<void> {
    const proto = loadProto(require.resolve('../proto/agentsy.proto'));
    const address = `unix://${socketPath}`;
    const creds = credentials.createInsecure();

    this.agentService = new proto.AgentService(address, creds);
    this.streamService = new proto.StreamService(address, creds);
    this.memoryService = new proto.MemoryService(address, creds);
    this.subprocessService = new proto.SubprocessService(address, creds);
    this.ragService = new proto.RAGService(address, creds);
    this.routingService = new proto.RoutingService(address, creds);
    this.diagnosticsService = new proto.DiagnosticsService(address, creds);
    this.daemonService = new proto.DaemonService(address, creds);
  }

  // ── Streaming ──────────────────────────────────

  /**
   * Start a token stream. Returns an async iterable of StreamChunks.
   * This is the primary way the TUI consumes LLM output.
   */
  async *startStream(request: StartStreamRequest): AsyncGenerator<StreamChunk> {
    const call = this.streamService.startStream(request);

    for await (const chunk of call) {
      yield chunk;
    }
  }

  // ── Subprocess ─────────────────────────────────

  /**
   * Spawn a subprocess and stream its output.
   * Used by the CLI/TUI to run tool commands with live output.
   */
  async *spawnSubprocess(request: SpawnSubprocessRequest): AsyncGenerator<SubprocessOutput> {
    const call = this.subprocessService.spawn(request);

    for await (const output of call) {
      yield output;
    }
  }

  // ── Agent Management ───────────────────────────

  async spawnAgent(request: SpawnAgentRequest): Promise<SpawnAgentResponse> {
    return promisify(this.agentService.spawnAgent, request);
  }

  async listAgents(): Promise<ListAgentsResponse> {
    return promisify(this.agentService.listAgents, {});
  }

  async killAgent(agentId: string, force = false): Promise<void> {
    await promisify(this.agentService.killAgent, { agent_id: agentId, force });
  }

  // ... memory, RAG, routing, diagnostics methods

  async disconnect(): Promise<void> {
    // gRPC clients don't need explicit close, but we can clean up
    this.agentService?.close?.();
    this.streamService?.close?.();
    this.memoryService?.close?.();
    this.subprocessService?.close?.();
    this.ragService?.close?.();
    this.routingService?.close?.();
    this.diagnosticsService?.close?.();
    this.daemonService?.close?.();
  }
}

function promisify<TReq, TRes>(
  method: (req: TReq, callback: (err: any, res: TRes) => void) => void,
  request: TReq
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    method(request, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
```

### Proto Code Generation

Add to `packages/daemon/package.json`:

```json
{
  "scripts": {
    "proto:generate": "grpc_tools_node_protoc \
      --js_out=import_style=commonjs,binary:./src/grpc/generated \
      --ts_out=import_style=commonjs,binary:./src/grpc/generated \
      --grpc_out=grpc_js:./src/grpc/generated \
      -I ./proto \
      ./proto/agentsy.proto",
    "proto:watch": "nodemon --watch proto --exec 'npm run proto:generate'"
  },
  "devDependencies": {
    "grpc-tools": "^1.12.4",
    "grpc_tools_node_protoc_ts": "^5.3.3"
  }
}
```

---

## 4. ACP Integration

### What is ACP?

The Agent Client Protocol (ACP) is an open JSON-RPC 2.0 standard for communication between code editors (IDEs) and AI coding agents. It was co-developed by Zed and JetBrains. Key features:

- **JSON-RPC 2.0 over stdio** — The agent is spawned as a child process; communication happens over stdin/stdout
- **Bidirectional** — Both the agent and the client can send requests and notifications
- **Capabilities negotiation** — `initialize` handshake declares what each side supports
- **File I/O** — Agent can read/write files on the client's filesystem (`fs/read_text_file`, `fs/write_text_file`)
- **Terminal management** — Agent can create terminals, get output, wait for exit, kill commands
- **Tool calls with permission** — Agent requests permission from the user before executing sensitive operations
- **Session management** — Multiple independent sessions with their own context
- **Extension methods** — Custom methods beyond the spec (`ext/*`)

### How Agentsy Becomes an ACP Agent

Instead of running as a standalone stdio process (the typical ACP agent pattern), the Agentsy daemon acts as an ACP agent server that can be connected to by ACP clients. This is a slight variation from the standard pattern but is compatible with the spec — ACP doesn't mandate stdio, it just recommends it.

The daemon will support two ACP connection modes:

1. **stdio mode** — For direct editor spawning (the standard pattern). The editor spawns `agentsy acp` as a child process.
2. **gRPC bridge mode** — For when the daemon is already running. The `agentsy acp` command connects to the daemon via gRPC and bridges ACP messages.

```typescript
// packages/daemon/src/acp/agent.ts

import { ACPAgent, ACPAgentConfig } from '@agent-client-protocol/agent-client-protocol-sdk';

export interface AgentsyACPAgentConfig {
  daemonClient: DaemonGRPCClient;    // Connect to the running daemon
  logger: Logger;
}

/**
 * Agentsy's ACP agent implementation.
 * 
 * This bridges the ACP protocol (JSON-RPC over stdio) to the daemon's
 * internal gRPC services. When an ACP client (Zed, VS Code) sends a
 * request, it's translated to a gRPC call to the daemon.
 */
export class AgentsyACPAgent {
  private agent: ACPAgent;
  private daemonClient: DaemonGRPCClient;
  private currentScope: string;

  constructor(private config: AgentsyACPAgentConfig) {
    this.agent = new ACPAgent({
      name: 'agentsy',
      version: '0.1.0',
      description: 'Agentsy AI coding agent',
    });

    this.daemonClient = config.daemonClient;
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // ── Session Lifecycle ────────────────────────

    this.agent.onRequest('session/start', async (params) => {
      // Derive scope from the working directory passed by the client
      this.currentScope = this.deriveScope(params);

      // Ensure an agent exists for this scope
      const agents = await this.daemonClient.listAgents();
      const existing = agents.agents.find(a => a.scope === this.currentScope);

      if (!existing) {
        await this.daemonClient.spawnAgent({
          agent_id: `acp_${Date.now()}`,
          role: 'coder',           // Default role for ACP sessions
          scope: this.currentScope,
          model_tier: 'frontier',  // Default, can be overridden
          capabilities: [
            'fs.readTextFile',
            'fs.writeTextFile',
            'terminal',
          ],
        });
      }

      return {
        capabilities: {
          // Advertise what the agent can do
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
          terminal: true,
          toolCalls: true,
        },
        sessionId: params.sessionId,
      };
    });

    // ── Prompt ───────────────────────────────────

    this.agent.onRequest('prompt', async (params) => {
      // This is the main interaction: user sends a prompt, agent responds
      // Stream the response back via ACP notifications

      const streamId = uuid();

      // Start streaming from the daemon
      const stream = this.daemonClient.startStream({
        agent_id: this.getAgentIdForScope(this.currentScope),
        prompt: params.text,
        messages: (params.messages ?? []).map(m => ({
          role: m.role,
          content: m.text ?? '',
        })),
        model_tier: 'frontier',
      });

      let fullText = '';

      for await (const chunk of stream) {
        switch (chunk.event) {
          case 'content':
            fullText += chunk.content.text;
            // Send ACP notification with the text delta
            this.agent.notify('session/update', {
              sessionId: params.sessionId,
              type: 'text_delta',
              text: chunk.content.text,
            });
            break;

          case 'tool_call':
            // Forward tool call to ACP client for permission
            const permission = await this.agent.request('requestPermission', {
              sessionId: params.sessionId,
              toolCall: {
                id: chunk.tool_call.call_id,
                name: chunk.tool_call.name,
                arguments: chunk.tool_call.arguments_json,
              },
            });

            if (permission.outcome === 'approved') {
              // Execute the tool (via subprocess service)
              // ... (see subprocess management section)
            }
            break;

          case 'done':
            this.agent.notify('session/update', {
              sessionId: params.sessionId,
              type: 'done',
              usage: chunk.done.usage,
            });
            break;

          case 'error':
            this.agent.notify('session/update', {
              sessionId: params.sessionId,
              type: 'error',
              error: chunk.error.message,
            });
            break;
        }
      }

      return {
        text: fullText,
        sessionId: params.sessionId,
      };
    });

    // ── File I/O ─────────────────────────────────

    this.agent.onRequest('fs/read_text_file', async (params) => {
      // The agent wants to read a file from the client's filesystem
      // In ACP, the CLIENT handles this — the agent sends the request
      // and the client responds with the file content.
      // 
      // But since we ARE the agent, we need to delegate this to the
      // daemon's tool executor, which has file system access.
      const content = await fs.readFile(params.path, 'utf-8');
      return { content };
    });

    this.agent.onRequest('fs/write_text_file', async (params) => {
      await fs.writeFile(params.path, params.content, 'utf-8');
      return {};
    });

    // ── Terminal ──────────────────────────────────

    this.agent.onRequest('terminal/create', async (params) => {
      // Spawn a subprocess via the daemon
      const result = await this.daemonClient.spawnSubprocess({
        agent_id: this.getAgentIdForScope(this.currentScope),
        command: params.command,
        args: params.args ?? [],
        cwd: params.cwd ?? this.currentScope,  // Default to project root
        env: params.env ?? {},
        timeout_ms: params.timeout_ms ?? 120_000,    // 2 minute default
        stall_timeout_ms: 30_000,                     // 30 second stall detection
      });

      return {
        terminalId: result.subprocess_id,
      };
    });

    this.agent.onRequest('terminal/output', async (params) => {
      // Get current output from the subprocess
      return this.daemonClient.getSubprocessOutput({
        subprocess_id: params.terminalId,
      });
    });

    this.agent.onRequest('terminal/wait_for_exit', async (params) => {
      return this.daemonClient.waitForSubprocess({
        subprocess_id: params.terminalId,
        timeout_ms: params.timeout_ms,
      });
    });

    this.agent.onRequest('terminal/kill', async (params) => {
      await this.daemonClient.killSubprocess({
        subprocess_id: params.terminalId,
        force: false,  // SIGTERM first
      });
      return {};
    });

    this.agent.onRequest('terminal/release', async (params) => {
      await this.daemonClient.killSubprocess({
        subprocess_id: params.terminalId,
        force: true,   // SIGKILL if still running
      });
      return {};
    });
  }

  // ── Scope Derivation ───────────────────────────

  private deriveScope(params: any): string {
    // ACP clients may pass a rootUri or workspace folder
    // Use that as the scope basis
    const rootPath = params?.rootUri
      ?.replace('file://', '')
      ?.replace('file:', '');

    if (rootPath) {
      return `project:${hashString(rootPath)}`;
    }

    // Fall back to CWD
    return `project:${hashString(process.cwd())}`;
  }

  // ── Lifecycle ──────────────────────────────────

  async start(): Promise<void> {
    await this.agent.start(); // Starts listening on stdin/stdout
  }

  async stop(): Promise<void> {
    await this.agent.stop();
  }
}
```

### ACP Agent Configuration for Editors

The daemon registers itself as an ACP agent that editors can discover:

```json
// ~/.agentsy/acp-agent.json
{
  "name": "agentsy",
  "version": "0.1.0",
  "description": "Agentsy AI coding agent with cognitive memory",
  "command": ["agentsy", "acp"],
  "capabilities": {
    "fs": {
      "readTextFile": true,
      "writeTextFile": true
    },
    "terminal": true,
    "toolCalls": true
  },
  "modelTiers": ["micro", "small", "mid", "frontier"],
  "defaultTier": "frontier"
}
```

For **Zed**, add to `settings.json`:

```json
{
  "agent_client_protocol": {
    "agents": {
      "agentsy": {
        "command": "agentsy",
        "args": ["acp"]
      }
    }
  }
}
```

For **VS Code**, install the ACP Client extension and configure:

```json
{
  "acp.agents": {
    "agentsy": {
      "command": "agentsy",
      "args": ["acp"]
    }
  }
}
```

### CLI Command: `agentsy acp`

```typescript
// packages/cli/src/commands/acp.ts

import { Command } from '@oclif/core';
import { AgentsyACPAgent } from '@agentsy/daemon/acp';

export default class ACPCommand extends Command {
  static description = 'Start Agentsy as an ACP agent (for editor integration)';

  static flags = {
    'daemon-socket': Flags.string({
      description: 'Path to daemon gRPC socket',
      default: path.join(os.homedir(), '.agentsy', 'daemon.sock'),
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ACPCommand);

    // Connect to the daemon via gRPC
    const daemonClient = new DaemonGRPCClient();

    try {
      await daemonClient.connect(flags['daemon-socket']);
    } catch {
      this.error(
        'Could not connect to the Agentsy daemon. Run `agentsy daemon start` first.'
      );
    }

    // Start the ACP agent (listens on stdin/stdout)
    const acpAgent = new AgentsyACPAgent({
      daemonClient,
      logger: createLogger('acp'),
    });

    await acpAgent.start();

    // The agent runs until stdin closes (editor disconnects)
    process.stdin.on('close', async () => {
      await acpAgent.stop();
      await daemonClient.disconnect();
      process.exit(0);
    });
  }
}
```

---

## 5. Subprocess Management

### Design

The daemon manages all subprocess (tool execution, shell commands, build scripts) with:

1. **Stall detection** — If no stdout/stderr for `stallTimeoutMs` (default 30s), the subprocess is flagged as stalled and a warning is sent
2. **Hard timeout** — If the subprocess exceeds `timeoutMs` (default 120s), it's killed with SIGTERM, then SIGKILL after 5s
3. **PID tracking** — All subprocess PIDs are tracked for cleanup on daemon shutdown
4. **Agent association** — Each subprocess is owned by an agent; killing the agent kills all its subprocesses
5. **Output streaming** — stdout/stderr streams over gRPC in real time

### Implementation

```typescript
// packages/daemon/src/subprocess/manager.ts

import { spawn, ChildProcess } from 'child_process';

export interface SubprocessConfig {
  stallTimeoutMs: number;     // Default: 30_000 (30 seconds of no output = stalled)
  hardTimeoutMs: number;      // Default: 120_000 (2 minutes = force kill)
  sigtermGraceMs: number;     // Default: 5_000 (5 seconds after SIGTERM before SIGKILL)
  maxConcurrent: number;      // Default: 10 per agent
  bufferSize: number;         // Default: 1MB per stream
}

interface ManagedSubprocess {
  id: string;
  agentId: string;
  pid: number;
  process: ChildProcess;
  command: string;
  cwd: string;
  startedAt: number;
  lastOutputAt: number;
  state: SubprocessState;
  exitCode: number | null;
  signal: string | null;
  stallTimer: ReturnType<typeof setTimeout> | null;
  hardTimer: ReturnType<typeof setTimeout> | null;
  stdoutBuffer: Buffer[];
  stderrBuffer: Buffer[];
  // Callbacks for streaming output
  onOutput?: (output: SubprocessOutput) => void;
}

export class SubprocessManager implements Service {
  readonly name = 'subprocess';
  private _state: ServiceState = 'stopped';

  private processes = new Map<string, ManagedSubprocess>();
  private config: SubprocessConfig;
  private logger: Logger;

  constructor(deps: {
    config?: Partial<SubprocessConfig>;
    logger: Logger;
  }) {
    this.config = {
      stallTimeoutMs: 30_000,
      hardTimeoutMs: 120_000,
      sigtermGraceMs: 5_000,
      maxConcurrent: 10,
      bufferSize: 1024 * 1024,
      ...deps.config,
    };
    this.logger = deps.logger;
  }

  /**
   * Spawn a subprocess managed by the daemon.
   * Returns a stream of output events (stdout, stderr, exit, stall warnings).
   */
  async spawn(request: SpawnSubprocessRequest): Promise<{
    subprocessId: string;
    pid: number;
    outputStream: AsyncIterable<SubprocessOutput>;
  }> {
    // Check concurrent limit per agent
    const agentProcesses = this.getProcessesForAgent(request.agent_id);
    if (agentProcesses.length >= this.config.maxConcurrent) {
      throw new Error(
        `Agent "${request.agent_id}" has ${agentProcesses.length} concurrent ` +
        `subprocesses (max: ${this.config.maxConcurrent})`
      );
    }

    const id = uuid();
    const stallTimeoutMs = request.stall_timeout_ms || this.config.stallTimeoutMs;
    const hardTimeoutMs = request.timeout_ms || this.config.hardTimeoutMs;

    // Spawn the child process
    const child = spawn(request.command, request.args ?? [], {
      cwd: request.cwd || process.cwd(),
      env: { ...process.env, ...request.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false, // Ensure child dies with parent
    });

    const managed: ManagedSubprocess = {
      id,
      agentId: request.agent_id,
      pid: child.pid!,
      process: child,
      command: request.command,
      cwd: request.cwd || process.cwd(),
      startedAt: Date.now(),
      lastOutputAt: Date.now(),
      state: 'running' as SubprocessState,
      exitCode: null,
      signal: null,
      stallTimer: null,
      hardTimer: null,
      stdoutBuffer: [],
      stderrBuffer: [],
    };

    this.processes.set(id, managed);

    // Create output stream
    const outputStream = this.createOutputStream(managed);

    // ── Stall Detection ────────────────────────

    managed.stallTimer = setInterval(() => {
      const silentMs = Date.now() - managed.lastOutputAt;
      if (silentMs >= stallTimeoutMs && managed.state === 'running') {
        managed.state = 'stalled';
        this.logger.warn(`Subprocess "${id}" stalled (no output for ${silentMs}ms)`, {
          subprocessId: id,
          command: managed.command,
          silentMs,
        });

        // Send stall warning
        managed.onOutput?.({
          subprocess_id: id,
          output: {
            oneof_kind: 'stall',
            stall: {
              silent_ms: silentMs,
              timeout_ms: hardTimeoutMs,
            },
          },
        } as SubprocessOutput);
      }
    }, 5_000); // Check every 5 seconds

    // ── Hard Timeout ──────────────────────────

    managed.hardTimer = setTimeout(() => {
      if (managed.state === 'running' || managed.state === 'stalled') {
        this.logger.warn(`Subprocess "${id}" exceeded hard timeout (${hardTimeoutMs}ms), killing`);
        this.kill(id, true);
      }
    }, hardTimeoutMs);
    managed.hardTimer.unref();

    // ── Stdout Handling ───────────────────────

    child.stdout!.on('data', (data: Buffer) => {
      managed.lastOutputAt = Date.now();
      managed.state = 'running'; // Reset from stalled if it was
      managed.stdoutBuffer.push(data);

      // Trim buffer if too large
      let totalSize = managed.stdoutBuffer.reduce((s, b) => s + b.length, 0);
      while (totalSize > this.config.bufferSize && managed.stdoutBuffer.length > 1) {
        totalSize -= managed.stdoutBuffer.shift()!.length;
      }

      managed.onOutput?.({
        subprocess_id: id,
        output: {
          oneof_kind: 'stdout',
          stdout: { data: Buffer.from(data) },
        },
      } as SubprocessOutput);
    });

    // ── Stderr Handling ───────────────────────

    child.stderr!.on('data', (data: Buffer) => {
      managed.lastOutputAt = Date.now();
      managed.stderrBuffer.push(data);

      managed.onOutput?.({
        subprocess_id: id,
        output: {
          oneof_kind: 'stderr',
          stderr: { data: Buffer.from(data) },
        },
      } as SubprocessOutput);
    });

    // ── Exit Handling ─────────────────────────

    child.on('exit', (code, signal) => {
      managed.exitCode = code;
      managed.signal = signal;
      managed.state = code === 0 ? 'exited' : 'killed';

      // Clear timers
      if (managed.stallTimer) clearInterval(managed.stallTimer);
      if (managed.hardTimer) clearTimeout(managed.hardTimer);

      managed.onOutput?.({
        subprocess_id: id,
        output: {
          oneof_kind: 'exit',
          exit: {
            exit_code: code ?? -1,
            signal: signal ?? '',
            duration_ms: Date.now() - managed.startedAt,
          },
        },
      } as SubprocessOutput);

      // Clean up after a delay (allows late consumers to read final output)
      setTimeout(() => this.processes.delete(id), 5_000).unref();
    });

    // ── Error Handling ────────────────────────

    child.on('error', (error) => {
      this.logger.error(`Subprocess "${id}" error:`, error);
      managed.state = 'killed';

      managed.onOutput?.({
        subprocess_id: id,
        output: {
          oneof_kind: 'exit',
          exit: {
            exit_code: -1,
            signal: 'ERROR',
            duration_ms: Date.now() - managed.startedAt,
          },
        },
      } as SubprocessOutput);
    });

    return {
      subprocessId: id,
      pid: child.pid!,
      outputStream,
    };
  }

  /**
   * Kill a subprocess. SIGTERM first, SIGKILL after grace period.
   */
  async kill(subprocessId: string, force = false): Promise<void> {
    const managed = this.processes.get(subprocessId);
    if (!managed) throw new Error(`Subprocess "${subprocessId}" not found`);

    if (managed.state === 'exited' || managed.state === 'killed') return;

    // Clear timers
    if (managed.stallTimer) clearInterval(managed.stallTimer);
    if (managed.hardTimer) clearTimeout(managed.hardTimer);

    if (force) {
      // SIGKILL immediately
      try {
        managed.process.kill('SIGKILL');
      } catch { /* already dead */ }
      managed.state = 'killed';
      return;
    }

    // SIGTERM first, then SIGKILL after grace period
    try {
      managed.process.kill('SIGTERM');
    } catch { /* already dead */ }

    setTimeout(() => {
      if (managed.state === 'running' || managed.state === 'stalled') {
        try {
          managed.process.kill('SIGKILL');
        } catch { /* already dead */ }
        managed.state = 'killed';
      }
    }, this.config.sigtermGraceMs).unref();
  }

  /**
   * Kill all subprocesses for an agent.
   */
  async killAllForAgent(agentId: string): Promise<void> {
    const processes = this.getProcessesForAgent(agentId);
    for (const p of processes) {
      await this.kill(p.id, true); // Force kill all agent subprocesses
    }
  }

  // ── Service Lifecycle ──────────────────────────

  async start(): Promise<void> { this._state = 'active'; }
  async sleep(): Promise<void> { this._state = 'sleeping'; }
  async wakeup(): Promise<void> { this._state = 'active'; }

  async stop(): Promise<void> {
    // Kill all managed subprocesses
    for (const [id] of this.processes) {
      await this.kill(id, true);
    }
    this.processes.clear();
    this._state = 'stopped';
  }

  get state(): ServiceState { return this._state; }

  // ── Helpers ────────────────────────────────────

  private getProcessesForAgent(agentId: string): ManagedSubprocess[] {
    return Array.from(this.processes.values())
      .filter(p => p.agentId === agentId && (p.state === 'running' || p.state === 'stalled'));
  }

  private createOutputStream(managed: ManagedSubprocess): AsyncIterable<SubprocessOutput> {
    // This is a simplified async iterable that pushes output events
    // as they arrive via the onOutput callback.
    const queue: SubprocessOutput[] = [];
    let waiting: ((result: IteratorResult<SubprocessOutput>) => void) | null = null;
    let done = false;

    managed.onOutput = (output) => {
      if (waiting) {
        waiting({ value: output, done: false });
        waiting = null;
      } else {
        queue.push(output);
      }
    };

    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<SubprocessOutput>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }
            if (done) {
              return Promise.resolve({ value: undefined, done: true } as any);
            }
            return new Promise((resolve) => { waiting = resolve; });
          },
        };
      },
    };
  }
}
```

### Integration with Agent Kill

When an agent is killed, all its subprocesses must be terminated:

```typescript
// In AgentHost.kill():
async kill(agentId: string): Promise<void> {
  // ... existing kill logic ...

  // Kill all subprocesses owned by this agent
  await this.deps.subprocessManager.killAllForAgent(agentId);
}
```

---

## 6. Directory-Based Scope Isolation

### Design

Each memory scope is derived from the **working directory** of the client that started the session. This provides natural isolation: different projects get different memory scopes automatically.

| Source | Scope Derivation | Example |
|--------|-----------------|---------|
| TUI started in `/home/user/projects/webapp` | `project:a1b2c3` (hash of path) | All agents in this TUI share project memory |
| ACP client passes `rootUri: file:///home/user/projects/api` | `project:d4e5f6` (hash of URI path) | ACP editor session scoped to that project |
| CLI `--scope` flag | Explicit override | `agentsy chat --scope project:x9y8z7` |
| No directory info available | `global:default` | Fallback for headless/CI use |

### Implementation

```typescript
// packages/daemon/src/scope/resolver.ts

import { createHash } from 'crypto';

export class ScopeResolver {
  /**
   * Derive a memory scope from the client context.
   * 
   * Priority:
   * 1. Explicit scope parameter (CLI --scope flag)
   * 2. ACP rootUri (from session/start params)
   * 3. Current working directory (TUI/CLI)
   * 4. Global default
   */
  resolve(context: ScopeContext): string {
    // 1. Explicit override
    if (context.explicitScope) {
      this.validateScope(context.explicitScope);
      return context.explicitScope;
    }

    // 2. ACP rootUri
    if (context.rootUri) {
      const path = this.uriToPath(context.rootUri);
      return `project:${this.hashPath(path)}`;
    }

    // 3. Working directory
    if (context.workingDirectory) {
      return `project:${this.hashPath(context.workingDirectory)}`;
    }

    // 4. Global default
    return 'global:default';
  }

  /**
   * Resolve the human-readable project name from a scope.
   * Useful for display in the TUI.
   */
  resolveDisplayName(scope: string, context: ScopeContext): string {
    if (scope === 'global:default') return 'Global';

    const path = context.rootUri
      ? this.uriToPath(context.rootUri)
      : context.workingDirectory;

    if (path) {
      return path.split('/').pop() || path;
    }

    return scope;
  }

  private hashPath(path: string): string {
    // Use first 12 chars of SHA-256 for a short, collision-resistant ID
    return createHash('sha256')
      .update(path)
      .digest('hex')
      .slice(0, 12);
  }

  private uriToPath(uri: string): string {
    return uri
      .replace(/^file:\/\//, '')
      .replace(/^file:/, '');
  }

  private validateScope(scope: string): void {
    if (!/^[a-zA-Z0-9_:.-]+$/.test(scope)) {
      throw new Error(
        `Invalid scope "${scope}". Must match /^[a-zA-Z0-9_:.-]+$/`
      );
    }
  }
}

export interface ScopeContext {
  explicitScope?: string;       // From CLI --scope flag
  rootUri?: string;             // From ACP session/start
  workingDirectory?: string;    // From process.cwd() or ACP cwd
}
```

### Cross-Scope Memory Sharing

Agents can read from other scopes (e.g., shared knowledge base) but write only to their own scope:

```typescript
// packages/daemon/src/scope/policy.ts

export class ScopePolicy {
  /**
   * Determine if a read/write operation is allowed on a scope.
   */
  canPerform(
    operation: 'read' | 'write',
    agentScope: string,        // The agent's own scope
    targetScope: string,       // The scope being accessed
    agentRole: string          // The agent's role
  ): boolean {
    // Always allow access to own scope
    if (agentScope === targetScope) return true;

    // Read access to other project scopes is allowed
    // (cross-project knowledge sharing)
    if (operation === 'read' && targetScope.startsWith('project:')) {
      return true;
    }

    // Write access to other scopes requires explicit permission
    // (would be configured via daemon config or ACP permission request)
    if (operation === 'write' && targetScope.startsWith('shared:')) {
      return true; // Shared scopes are writable by all
    }

    // Global scope is read-only for all agents
    if (targetScope === 'global:default') {
      return operation === 'read';
    }

    return false;
  }
}
```

### Scope in ACP Session

When an ACP client starts a session, it typically passes a `rootUri` that identifies the project. The daemon uses this to set the scope:

```typescript
// In AgentsyACPAgent.registerHandlers():

this.agent.onRequest('session/start', async (params) => {
  const scopeContext: ScopeContext = {
    rootUri: params.rootUri,       // ACP standard field
    workingDirectory: params.cwd,  // Some clients pass this
  };

  const scope = this.scopeResolver.resolve(scopeContext);
  const displayName = this.scopeResolver.resolveDisplayName(scope, scopeContext);

  this.logger.info('ACP session started', { scope, displayName, rootUri: params.rootUri });

  // Create or reuse agent for this scope
  // ...
});
```

---

## 7. Revised Package Consolidation

### Changes from v1

| v1 Action | v2 Action | Reason |
|-----------|-----------|--------|
| Keep `vscode/` (75 files) | **Drop `vscode/`** entirely | Replaced by ACP compliance — VS Code uses the ACP Client extension |
| Keep `mcp/` → merge to daemon | **Keep `mcp/`** as separate package | MCP is a distinct protocol (tools/resources for LLMs); ACP is the editor protocol. Both are needed. |
| Merge `connectors/` → daemon | **Keep `connectors/`** as separate package | Discord/Slack/Telegram connectors may grow; separate deployment |

### Updated Consolidation Map

| Current Package | Action | Target |
|----------------|--------|--------|
| `workflows` | Merge | `orchestrator` |
| `shared` | Merge | `types` |
| `scripts` | Move | Root `scripts/` |
| `ui` | Merge | `renderers` |
| `vscode` | **Delete** | Replaced by ACP |
| All others | Keep | — |

### Post-Consolidation Layout (23 packages + root scripts)

```
packages/
├── daemon/        ← NEW: Central process (gRPC + ACP)
├── core/          ← Stream processing, SSE, tool calls, retry
├── providers/     ← LLM provider adapters
├── gateway/       ← Thin daemon client (post-Phase 4)
├── memory/        ← Cognitive memory engine
├── orchestrator/  ← Absorbs workflows; council, hooks, routing
├── runtime/       ← Agent turn loop, hooks execution
├── tokenomics/    ← Token management, quotas
├── types/         ← Absorbs shared
├── renderers/     ← Absorbs ui; Ink/TUI rendering
├── models/        ← Model selector/profiles
├── tools/         ← Tool registry + builtins
├── secrets/       ← Secret injection/providers
├── guardrails/    ← Safety/policy/PII
├── observability/ ← OTel/tracing/cost
├── session/       ← Session management
├── retrieval/     ← Search/indexing
├── testing/       ← Test helpers/MSW/aimock
├── agents/        ← Agent runtime/specs
├── plugins/       ← Plugin system
├── prompts/       ← Prompt layering
├── connectors/    ← Discord/Slack/Telegram (kept separate)
├── mcp/           ← MCP protocol layer (kept separate)
├── cli/           ← Thin daemon client + TUI + `agentsy acp`
```

---

## 8. Revised Effort Estimates

| Phase | Description | v1 Hours | v2 Delta | v2 Hours | Rationale for Delta |
|-------|-------------|----------|----------|----------|---------------------|
| 0 | Critical Bug Fixes | ~20 | +0 | ~20 | Unchanged |
| 1 | Daemon Foundation | ~60 | +25 | ~85 | gRPC server/client + proto definitions + ACP bridge + subprocess manager + scope resolver |
| 2 | Package Consolidation | ~15 | -3 | ~12 | Dropping vscode is less work than merging it |
| 3 | Hook Pipeline Redesign | ~25 | +0 | ~25 | Unchanged |
| 4 | Gateway → Daemon | ~40 | +5 | ~45 | gRPC routing service adapter |
| 5 | Streaming Architecture | ~35 | +5 | ~40 | gRPC streaming adapter |
| 6 | RAG as Daemon Service | ~30 | +5 | ~35 | gRPC + ACP query interface |
| 7 | Learning Loop | ~25 | +0 | ~25 | Unchanged |
| 8 | Multi-Agent & Deployment | ~45 | +10 | ~55 | ACP agent lifecycle + subprocess integration |
| 9 | Missing Capabilities | ~50 | +5 | ~55 | Subprocess-based tool execution |
| | **Total** | **~345** | **+52** | **~397** | |

### New Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `@grpc/grpc-js` | Pure JS gRPC server/client | ^1.12 |
| `@grpc/proto-loader` | Dynamic proto loading | ^0.7 |
| `grpc-tools` | Proto code generation (dev) | ^1.12 |
| `@agent-client-protocol/agent-client-protocol-sdk` | ACP agent SDK | ^0.25 |
| `protobufjs` | Proto file parsing | ^7.4 |

### Revised Dependencies Graph

```
Phase 0 (Bug Fixes) ──────────────────────────────┐
                                                    ├──▶ Phase 2 (Consolidation — now drops vscode)
Phase 1 (Daemon Foundation) ─┬──▶ Phase 4 (Gateway)│
                 + gRPC      ├──▶ Phase 5 (Stream)  │
                 + ACP       ├──▶ Phase 6 (RAG)     │
                 + Subprocess├──▶ Phase 3 (Hooks) ──┘
                 + Scope     │
                             └──▶ Phase 8 (Multi-Agent/Deploy)
                                       │
Phase 6 ──────────────────────────────▶ Phase 7 (Learning Loop)
Phase 8 ──────────────────────────────▶ Phase 9 (Missing Capabilities)
```

### Revised Milestones

```
Week 1-2:   Phase 0 (Critical Bug Fixes)
Week 2-4:   Phase 1 (Daemon Foundation + gRPC + ACP + Subprocess + Scope)
Week 4:     Phase 2 (Package Consolidation — drop vscode)
Week 4-5:   Phase 3 (Hook Pipeline Redesign)
Week 5-6:   Phase 4 (Gateway → Daemon)
Week 6-7:   Phase 5 (Streaming Architecture)
Week 6-7:   Phase 6 (RAG as Daemon Service) — parallel with Phase 5
Week 7-8:   Phase 7 (Learning Loop)
Week 8-9:   Phase 8 (Multi-Agent & ACP Integration)
Week 10+:   Phase 9 (Missing Capabilities)
```
