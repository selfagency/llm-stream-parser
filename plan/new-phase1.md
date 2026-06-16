## 4. Phase 1 — Daemon Foundation

**Priority**: P0 — Can begin in parallel with Phase 0 bug fixes  
**Estimated effort**: ~90 hours (increased from v2's 80h due to Piscina pool, Honker queue, and SQLite worker integration)  
**Branch**: `feat/daemon-foundation`

This phase creates the `@agentsy/daemon` package — the central long-lived process with dual interfaces: an internal JSON-RPC 2.0 server over Unix sockets for CLI/TUI clients, and an external ACP Agent interface for editor clients.

### Design Influences

Phase 1 incorporates battle-tested patterns from six established projects:

| Source | What We Adopt | Where Applied |
|--------|--------------|---------------|
| **Piscina** | Worker thread pool with `runTask()`, configurable min/max threads, AbortSignal cancellation, `Piscina.move()` transferables, custom task queues, runtime statistics | Agent computation pool (`AgentPool`) |
| **Bree** | Cron + interval + one-time scheduling via worker threads, per-job timeout, `hasLagTime` overlap prevention, graceful drain on shutdown | Job scheduler layer on top of Honker |
| **Honker** | Durable SQLite-backed queues with transactional enqueue, `claim`/`ack` semantics, retries with backoff, priority queues, dead letters, NOTIFY/LISTEN-style cross-process wake, streams with per-consumer offsets | `jobs/` subsystem — replaces hand-rolled `JobScheduler` |
| **Pup** | Config-driven process definitions with restart policies (`always`/`on-failure`), PID file management, structured logging with rotation, REST API for remote control, clustering with load balancer, system service installation | SubprocessManager, daemon lifecycle, REST control API |
| **bgproc** | Agent-friendly CLI with JSON output, port detection (`-w` wait-for-port), log streaming (`--follow`/`--tail`/`--errors`), `clean --all` stale cleanup, `restart` with preserved cwd | CLI commands, TUI integration |
| **sqlite-worker** | SQLite operations offloaded to a dedicated worker thread to avoid blocking the main event loop; tag-template query API (`query\`SELECT *\`) | `db/` subsystem — all SQLite access |

### 1.1 Package Scaffolding

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
│   │   ├── sqlite-worker.ts        # SQLite in worker thread (sqlite-worker pattern)
│   │   ├── sqlite-worker.test.ts
│   │   ├── migrations.ts           # Schema migrations
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

### 1.2 Core Daemon Class

The `Daemon` class is the top-level lifecycle manager. It owns all subsystems and coordinates their startup, shutdown, sleep, and wake. Compared to v2, it now includes the Piscina-backed `AgentPool`, Honker-backed `JobQueue`, Bree `JobScheduler`, and SQLite worker database.

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
import { SQLiteWorkerDB } from './db/sqlite-worker.js';
import { RestServer } from './api/rest-server.js';

export interface DaemonDeps {
  config: Partial<DaemonConfig>;
  // Optional overrides for testing
  memoryEngine?: MemoryEngine;
  ipcServer?: IPCServer;
  db?: SQLiteWorkerDB;
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
  readonly jobs: HonkerQueue;          // Honker-backed durable queue
  readonly scheduler: BreeScheduler;   // Bree cron/interval layer
  readonly connectors: ConnectorHost;
  readonly supervisor: Supervisor;
  readonly sleeper: Sleeper;
  readonly db: SQLiteWorkerDB;
  readonly api: RestServer;            // REST control API (Pup pattern)

  // ── Infrastructure ─────────────────────────────
  private readonly config: DaemonConfig;
  private readonly logger: DaemonLogger;
  private readonly metrics: DaemonMetrics;

  constructor(deps: DaemonDeps) {
    this.config = resolveConfig(deps.config);

    // Core infrastructure
    this.logger = createDaemonLogger(this.config.logging);
    this.metrics = createDaemonMetrics(this.config.metrics);
    this.db = deps.db ?? new SQLiteWorkerDB({
      path: this.config.database.path,
      walMode: this.config.database.walMode,
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

    // Honker-backed durable job queue
    this.jobs = new HonkerQueue({
      dbPath: this.config.database.path,
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
      // 1. Initialize SQLite worker (non-blocking via worker thread)
      await this.db.open();
      await this.db.migrate();

      // 2. Start memory engine
      await this.memory.initialize();
      this.services.register('memory', this.memory);

      // 3. Initialize Honker durable queue (same SQLite file, transactional)
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

### 1.3 Piscina-Backed Agent Pool

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

### 1.4 Worker Thread Entry Point

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

### 1.5 Honker-Backed Durable Job Queue

The `HonkerQueue` replaces the hand-rolled `JobScheduler` from v2. Honker provides durable, transactional job queues backed by the same SQLite file as the daemon's primary database. This means `INSERT INTO orders` and `queue.enqueue(...)` commit in the same transaction — rollbacks drop both, eliminating the dual-write problem.

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

import { open, type Database as HonkerDB, type Queue as HonkerQueue } from 'honker';

export interface HonkerQueueConfig {
  dbPath: string;
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
  private db: HonkerDB | null = null;
  private queues = new Map<string, HonkerQueue>();
  private config: HonkerQueueConfig;

  constructor(config: HonkerQueueConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.db = open(this.config.dbPath);

    await this.ensureQueue('default');
    await this.ensureQueue('agents');
    await this.ensureQueue('maintenance');
    await this.ensureQueue('indexing');

    this.config.logger.info('Honker queue started', {
      dbPath: this.config.dbPath,
      queues: Array.from(this.queues.keys()),
    });
  }

  private async ensureQueue(name: string): Promise<void> {
    if (!this.db) throw new Error('Queue not initialized');
    const q = this.db.queue(name);
    this.queues.set(name, q);
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

### 1.6 Bree Scheduler (Cron/Interval Layer)

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

### 1.7 SQLite Worker (Non-Blocking Database Access)

All SQLite operations are offloaded to a dedicated worker thread, following the sqlite-worker pattern. This ensures that database queries (which can be slow for large datasets) never block the daemon's main event loop.

**Key sqlite-worker patterns adopted:**

- **Worker thread for all SQLite I/O** — The main thread sends query requests via `postMessage()` and receives results asynchronously.
- **Tag-template query API** — A tagged template literal API that automatically handles parameter binding.
- **Connection lifecycle management** — The worker manages opening, WAL mode configuration, migrations, and closing.
- **Migration system** — Migrations run in the worker thread on startup.

```typescript
// packages/daemon/src/db/sqlite-worker.ts

import { Worker } from 'worker_threads';

export interface SQLiteWorkerConfig {
  path: string;
  walMode?: boolean;
  logger: Logger;
}

export class SQLiteWorkerDB {
  private worker: Worker | null = null;
  private requestId = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private config: SQLiteWorkerConfig;

  constructor(config: SQLiteWorkerConfig) {
    this.config = config;
  }

  async open(): Promise<void> {
    this.worker = new Worker(new URL('./db-worker-entry.js', import.meta.url), {
      workerData: {
        path: this.config.path,
        walMode: this.config.walMode ?? true,
      },
    });

    this.worker.on('message', (msg: { id: number; result?: unknown; error?: string }) => {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result);
      }
    });
  }

  async migrate(): Promise<void> {
    await this.send('migrate', {});
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.send('query', { sql, params }) as Promise<T[]>;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.send('execute', { sql, params });
  }

  async close(): Promise<void> {
    await this.send('close', {});
    await this.worker?.terminate();
    this.worker = null;
  }

  private send(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Database not open'));
        return;
      }
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, params });
    });
  }
}
```

### 1.8 SubprocessManager (Pup-Inspired Restart Policies)

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

### 1.9 REST Control API (Pup Pattern)

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

### 1.10 IPC Protocol

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

### 1.11 IPC Server Implementation

(Same as v2 Section 1.4 — the IPC server implementation is unchanged except for the additional handler methods listed above.)

### 1.12 IPC Client (Thin Client for CLI/TUI)

(Same as v2 Section 1.5 — unchanged.)

### 1.13 ACP Server, Capabilities, Session Bridge, Notification Adapter

(Same as v2 Sections 1.6–1.9 — the ACP implementation is unchanged.)

### 1.14 Terminal Bridge (ACP Terminal → Subprocess Mapping)

(Same as v2 Section 1.11 — unchanged.)

### 1.15 Service Host with Sleep/Wake

(Same as v2 Section 1.12 — unchanged.)

### 1.16 Agent Host (Multi-Agent Lifecycle with Piscina Pool)

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

### 1.17 Scope Manager (Folder-Based Scoping)

(Same as v2 Section 1.14 — unchanged.)

### 1.18 Supervisor (Crash Recovery — Pup-Inspired)

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

### 1.19 Daemon Configuration Schema

Extended to include Piscina pool, Honker queue, Bree scheduler, REST API, and SQLite worker settings.

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
    path: string;
    walMode: boolean;
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
    path: path.join(os.homedir(), '.agentsy', 'daemon.db'),
    walMode: true,
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

### 1.20 CLI Integration (bgproc-Inspired)

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

### 1.21 Dependency Summary

New runtime dependencies introduced in this phase:

| Package | Version | Purpose | Replaces |
|---------|---------|---------|----------|
| `piscina` | ^4.x | Worker thread pool for agent computation | Custom worker management |
| `bree` | ^9.x | Cron/interval/one-time job scheduling | Custom timer-based scheduler |
| `honker` | ^0.x | Durable SQLite-backed job queue | Custom SQLite job table |
| `better-sqlite3` | ^11.x | Synchronous SQLite in worker thread | (already a dependency) |

These dependencies are all well-maintained, have zero native compilation requirements (except better-sqlite3 which is already used), and are specifically designed for the use cases we need.

---
