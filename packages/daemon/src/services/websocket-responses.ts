/**
 * WebSocket Responses API — prewarm + sticky routing.
 *
 * Implements Codex-style transport:
 * - `response.create` with `generate=false` prewarms a connection.
 * - `x-codex-turn-state` header pins requests to the same replica.
 * - Prewarm pool reduces TTFT (time to first token).
 * - Sticky routing persists across turns in same session.
 * - Fallback to non-sticky when replica unavailable.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';

import {
  createStickyRoutingTable,
  type StickyRoutingOptions,
  type StickyRoutingTable,
  type TurnState
} from '@agentsy/gateway';

// ── Types ──────────────────────────────────────────────────

export const TURN_STATE_HEADER = 'x-codex-turn-state';

export interface ResponseCreateRequest {
  generate?: boolean;
  headers?: Record<string, string>;
  input?: string | unknown;
  messages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
  model?: string;
  replicaId?: string;
  sessionId?: string;
  stream?: boolean;
  turnState?: string;
}

export interface ResponseCreateResult {
  connectionId: string;
  fallback: boolean;
  id: string;
  prewarmed: boolean;
  prewarmHit: boolean;
  replicaId: string;
  sessionId?: string;
  status: 'prewarmed' | 'created' | 'streaming';
  sticky: boolean;
  ttftMs: number;
  turnState: string;
}

export type ConnectionState = 'closed' | 'connecting' | 'expired' | 'in-use' | 'ready';

export interface PooledConnection {
  close?: () => void;
  connectStartedAt: number;
  createdAt: number;
  expiresAt: number;
  id: string;
  lastUsedAt: number;
  readyAt?: number;
  replicaId: string;
  send?: (data: string) => void;
  sessionId?: string;
  state: ConnectionState;
  turnState: string;
}

export interface ConnectionFactoryResult {
  close?: () => void;
  connectDelayMs?: number;
  id?: string;
  send?: (data: string) => void;
}

export type ConnectionFactory = (replicaId: string, turnState: string) => Promise<ConnectionFactoryResult>;

export interface WebSocketResponsesOptions {
  availableReplicaIds?: string[];
  connectionFactory?: ConnectionFactory;
  defaultConnectDelayMs?: number;
  defaultReplicaId?: string;
  idGenerator?: () => string;
  idleTimeoutMs?: number;
  maxPoolSize?: number;
  now?: () => number;
  prewarmTtlMs?: number;
  stickyTable?: StickyRoutingTable;
}

export interface PoolStats {
  connecting: number;
  expired: number;
  inUse: number;
  maxSize: number;
  ready: number;
  total: number;
}

export interface PrewarmResult {
  connectDurationMs: number;
  connectionId: string;
  readyAt: number;
  replicaId: string;
  sessionId?: string;
  turnState: string;
}

// ── Connection Pool ────────────────────────────────────────

export class WebSocketConnectionPool {
  readonly #bySession = new Map<string, PooledConnection>();
  readonly #byTurnState = new Map<string, PooledConnection>();
  readonly #connections = new Map<string, PooledConnection>();
  readonly #factory: ConnectionFactory;
  readonly #idGen: () => string;
  readonly #now: () => number;
  readonly #options: {
    availableReplicaIds: string[];
    defaultConnectDelayMs: number;
    defaultReplicaId: string;
    idleTimeoutMs: number;
    maxPoolSize: number;
    prewarmTtlMs: number;
    stickyTable: StickyRoutingTable;
  };

  constructor(options: WebSocketResponsesOptions & { stickyTable: StickyRoutingTable }) {
    const now = options.now ?? (() => Date.now());
    const idGen = options.idGenerator ?? (() => `ws-${randomUUID().slice(0, 8)}`);
    const factory: ConnectionFactory =
      options.connectionFactory ??
      (async () => {
        const delay = options.defaultConnectDelayMs ?? 10;
        if (delay > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
        return {};
      });

    this.#now = now;
    this.#idGen = idGen;
    this.#factory = factory;
    this.#options = {
      availableReplicaIds: options.availableReplicaIds ?? [],
      defaultConnectDelayMs: options.defaultConnectDelayMs ?? 10,
      defaultReplicaId: options.defaultReplicaId ?? 'replica-default',
      idleTimeoutMs: options.idleTimeoutMs ?? 60_000,
      maxPoolSize: options.maxPoolSize ?? 20,
      prewarmTtlMs: options.prewarmTtlMs ?? 5 * 60 * 1000,
      stickyTable: options.stickyTable
    };
  }

  get size(): number {
    return this.#connections.size;
  }

  async createConnection(replicaId: string, turnState: string, sessionId?: string): Promise<PooledConnection> {
    this.evictExpired();

    if (this.#connections.size >= this.#options.maxPoolSize) {
      const candidates = Array.from(this.#connections.values())
        .filter(c => c.state === 'ready')
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      const lru = candidates[0];
      if (lru) {
        this.#removeConnection(lru.id);
      } else if (this.#connections.size >= this.#options.maxPoolSize) {
        throw new Error('Connection pool exhausted');
      }
    }

    const now = this.#now();
    const id = this.#idGen();

    const conn: PooledConnection = {
      connectStartedAt: now,
      createdAt: now,
      expiresAt: now + this.#options.prewarmTtlMs,
      id,
      lastUsedAt: now,
      replicaId,
      ...(sessionId ? { sessionId } : {}),
      state: 'connecting',
      turnState
    };

    this.#connections.set(id, conn);
    this.#byTurnState.set(turnState, conn);
    if (sessionId) {
      this.#bySession.set(sessionId, conn);
    }

    try {
      const result = await this.#factory(replicaId, turnState);
      const readyAt = this.#now();
      const finalId = result.id ?? id;
      const updated: PooledConnection = {
        ...conn,
        ...(result.close ? { close: result.close } : {}),
        ...(result.send ? { send: result.send } : {}),
        id: finalId,
        lastUsedAt: readyAt,
        readyAt,
        state: 'ready'
      };
      if (result.id && result.id !== id) {
        this.#connections.delete(id);
      }
      this.#connections.set(updated.id, updated);
      this.#byTurnState.set(turnState, updated);
      if (sessionId) {
        this.#bySession.set(sessionId, updated);
      }
      return updated;
    } catch (err) {
      this.#removeConnection(id);
      throw err;
    }
  }

  acquire(turnState: string): PooledConnection | undefined {
    this.evictExpired();
    const stored = this.#byTurnState.get(turnState);
    if (!stored) {
      return;
    }
    if (stored.state !== 'ready') {
      return;
    }
    if (stored.expiresAt <= this.#now()) {
      this.#removeConnection(stored.id);
      return;
    }
    const byState = this.#byTurnState.get(turnState);
    const conn = byState ?? stored;
    const updated: PooledConnection = {
      ...conn,
      lastUsedAt: this.#now(),
      state: 'in-use'
    };
    this.#connections.set(conn.id, updated);
    this.#byTurnState.set(turnState, updated);
    if (updated.sessionId) {
      this.#bySession.set(updated.sessionId, updated);
    }
    return updated;
  }

  acquireBySession(sessionId: string): PooledConnection | undefined {
    this.evictExpired();
    const stored = this.#bySession.get(sessionId);
    if (!stored) {
      return;
    }
    if (stored.state !== 'ready' || stored.expiresAt <= this.#now()) {
      this.#removeConnection(stored.id);
      return;
    }
    const updated: PooledConnection = {
      ...stored,
      lastUsedAt: this.#now(),
      state: 'in-use'
    };
    this.#connections.set(stored.id, updated);
    this.#byTurnState.set(stored.turnState, updated);
    this.#bySession.set(sessionId, updated);
    return updated;
  }

  release(connectionId: string): void {
    const conn = this.#connections.get(connectionId);
    if (!conn) {
      return;
    }
    if (conn.state === 'in-use') {
      const updated: PooledConnection = {
        ...conn,
        lastUsedAt: this.#now(),
        state: 'ready'
      };
      this.#connections.set(connectionId, updated);
      this.#byTurnState.set(conn.turnState, updated);
      if (conn.sessionId) {
        this.#bySession.set(conn.sessionId, updated);
      }
    }
  }

  remove(connectionId: string): boolean {
    return this.#removeConnection(connectionId);
  }

  #removeConnection(connectionId: string): boolean {
    const conn = this.#connections.get(connectionId);
    if (!conn) {
      return false;
    }
    const closer = conn.close;
    if (closer) {
      closer();
    }
    this.#connections.delete(connectionId);
    const byTurn = this.#byTurnState.get(conn.turnState);
    if (byTurn?.id === connectionId) {
      this.#byTurnState.delete(conn.turnState);
    }
    if (conn.sessionId) {
      const bySess = this.#bySession.get(conn.sessionId);
      if (bySess?.id === connectionId) {
        this.#bySession.delete(conn.sessionId);
      }
    }
    return true;
  }

  evictExpired(): number {
    const now = this.#now();
    let count = 0;
    for (const [id, conn] of this.#connections) {
      const idleExpired = conn.state === 'ready' && now - conn.lastUsedAt > this.#options.idleTimeoutMs;
      if (conn.expiresAt <= now || idleExpired) {
        this.#removeConnection(id);
        count++;
      }
    }
    return count;
  }

  stats(): PoolStats {
    let ready = 0;
    let inUse = 0;
    let connecting = 0;
    let expired = 0;
    const now = this.#now();
    for (const conn of this.#connections.values()) {
      if (conn.expiresAt <= now) {
        expired++;
      }
      switch (conn.state) {
        case 'ready':
          ready++;
          break;
        case 'in-use':
          inUse++;
          break;
        case 'connecting':
          connecting++;
          break;
        default:
          break;
      }
    }
    return {
      connecting,
      expired,
      inUse,
      maxSize: this.#options.maxPoolSize,
      ready,
      total: this.#connections.size
    };
  }

  getByTurnState(turnState: string): PooledConnection | undefined {
    const conn = this.#byTurnState.get(turnState);
    return conn;
  }

  getAll(): PooledConnection[] {
    return Array.from(this.#connections.values()).map(c => ({ ...c }));
  }

  clear(): void {
    for (const conn of this.#connections.values()) {
      const closer = conn.close;
      if (closer) {
        closer();
      }
    }
    this.#connections.clear();
    this.#byTurnState.clear();
    this.#bySession.clear();
  }
}

// ── Service ────────────────────────────────────────────────

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

function noOpLogger(): Logger {
  return {
    debug() {
      // noop
    },
    error() {
      // noop
    },
    info() {
      // noop
    },
    warn() {
      // noop
    }
  };
}

export class WebSocketResponsesService {
  readonly name = 'websocket-responses';
  readonly #pool: WebSocketConnectionPool;
  readonly #stickyTable: StickyRoutingTable;
  readonly #logger: Logger;
  readonly #now: () => number;
  readonly #idGen: () => string;
  readonly #defaultReplicaId: string;
  readonly #availableReplicaIds: string[];
  readonly #defaultConnectDelayMs: number;
  #state: 'active' | 'sleeping' | 'starting' | 'stopped' | 'stopping' = 'stopped';

  constructor(options: WebSocketResponsesOptions & { logger?: Logger } = {}) {
    const now = options.now ?? (() => Date.now());
    const idGen = options.idGenerator ?? (() => `resp-${randomUUID().slice(0, 8)}`);
    const stickyOptions: StickyRoutingOptions = { now };
    if (options.prewarmTtlMs !== undefined) {
      stickyOptions.ttlMs = options.prewarmTtlMs;
    }
    const stickyTable = options.stickyTable ?? createStickyRoutingTable(stickyOptions);
    const logger = options.logger ?? noOpLogger();

    this.#now = now;
    this.#idGen = idGen;
    this.#stickyTable = stickyTable;
    this.#logger = logger;
    this.#defaultReplicaId = options.defaultReplicaId ?? 'replica-default';
    this.#availableReplicaIds = options.availableReplicaIds ?? [this.#defaultReplicaId, 'replica-a', 'replica-b'];
    this.#defaultConnectDelayMs = options.defaultConnectDelayMs ?? 50;

    const poolOverrides: WebSocketResponsesOptions & { stickyTable: StickyRoutingTable } = {
      availableReplicaIds: this.#availableReplicaIds,
      defaultConnectDelayMs: this.#defaultConnectDelayMs,
      defaultReplicaId: this.#defaultReplicaId,
      now,
      stickyTable
    };
    if (options.connectionFactory) {
      poolOverrides.connectionFactory = options.connectionFactory;
    }
    if (options.idGenerator) {
      poolOverrides.idGenerator = options.idGenerator;
    }
    if (options.idleTimeoutMs !== undefined) {
      poolOverrides.idleTimeoutMs = options.idleTimeoutMs;
    }
    if (options.maxPoolSize !== undefined) {
      poolOverrides.maxPoolSize = options.maxPoolSize;
    }
    if (options.prewarmTtlMs !== undefined) {
      poolOverrides.prewarmTtlMs = options.prewarmTtlMs;
    }
    if (options.availableReplicaIds) {
      poolOverrides.availableReplicaIds = options.availableReplicaIds;
    }
    this.#pool = new WebSocketConnectionPool(poolOverrides);
  }

  get state(): string {
    return this.#state;
  }

  get pool(): WebSocketConnectionPool {
    return this.#pool;
  }

  get stickyTable(): StickyRoutingTable {
    return this.#stickyTable;
  }

  // biome-ignore lint/suspicious/useAwait: lifecycle sync but interface async
  async start(): Promise<void> {
    this.#state = 'starting';
    this.#pool.evictExpired();
    this.#stickyTable.evictExpired();
    this.#state = 'active';
    this.#logger.info('WebSocketResponsesService started');
  }

  // biome-ignore lint/suspicious/useAwait: lifecycle sync but interface async
  async stop(): Promise<void> {
    this.#state = 'stopping';
    this.#pool.clear();
    this.#stickyTable.clear();
    this.#state = 'stopped';
    this.#logger.info('WebSocketResponsesService stopped');
  }

  async sleep(): Promise<void> {
    this.#state = 'sleeping';
    await Promise.resolve();
  }

  async wakeup(): Promise<void> {
    this.#state = 'active';
    this.#pool.evictExpired();
    await Promise.resolve();
  }

  // ── Turn state header handling ────────────────────────

  parseTurnStateHeaderValue(headerValue: string | null | undefined): TurnState | null {
    return this.#stickyTable.parseTurnStateHeader(headerValue);
  }

  extractTurnStateFromRequest(request: ResponseCreateRequest): {
    parsed: TurnState | null;
    sessionId?: string;
    turnState: string;
  } {
    const headerValue = request.headers?.[TURN_STATE_HEADER] ?? request.headers?.[TURN_STATE_HEADER.toLowerCase()];

    let rawTurnState = request.turnState ?? (headerValue as string | undefined);
    let parsed: TurnState | null = null;

    if (rawTurnState) {
      parsed = this.#stickyTable.parseTurnStateHeader(rawTurnState);
    } else if (headerValue) {
      parsed = this.#stickyTable.parseTurnStateHeader(headerValue);
      rawTurnState = parsed?.raw;
    }

    const sessionId = request.sessionId ?? parsed?.sessionId;
    const turnState = rawTurnState ?? `ts-${this.#idGen()}`;

    return {
      parsed,
      ...(sessionId ? { sessionId } : {}),
      turnState
    };
  }

  // ── Prewarm ───────────────────────────────────────────

  async prewarm(request: ResponseCreateRequest): Promise<PrewarmResult> {
    if (this.#state !== 'active') {
      throw new Error('WebSocketResponsesService not active');
    }

    const { turnState, sessionId, parsed } = this.extractTurnStateFromRequest(request);
    const requestedSessionId = sessionId ?? parsed?.sessionId;

    let replicaId = request.replicaId;

    if (!replicaId) {
      const stickyResolution = this.#stickyTable.resolveWithFallback(turnState, this.#availableReplicaIds);
      if (stickyResolution.replicaId && stickyResolution.isSticky) {
        replicaId = stickyResolution.replicaId;
      }
    }

    if (!replicaId) {
      replicaId = this.#defaultReplicaId;
    }

    if (!this.#availableReplicaIds.includes(replicaId)) {
      const first = this.#availableReplicaIds[0];
      replicaId = first ?? this.#defaultReplicaId;
    }

    const start = this.#now();
    const conn = await this.#pool.createConnection(replicaId, turnState, requestedSessionId);
    const duration = (conn.readyAt ?? this.#now()) - start;

    this.#stickyTable.setRoute(turnState, replicaId, {
      ...(requestedSessionId ? { sessionId: requestedSessionId } : {})
    });

    this.#logger.info('Connection prewarmed', {
      connectionId: conn.id,
      durationMs: duration,
      replicaId,
      turnState
    });

    return {
      connectionId: conn.id,
      connectDurationMs: duration,
      readyAt: conn.readyAt ?? this.#now(),
      replicaId,
      ...(requestedSessionId ? { sessionId: requestedSessionId } : {}),
      turnState
    };
  }

  #resolveReplica(
    requestedReplicaId: string | undefined,
    stickyResolution: ReturnType<StickyRoutingTable['resolveWithFallback']>
  ): { replicaId: string; sticky: boolean; fallback: boolean } {
    let replicaId = requestedReplicaId;
    let sticky = false;
    let fallback = false;

    if (!replicaId) {
      if (stickyResolution.replicaId) {
        replicaId = stickyResolution.replicaId;
        sticky = stickyResolution.isSticky;
        fallback = stickyResolution.isFallback;
      } else {
        fallback = stickyResolution.isFallback;
      }
    }

    if (!replicaId) {
      replicaId = this.#defaultReplicaId;
    }

    if (!this.#availableReplicaIds.includes(replicaId)) {
      const first = this.#availableReplicaIds[0];
      const fallbackReplica = first ?? this.#defaultReplicaId;
      fallback = true;
      replicaId = fallbackReplica;
    }

    return { replicaId, sticky, fallback };
  }

  async #acquireOrCreateConnection(
    turnState: string,
    replicaId: string,
    sessionId: string | undefined
  ): Promise<{ conn: PooledConnection; prewarmHit: boolean; ttftMs: number; stickyViaSession: boolean }> {
    const acquireStart = this.#now();
    let conn = this.#pool.acquire(turnState);
    let stickyViaSession = false;

    if (!conn && sessionId) {
      conn = this.#pool.acquireBySession(sessionId);
      if (conn) {
        stickyViaSession = true;
      }
    }

    if (conn) {
      let ttftMs = this.#now() - acquireStart;
      if (ttftMs === 0) {
        ttftMs = 1;
      }
      return { conn, prewarmHit: true, ttftMs, stickyViaSession };
    }

    const coldStart = this.#now();
    const newConn = await this.#pool.createConnection(replicaId, turnState, sessionId);
    const inUse = this.#pool.acquire(turnState);
    const ttftMs = this.#now() - coldStart;
    const finalConn = inUse ?? newConn;
    return { conn: finalConn, prewarmHit: false, ttftMs, stickyViaSession: false };
  }

  // ── Response.create (main entry) ──────────────────────

  async createResponse(request: ResponseCreateRequest): Promise<ResponseCreateResult> {
    if (this.#state !== 'active') {
      throw new Error('WebSocketResponsesService not active');
    }

    const isPrewarm = request.generate === false;
    const { turnState, sessionId, parsed } = this.extractTurnStateFromRequest(request);
    const requestedSessionId = sessionId ?? parsed?.sessionId;
    const stickyResolution = this.#stickyTable.resolveWithFallback(turnState, this.#availableReplicaIds);
    const {
      replicaId,
      sticky: initialSticky,
      fallback: initialFallback
    } = this.#resolveReplica(request.replicaId, stickyResolution);

    let sticky = initialSticky;
    const fallback = initialFallback;

    if (isPrewarm) {
      const prewarmResult = await this.prewarm({
        ...request,
        replicaId,
        turnState,
        ...(requestedSessionId ? { sessionId: requestedSessionId } : {})
      });

      return {
        connectionId: prewarmResult.connectionId,
        fallback,
        id: `resp-${this.#idGen()}`,
        prewarmHit: false,
        prewarmed: true,
        replicaId: prewarmResult.replicaId,
        ...(prewarmResult.sessionId ? { sessionId: prewarmResult.sessionId } : {}),
        status: 'prewarmed',
        sticky,
        ttftMs: 0,
        turnState: prewarmResult.turnState
      };
    }

    const { conn, prewarmHit, ttftMs, stickyViaSession } = await this.#acquireOrCreateConnection(
      turnState,
      replicaId,
      requestedSessionId
    );
    if (stickyViaSession) {
      sticky = true;
    }

    this.#stickyTable.setRoute(turnState, replicaId, {
      ...(requestedSessionId ? { sessionId: requestedSessionId } : {})
    });

    const status = request.stream === false ? 'created' : 'streaming';

    this.#logger.info('Response created', {
      fallback,
      prewarmHit,
      replicaId,
      responseId: `resp-${conn.id}`,
      sticky,
      ttftMs,
      turnState
    });

    return {
      connectionId: conn.id,
      fallback,
      id: `resp-${this.#idGen()}`,
      prewarmHit,
      prewarmed: false,
      replicaId,
      ...(requestedSessionId ? { sessionId: requestedSessionId } : {}),
      status,
      sticky,
      ttftMs,
      turnState
    };
  }

  // ── Metrics ───────────────────────────────────────────

  getPoolStats(): PoolStats {
    return this.#pool.stats();
  }

  measureTtftImprovement(coldTtft: number, warmTtft: number): { improvementMs: number; improvementPercent: number } {
    const improvementMs = coldTtft - warmTtft;
    const improvementPercent = coldTtft > 0 ? (improvementMs / coldTtft) * 100 : 0;
    return { improvementMs, improvementPercent };
  }

  // ── Helpers for integration test ──────────────────────

  async codexFlow(params: {
    input: string;
    sessionId: string;
    model?: string;
    replicaId?: string;
    turnState?: string;
  }): Promise<{ prewarm: PrewarmResult; response: ResponseCreateResult }> {
    const turnState = params.turnState ?? `${params.sessionId}:turn-1`;
    const prewarm = await this.prewarm({
      sessionId: params.sessionId,
      turnState,
      ...(params.model ? { model: params.model } : {}),
      ...(params.replicaId ? { replicaId: params.replicaId } : {}),
      headers: { [TURN_STATE_HEADER]: turnState }
    });

    const response = await this.createResponse({
      sessionId: params.sessionId,
      turnState,
      input: params.input,
      ...(params.model ? { model: params.model } : {}),
      ...(params.replicaId ? { replicaId: params.replicaId } : {}),
      headers: { [TURN_STATE_HEADER]: turnState }
    });

    return { prewarm, response };
  }
}

// ── Factory ──────────────────────────────────────────────

export interface CreateWebSocketResponsesOptions extends WebSocketResponsesOptions {
  logger?: Logger;
}

export function createWebSocketResponsesService(
  options: CreateWebSocketResponsesOptions = {}
): WebSocketResponsesService {
  return new WebSocketResponsesService(options);
}
