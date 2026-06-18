## Phase 31 — AG-UI Adapter Integration (Retroactive Documentation + Daemon Wiring)

**Priority**: P1 — Sprint 6 (parallel with Phase 6)
**Story points**: 3
**Branch**: `feat/ag-ui-daemon-wiring`
**Depends on**: Phase 6 (Streaming Architecture — daemon StreamManager)
**Unblocks**: Phase 17 (Competitive Gap-Closing — CopilotKit interop item)

> **Retroactive documentation**: The `runtime/src/ag-ui/` directory was implemented outside the
> original plan and contains production-quality AG-UI protocol support. This phase formally
> documents the addition and completes the daemon wiring needed to make it consumable.

---

### 31.1 What Was Built (Unplanned)

Eight files in `packages/runtime/src/ag-ui/` implement the [AG-UI protocol](https://docs.ag-ui.com),
which is the wire format used by [CopilotKit](https://copilotkit.ai) and compatible frontends:

| File | Purpose |
|---|---|
| `adapter.ts` | Translates `PipelineEvent` stream → AG-UI events (RunStarted, TextMessageContent, ToolCallStart, etc.) |
| `event-converters.ts` | Per-event-type conversion utilities |
| `http-server.ts` | SSE stream helpers for Node.js http, Hono, Express, Fastify |
| `interrupt-handler.ts` | Maps AG-UI interrupt signals to runtime interruption |
| `observable.ts` | RxJS-compatible observable wrapper for AG-UI event streams |
| `reasoning-mapper.ts` | Maps model reasoning/thinking events to AG-UI reasoning events |
| `state-manager.ts` | Tracks AG-UI run state (running, finished, error) |
| `index.ts` | Public exports |

All types are sourced from `@agentsy/shared` (`AgUiEvent`, `EventType`).

**Why this matters**: AG-UI is the emerging standard for agentic frontends. CopilotKit's 50k+ GitHub
stars signal strong ecosystem adoption. Having AG-UI support means any CopilotKit-based frontend can
connect to an Agentsy daemon without a custom adapter.

---

### 31.2 Gaps to Close

The existing implementation is runtime-layer only — it is not wired into the daemon. To make AG-UI
useful in production:

#### 31.2.1 Daemon AG-UI HTTP Endpoint

Add an optional HTTP server to the daemon that exposes an AG-UI SSE endpoint:

```typescript
// packages/daemon/src/services/ag-ui-service.ts (NEW)

import { createServer } from 'node:http';
import { AgUiHttpServer } from '@agentsy/runtime';
import type { StreamManager } from './stream-manager.js';

export class AgUiService implements Service {
  readonly name = 'ag-ui';
  private server: ReturnType<typeof createServer> | null = null;

  constructor(
    private readonly streamManager: StreamManager,
    private readonly config: { port: number; enabled: boolean }
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) return;
    const agUi = new AgUiHttpServer({ streamManager: this.streamManager });
    this.server = createServer((req, res) => agUi.handleRequest(req, res));
    await new Promise<void>(resolve => this.server!.listen(this.config.port, resolve));
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>(resolve => this.server!.close(() => resolve()));
      this.server = null;
    }
  }

  sleep(): Promise<void> { return this.stop(); }
  wakeup(): Promise<void> { return this.start(); }
}
```

**Config addition** in `DaemonConfig`:

```typescript
agui: {
  enabled: z.boolean().default(false),
  port: z.number().int().min(1024).max(65535).default(7801)
}
```

#### 31.2.2 SSE Backpressure Fix

`http-server.ts` does not check client disconnect before writing. In the daemon context with
long-running sessions this can accumulate zombie connections:

```typescript
// packages/runtime/src/ag-ui/http-server.ts — ADD to SSEStream
readable: ReadableStream<Uint8Array> & {
  // Add cancel signal propagation
  cancel(reason?: unknown): void;
}
```

The fix: listen for `request.on('close', ...)` and call `controller.close()` on the
`ReadableStream`. This must happen before Phase 6 wires streaming, or zombie connections will
appear under load.

#### 31.2.3 Config-Driven Reasoning Encryption

`adapter.ts` has an `encryptReasoning` option but no config path into the daemon. Wire it through
`DaemonConfig.agui.encryptReasoning: boolean` (default: `false`).

---

### 31.3 IPC Protocol Addition

Add `agui.runStart` and `agui.runEnd` methods to the IPC method registry so CLI clients can
initiate AG-UI runs over the socket:

```typescript
// packages/daemon/src/ipc/protocol.ts — add to IPCMethod union
| 'agui.run'
| 'agui.cancel'
```

---

### 31.4 Tests

| Test | File |
|---|---|
| AG-UI SSE endpoint returns `RunStarted` within 500ms of connection | `ag-ui-service.test.ts` |
| Client disconnect → stream cancelled, no zombie connections | `ag-ui-service.test.ts` |
| `encryptReasoning: true` → reasoning events contain placeholder | existing `adapter.test.ts` extension |
| IPC `agui.run` → emits AG-UI events over socket | `ipc/protocol.test.ts` extension |

---

### 31.5 Verification

- [ ] `agentsy daemon start --agui` exposes `http://localhost:7801/agui` SSE endpoint
- [ ] CopilotKit smoke test: connect CopilotKit frontend → send prompt → receive AG-UI events
- [ ] Load test: 10 concurrent AG-UI clients, all disconnect cleanly without zombie connections
- [ ] `DaemonConfig.agui.enabled: false` (default) → no HTTP port opened
