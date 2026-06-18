

## 25. AFT, Magic Context, Todos & Task Delegation — Integration Audit

> **Note**: This section is a research-and-clarification addendum responding to the question: *"I would like to better understand the roles AFT and Magic Context are playing and how/whether they are properly tied into our memory and context and how to-do lists are managed and tasks get delegated."* It documents the current state (read from the `develop` branch source) and identifies integration gaps that Phase 23 (below) closes.

### 25.1 What AFT and Magic Context actually are

Both are **CortexKit** packages — external dependencies, not agentsy-original code. They are consumed as hard (non-optional) dependencies per `docs/developers/cortexkit-integration.md`:

| Component | Package | What it does | Language |
|---|---|---|---|
| **AFT** (Agent File Tree) | `@cortexkit/aft-bridge` | Persistent Rust process providing tree-sitter-backed code intelligence — file-tree structure, symbol indices, structural queries. One persistent `aft` worker process per project root, managed via a `BridgePool`. | Rust binary + TS bridge |
| **Magic Context** | `@cortexkit/magic-context` | Durable session & memory storage via a shared SQLite database at `~/.local/share/cortexkit/magic-context/context.db`. Defines 4 tables: `project_memories`, `compartments`, `session_meta`, `project_state`. | TypeScript |

### 25.2 How they tie into agentsy's memory and context (current state)

**Magic Context** is the **durable persistence layer** for two concerns:

1. **Per-project durable knowledge** (`project_memories` table) — a 5-category taxonomy (`ARCHITECTURE`, `CONSTRAINTS`, `CONFIG_VALUES`, `NAMING`, `PROJECT_RULES`) with an `importance` score (0–1). The `@agentsy/memory` package's `createMemoryBridge()` (`packages/memory/src/cortexkit/memory-adapter.ts`) reads this table and **promotes** entries into agentsy's own `WikiManager` as wiki pages (mapping MC categories → wiki entity kinds: `rule`, `architecture`, `constraint`, `config`, `naming`). Low-importance items (< 0.3) are skipped during promotion.

2. **Tiered session history** (`compartments` table) — 4 verbosity tiers (`p1` Verbose, `p2` Normal, `p3` Terse, `p4` Anchor-only) with a monotonic `seq` and `episode_type`. The `@agentsy/session` package's `CortexKitSnapshotBridge` reads this for crash recovery and session resume. A `context-fingerprint.ts` module computes a SHA-256 over context content + message count + model ID to enable cache-aware context reuse on resume.

3. **Per-session metadata** (`session_meta` table) — key-value JSON blob store, used by `CortexKitSessionStore`.

4. **Epoch tracker** (`project_state` table) — `project_memory_epoch` is bumped when Magic Context's "dreamer" consolidates. The `@agentsy/memory` package's `createDreamerConsumer()` polls this epoch; when it advances, the consumer reads all project memories and upserts them as wiki pages. This is the **one-directional sync** from MC → agentsy wiki.

**AFT** is the **code intelligence layer**. The `@agentsy/shared` package's `aft-manager.ts` provides `getAftBridge()` / `getAftSessionBridge()` / `isAftAvailable()` / `shutdownAftBridge()`. A `BridgePool` manages one persistent Rust `aft` process per project root. The `@agentsy/tools` package has a `cortexkit/import-linter.ts` that consumes AFT. The `scripts/postinstall-aft.mjs` script handles binary discovery.

### 25.3 The integration gaps (what's not properly tied together)

After reading the source, I identified five gaps:

**Gap 1 — MC → agentsy wiki sync is one-directional and poll-based.** The `dreamer-consumer.ts` polls `project_state.project_memory_epoch` on each `checkAndSync()` call. There is no event-driven push from MC to agentsy when memories change. If the poll interval is long (default not found in source — likely configurable), stale data persists. There is also no agentsy → MC write path: agentsy's own `WikiManager` can upsert pages, but those changes never flow back to MC's `project_memories`. This means MC's dashboard (if used) and agentsy's wiki can diverge.

**Gap 2 — AFT availability is checked but not gracefully degraded.** `isAftAvailable()` returns a boolean, but callers that invoke `getAftBridge()` get a hard throw (`'AFT binary not found. Run npx @cortexkit/aft setup...'`) when the binary is missing. There is no fallback path for "AFT not installed — degrade to no code intelligence." The postinstall script attempts to discover the binary, but if it fails, every code-intelligence-dependent tool call throws. This should be a warning + degraded mode, not a hard failure.

**Gap 3 — AFT and Magic Context are NOT wired into the daemon.** The daemon (`packages/daemon/src/daemon.ts`) does not import `@agentsy/shared/src/cortexkit/aft-manager` or the MC bridge. The MC integration lives in `@agentsy/memory`, `@agentsy/session`, and `@agentsy/tokenomics` — but the daemon (the central process owning all agent execution per AD-1) has no lifecycle hook for AFT's `BridgePool` or MC's database. This means:
- AFT processes are not started/stopped with the daemon.
- MC's database is not opened/closed by the daemon (it's opened lazily by each consumer).
- The `UnifiedDB` consolidation (Phase 1) did NOT absorb MC's `context.db` — it's still a separate file at `~/.local/share/cortexkit/magic-context/context.db`. This is a deliberate exception (MC owns that schema), but it means the daemon's `shutdown()` cannot flush MC state.

**Gap 4 — Todo lists and task delegation are split across two systems that don't talk to each other.**

- **Todo lists** (the agent-facing "write a list of things to do" tool, à la Claude-Code's `TodoWrite`) — **do not exist**. I grepped for `todo`, `Todo`, `TodoWrite`, `write_todos`, `task_list`, `TaskList` across all packages. The only matches are: (a) `packages/core/src/xml-filter/tag-lists.ts` (unrelated — XML tag filtering), (b) `packages/orchestrator/docs/workflows-plan.md` (a plan doc, not code). There is no agent-callable todo-list tool. There is no persisted todo-list store. This is a significant gap — Claude-Code, opencode, and codebuff all have structured todo tracking.

- **Task delegation** lives in `@agentsy/orchestrator/src/task-board/` — a `Task` type with lifecycle `pending → ready → running → paused → completed → failed`, `dependencies: string[]`, `parentTaskId?` for sub-task decomposition trees, `planId` + `stepId` linking to a plan, and `TaskAttempt` records with `ToolCallRecord[]` for idempotency replay. An `InMemoryTaskBoard` implementation exists (`in-memory.ts`). The `TaskDecomposer` (`packages/orchestrator/src/intelligence/decomposer.ts`) breaks plans into atomic tasks.

  **But**: the task board is **in-memory only** (`InMemoryTaskBoard`). There is no SQLite-backed `TaskBoard` implementation. Tasks are lost on daemon restart. The task board is also **not exposed as an agent-callable tool** — agents cannot query or update the task board directly; only the orchestrator's internal plan execution touches it. And the task board has **no connection to MC's `compartments` or `session_meta`** — task state is invisible to MC's session-resume machinery.

**Gap 5 — AFT, Magic Context, and the task board are not coordinated.** When an agent delegates a sub-task (via the task board), the sub-task's working context does not inherit the parent's AFT session or MC compartments. Each sub-task starts cold. There is no `forkWithCacheSharing` (Claude-Code pattern) that would let a sub-agent inherit the parent's code-intelligence index and memory compartments.

### 25.4 What Phase 23 (below) does about it

Phase 23 — "AFT, Magic Context & Task Board Integration Hardening" closes the five gaps above:

1. **Gap 1**: Add bidirectional sync between MC `project_memories` and agentsy wiki (event-driven, not poll-based). Add a `writeBackToMagicContext` option to `WikiManager.upsertPage`.
2. **Gap 2**: Add graceful degradation to AFT — `getAftBridgeOrNull()` returns `null` instead of throwing; callers check and fall back to no-code-intelligence mode with a one-time warning.
3. **Gap 3**: Wire AFT `BridgePool` and MC database into the daemon lifecycle (`Daemon.start()` calls `aftPool.start()`, `Daemon.stop()` calls `aftPool.shutdown()` + `mcDb.close()`). Document the deliberate exception to UnifiedDB consolidation.
4. **Gap 4**: Add an agent-callable `todo` tool (`todo_write`, `todo_read`, `todo_update`) backed by a new `todos` table in `UnifiedDB`. Add a SQLite-backed `TaskBoard` implementation. Expose the task board as agent-callable tools (`task_list`, `task_claim`, `task_complete`). Persist both across daemon restarts.
5. **Gap 5**: Implement `forkWithCacheSharing` for sub-agents — inherit parent's AFT session bridge and MC compartment snapshot. Sub-tasks no longer start cold.

---


## 29. Phase 23 — AFT, Magic Context & Task Board Integration Hardening

**Priority**: P1 — Sprint 7–8
**Story points**: 10
**Branch**: `feat/aft-mc-taskboard-hardening`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`), Phase 15 (bootstrap — owns AFT/MC generation)
**Unblocks**: Phase 14 (sub-agent fork-with-cache-sharing depends on this), reliable task delegation

> This phase closes the five integration gaps documented in §25.3 (AFT/Magic Context/Todos/Task Delegation audit).

### 29.1 Gap 1 — Bidirectional MC ↔ agentsy wiki sync

**Current**: `dreamer-consumer.ts` polls `project_state.project_memory_epoch` and one-directionally upserts MC memories into the agentsy wiki. No write-back path.

**Fix**:
- Add `writeBackToMagicContext: boolean` option to `WikiManager.upsertPage()`. When true, the upsert also writes to MC's `project_memories` table (mapping wiki entity kinds back to MC categories).
- Replace the poll-based `dreamer-consumer` with an event-driven model: MC bumps `project_memory_epoch` on write; agentsy subscribes via a SQLite trigger + Honker NOTIFY (Phase 1's event bus). Epoch change → immediate sync, not poll.
- Document the bidirectional sync in `docs/developers/cortexkit-integration.md`.

### 29.2 Gap 2 — AFT graceful degradation

**Current**: `getAftBridge()` throws `'AFT binary not found'` when the binary is missing. No fallback.

**Fix**:
- Add `getAftBridgeOrNull(): Promise<BridgePool | null>` — returns `null` instead of throwing.
- Update all callers to check for `null` and fall back to no-code-intelligence mode with a one-time `logger.warn('AFT not available — code intelligence disabled. Run npx @cortexkit/aft setup.')`.
- Keep the existing `getAftBridge()` as a thin wrapper that throws for backward compatibility, but mark it `@deprecated` in favor of `getAftBridgeOrNull()`.

### 29.3 Gap 3 — Wire AFT and MC into the daemon lifecycle

**Current**: AFT `BridgePool` and MC database are not started/stopped by the daemon. MC's `context.db` is a separate file not absorbed by `UnifiedDB`.

**Fix**:
- Add `aftPool` and `magicContextDb` fields to the `Daemon` class.
- In `Daemon.start()`: call `aftPool.start()` (if AFT available) and open MC database.
- In `Daemon.stop()`: call `aftPool.shutdown()` and close MC database (before `UnifiedDB.close()`, since the dreamer consumer may flush).
- Document the deliberate exception to UnifiedDB consolidation: MC's `context.db` stays separate because MC owns its schema and external tools (MC dashboard) expect it at the XDG path. `UnifiedDB` does not absorb it.
- Register both as services in `ServiceHost` for sleep/wake lifecycle.

### 29.4 Gap 4 — Todo lists + SQLite-backed task board + agent-callable tools

**Current**: No todo-list tool exists. Task board is in-memory only and not agent-callable.

**Fix**:

#### 29.4.1 Todo-list tool and store

Add a `todos` table to `UnifiedDB`:
```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed | cancelled
  priority TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  parent_task_id TEXT,                     -- link to task-board tasks
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);
CREATE INDEX idx_todos_session ON todos(session_id);
```

Add three agent-callable tools in `packages/tools/src/tools/todo/`:
- `todo_write` — create/update a todo item
- `todo_read` — list todos for the current session/agent (with status filter)
- `todo_update` — mark todo status (in_progress, completed, cancelled)

#### 29.4.2 SQLite-backed TaskBoard

Add `packages/orchestrator/src/task-board/sqlite.ts`:
```typescript
export class SqliteTaskBoard implements TaskBoard {
  constructor(private db: UnifiedDB) {}
  // Implements the same TaskBoard interface as InMemoryTaskBoard
  // Persists to UnifiedDB.tasks and UnifiedDB.task_attempts
}
```

Add `tasks` and `task_attempts` tables to `UnifiedDB` (mirroring the `Task` and `TaskAttempt` types from `packages/orchestrator/src/task-board/types.ts`).

The daemon uses `SqliteTaskBoard` (not `InMemoryTaskBoard`) so tasks survive restarts.

#### 29.4.3 Agent-callable task-delegation tools

Add three agent-callable tools in `packages/tools/src/tools/task/`:
- `task_list` — list tasks for the current plan (with status filter)
- `task_claim` — claim a `ready` task for execution (sets status to `running`, creates a `TaskAttempt`)
- `task_complete` — mark a task completed/failed (records output in `TaskAttempt`)

These let an agent delegate sub-tasks to other agents (via the `AgentHost.spawn` + task-board claim pattern) and track progress.

### 29.5 Gap 5 — `forkWithCacheSharing` for sub-agents

**Current**: Sub-agents start cold — no inheritance of parent's AFT session, MC compartments, or wiki context.

**Fix**:

Add `forkWithCacheSharing(parentAgentId): AgentId` to `AgentHost`:
```typescript
async forkWithCacheSharing(parentAgentId: string): Promise<string> {
  const parent = this.getAgent(parentAgentId);
  // 1. Inherit AFT session bridge (same project root → same BridgePool entry)
  const aftBridge = await getAftSessionBridge({ projectRoot: parent.spec.cwd });
  // 2. Snapshot parent's MC compartments (p1–p4 tiers)
  const compartmentSnapshot = await this.mcSnapshotBridge.snapshot(parent.spec.sessionId);
  // 3. Spawn child agent with inherited context
  const childId = await this.spawn({
    spec: { ...parent.spec, id: undefined, parentId: parentAgentId },
    aftBridge,                          // shared
    compartmentSnapshot,                // copied
    wikiContext: parent.wikiContext,    // shared (read-only)
  });
  return childId;
}
```

This implements the Claude-Code `CacheSafeParams` + `buildForkedMessages` pattern (Phase 14 §19.5) at the agentsy level.

### 29.6 File-by-File Change List

**New** (8 files):
- `packages/tools/src/tools/todo/index.ts` — `todo_write`, `todo_read`, `todo_update` tools
- `packages/tools/src/tools/todo/index.test.ts`
- `packages/tools/src/tools/task/index.ts` — `task_list`, `task_claim`, `task_complete` tools
- `packages/tools/src/tools/task/index.test.ts`
- `packages/orchestrator/src/task-board/sqlite.ts` — `SqliteTaskBoard`
- `packages/orchestrator/src/task-board/sqlite.test.ts`
- `packages/daemon/src/db/migrations/00X_todos_tasks.sql` — `todos`, `tasks`, `task_attempts` tables
- `packages/memory/src/cortexkit/bidirectional-sync.ts` — bidirectional MC ↔ wiki sync

**Modified** (8 files):
- `packages/shared/src/cortexkit/aft-manager.ts` — add `getAftBridgeOrNull()`, deprecate `getAftBridge()`
- `packages/memory/src/cortexkit/wiki-manager.ts` — add `writeBackToMagicContext` option
- `packages/memory/src/cortexkit/dreamer-consumer.ts` — replace polling with Honker NOTIFY subscription
- `packages/daemon/src/daemon.ts` — add `aftPool`, `magicContextDb` fields; wire start/stop; use `SqliteTaskBoard`
- `packages/daemon/src/agents/agent-host.ts` — add `forkWithCacheSharing()`
- `packages/daemon/src/db/unified-db.ts` — add `todos`/`tasks`/`task_attempts` tables to migration
- `docs/developers/cortexkit-integration.md` — document bidirectional sync, daemon lifecycle wiring, deliberate UnifiedDB exception
- `packages/tools/src/tools/baseline.ts` — register todo + task tools

### 29.7 Verification

- [ ] `WikiManager.upsertPage({ writeBackToMagicContext: true })` writes to both wiki and MC `project_memories`
- [ ] Dreamer consumer syncs within 1s of MC epoch change (event-driven, not poll)
- [ ] `getAftBridgeOrNull()` returns `null` when AFT binary missing (no throw)
- [ ] Callers log a one-time warning and continue in degraded mode
- [ ] `Daemon.start()` starts AFT pool + opens MC database; `Daemon.stop()` shuts them down
- [ ] `todo_write` / `todo_read` / `todo_update` tools work and persist to `UnifiedDB.todos`
- [ ] Todos survive daemon restart
- [ ] `SqliteTaskBoard` persists tasks and attempts to `UnifiedDB`
- [ ] `task_list` / `task_claim` / `task_complete` tools work
- [ ] `AgentHost.forkWithCacheSharing()` creates a child agent that inherits parent's AFT bridge + MC compartment snapshot
- [ ] Sub-agent fork does not re-index the project (AFT session shared)
- [ ] `docs/developers/cortexkit-integration.md` updated
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

