import type { ProviderEthicsPolicyHook } from '@agentsy/gateway';
import {
  createBuiltinScanners,
  GuardrailPipeline,
  isProviderBlocked,
  requiresAcknowledgement
} from '@agentsy/guardrails';
import type { MemoryEngine } from '@agentsy/memory';
import type { ObservabilityEngine } from '@agentsy/observability';
import { createObservabilityFromEnv } from '@agentsy/observability';
import { z } from 'zod';
import { ACPNotificationAdapter } from './acp/acp-notification-adapter.js';
import { ACPServer } from './acp/acp-server.js';
import { AgentHost } from './agents/agent-host.js';
import { ScopeManager } from './agents/scope-manager.js';
import type { DaemonConfig } from './config.js';
import { resolveConfig } from './config.js';
import { ConnectorHost } from './connectors/connector-host.js';
import { UnifiedDB } from './db/unified-db.js';
import { loadDotenv } from './env.js';
import { HonkerEventBus } from './events/event-bus.js';
import { StreamStartRequestSchema } from './ipc/protocol.js';
import { IPCServer } from './ipc/server.js';
import { TimerScheduler } from './jobs/bree-scheduler.js';
import { HonkerQueueAdapter } from './jobs/honker-queue.js';
import { LearningJob } from './jobs/learning-job.js';
import { Sleeper } from './lifecycle/sleeper.js';
import { Supervisor } from './lifecycle/supervisor.js';
import { AgentPool } from './pool/agent-pool.js';
import { SubprocessManager } from './processes/subprocess-manager.js';
import { RetrievalService } from './services/retrieval-service.js';
import { RoutingService } from './services/routing-service.js';
import { ServiceHost } from './services/service-host.js';
import type { StreamProvider } from './services/stream-manager.js';
import { StreamManager } from './services/stream-manager.js';
import type { DeepPartial, Logger } from './types.js';

/**
 * MemoryEngine with lifecycle methods required by the daemon.
 * The base MemoryEngine interface doesn't expose initialize/shutdown,
 * so we define a narrower interface here.
 */
export interface DaemonMemoryEngine extends MemoryEngine {
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
}

// ── IPC param schemas ──────────────────────────────────
const AgentIdSchema = z.object({ agentId: z.string().min(1) });
const AgentSendSchema = z.object({ agentId: z.string().min(1), message: z.string() });
const StreamIdSchema = z.object({ streamId: z.string().min(1) });
const JobIdSchema = z.object({ jobId: z.string().min(1) });
const JobClaimSchema = z.object({ workerId: z.string().min(1), queueName: z.string().min(1).optional() });
const ScheduleIdSchema = z.object({ scheduleId: z.string().min(1) });
const ProcessIdSchema = z.object({ processId: z.string().min(1) });

const SubprocessSpecSchema = z.object({
  id: z.string().optional(),
  command: z
    .string()
    .min(1, 'command is required')
    .refine(cmd => !(cmd.includes('/') || cmd.includes('..')), 'command must not contain path separators'),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeoutMs: z.number().positive().optional(),
  stallTimeoutMs: z.number().positive().optional(),
  restartPolicy: z.enum(['always', 'on-failure', 'never']).optional(),
  maxRestarts: z.number().int().positive().optional(),
  restartWindowMs: z.number().positive().optional(),
  backoffBaseMs: z.number().positive().optional(),
  backoffMaxMs: z.number().positive().optional(),
  backoffJitter: z.boolean().optional(),
  memoryLimitMb: z.number().positive().optional()
});

/**
 * Resolve a log level string to a numeric priority.
 */
function resolveLevel(level: string | undefined): number {
  if (level === 'debug') {
    return 10;
  }
  if (level === 'info') {
    return 20;
  }
  if (level === 'warn') {
    return 30;
  }
  if (level === 'error') {
    return 40;
  }
  return 20;
}

export type DaemonState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export interface DaemonDeps {
  config: DeepPartial<DaemonConfig>;
  db?: UnifiedDB;
  ipcServer?: IPCServer;
  memoryEngine?: MemoryEngine;
  pool?: AgentPool;
}

function createLogger(config: DaemonConfig['logging']): Logger {
  const prefix = config.file ?? '[daemon] ';
  const configuredLevel = resolveLevel(config.level);

  function shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levelValue = resolveLevel(level);
    return levelValue >= configuredLevel;
  }

  return {
    debug: (msg: string, ...args: unknown[]) => {
      if (shouldLog('debug')) {
        console.debug('%s%s', prefix, msg, ...args);
      }
    },
    info: (msg: string, ...args: unknown[]) => {
      if (shouldLog('info')) {
        console.info('%s%s', prefix, msg, ...args);
      }
    },
    warn: (msg: string, ...args: unknown[]) => {
      if (shouldLog('warn')) {
        console.warn('%s%s', prefix, msg, ...args);
      }
    },
    error: (msg: string, ...args: unknown[]) => {
      if (shouldLog('error')) {
        console.error('%s%s', prefix, msg, ...args);
      }
    },
    child: (name: string): Logger =>
      createLogger({
        ...config,
        level: config.level,
        file: `[daemon][${name}]`
      })
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Swallow late rejections so they don't become unhandled rejections
  const guarded: Promise<T> = promise.catch(() => undefined as T);
  return Promise.race([
    guarded,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms).unref())
  ]);
}

export class Daemon {
  private _state: DaemonState = 'stopped';
  private readonly _stateListeners = new Set<(state: DaemonState) => void>();

  readonly db: UnifiedDB;
  readonly memory: DaemonMemoryEngine | null;
  readonly ipc: IPCServer;
  readonly acp: ACPServer;
  readonly pool: AgentPool;
  readonly processes: SubprocessManager;
  readonly services: ServiceHost;
  readonly agents: AgentHost;
  readonly scopes: ScopeManager;
  readonly jobs: HonkerQueueAdapter;
  readonly scheduler: TimerScheduler;
  readonly connectors: ConnectorHost;
  readonly supervisor: Supervisor;
  readonly sleeper: Sleeper;
  readonly routing: RoutingService;
  readonly retrieval: RetrievalService;
  readonly streamManager: StreamManager;
  readonly acpNotificationAdapter: ACPNotificationAdapter;
  readonly observability: ObservabilityEngine;
  readonly eventBus: HonkerEventBus;
  readonly learningJob: LearningJob;
  readonly guardrails: GuardrailPipeline;
  private readonly _observabilitySinks: Array<{ type: string; enabled: boolean; reason: string }>;

  private readonly config: DaemonConfig;
  private readonly logger: Logger;

  constructor(deps: DaemonDeps) {
    this.config = resolveConfig(deps.config);
    this.logger = createLogger(this.config.logging);

    // Load .env files before any env-dependent initialization
    if (this.config.observability.enabled) {
      try {
        loadDotenv(this.config.observability.envFiles);
      } catch (err) {
        this.logger.warn('Failed to load .env file', err);
      }
    }

    // Initialize observability engine from env
    const obsResult = createObservabilityFromEnv(
      {
        serviceName: this.config.observability.serviceName,
        serviceVersion: this.config.observability.serviceVersion,
        langfuseEnabled: this.config.observability.langfuse.enabled,
        langfuse: {
          endpoint: this.config.observability.langfuse.endpoint,
          publicKey: this.config.observability.langfuse.publicKey,
          secretKey: this.config.observability.langfuse.secretKey,
          projectId: this.config.observability.langfuse.projectId,
          flushIntervalMs: this.config.observability.langfuse.flushIntervalMs,
          maxBatchSize: this.config.observability.langfuse.maxBatchSize
        }
      },
      this.logger
    );
    this.observability = obsResult.engine;
    this._observabilitySinks = obsResult.sinks;

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

    this.memory = deps.memoryEngine ?? null;

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
      memory: this.memory as MemoryEngine,
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

    this.scheduler = new TimerScheduler({
      queue: this.jobs,
      root: this.config.jobs.jobDirectory,
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

    this.routing = new RoutingService({
      db: this.db,
      ethicsPolicy: this.#createProviderEthicsPolicyHook()
    });

    this.acpNotificationAdapter = new ACPNotificationAdapter({
      logger: this.logger.child('acp-notification')
    });

    this.streamManager = new StreamManager({
      logger: this.logger.child('stream'),
      ipc: this.ipc,
      routing: this.routing,
      idleTimeoutMs: this.config.streaming.idleTimeoutMs,
      secretsFilterEnabled: this.config.streaming.secretsFilterEnabled
    });

    this.retrieval = new RetrievalService({
      db: this.db,
      embedderOptions: {
        remoteEnabled: false
      },
      logger: this.logger.child('retrieval'),
      scheduler: this.scheduler
    });

    // Event bus for cross-process communication
    this.eventBus = new HonkerEventBus({
      logger: this.logger.child('event-bus'),
      queue: this.jobs
    });

    // Learning job — background consolidation of event memory items
    this.learningJob = new LearningJob({
      db: this.db,
      retrieval: this.retrieval,
      eventBus: this.eventBus,
      logger: this.logger.child('learning')
    });

    // Guardrail pipeline — seeded with all built-in scanners (Phases 4, 9, 10, 11)
    this.guardrails = new GuardrailPipeline();
    for (const scanner of createBuiltinScanners()) {
      this.guardrails.add(scanner);
    }
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
      if (this.memory?.initialize) {
        await this.memory.initialize();
      }
      this.services.register('memory', this.memory);

      // 3. Initialize Honker durable queue (same DB file)
      await this.jobs.start();
      this.services.register('jobs', this.jobs);

      // 4. Start Bree scheduler
      await this.scheduler.start();
      this.services.register('scheduler', this.scheduler);

      // 5. Initialize scope manager
      await this.scopes.initialize();

      // 6. Start agent host
      await this.agents.initialize();

      // 7. Start subprocess manager
      await this.processes.start();

      // 8. Start connectors
      await this.connectors.initialize();

      // 8a. Start routing service (gateway)
      await this.routing.start();
      this.services.register('routing', this.routing);

      // 8b. Start stream manager
      await this.streamManager.start();
      this.services.register('stream', this.streamManager);

      // 8c. Start retrieval service (RAG)
      await this.retrieval.start();
      this.services.register('retrieval', this.retrieval);

      // 8d. Schedule learning job — every 1 hour
      await this.scheduler.schedule({
        name: 'learning-loop',
        type: 'interval',
        schedule: '3600000', // 1 hour
        handler: './jobs/learning-job.js',
        timeout: 120_000,
        scope: 'maintenance'
      });
      this.logger.info('Learning job scheduled (interval: 1h)');

      // 9. Start IPC server
      await this.ipc.start();
      this.registerIPCHandlers();

      // 10. Start ACP server
      await this.acp.start(this.config.acp);

      // 11. Enable supervisor
      this.supervisor.watch(this);

      // 12. Enable sleeper
      this.sleeper.watch(this.services);

      // 13. Catch uncaught exceptions/rejections so supervisor can react
      process.on('uncaughtException', err => {
        this.logger.error('Uncaught exception, transitioning to crashed', err);
        this.transition('crashed');
      });
      process.on('unhandledRejection', (reason: Error) => {
        this.logger.error('Unhandled rejection, transitioning to crashed', reason);
        this.transition('crashed');
      });

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

      // Log observability sink status
      for (const sink of this._observabilitySinks) {
        if (sink.enabled) {
          this.logger.info(`observability: ${sink.type} enabled — ${sink.reason}`);
        } else {
          this.logger.info(`observability: ${sink.type} disabled — ${sink.reason}`);
        }
      }
    } catch (error) {
      this.transition('crashed');
      this.logger.error('Daemon failed to start', error);
      throw error;
    }
  }

  async stop(graceful = true): Promise<void> {
    // Allow stop from running, crashed, or starting states
    if (this._state === 'stopped' || this._state === 'stopping') {
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
      await withTimeout(this.retrieval.stop(), timeout);
      await withTimeout(this.jobs.stop(), timeout);
      if (this.memory?.shutdown) {
        await withTimeout(this.memory.shutdown(), timeout);
      }
      await withTimeout(this.observability.shutdown(), timeout);
      await withTimeout(this.db.close(), timeout);

      // Remove process-level handlers
      process.removeAllListeners('uncaughtException');
      process.removeAllListeners('unhandledRejection');

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
      const parsed = AgentIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid agentId'), { code: -32_602 }));
      }
      this.agents.kill(parsed.data.agentId);
      return Promise.resolve({ killed: true });
    });
    this.ipc.handle('agent.send', req => {
      const parsed = AgentSendSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid agentId or message'), { code: -32_602 }));
      }
      return this.agents.send(parsed.data.agentId, parsed.data.message);
    });

    this.ipc.handle('memory.recall', () => Promise.resolve({ recalled: true }));
    this.ipc.handle('memory.capture', () => Promise.resolve({ captured: true }));
    this.ipc.handle('memory.search', () => Promise.resolve({ searched: true }));

    this.ipc.handle('stream.start', (req, _context) => {
      const parsed = StreamStartRequestSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(
          Object.assign(new Error(`Invalid stream request: ${parsed.error.issues.map(i => i.message).join('; ')}`), {
            code: -32_602
          })
        );
      }
      return Promise.resolve(this.streamManager.startStream(parsed.data, this.createDefaultStreamProvider()));
    });
    this.ipc.handle('stream.cancel', req => {
      const parsed = StreamIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid streamId'), { code: -32_602 }));
      }
      this.streamManager.cancelStream(parsed.data.streamId);
      return Promise.resolve({ cancelled: true });
    });

    this.ipc.handle('jobs.enqueue', req => this.jobs.enqueue(req.payload, req.options as never));
    this.ipc.handle('jobs.list', () => this.jobs.list());
    this.ipc.handle('jobs.cancel', req => {
      const parsed = JobIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid jobId'), { code: -32_602 }));
      }
      this.jobs.cancel(parsed.data.jobId);
      return Promise.resolve({ cancelled: true });
    });
    this.ipc.handle('jobs.claim', req => {
      const parsed = JobClaimSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid workerId or queueName'), { code: -32_602 }));
      }
      return this.jobs.claim(parsed.data.workerId, parsed.data.queueName);
    });
    this.ipc.handle('jobs.ack', req => {
      const parsed = JobIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid jobId'), { code: -32_602 }));
      }
      this.jobs.ack(parsed.data.jobId);
      return Promise.resolve({ acked: true });
    });

    this.ipc.handle('scheduler.schedule', req => this.scheduler.schedule(req as never));
    this.ipc.handle('scheduler.list', () => this.scheduler.list());
    this.ipc.handle('scheduler.cancel', req => {
      const parsed = ScheduleIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid scheduleId'), { code: -32_602 }));
      }
      this.scheduler.cancel(parsed.data.scheduleId);
      return Promise.resolve({ cancelled: true });
    });

    this.ipc.handle('daemon.status', () => Promise.resolve(this.getStatus()));
    this.ipc.handle('daemon.shutdown', async () => {
      await this.stop();
      return { stopped: true };
    });

    this.ipc.handle('pool.stats', () => Promise.resolve(this.pool.stats()));
    this.ipc.handle('display.render', req => Promise.resolve(this.handleDisplay(req)));

    this.ipc.handle('process.spawn', req => {
      const parsed = SubprocessSpecSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(
          Object.assign(new Error(parsed.error.issues.map(i => i.message).join('; ')), { code: -32_602 })
        );
      }
      return this.processes.spawnProcess(parsed.data as import('./processes/subprocess-manager.js').SubprocessSpec);
    });
    this.ipc.handle('process.list', () => Promise.resolve(this.processes.listProcesses()));
    this.ipc.handle('process.kill', req => {
      const parsed = ProcessIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid processId'), { code: -32_602 }));
      }
      this.processes.killProcess(parsed.data.processId);
      return Promise.resolve({ killed: true });
    });
    this.ipc.handle('process.output', req => {
      const parsed = ProcessIdSchema.safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid processId'), { code: -32_602 }));
      }
      return Promise.resolve(this.processes.getOutput(parsed.data.processId));
    });

    // RAG / retrieval IPC handlers
    this.ipc.handle('retrieval.retrieve', req => {
      const parsed = z.object({ query: z.string(), scope: z.string().optional() }).safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid retrieval request'), { code: -32_602 }));
      }
      return this.retrieval.retrieve(parsed.data.query, parsed.data.scope ?? 'default');
    });
    this.ipc.handle('retrieval.index', req => {
      const parsed = z
        .object({ content: z.string(), memoryItemId: z.string(), scope: z.string().optional() })
        .safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid index request'), { code: -32_602 }));
      }
      return this.retrieval.indexContent(parsed.data.content, parsed.data.memoryItemId, parsed.data.scope ?? 'default');
    });
    this.ipc.handle('retrieval.index-new', req => {
      const parsed = z.object({ scope: z.string().optional() }).safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid index-new request'), { code: -32_602 }));
      }
      return this.retrieval.indexNewContent(parsed.data.scope ?? 'default');
    });
    this.ipc.handle('retrieval.delete', req => {
      const parsed = z.object({ memoryItemId: z.string() }).safeParse(req);
      if (!parsed.success) {
        return Promise.reject(Object.assign(new Error('Invalid delete request'), { code: -32_602 }));
      }
      return this.retrieval.deleteItem(parsed.data.memoryItemId);
    });
  }

  /**
   * Create a default stream provider that routes through the daemon's
   * provider infrastructure. Used by IPC handler `stream.start`.
   */
  createDefaultStreamProvider(): StreamProvider {
    const logger = this.logger.child('stream-provider');

    return {
      stream(request) {
        logger.debug('Stream request', {
          model: request.model,
          messages: request.messages.length
        });

        // FIXME(phase-14): Wire through LoadBalancedClient.stream() once
        // the streaming provider path is fully connected.
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return Promise.resolve({ done: true, value: undefined });
              }
            };
          }
        };
      }
    };
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
      services: this.services.count(),
      observability: {
        enabled: this._observabilitySinks.some(s => s.enabled),
        sinks: this._observabilitySinks.map(s => ({ type: s.type, enabled: s.enabled }))
      }
    };
  }

  private handleDisplay(_req: Record<string, unknown>): Record<string, unknown> {
    return { rendered: true };
  }

  /**
   * Create the provider ethics policy hook for the gateway.
   *
   * Implements agentsy's PROVIDER_ETHICS_POLICY: hard-block xAI/Grok,
   * warn-and-acknowledge for Meta/OpenAI/Microsoft/Google/Amazon.
   */
  #createProviderEthicsPolicyHook(): ProviderEthicsPolicyHook {
    return {
      filter: (candidates, _request) => {
        const blockedProviders: string[] = [];
        const requiresAck: string[] = [];
        const filtered = candidates.filter(r => {
          if (isProviderBlocked(r.providerId)) {
            blockedProviders.push(r.providerId);
            return false;
          }
          if (requiresAcknowledgement(r.providerId)) {
            requiresAck.push(r.providerId);
          }
          return true;
        });

        return {
          candidates: filtered,
          blockedProviders,
          requiresAcknowledgement: requiresAck
        };
      }
    };
  }
}
