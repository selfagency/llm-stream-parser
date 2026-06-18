
## 6. Phase 1 — Daemon Foundation ✅ COMPLETE

**Status**: Landed on `develop` (branch `feat/daemon-foundation` merged).
**Story points**: 13 (actuals reconciled at merge).
**What shipped** (treat as existing infrastructure):

- **`@agentsy/daemon`** package — central long-lived process.
- **`UnifiedDB`** (`packages/daemon/src/db/unified-db.ts`) — single `~/.agentsy/agentsy.db` opened via `@russellthehippo/honker-node`. Consolidates the prior memory.db, CortexKit context.db, and tokenomics session_ledger into one file with namespaced tables (memory_*, agentfs_*, context_*, tokenomics_*, daemon_*, tool_audit_*) plus Honker-managed tables (honker_queues, honker_jobs, honker_streams, honker_consumers, honker_schedule, honker_locks). WAL mode, native extension with `better-sqlite3` fallback. Migration is idempotent; old DBs moved to `.agentsy/migrated/`.
- **`AgentPool`** (`packages/daemon/src/agents/agent-pool.ts`) — Piscina-backed worker thread pool for agent computation. Configurable min/max threads, `AbortSignal` cancellation, `Piscina.move()` transferables.
- **`JobScheduler`** (`packages/daemon/src/jobs/scheduler.ts`) — Bree on top of Honker. Cron + interval + one-time scheduling, per-job timeout, `hasLagTime` overlap prevention, graceful drain on shutdown.
- **`SQLiteWorker`** (`packages/daemon/src/db/sqlite-worker.ts`) — all SQLite access offloaded to a dedicated worker thread; tag-template query API.
- **`SubprocessManager`** (`packages/daemon/src/processes/subprocess-manager.ts`) — Pup-inspired. Tracks child processes with `SubprocessSpec` and `SubprocessState`; stall detection (stdout/stderr activity monitor, `stallTimeoutMs`); memory-limit enforcement via periodic RSS; auto-restart for MCP servers; emits `process:stalled`, `process:killed`, `process:exited`, `process:restarted`.
- **REST control API** (`packages/daemon/src/api/rest.ts`) — remote control (Pup pattern).
- **IPC server + client** (`packages/daemon/src/ipc/`) — JSON-RPC 2.0 over Unix domain sockets, newline-delimited, Zod-validated. See Appendix D for protocol spec.
- **ACP server stub** (`packages/daemon/src/acp/`) — `@agentclientprotocol/sdk` `AgentSideConnection` wired; full method implementation in Phase 14.
- **`TerminalBridge`** — ACP terminal/create → SubprocessManager mapping.
- **`ServiceHost`** with sleep/wake lifecycle.
- **`AgentHost`** — multi-agent lifecycle on Piscina pool.
- **`ScopeManager`** — folder-based scoping (`folder:[sha256-hash-of-absolute-path]`).
- **`Supervisor`** — crash recovery, auto-restart.
- **`DaemonConfig`** schema (`packages/daemon/src/config/schema.ts`).
- **CLI integration** — `agentsy daemon start|stop|status|logs` (bgproc-inspired).

**Dependencies added**: `piscina@^4`, `bree@^9`, `@russellthehippo/honker-node@^0.x`, `better-sqlite3@^11`.

**Downstream consumers**:

- Phase 5 moves gateway routing into the daemon's `RoutingService`.
- Phase 6 owns all provider connections in the daemon's `StreamManager`.
- Phase 7 runs RAG as a daemon service on `UnifiedDB`.
- Phase 12 wires `@agentsy/guardrails` into the daemon's IPC handlers and persists audit receipts to `UnifiedDB.guardrail_decisions`.
- Phase 14 fills in the ACP server stub.
- Phase 15 hosts `BootstrapService` in the daemon and seeds Magic Context compartments in `UnifiedDB.context_*`.

---
