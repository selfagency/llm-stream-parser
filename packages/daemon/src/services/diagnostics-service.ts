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

function _safeCall<T>(fn: (() => T) | undefined, fallback: T): T {
  if (!fn) {
    return fallback;
  }
  try {
    const result = fn();
    return result ?? fallback;
  } catch {
    return fallback;
  }
}

function safeCallNum(fn: (() => number | undefined) | undefined, fallback: number): number {
  if (!fn) {
    return fallback;
  }
  try {
    const result = fn();
    return result ?? fallback;
  } catch {
    return fallback;
  }
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
  const fromRouting = safeCallNum(() => routingService?.getModelCount?.(), 0);
  if (fromRouting > 0) {
    return fromRouting;
  }
  if (gateway) {
    const fromGateway = safeCallNum(() => gateway.getModelCount?.(), 0);
    if (fromGateway > 0) {
      return fromGateway;
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
  const fromRouting = safeCallNum(() => routingService?.getTotalProviderCount?.(), 0);
  if (fromRouting > 0) {
    return fromRouting;
  }
  if (gateway) {
    const fromGateway = safeCallNum(() => gateway.getTotalProviderCount?.(), 0);
    if (fromGateway > 0) {
      return fromGateway;
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
  const fromRouting = safeCallNum(() => routingService?.getHealthyProviderCount?.(), 0);
  if (fromRouting > 0) {
    return fromRouting;
  }
  return safeCallNum(() => gateway?.getHealthyProviderCount?.(), 0);
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

  const id = firstString(entry.id, spec?.id, (entry as { spec?: { id?: string } }).spec?.id, 'unknown');
  const role = firstString(entry.role, spec?.role, undefined, 'general');
  const memoryScope = firstString(
    entry.memoryScope,
    spec?.memoryScope,
    (spec as { memoryScope?: string })?.memoryScope,
    'default'
  );
  const state = firstString(entry.state, entry.status, undefined, 'unknown');

  return {
    id,
    role,
    state,
    tokensUsed: safeNumber(entry.tokensUsed, 0),
    turnsCompleted: safeNumber(entry.turnsCompleted, 0),
    memoryScope
  };
}

/** Return the first non-empty string among candidates, falling back to a default. */
function firstString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  const last = candidates.at(-1);
  return typeof last === 'string' ? last : '';
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

function resolveAcp(acpServer: AcpServerLike | null | undefined, daemon: DaemonLike | null | undefined): AcpHealth {
  let enabled = false;

  if (daemon) {
    enabled = daemon.acp !== null && daemon.acp !== undefined;
  }

  const activeSessions = acpServer ? resolveActiveSessionCount(acpServer) : 0;

  if (acpServer && !daemon) {
    enabled = true;
  }

  return { enabled, activeSessions };
}

/** Resolve the active ACP session count across the various supported shapes. */
function resolveActiveSessionCount(acpServer: AcpServerLike): number {
  if (typeof (acpServer as { getActiveSessionCount?: () => number }).getActiveSessionCount === 'function') {
    try {
      const c = (acpServer as { getActiveSessionCount: () => number }).getActiveSessionCount();
      if (typeof c === 'number') {
        return c;
      }
    } catch {
      // ignore
    }
  } else if (typeof acpServer.count === 'function') {
    try {
      return acpServer.count();
    } catch {
      // ignore
    }
  }

  const sessions = acpServer.activeSessions ?? acpServer.sessions;
  if (sessions) {
    if (typeof (sessions as AcpSessionsLike).size === 'number') {
      return (sessions as AcpSessionsLike).size as number;
    }
    if (typeof (sessions as AcpSessionsLike).count === 'number') {
      return (sessions as AcpSessionsLike).count as number;
    }
    if (sessions instanceof Map || sessions instanceof Set) {
      return sessions.size;
    }
  }

  return 0;
}

/** Resolve memory health from a MemoryProvider-like dependency with async/sync fallback. */
async function resolveMemoryHealth(memory: MemoryEngineLike | null | undefined): Promise<MemoryHealth> {
  if (!memory) {
    return { scopes: 0, totalItems: 0, lastConsolidation: null };
  }

  const scopes = await resolveNumberMetric(
    () => memory.getScopeCount?.(),
    () => memory.scopeCount
  );
  const totalItems = await resolveNumberMetric(
    () => memory.getTotalItemCount?.(),
    () => memory.totalItems
  );
  const lastConsolidation = await resolveDateMetric(() => memory.getLastConsolidationTime?.());

  return { scopes, totalItems, lastConsolidation };
}

/** Resolve a numeric metric from a function-or-property dependency, defaulting to 0. */
async function resolveNumberMetric(
  fn: () => number | Promise<number> | undefined,
  prop: () => number | undefined
): Promise<number> {
  try {
    const result = fn();
    if (result !== undefined) {
      const resolved = result instanceof Promise ? await result : result;
      return typeof resolved === 'number' ? resolved : 0;
    }
  } catch {
    return 0;
  }
  try {
    const value = prop();
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

/** Resolve a date metric from a function dependency, defaulting to null. */
async function resolveDateMetric(
  fn: () => Date | string | null | Promise<Date | string | null> | undefined
): Promise<Date | string | null> {
  try {
    const result = fn();
    if (result === undefined) {
      return null;
    }
    const resolved = result instanceof Promise ? await result : result;
    return resolved ?? null;
  } catch {
    return null;
  }
}

/** Resolve job scheduler health with list/running fallback. */
async function resolveJobsHealth(jobScheduler: JobSchedulerLike | null | undefined): Promise<JobsHealth> {
  let scheduled: ScheduleEntry[] | number = [];
  let running = 0;

  if (jobScheduler) {
    try {
      const listResult = jobScheduler.list();
      scheduled = listResult instanceof Promise ? await listResult : listResult;
      if (!Array.isArray(scheduled)) {
        scheduled = 0;
      }
    } catch {
      scheduled = [];
    }

    if (jobScheduler.getRunningCount) {
      try {
        const rc = jobScheduler.getRunningCount();
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

    const memory: MemoryHealth = await resolveMemoryHealth(deps.memory);

    const jobs: JobsHealth = await resolveJobsHealth(deps.jobScheduler);

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
