

## 11. Phase 6 — Streaming Architecture

**Priority**: P1 — Sprint 3
**Story points**: 5
**Branch**: `feat/streaming-architecture`
**Depends on**: Phase 5 ✅ (routing in daemon)
**Unblocks**: Phase 14 (ACP agent needs streaming), Phase 17 (competitive streaming items)
**Closes competitive gaps**: #12 (wrapSSE idle timeout from opencode), streaming secret masking from agent-zero, failUnsettledTools integration with the new stream manager

### 11.1 Architecture

The daemon owns all LLM provider connections. Clients request streams via IPC; the daemon pipes events back as JSON-RPC notifications. For ACP clients, the same events map to ACP `session/update` notifications.

```
Client (CLI/TUI/ACP) ──stream.start──▶ Daemon.StreamManager
                                            ↓
                                       Provider → LLM API
                                            ↓
Client ◀──stream.chunk (JSON-RPC notification)─── Daemon.StreamManager
Client ◀──session/update (ACP notification)────── Daemon.StreamManager
```

### 11.2 StreamManager

```typescript
// packages/daemon/src/services/stream-manager.ts

export class StreamManager implements Service {
  readonly name = 'stream';
  private activeStreams = new Map<string, ActiveStream>();

  async startStream(request: StreamRequest): Promise<{ streamId: string }> {
    const streamId = `s-${randomUUID()}`;
    const routing = await this.routingService.selectModel(request.routing);
    const provider = this.providerRegistry.get(routing.replica.providerId);

    const stream = {
      id: streamId,
      routing,
      abortController: new AbortController(),
      pendingToolCalls: new Map<string, PendingToolCall>(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
    this.activeStreams.set(streamId, stream);

    // Kick off the stream in the background; emit notifications as chunks arrive
    this.pipeStream(stream, provider, request.messages).catch(err => {
      this.handleStreamError(stream, err);
    });

    return { streamId };
  }

  private async pipeStream(stream: ActiveStream, provider: Provider, messages: Message[]) {
    const idleTimeout = this.config.idleTimeoutMs ?? 30_000;
    try {
      const chunkStream = provider.stream(messages, { signal: stream.abortController.signal });

      for await (const chunk of wrapSSE(chunkStream, { idleTimeout })) {
        // Streaming secret masking: scrub secrets across chunk boundaries
        const masked = this.secretsFilter.feed(chunk);

        // Emit to IPC clients
        this.ipc.notify('stream.chunk', { streamId: stream.id, chunk: masked });

        // Emit to ACP clients (mapped to session/update)
        this.acpBridge.emitChunk(stream.id, masked);

        // Track tool calls for failUnsettledTools
        if (masked.type === 'tool_call_start') {
          stream.pendingToolCalls.set(masked.toolCallId, { ... });
        } else if (masked.type === 'tool_call_end') {
          stream.pendingToolCalls.delete(masked.toolCallId);
        }
      }

      this.ipc.notify('stream.end', { streamId: stream.id, usage: stream.usage });
    } catch (err) {
      this.handleStreamError(stream, err);
    }
  }

  private async handleStreamError(stream: ActiveStream, error: unknown) {
    // failUnsettledTools (Phase 3 #8.5) — emit failed updates for orphaned tool calls
    await failUnsettledTools(stream.pendingToolCalls, error, event =>
      this.ipc.notify('stream.chunk', { streamId: stream.id, chunk: event })
    );

    this.ipc.notify('stream.error', { streamId: stream.id, error: serializeError(error) });
    this.activeStreams.delete(stream.id);
  }

  cancelStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.abortController.abort();
      this.activeStreams.delete(streamId);
    }
  }
}
```

### 11.3 wrapSSE Idle Timeout (Competitive #12 from opencode)

Per-read timeout that aborts on idle. Prevents hung connections when a provider's SSE stream stalls without closing.

```typescript
// packages/daemon/src/streaming/wrap-sse.ts (NEW)

export async function* wrapSSE<T>(
  source: AsyncIterable<T>,
  options: { idleTimeout: number; signal?: AbortSignal },
): AsyncGenerator<T> {
  let timer: NodeJS.Timeout | undefined;
  const abort = new AbortController();

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => abort.abort(), options.idleTimeout);
  };

  try {
    for await (const chunk of source) {
      resetTimer();
      yield chunk;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

### 11.4 Streaming Secret Masking (from agent-zero)

`StreamingSecretsFilter` masks secrets across chunk boundaries. The previous Phase 0 `SecretDetectionScanner` runs on complete strings; streaming needs a stateful filter that handles the case where a secret is split across two chunks.

```typescript
// packages/daemon/src/streaming/secrets-filter.ts (NEW)

export class StreamingSecretsFilter {
  private buffer = '';
  private readonly secretPatterns: RegExp[];

  feed(chunk: StreamChunk): StreamChunk {
    if (chunk.type !== 'content') return chunk;
    this.buffer += chunk.text;
    const masked = this.maskSecrets(this.buffer);
    // Keep the last N characters in the buffer to handle secrets split across chunks
    const keepLength = this.maxSecretLength;
    const emitLength = Math.max(0, masked.length - keepLength);
    const emit = masked.slice(0, emitLength);
    this.buffer = masked.slice(emitLength);
    return { ...chunk, text: emit };
  }

  flush(): StreamChunk | null {
    if (!this.buffer) return null;
    const masked = this.maskSecrets(this.buffer);
    this.buffer = '';
    return { type: 'content', text: masked };
  }
}
```

### 11.5 ACP Notification Mapping

Map daemon stream events to ACP `session/update` notifications:

| Daemon Event | ACP `session/update` Type | Content |
|---|---|---|
| `stream.chunk` (content) | `agent_message_chunk` | `{ content: string }` |
| `stream.chunk` (thinking) | `agent_thought_chunk` | `{ content: string }` |
| `stream.chunk` (tool_call_start) | `tool_call` | `{ toolCallId, toolName, arguments, status: "running" }` |
| `stream.chunk` (tool_call_end) | `tool_call_update` | `{ toolCallId, status, output }` |
| `stream.end` (usage) | `usage_update` | `{ usage: { inputTokens, outputTokens, costUsd } }` |

### 11.6 Tests

- Unit: `StreamManager.startStream` emits `stream.chunk` notifications in order.
- Unit: `wrapSSE` aborts after `idleTimeout` ms of no chunks.
- Unit: `StreamingSecretsFilter` masks a secret split across two chunks.
- Unit: `failUnsettledTools` fires on stream error (integration with Phase 3).
- Integration: CLI → daemon → provider → stream back to CLI; first chunk arrives before stream end.

### 11.7 Verification

- [x] `StreamManager` runs as a `Service` in the daemon
- [x] `wrapSSE` aborts on idle
- [x] `StreamingSecretsFilter` masks secrets across chunk boundaries
- [x] `failUnsettledTools` fires on stream error
- [x] ACP `session/update` notifications emitted for all event types
- [x] `pnpm check-types && pnpm lint && pnpm test` green

---

