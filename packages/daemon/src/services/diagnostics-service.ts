/**
 * DiagnosticsService — comprehensive health report for the daemon.
 *
 * Phase 18: Telemetry & Diagnostics
 *
 * Collects from:
 * - Daemon: state, uptime, pid, memory
 * - Services: ServiceHost.list() / listStates()
 * - Agents: AgentHost.list() with id/role/state/tokensUsed/turnsCompleted/memoryScope
 * - Routing: gateway stats (modelsRegistered, healthyProviders, totalProviders)
 * - Memory: scopes, totalItems, lastConsolidation
 * - Jobs: scheduled + running counts
 * - Streams: active count
 * - Subprocesses: id, pid, status, memoryUsageMb, restartCount
 * - ACP: enabled + activeSessions
 *
 * @module
 */

import { createNoopLogger, type Logger } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type DaemonState = 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export interface DaemonInfo {
  memory: NodeJS.MemoryUsage;
  pid: number;
  state: DaemonState | string;
  uptime: number;
}

export interface ServiceStateEntry {
  name: string;
  state: string;
}

export interface AgentHealthEntry {
  id: string;
  memoryScope: string;
  role: string;
  state: string;
  tokensUsed: number;
  turnsCompleted: number;
}

export interface RoutingHealth {
  healthyProviders: number;
  modelsRegistered: number;
  totalProviders: number;
}

export interface MemoryHealth {
  lastConsolidation: Date | string | null;
  scopes: number;
  totalItems: number;
}

export interface JobsHealth {
  running: number;
  scheduled: ScheduleEntry[] | number;
}

export interface ScheduleEntry {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface StreamsHealth {
  active: number;
}

export interface SubprocessHealthEntry {
  id: string;
  memoryUsageMb: number | null;
  pid: number | null;
  restartCount: number;
  status: string;
}

export interface AcpHealth {
  activeSessions: number;
  enabled: boolean;
}

export interface DaemonHealthReport {
  acp: AcpHealth;
  agents: AgentHealthEntry[];
  daemon: DaemonInfo;
  jobs: JobsHealth;
  memory: MemoryHealth;
  routing: RoutingHealth;
  services: ServiceStateEntry[];
  streams: StreamsHealth;
  subprocesses: SubprocessHealthEntry[];
  timestamp: string;
}

// ── Dependency interfaces (loose, DI-friendly) ──────────────────────────────

export interface DaemonLike {
  acp?: unknown | null;
  state: DaemonState | string;
}

export interface ServiceHostLike {
  count?(): number;
  get?(name: string): unknown;
  getState?(name: string): string | undefined;
  list(): ServiceStateEntry[] | Array<{ name: string; state: string }>;
  listStates?(): ServiceStateEntry[];
}

export interface AgentListEntry {
  id?: string;
  memoryScope?: string;
  role?: string;
  spec?: {
    id?: string;
    memoryScope?: string;
    role?: string;
  };
  state?: string;
  status?: string;
  tokensUsed?: number;
  turnsCompleted?: number;
}

export interface AgentHostLike {
  count?(): number;
  list(): AgentListEntry[] | unknown[];
}

export interface GatewayLike {
  getHealthyProviderCount?(): number;
  getModelCount?(): number;
  getTotalProviderCount?(): number;
  healthCheck?(): unknown;
  listModels?(): unknown[];
  listProviders?(): unknown[];
  modelCount?: number;
  providerIds?: string[] | readonly string[];
}

export interface RoutingServiceLike {
  gatewayInstance?: GatewayLike | null;
  getGateway?(): GatewayLike | null;
  getHealthyProviderCount?(): number;
  getModelCount?(): number;
  getTotalProviderCount?(): number;
}

export interface MemoryEngineLike {
  getLastConsolidationTime?(): Date | string | null | Promise<Date | string | null>;
  getScopeCount?(): number | Promise<number>;
  getTotalItemCount?(): number | Promise<number>;
  scopeCount?: number;
  totalItems?: number;
}

export interface JobSchedulerLike {
  getRunningCount?(): number | Promise<number>;
  list(): ScheduleEntry[] | Promise<ScheduleEntry[]>;
}

export interface StreamManagerLike {
  count?(): number;
  getActiveStreamCount?(): number;
}

export interface SubprocessEntry {
  id: string;
  memoryUsageMb?: number | null;
  pid?: number | null;
  restartCount?: number;
  status?: string;
}

export interface SubprocessManagerLike {
  listProcesses(): SubprocessEntry[];
}

export interface AcpSessionsLike {
  count?: number;
  size?: number;
}

export interface AcpServerLike {
  activeSessions?: AcpSessionsLike | Map<string, unknown> | Set<string> | unknown;
  count?(): number;
  getActiveSessionCount?(): number;
  sessions?: Map<string, unknown> | Set<string> | unknown;
}

export interface DiagnosticsServiceDeps {
  acpServer?: AcpServerLike | null;
  agentHost?: AgentHostLike | null;
  daemon?: DaemonLike | null;
  jobScheduler?: JobSchedulerLike | null;
  logger?: Logger;
  memory?: MemoryEngineLike | null;
  routingService?: RoutingServiceLike | null;
  serviceHost?: ServiceHostLike | null;
  streamManager?: StreamManagerLike | null;
  subprocessManager?: SubprocessManagerLike | null;
}

export interface DiagnosticsServiceOptions {
  logger?: Logger;
  now?: () => Date;
  pid?: number;
  uptime?: () => number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function safeString(value: unknown, fallback = 'unknown'): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return fallback;
}

function resolveGateway(routingService: RoutingServiceLike | null | undefined): GatewayLike | null {
  if (!routingService) {
    return null;
  }
  if (routingService.gatewayInstance) {
    return routingService.gatewayInstance;
  }
  if (routingService.getGateway) {
    try {
      const g = routingService.getGateway();
      if (g) {
        return g;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function resolveModelsRegistered(
  routingService: RoutingServiceLike | null | undefined,
  gateway: GatewayLike | null
): number {
  if (routingService?.getModelCount) {
    try {
      const c = routingService.getModelCount();
      if (typeof c === 'number') {
        return c;
      }
    } catch {
      // ignore
    }
  }
  if (gateway) {
    if (typeof gateway.getModelCount === 'function') {
      try {
        const c = gateway.getModelCount();
        if (typeof c === 'number') {
          return c;
        }
      } catch {
        // ignore
      }
    }
    if (typeof gateway.modelCount === 'number') {
      return gateway.modelCount;
    }
    if (Array.isArray(gateway.listModels?.())) {
      return (gateway.listModels?.() as unknown[]).length;
    }
  }
  return 0;
}

function resolveTotalProviders(
  routingService: RoutingServiceLike | null | undefined,
  gateway: GatewayLike | null
): number {
  if (routingService?.getTotalProviderCount) {
    try {
      const c = routingService.getTotalProviderCount();
      if (typeof c === 'number') {
        return c;
      }
    } catch {
      // ignore
    }
  }
  if (gateway) {
    if (typeof gateway.getTotalProviderCount === 'function') {
      try {
        const c = gateway.getTotalProviderCount();
        if (typeof c === 'number') {
          return c;
        }
      } catch {
        // ignore
      }
    }
    if (Array.isArray(gateway.providerIds)) {
      return gateway.providerIds.length;
    }
    if (Array.isArray(gateway.listProviders?.())) {
      return (gateway.listProviders?.() as unknown[]).length;
    }
  }
  return 0;
}

function resolveHealthyProviders(
  routingService: RoutingServiceLike | null | undefined,
  gateway: GatewayLike | null
): number {
  if (routingService?.getHealthyProviderCount) {
    try {
      const c = routingService.getHealthyProviderCount();
      if (typeof c === 'number') {
        return c;
      }
    } catch {
      // ignore
    }
  }
  if (gateway?.getHealthyProviderCount) {
    try {
      const c = gateway.getHealthyProviderCount();
      if (typeof c === 'number') {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return 0;
}

function normalizeAgentEntry(raw: unknown): AgentHealthEntry {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'unknown',
      role: 'unknown',
      state: 'unknown',
      tokensUsed: 0,
      turnsCompleted: 0,
      memoryScope: 'default'
    };
  }
  const entry = raw as Record<string, unknown>;
  const spec = entry.spec as Record<string, unknown> | undefined;

  const id =
    safeString(entry.id, '') ||
    safeString(spec?.id, '') ||
    safeString((entry as { spec?: { id?: string } }).spec?.id, 'unknown');

  const role = safeString(entry.role, '') || safeString(spec?.role, 'general');

  const memoryScope =
    safeString(entry.memoryScope, '') ||
    safeString(spec?.memoryScope, '') ||
    safeString((spec as { memoryScope?: string })?.memoryScope, 'default');

  const state = safeString(entry.state, '') || safeString(entry.status, 'unknown');

  return {
    id: id || 'unknown',
    role: role || 'general',
    state: state || 'unknown',
    tokensUsed: safeNumber(entry.tokensUsed, 0),
    turnsCompleted: safeNumber(entry.turnsCompleted, 0),
    memoryScope: memoryScope || 'default'
  };
}

function normalizeServiceEntries(host: ServiceHostLike | null | undefined): ServiceStateEntry[] {
  if (!host) {
    return [];
  }
  try {
    if (typeof host.listStates === 'function') {
      const states = host.listStates();
      if (Array.isArray(states)) {
        return states.map(s => ({
          name: safeString(s.name, 'unknown'),
          state: safeString(s.state, 'unknown')
        }));
      }
    }
    if (typeof host.list === 'function') {
      const list = host.list();
      if (Array.isArray(list)) {
        return list.map((s: unknown) => {
          if (!s || typeof s !== 'object') {
            return { name: 'unknown', state: 'unknown' };
          }
          const entry = s as Record<string, unknown>;
          return {
            name: safeString(entry.name, 'unknown'),
            state: safeString(entry.state, 'unknown')
          };
        });
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function resolveSubprocessMemoryMb(entry: SubprocessEntry): number | null {
  if (typeof entry.memoryUsageMb === 'number' && Number.isFinite(entry.memoryUsageMb)) {
    return entry.memoryUsageMb;
  }
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: maps multiple acp session shapes
function resolveAcp(acpServer: AcpServerLike | null | undefined, daemon: DaemonLike | null | undefined): AcpHealth {
  let enabled = false;
  let activeSessions = 0;

  if (daemon) {
    enabled = daemon.acp !== null && daemon.acp !== undefined;
  }

  if (acpServer) {
    if (typeof (acpServer as { getActiveSessionCount?: () => number }).getActiveSessionCount === 'function') {
      try {
        const c = (acpServer as { getActiveSessionCount: () => number }).getActiveSessionCount();
        if (typeof c === 'number') {
          activeSessions = c;
        }
      } catch {
        // ignore
      }
    } else if (typeof acpServer.count === 'function') {
      try {
        activeSessions = acpServer.count();
      } catch {
        // ignore
      }
    }

    const sessions = acpServer.activeSessions ?? acpServer.sessions;
    if (sessions) {
      if (typeof (sessions as AcpSessionsLike).size === 'number') {
        activeSessions = (sessions as AcpSessionsLike).size as number;
      } else if (typeof (sessions as AcpSessionsLike).count === 'number') {
        activeSessions = (sessions as AcpSessionsLike).count as number;
      } else if (sessions instanceof Map || sessions instanceof Set) {
        activeSessions = sessions.size;
      }
    }

    if (acpServer && !daemon) {
      enabled = true;
    }
  }

  return { enabled, activeSessions };
}

// ── Factory ──────────────────────────────────────────────────────────────────

export interface DiagnosticsService {
  getHealthReport(): Promise<DaemonHealthReport>;
  readonly name: string;
  sleep(): Promise<void>;
  start(): Promise<void>;
  readonly state: 'stopped' | 'running' | 'sleeping';
  stop(): Promise<void>;
  wakeup(): Promise<void>;
}

export function createDiagnosticsService(
  deps: DiagnosticsServiceDeps = {},
  options: DiagnosticsServiceOptions = {}
): DiagnosticsService {
  const logger = deps.logger ?? options.logger ?? createNoopLogger();
  const nowFn = options.now ?? (() => new Date());
  const pid = options.pid ?? process.pid;
  const uptimeFn = options.uptime ?? (() => process.uptime());

  let _state: 'stopped' | 'running' | 'sleeping' = 'stopped';

  async function getHealthReport(): Promise<DaemonHealthReport> {
    const timestamp = nowFn().toISOString();

    const daemonState = deps.daemon?.state ?? 'unknown';
    const uptime = (() => {
      try {
        return uptimeFn();
      } catch {
        return 0;
      }
    })();

    let memoryUsage: NodeJS.MemoryUsage;
    try {
      memoryUsage = process.memoryUsage();
    } catch {
      memoryUsage = {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0
      } as NodeJS.MemoryUsage;
    }

    const daemonInfo: DaemonInfo = {
      state: daemonState,
      uptime,
      pid,
      memory: memoryUsage
    };

    const services = normalizeServiceEntries(deps.serviceHost ?? undefined);

    const agents: AgentHealthEntry[] = (() => {
      if (!deps.agentHost) {
        return [];
      }
      try {
        const rawList = deps.agentHost.list();
        if (!Array.isArray(rawList)) {
          return [];
        }
        return rawList.map(normalizeAgentEntry);
      } catch {
        return [];
      }
    })();

    const gateway = resolveGateway(deps.routingService ?? undefined);
    const routing: RoutingHealth = {
      modelsRegistered: resolveModelsRegistered(deps.routingService ?? undefined, gateway),
      healthyProviders: resolveHealthyProviders(deps.routingService ?? undefined, gateway),
      totalProviders: resolveTotalProviders(deps.routingService ?? undefined, gateway)
    };

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: memory DI resolution with async sync fallback
    const memory: MemoryHealth = await (async () => {
      let scopes = 0;
      let totalItems = 0;
      let lastConsolidation: Date | string | null = null;

      if (!deps.memory) {
        return { scopes, totalItems, lastConsolidation };
      }

      try {
        if (typeof deps.memory.getScopeCount === 'function') {
          const result = deps.memory.getScopeCount();
          scopes = result instanceof Promise ? await result : result;
          if (typeof scopes !== 'number') {
            scopes = 0;
          }
        } else if (typeof deps.memory.scopeCount === 'number') {
          scopes = deps.memory.scopeCount;
        }
      } catch {
        scopes = 0;
      }

      try {
        if (typeof deps.memory.getTotalItemCount === 'function') {
          const result = deps.memory.getTotalItemCount();
          totalItems = result instanceof Promise ? await result : result;
          if (typeof totalItems !== 'number') {
            totalItems = 0;
          }
        } else if (typeof deps.memory.totalItems === 'number') {
          totalItems = deps.memory.totalItems;
        }
      } catch {
        totalItems = 0;
      }

      try {
        if (typeof deps.memory.getLastConsolidationTime === 'function') {
          const result = deps.memory.getLastConsolidationTime();
          const resolved = result instanceof Promise ? await result : result;
          if (resolved) {
            lastConsolidation = resolved;
          }
        }
      } catch {
        lastConsolidation = null;
      }

      return { scopes, totalItems, lastConsolidation };
    })();

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: job scheduler DI with list/running fallback
    const jobs: JobsHealth = await (async () => {
      let scheduled: ScheduleEntry[] | number = [];
      let running = 0;

      if (deps.jobScheduler) {
        try {
          const listResult = deps.jobScheduler.list();
          scheduled = listResult instanceof Promise ? await listResult : listResult;
          if (!Array.isArray(scheduled)) {
            scheduled = 0;
          }
        } catch {
          scheduled = [];
        }

        if (deps.jobScheduler.getRunningCount) {
          try {
            const rc = deps.jobScheduler.getRunningCount();
            running = rc instanceof Promise ? await rc : rc;
            if (typeof running !== 'number') {
              running = 0;
            }
          } catch {
            running = 0;
          }
        }
      }

      return { scheduled, running };
    })();

    const streams: StreamsHealth = (() => {
      if (!deps.streamManager) {
        return { active: 0 };
      }
      try {
        if (typeof deps.streamManager.getActiveStreamCount === 'function') {
          return { active: deps.streamManager.getActiveStreamCount() };
        }
        if (typeof deps.streamManager.count === 'function') {
          return { active: deps.streamManager.count() };
        }
      } catch {
        // ignore
      }
      return { active: 0 };
    })();

    const subprocesses: SubprocessHealthEntry[] = (() => {
      if (!deps.subprocessManager) {
        return [];
      }
      try {
        const procs = deps.subprocessManager.listProcesses();
        if (!Array.isArray(procs)) {
          return [];
        }
        return procs.map(p => ({
          id: safeString(p.id, 'unknown'),
          pid: typeof p.pid === 'number' ? p.pid : null,
          status: safeString(p.status, 'unknown'),
          memoryUsageMb: resolveSubprocessMemoryMb(p),
          restartCount: safeNumber(p.restartCount, 0)
        }));
      } catch {
        return [];
      }
    })();

    const acp = resolveAcp(deps.acpServer ?? undefined, deps.daemon ?? undefined);

    logger.debug('Diagnostics health report generated', {
      services: services.length,
      agents: agents.length,
      subprocesses: subprocesses.length
    });

    return {
      timestamp,
      daemon: daemonInfo,
      services,
      agents,
      routing,
      memory,
      jobs,
      streams,
      subprocesses,
      acp
    };
  }

  const service: DiagnosticsService = {
    name: 'diagnostics',

    get state(): 'stopped' | 'running' | 'sleeping' {
      return _state;
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle requires Promise
    async start(): Promise<void> {
      _state = 'running';
      logger.info('DiagnosticsService started');
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle requires Promise
    async stop(): Promise<void> {
      _state = 'stopped';
      logger.info('DiagnosticsService stopped');
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle requires Promise
    async sleep(): Promise<void> {
      _state = 'sleeping';
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle requires Promise
    async wakeup(): Promise<void> {
      _state = 'running';
    },

    getHealthReport
  };

  return service;
}

// ── Class wrapper ────────────────────────────────────────────────────────────

export class DiagnosticsServiceImpl implements DiagnosticsService {
  readonly #inner: DiagnosticsService;
  readonly name = 'diagnostics';

  constructor(deps: DiagnosticsServiceDeps = {}, options: DiagnosticsServiceOptions = {}) {
    this.#inner = createDiagnosticsService(deps, options);
  }

  get state(): 'stopped' | 'running' | 'sleeping' {
    return this.#inner.state;
  }

  async start(): Promise<void> {
    await this.#inner.start();
  }

  async stop(): Promise<void> {
    await this.#inner.stop();
  }

  async sleep(): Promise<void> {
    await this.#inner.sleep();
  }

  async wakeup(): Promise<void> {
    await this.#inner.wakeup();
  }

  getHealthReport(): Promise<DaemonHealthReport> {
    return this.#inner.getHealthReport();
  }
}

export const DiagnosticsService = DiagnosticsServiceImpl;
