import type { MemoryEngine } from '@agentsy/memory';
import { ACPServer } from './acp/acp-server.js';
import { AgentHost } from './agents/agent-host.js';
import { ScopeManager } from './agents/scope-manager.js';
import type { DaemonConfig } from './config.js';
import { resolveConfig } from './config.js';
import { ConnectorHost } from './connectors/connector-host.js';
import { UnifiedDB } from './db/unified-db.js';
import { IPCServer } from './ipc/server.js';
import { BreeScheduler } from './jobs/bree-scheduler.js';
import { HonkerQueueAdapter } from './jobs/honker-queue.js';
import { Sleeper } from './lifecycle/sleeper.js';
import { Supervisor } from './lifecycle/supervisor.js';
import { AgentPool } from './pool/agent-pool.js';
import { SubprocessManager } from './processes/subprocess-manager.js';
import { ServiceHost } from './services/service-host.js';
import type { DeepPartial, Logger } from './types.js';

export type DaemonState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export interface DaemonDeps {
  config: DeepPartial<DaemonConfig>;
  db?: UnifiedDB;
  ipcServer?: IPCServer;
  memoryEngine?: MemoryEngine;
  pool?: AgentPool;
}

function createLogger(config: DaemonConfig['logging']): Logger {
  const prefix = config.file ? '' : '[daemon] ';
  return {
    debug: (msg: string, ...args: unknown[]) => {
      if (config.level === 'debug') {
        console.debug('%s%s', prefix, msg, ...args);
      }
    },
    info: (msg: string, ...args: unknown[]) => console.info('%s%s', prefix, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn('%s%s', prefix, msg, ...args),
    error: (msg: string, ...args: unknown[]) => console.error('%s%s', prefix, msg, ...args),
    child: (_name: string): Logger => createLogger({ ...config, level: config.level })
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms).unref())
  ]);
}

export class Daemon {
  private _state: DaemonState = 'stopped';
  private readonly _stateListeners = new Set<(state: DaemonState) => void>();

  readonly db: UnifiedDB;
  readonly memory: MemoryEngine;
  readonly ipc: IPCServer;
  readonly acp: ACPServer;
  readonly pool: AgentPool;
  readonly processes: SubprocessManager;
  readonly services: ServiceHost;
  readonly agents: AgentHost;
  readonly scopes: ScopeManager;
  readonly jobs: HonkerQueueAdapter;
  readonly scheduler: BreeScheduler;
  readonly connectors: ConnectorHost;
  readonly supervisor: Supervisor;
  readonly sleeper: Sleeper;

  private readonly config: DaemonConfig;
  private readonly logger: Logger;

  constructor(deps: DaemonDeps) {
    this.config = resolveConfig(deps.config);
    this.logger = createLogger(this.config.logging);

    // Unified database: ~/.agentsy/agentsy.db — single file for all subsystems
    this.db =
      deps.db ??
      new UnifiedDB({
        path: this.config.database.path,
        ...('extensionPath' in this.config.database && this.config.database.extensionPath
          ? { extensionPath: this.config.database.extensionPath }
          : {}),
        ...('blake3ExtensionPath' in this.config.database && this.config.database.blake3ExtensionPath
          ? { blake3ExtensionPath: this.config.database.blake3ExtensionPath }
          : {}),
        walMode: this.config.database.walMode,
        busyTimeoutMs: this.config.database.busyTimeoutMs,
        logger: this.logger
      });

    this.memory = deps.memoryEngine ?? (null as unknown as MemoryEngine);

    this.ipc =
      deps.ipcServer ??
      new IPCServer({
        socketPath: this.config.ipc.socketPath,
        maxConnections: this.config.ipc.maxConnections,
        requestTimeoutMs: this.config.ipc.requestTimeoutMs,
        logger: this.logger
      });

    this.pool =
      deps.pool ??
      new AgentPool({
        filename: new URL('./pool/worker-entry.js', import.meta.url).href,
        minThreads: this.config.pool.minThreads,
        maxThreads: this.config.pool.maxThreads,
        idleTimeoutMs: this.config.pool.idleTimeoutMs,
        maxQueueSize: this.config.pool.maxQueueSize,
        concurrentTasksPerWorker: this.config.pool.concurrentTasksPerWorker,
        resourceLimits: this.config.pool.resourceLimits
      });

    this.processes = new SubprocessManager({
      logger: this.logger,
      defaultStallTimeoutMs: this.config.subprocess.defaultStallTimeoutMs,
      defaultMemoryLimitMb: this.config.subprocess.defaultMemoryLimitMb,
      memoryCheckIntervalMs: this.config.subprocess.memoryCheckIntervalMs,
      defaultRestartPolicy: this.config.subprocess.defaultRestartPolicy
    });

    this.acp = new ACPServer({
      daemon: this,
      logger: this.logger,
      subprocessManager: this.processes
    });

    this.services = new ServiceHost({ logger: this.logger });

    this.scopes = new ScopeManager({ logger: this.logger });

    this.agents = new AgentHost({
      memory: this.memory,
      scopeManager: this.scopes,
      pool: this.pool,
      logger: this.logger
    });

    // Honker queue adapter uses the unified database
    this.jobs = new HonkerQueueAdapter({
      db: this.db,
      queues: this.config.jobs.queues,
      logger: this.logger
    });

    this.scheduler = new BreeScheduler({
      queue: this.jobs,
      root: this.config.jobs.jobDirectory,
      logger: this.logger
    });

    this.connectors = new ConnectorHost({
      logger: this.logger,
      config: this.config.connectors as never
    });

    this.supervisor = new Supervisor({
      policy: this.config.supervisor,
      logger: this.logger
    });

    this.sleeper = new Sleeper({
      policy: this.config.sleep,
      logger: this.logger
    });
  }

  async start(): Promise<void> {
    if (this._state !== 'stopped') {
      throw new Error(`Cannot start daemon in state "${this._state}"`);
    }

    this.transition('starting');

    try {
      // 1. Open unified database + run migrations
      await this.db.open();
      await this.db.migrate();

      // 2. Start memory engine
      if (
        this.memory &&
        typeof (this.memory as unknown as { initialize?: () => Promise<void> }).initialize === 'function'
      ) {
        await (this.memory as unknown as { initialize: () => Promise<void> }).initialize();
      }
      this.services.register('memory', this.memory as never);

      // 3. Initialize Honker durable queue (same DB file)
      await this.jobs.start();
      this.services.register('jobs', this.jobs as never);

      // 4. Start Bree scheduler
      await this.scheduler.start();
      this.services.register('scheduler', this.scheduler as never);

      // 5. Initialize scope manager
      await this.scopes.initialize();

      // 6. Start agent host
      await this.agents.initialize();

      // 7. Start subprocess manager
      await this.processes.start();

      // 8. Start connectors
      await this.connectors.initialize();

      // 9. Start IPC server
      await this.ipc.start();
      this.registerIPCHandlers();

      // 10. Start ACP server
      await this.acp.start(this.config.acp);

      // 11. Enable supervisor
      this.supervisor.watch(this);

      // 12. Enable sleeper
      this.sleeper.watch(this.services);

      this.transition('running');
      this.logger.info('Daemon started', {
        pid: process.pid,
        socket: this.config.ipc.socketPath,
        acp: this.config.acp.enabled ? 'enabled' : 'disabled',
        db: this.config.database.path,
        dbMode: this.db.mode,
        agents: this.agents.count(),
        services: this.services.count()
      });
    } catch (error) {
      this.transition('crashed');
      this.logger.error('Daemon failed to start', error);
      throw error;
    }
  }

  async stop(graceful = true): Promise<void> {
    if (this._state !== 'running') {
      return;
    }

    this.transition('stopping');
    const timeout = graceful ? this.config.shutdownTimeoutMs : 5000;

    try {
      await withTimeout(this.acp.stop(), timeout);
      await withTimeout(this.ipc.stop(), timeout);
      await withTimeout(this.sleeper.stop(), timeout);
      await withTimeout(Promise.resolve(this.supervisor.stop()), timeout);
      await withTimeout(this.scheduler.stop(), timeout);
      await withTimeout(this.processes.killAll(), timeout);
      await withTimeout(this.pool.destroy(), timeout);
      await withTimeout(this.connectors.shutdown(), timeout);
      await withTimeout(this.agents.shutdown(), timeout);
      await withTimeout(this.jobs.stop(), timeout);
      if (
        this.memory &&
        typeof (this.memory as unknown as { shutdown?: () => Promise<void> }).shutdown === 'function'
      ) {
        await withTimeout((this.memory as unknown as { shutdown: () => Promise<void> }).shutdown(), timeout);
      }
      await withTimeout(this.db.close(), timeout);

      this.transition('stopped');
      this.logger.info('Daemon stopped');
    } catch (error) {
      this.transition('crashed');
      this.logger.error('Daemon error during shutdown', error);
      throw error;
    }
  }

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
    this.logger.debug('Daemon state: %s → %s', prev, state);
    for (const listener of this._stateListeners) {
      try {
        listener(state);
      } catch {
        /* don't let listeners crash daemon */
      }
    }
  }

  private registerIPCHandlers(): void {
    this.ipc.handle('agent.spawn', req => this.agents.spawn(req));
    this.ipc.handle('agent.list', () => Promise.resolve(this.agents.list()));
    this.ipc.handle('agent.kill', req => {
      this.agents.kill(req.agentId as string);
      return Promise.resolve({ killed: true });
    });
    this.ipc.handle('agent.send', req => this.agents.send(req.agentId as string, req.message as string));

    this.ipc.handle('memory.recall', () => Promise.resolve({ recalled: true }));
    this.ipc.handle('memory.capture', () => Promise.resolve({ captured: true }));
    this.ipc.handle('memory.search', () => Promise.resolve({ searched: true }));

    this.ipc.handle('stream.start', req => this.agents.startStream(req));
    this.ipc.handle('stream.cancel', req => {
      this.agents.cancelStream(req.streamId as string);
      return Promise.resolve({ cancelled: true });
    });

    this.ipc.handle('jobs.enqueue', req => this.jobs.enqueue(req.payload, req.options as never));
    this.ipc.handle('jobs.list', () => this.jobs.list());
    this.ipc.handle('jobs.cancel', req => {
      this.jobs.cancel(req.jobId as string);
      return Promise.resolve({ cancelled: true });
    });
    this.ipc.handle('jobs.claim', req => this.jobs.claim(req.workerId as string, req.queueName as string));
    this.ipc.handle('jobs.ack', req => {
      this.jobs.ack(req.jobId as string);
      return Promise.resolve({ acked: true });
    });

    this.ipc.handle('scheduler.schedule', req => this.scheduler.schedule(req as never));
    this.ipc.handle('scheduler.list', () => this.scheduler.list());
    this.ipc.handle('scheduler.cancel', req => {
      this.scheduler.cancel(req.scheduleId as string);
      return Promise.resolve({ cancelled: true });
    });

    this.ipc.handle('daemon.status', () => Promise.resolve(this.getStatus()));
    this.ipc.handle('daemon.shutdown', async () => {
      await this.stop();
      return { stopped: true };
    });

    this.ipc.handle('pool.stats', () => Promise.resolve(this.pool.stats()));
    this.ipc.handle('display.render', req => Promise.resolve(this.handleDisplay(req)));

    this.ipc.handle('process.spawn', req =>
      this.processes.spawnProcess(req as unknown as import('./processes/subprocess-manager.js').SubprocessSpec)
    );
    this.ipc.handle('process.list', () => Promise.resolve(this.processes.listProcesses()));
    this.ipc.handle('process.kill', req => {
      this.processes.killProcess(req.processId as string);
      return Promise.resolve({ killed: true });
    });
    this.ipc.handle('process.output', req => Promise.resolve(this.processes.getOutput(req.processId as string)));
  }

  getStatus(): Record<string, unknown> {
    return {
      state: this._state,
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dbMode: this.db.mode,
      agents: this.agents.count(),
      processes: this.processes.count(),
      jobs: this.jobs.count(),
      services: this.services.count()
    };
  }

  private handleDisplay(_req: Record<string, unknown>): Record<string, unknown> {
    return { rendered: true };
  }
}
