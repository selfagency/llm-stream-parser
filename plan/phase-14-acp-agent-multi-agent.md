

## 19. Phase 14 — ACP Agent & Multi-Agent Deployment

**Priority**: P2 — Sprints 7–8 (consider elevating to P1 — see note below)
**Story points**: 7 (consider expanding to 12 to match openclaw's ACP depth — see §19.10)
**Branch**: `feat/acp-agent`
**Depends on**: Phase 5 ✅ (routing in daemon), Phase 6 ✅ (streaming)
**Unblocks**: Phase 17 (competitive items need ACP), Phase 18 (missing capabilities build on ACP), Phase 26 (A2A builds on ACP transport)
**Closes competitive gaps**: #2 (steering + follow-up queues from pi), #6 (rich tool type from Claude-Code), #8 (reflection loop from aider)
**Note**: The expanded 15-competitor comparison (§A.13 openclaw) reveals that openclaw has a 50+ file ACP implementation with a SQLite-backed event ledger and 13 translator sub-modules. agentsy's ACP is currently a stub. The competitive comparison's Final Assessment says: "ACP depth is a critical gap — openclaw's 50-file implementation is the reference. agentsy's stub blocks editor integration. Elevate to P0." This phase should be expanded to include event-ledger persistence and the most critical translators — see §19.10.

### 19.1 ACP Agent Integration: Full Wiring

Fill in the ACP server stub from Phase 1. The daemon's `acp/` module implements the ACP Agent interface using `@agentclientprotocol/sdk`'s `AgentSideConnection`. ACP transport is stdio (for CLI integration) or WebSocket (for remote access).

```typescript
// packages/daemon/src/acp/server.ts (FILLED IN)

export class ACPServer {
  constructor(
    private agentHost: AgentHost,
    private scopeManager: ScopeManager,
    private streamManager: StreamManager,
    private subprocessManager: SubprocessManager,
  ) {}

  async handleSessionNew(params: ACPSessionNewParams): Promise<ACPSessionNewResult> {
    // 1. Derive scope from cwd (AD-12: folder-based scoping)
    const scope = this.scopeManager.deriveScopeKey(params.cwd);

    // 2. Spawn agent with folder scope
    const agentId = await this.agentHost.spawn({
      spec: DEFAULT_AGENT_SPEC,
      scope,
      additionalDirectories: params.additionalDirectories,
    });

    // 3. Start MCP servers provided by the client
    if (params.mcpServers) {
      for (const [name, server] of Object.entries(params.mcpServers)) {
        const subprocess = await this.subprocessManager.spawnProcess({
          command: server.command,
          args: server.args,
          env: server.env,
          restart: 'always',
        });
        // Connect to the MCP server and register its tools with the agent
      }
    }

    return { sessionId: agentId, mode: 'code' };
  }

  async handleSessionPrompt(params: ACPSessionPromptParams): Promise<void> {
    const stream = await this.streamManager.startStream({
      agentId: params.sessionId,
      messages: params.messages,
    });

    // Stream chunks are mapped to session/update notifications by the StreamManager (Phase 6 §11.5)
  }
}
```

### 19.2 ACP Terminal Integration: Tool Execution

Map ACP `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` to the daemon's `SubprocessManager`. Each ACP terminal is a managed subprocess.

### 19.3 Multi-Agent Scope Isolation with Folder Scoping

Each ACP session gets its own scope derived from `cwd`. Multiple sessions can run concurrently with isolated memory, agent state, and tool registries.

### 19.4 Default Agents

```yaml
# packages/agents/src/specs/coder.yaml
id: coder
role: coder
modelTier: mid
tools: [read_file, write_file, edit_file, run_command, search_files, git]
scope:
  purpose: "Help with software development tasks: writing, editing, reviewing, and debugging code."
  inScope: [writing code, editing code, reviewing code, debugging, explaining code, running tests, git operations]
  outOfScope: [relationship advice, medical advice, legal advice, financial advice, mental health counseling]
  redirects:
    relationship advice: "I'm a coding assistant and can't help with relationship advice. Consider speaking with a trusted friend or a licensed therapist."

# packages/agents/src/specs/researcher.yaml
id: researcher
role: researcher
modelTier: frontier
tools: [web_search, fetch_url, summarize, cite]
scope:
  purpose: "Research topics on the web and synthesize findings with citations."
  inScope: [web research, summarization, citation, fact-checking]
  outOfScope: [code editing, file system operations, executing commands]

# packages/agents/src/specs/planner.yaml
id: planner
role: planner
modelTier: frontier
tools: [read_file, list_files, web_search]
scope:
  purpose: "Break down complex tasks into actionable plans."
  inScope: [task decomposition, planning, estimation, dependency analysis]
  outOfScope: [code editing, executing commands]
```

### 19.5 Competitive Items Threaded In

**#2 Steering + follow-up queues (from pi)**: Add `steer` and `queue` methods to the agent. A steer injects a message mid-turn. A queue message waits for the current turn to complete. `QueueMode: "all" | "one-at-a-time"` controls delivery.

```typescript
// packages/runtime/src/loop/steering.ts (NEW)

export class SteeringQueue {
  private steers: Message[] = [];
  private queued: Message[] = [];

  steer(message: Message): void {
    this.steers.push(message);
  }

  queue(message: Message, mode: 'all' | 'one-at-a-time' = 'all'): void {
    this.queued.push(message);
  }

  drainSteers(): Message[] {
    const result = this.steers;
    this.steers = [];
    return result;
  }

  promoteQueued(mode: 'all' | 'one-at-a-time'): Message[] {
    if (mode === 'all') {
      const result = this.queued;
      this.queued = [];
      return result;
    } else {
      return this.queued.length > 0 ? [this.queued.shift()!] : [];
    }
  }
}
```

**#6 Rich tool type (from Claude-Code)**: Enrich the `ToolDefinition` type with `isReadOnly`, `isConcurrencySafe`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `shouldDefer`, `alwaysLoad`, `searchHint`, `backfillObservableInput`.

```typescript
// packages/tools/src/types.ts (EXPANDED)

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  execute: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
  // NEW fields (from Claude-Code)
  isReadOnly?: boolean;                    // If true, can run concurrently
  isConcurrencySafe?: boolean;             // If true, safe to run in parallel with itself
  isDestructive?: boolean;                 // If true, requires approval
  interruptBehavior?: 'cancel' | 'defer' | 'block';
  maxResultSizeChars?: number;             // Disk-spill above this size (default 10_000)
  shouldDefer?: boolean;                   // Don't load until needed
  alwaysLoad?: boolean;                    // Always include in tool list
  searchHint?: string;                     // Keyword for ToolSearch deferral
  backfillObservableInput?: (args: unknown) => string;  // For audit log
}
```

Add **disk-spilled tool results**: persist results to disk when they exceed `maxResultSizeChars`; return a preview to the model.

**#8 Reflection loop (from aider)**: After tool execution, if the agent ran a linter or tests and they failed, inject the failure as a `reflected_message` and re-enter the loop (max 3 reflections).

```typescript
// packages/runtime/src/loop/reflection.ts (NEW)

export class ReflectionLoop {
  private maxReflections = 3;

  shouldReflect(toolName: string, result: ToolResult): boolean {
    if (this.reflectionCount >= this.maxReflections) return false;
    return (toolName === 'run_command' || toolName === 'lint' || toolName === 'test')
      && result.exitCode !== 0;
  }

  buildReflectionMessage(result: ToolResult): Message {
    return {
      role: 'user',
      content: `The previous command failed with exit code ${result.exitCode}. Output:\n\n${result.stdout}\n\nPlease fix the issue and try again.`,
    };
  }
}
```

### 19.6 ACP Client Compatibility Matrix

| ACP Method | Daemon Support | Notes |
|---|---|---|
| `initialize` | ✅ | Returns `AGENT_CAPABILITIES` |
| `authenticate` | ✅ | Local mode: always succeeds |
| `session/new` | ✅ | Folder-based scope from `cwd` |
| `session/prompt` | ✅ | Streaming via `session/update` |
| `session/load` | ✅ | Restore from `UnifiedDB.acp_sessions` |
| `session/list` | ✅ | All sessions for this client |
| `session/close` | ✅ | Agent stays alive; session disconnected |
| `session/delete` | ✅ | Fully removes session and agent |
| `session/resume` | ✅ | Re-create bridge from persisted state |
| `session/cancel` | ✅ | Aborts the `AbortController` |
| `session/set_mode` | ✅ | code/ask/plan |
| `session/set_config_option` | ✅ | model tier, temperature |
| `fs/readTextFile` | ✅ | Path must be within `cwd` |
| `fs/writeTextFile` | ✅ | Path must be within `cwd` |
| `requestPermission` | ✅ | Auto-approve in local mode |
| `terminal/create` | ✅ | SubprocessManager |
| `terminal/output` | ✅ | |
| `terminal/wait_for_exit` | ✅ | |
| `terminal/kill` | ✅ | SIGTERM + SIGKILL after 5s |
| `terminal/release` | ✅ | |

### 19.7 Future: Server Deployment

The daemon starts as a local multi-agent system (AD-8). Server deployment with authentication, rate limiting, and multi-tenancy is a future goal. The architectural decisions in this phase (folder-based scoping, ACP transport abstraction, JWT-ready auth stubs) inform but don't block server mode.

### 19.8 Tests

- ACP smoke test: `agentsy daemon start` → connect from Zed → send prompt → receive streamed response with tool calls.
- Multi-agent test: two ACP sessions in different folders → isolated memory and agent state.
- Steering test: inject a steer mid-turn → agent incorporates it.
- Reflection test: lint failure → reflection message → agent fixes and re-runs.
- Disk-spill test: tool result > `maxResultSizeChars` → preview returned, full content on disk.

### 19.9 Verification

- [ ] ACP server handles all 20 methods in the compatibility matrix
- [ ] Folder-based scope isolation works across concurrent sessions
- [ ] Steering + follow-up queues work
- [ ] Rich tool type fields respected (concurrency, disk-spill, approval)
- [ ] Reflection loop fires on lint/test failure (max 3)
- [ ] Default agents (coder, researcher, planner) loadable from YAML
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 19.10 Extension — ACP Event Ledger & Translators (from openclaw)

> **Added based on the expanded 15-competitor comparison (§A.13).** openclaw's 50+ file ACP implementation is the reference for ACP depth. This extension adds ~5 SP to Phase 14 (total 12 SP) and should be prioritized — the competitive comparison's Final Assessment says ACP depth is a "critical gap" that "blocks editor integration."

**What to add**:

1. **SQLite-backed event ledger** — every ACP event (session create, prompt, tool call, stream chunk, session close) is persisted to `UnifiedDB.acp_events` with `sessionId`, `timestamp`, `eventType`, `eventData`. Configurable limits: `maxSessions=200`, `maxEventsPerSession=5000`, `maxSerializedBytes=16MB`. Enables session replay, crash recovery, and audit.

2. **Critical translators** (from openclaw's 13 — implement the most important 6):
   - **replay** — replay a recorded session from the event ledger
   - **session-lineage** — track parent/child session relationships for subagent forks
   - **cancel-scoping** — properly scope cancellation to the right session and turn
   - **permission-relay** — relay permission requests from agent to editor client
   - **tool-streaming** — stream tool-call progress (partial args, status updates) to the editor
   - **error-kind** — structured error kinds (rate_limit, guardrail_block, budget_exceeded, etc.) for editor UI

3. **Session provenance metadata** — each session records its origin (ACP client, CLI, A2A delegation, subagent fork) for audit and debugging.

4. **Permission option kind probing** — the ACP server probes the client for which permission option kinds it supports, enabling graceful degradation for older clients.

**Effort**: +5 SP (total Phase 14 becomes 12 SP). The event ledger is the highest-value addition — it enables crash recovery and session replay, which are essential for a production ACP implementation.

---


