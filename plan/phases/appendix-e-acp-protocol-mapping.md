

## 36. Appendix E — ACP Protocol Mapping

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
    image: false,         // Future: enable when vision models are wired (Phase 18)
    audio: false,         // Future: enable when ASR pipeline is added (Phase 18)
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

