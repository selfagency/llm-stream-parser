import type { MemoryEngine } from '@agentsy/memory';
import { ACPServer } from './acp/acp-server.js';
import { AgentHost } from './agents/agent-host.js';
import { ScopeManager } from './agents/scope-manager.js';
import type { DaemonConfig } from './config.js';
import { resolveConfig } from './config.js';
import { ConnectorHost } from './connectors/connector-host.js';
import { IPCServer } from './ipc/server.js';
import { JobScheduler } from './jobs/scheduler.js';
import { Sleeper } from './lifecycle/sleeper.js';
import { Supervisor } from './lifecycle/supervisor.js';
import { SubprocessManager } from './processes/subprocess-manager.js';
import { ServiceHost } from './services/service-host.js';
import type { DeepPartial, Logger } from './types.js';

export type DaemonState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export interface DaemonDeps {
  config: DeepPartial<DaemonConfig>;
  ipcServer?: IPCServer;
  memoryEngine?: MemoryEngine;
}

function createLogger(config: DaemonConfig['logging']): Logger {
  const prefix = config.json ? '' : '[daemon] ';
  return {
    debug: (msg: string, ...args: unknown[]) => {
      if (config.level === 'debug') {
        console.debug(`${prefix}${msg}`, ...args);
      }
    },
    info: (msg: string, ...args: unknown[]) => console.info(`${prefix}${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(`${prefix}${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`${prefix}${msg}`, ...args),
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

  readonly memory: MemoryEngine;
  readonly ipc: IPCServer;
  readonly acp: ACPServer;
  readonly processes: SubprocessManager;
  readonly services: ServiceHost;
  readonly agents: AgentHost;
  readonly scopes: ScopeManager;
  readonly jobs: JobScheduler;
  readonly connectors: ConnectorHost;
  readonly supervisor: Supervisor;
  readonly sleeper: Sleeper;

  private readonly config: DaemonConfig;
  private readonly logger: Logger;

  constructor(deps: DaemonDeps) {
    this.config = resolveConfig(deps.config);
    this.logger = createLogger(this.config.logging);

    // Subsystems
    this.memory = deps.memoryEngine ?? (null as unknown as MemoryEngine);
    this.ipc =
      deps.ipcServer ??
      new IPCServer({
        socketPath: this.config.ipc.socketPath,
        maxConnections: this.config.ipc.maxConnections,
        requestTimeoutMs: this.config.ipc.requestTimeoutMs,
        logger: this.logger
      });

    this.processes = new SubprocessManager({
      logger: this.logger,
      defaultStallTimeoutMs: this.config.subprocess.defaultStallTimeoutMs,
      defaultMemoryLimitBytes: this.config.subprocess.defaultMemoryLimitBytes,
      memoryCheckIntervalMs: this.config.subprocess.memoryCheckIntervalMs
    });

    this.acp = new ACPServer({
      daemon: this,
      logger: this.logger,
      subprocessManager: this.processes
    });

    this.services = new ServiceHost({
      logger: this.logger
    });

    this.scopes = new ScopeManager({
      logger: this.logger
    });

    this.agents = new AgentHost({
      memory: this.memory,
      scopeManager: this.scopes,
      logger: this.logger
    });

    this.jobs = new JobScheduler({
      logger: this.logger
    });

    this.connectors = new ConnectorHost({
      logger: this.logger,
      config: this.config.connectors
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
      // 1. Start memory engine (if it has initialize)
      if (
        this.memory &&
        typeof (this.memory as unknown as { initialize?: () => Promise<void> }).initialize === 'function'
      ) {
        await (this.memory as unknown as { initialize: () => Promise<void> }).initialize();
      }
      this.services.register('memory', this.memory as never);

      // 2. Start job scheduler
      await this.jobs.start();
      this.services.register('jobs', this.jobs as never);

      // 3. Initialize scope manager
      await this.scopes.initialize();

      // 4. Start agent host
      await this.agents.initialize();

      // 5. Start subprocess manager
      await this.processes.start();

      // 6. Start connectors
      await this.connectors.initialize();

      // 7. Start IPC server
      await this.ipc.start();
      this.registerIPCHandlers();

      // 8. Start ACP server
      await this.acp.start(this.config.acp);

      // 9. Enable supervisor
      this.supervisor.watch(this);

      // 10. Enable sleeper
      this.sleeper.watch(this.services);

      this.transition('running');
      this.logger.info('Daemon started', {
        pid: process.pid,
        socket: this.config.ipc.socketPath,
        acp: this.config.acp.enabled ? 'enabled' : 'disabled'
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
      await withTimeout(this.supervisor.stop(), timeout);
      await withTimeout(this.processes.killAll(), timeout);
      await withTimeout(this.connectors.shutdown(), timeout);
      await withTimeout(this.agents.shutdown(), timeout);
      await withTimeout(this.jobs.stop(), timeout);
      if (
        this.memory &&
        typeof (this.memory as unknown as { shutdown?: () => Promise<void> }).shutdown === 'function'
      ) {
        await withTimeout((this.memory as unknown as { shutdown: () => Promise<void> }).shutdown(), timeout);
      }

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
    this.logger.debug(`Daemon state: ${prev} → ${state}`);
    for (const listener of this._stateListeners) {
      try {
        listener(state);
      } catch {
        // don't let listeners crash daemon
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

    this.ipc.handle('jobs.schedule', req => this.jobs.schedule(req));
    this.ipc.handle('jobs.list', () => Promise.resolve(this.jobs.list()));
    this.ipc.handle('jobs.cancel', req => {
      this.jobs.cancel(req.jobId as string);
      return Promise.resolve({ cancelled: true });
    });

    this.ipc.handle('daemon.status', () => Promise.resolve(this.getStatus()));
    this.ipc.handle('daemon.shutdown', async () => {
      await this.stop();
      return { stopped: true };
    });

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

  private getStatus(): Record<string, unknown> {
    return {
      state: this._state,
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
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
