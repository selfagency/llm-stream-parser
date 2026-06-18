
## 35. Appendix D — IPC Protocol Spec

### Socket Location

| Platform | Default Path |
|----------|-------------|
| macOS | `~/.agentsy/daemon.sock` |
| Linux | `~/.agentsy/daemon.sock` |
| Windows | `\\.\pipe\agentsy-daemon` |

### Message Format

Newline-delimited JSON-RPC 2.0:

```text
Client:  {"jsonrpc":"2.0","id":"1","method":"agent.list","params":{}}\n
Server:  {"jsonrpc":"2.0","id":"1","result":[{"id":"coder-1","role":"coder","state":"idle"}]}\n
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
interface AuthToken {
  sub: string;          // User ID
  scope: string[];      // Allowed memory scopes
  agents: string[];     // Allowed agent IDs
  exp: number;          // Expiration timestamp
  iat: number;          // Issued at
}
```

---
