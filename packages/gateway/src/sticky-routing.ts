/**
 * Sticky routing for WebSocket Responses API.
 *
 * Implements `x-codex-turn-state` header handling that pins
 * a session/turn to a specific model replica for lower TTFT
 * and consistent context.
 *
 * - Prewarm creates a connection for a turn state.
 * - Sticky routing reuses the same replica across turns in same session.
 * - Falls back to non-sticky when replica unavailable.
 *
 * @module
 */

// ── Types ──────────────────────────────────────────────────

export interface TurnState {
  metadata?: Record<string, unknown>;
  raw: string;
  replicaId?: string;
  sessionId?: string;
  timestamp?: number;
  turnId?: string;
}

export interface StickyRoute {
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number;
  replicaId: string;
  sessionId?: string;
  turnId?: string;
  turnState: string;
}

export interface StickyRoutingOptions {
  maxEntries?: number;
  now?: () => number;
  ttlMs?: number;
}

export interface StickyRoutingTable {
  buildTurnStateHeader(state: TurnState): string;
  clear(): void;
  entries(): StickyRoute[];
  evictExpired(): number;
  getReplicaBySession(sessionId: string): string | undefined;
  getReplicaId(turnState: string): string | undefined;
  getRoute(turnState: string): StickyRoute | undefined;
  hasRoute(turnState: string): boolean;
  parseTurnStateHeader(value: string | null | undefined): TurnState | null;
  removeRoute(turnState: string): boolean;
  resolveStickyReplica(turnState: string | null | undefined, availableReplicaIds: string[]): string | undefined;
  resolveWithFallback(
    turnState: string | null | undefined,
    availableReplicaIds: string[]
  ): {
    isFallback: boolean;
    isSticky: boolean;
    replicaId?: string;
    sessionAffinity: boolean;
  };
  setRoute(turnState: string, replicaId: string, extras?: { sessionId?: string; turnId?: string }): StickyRoute;
  readonly size: number;
}

// ── Header parsing ─────────────────────────────────────────

function tryParseJsonObject(input: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(input);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed json
  }
  return null;
}

function tryParseBase64Json(input: string): Record<string, unknown> | null {
  try {
    let decoded: string;
    if (typeof Buffer === 'undefined') {
      decoded = atob(input);
    } else {
      decoded = Buffer.from(input, 'base64').toString('utf-8');
    }
    return tryParseJsonObject(decoded);
  } catch {
    return null;
  }
}

function extractStringField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return;
}

function extractNumberField(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return;
}

function extractTurnStateFromObject(raw: string, obj: Record<string, unknown>): TurnState {
  const sessionId = extractStringField(obj, ['sessionId', 'session_id', 'sid']);
  const turnId = extractStringField(obj, ['turnId', 'turn_id', 'tid']);
  const replicaId = extractStringField(obj, ['replicaId', 'replica_id', 'rid']);
  const timestamp = extractNumberField(obj, ['timestamp', 'ts']);

  const metadata: Record<string, unknown> = {};
  const knownKeys = new Set([
    'sessionId',
    'session_id',
    'sid',
    'turnId',
    'turn_id',
    'tid',
    'replicaId',
    'replica_id',
    'rid',
    'timestamp',
    'ts'
  ]);
  for (const [k, v] of Object.entries(obj)) {
    if (!knownKeys.has(k)) {
      metadata[k] = v;
    }
  }

  const result: TurnState = { raw };
  if (sessionId) {
    result.sessionId = sessionId;
  }
  if (turnId) {
    result.turnId = turnId;
  }
  if (replicaId) {
    result.replicaId = replicaId;
  }
  if (timestamp !== undefined) {
    result.timestamp = timestamp;
  }
  if (Object.keys(metadata).length > 0) {
    result.metadata = metadata;
  }
  return result;
}

function parseColonSeparated(raw: string): TurnState | null {
  const parts = raw.split(':');
  if (parts.length < 2) {
    return null;
  }
  const sessionId = parts[0];
  const turnId = parts[1];
  if (!sessionId) {
    return null;
  }
  if (!turnId) {
    return null;
  }
  if (parts.length === 2) {
    return { raw, sessionId, turnId };
  }
  const replicaId = parts.slice(2).join(':');
  if (replicaId) {
    return { raw, replicaId, sessionId, turnId };
  }
  return { raw, sessionId, turnId };
}

// ── Factory ────────────────────────────────────────────────

export function createStickyRoutingTable(options: StickyRoutingOptions = {}): StickyRoutingTable {
  const maxEntries = options.maxEntries ?? 1000;
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const now = options.now ?? (() => Date.now());

  const exact = new Map<string, StickyRoute>();
  const bySession = new Map<string, StickyRoute>();

  function removeExactAndSession(turnState: string, sessionId: string | undefined): void {
    exact.delete(turnState);
    if (!sessionId) {
      return;
    }
    const sessRoute = bySession.get(sessionId);
    if (sessRoute?.turnState === turnState) {
      bySession.delete(sessionId);
    }
  }

  function isExpired(route: StickyRoute): boolean {
    return route.expiresAt <= now();
  }

  function evictIfNeeded(): void {
    if (exact.size <= maxEntries) {
      return;
    }
    const sorted = Array.from(exact.values()).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const toEvict = sorted.slice(0, exact.size - maxEntries);
    for (const route of toEvict) {
      removeExactAndSession(route.turnState, route.sessionId);
    }
  }

  const table: StickyRoutingTable = {
    buildTurnStateHeader(state: TurnState): string {
      const hasStructured =
        state.sessionId !== undefined || state.turnId !== undefined || state.replicaId !== undefined;
      if (!hasStructured) {
        return state.raw;
      }
      const obj: Record<string, unknown> = {};
      if (state.sessionId) {
        obj.sessionId = state.sessionId;
      }
      if (state.turnId) {
        obj.turnId = state.turnId;
      }
      if (state.replicaId) {
        obj.replicaId = state.replicaId;
      }
      if (state.timestamp !== undefined) {
        obj.timestamp = state.timestamp;
      }
      if (state.metadata) {
        Object.assign(obj, state.metadata);
      }
      if (Object.keys(obj).length === 0) {
        return state.raw;
      }
      return JSON.stringify(obj);
    },

    clear(): void {
      exact.clear();
      bySession.clear();
    },

    entries(): StickyRoute[] {
      const current = now();
      return Array.from(exact.values())
        .filter(r => r.expiresAt > current)
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        .map(r => ({ ...r }));
    },

    evictExpired(): number {
      const current = now();
      let count = 0;
      for (const [key, route] of exact) {
        if (route.expiresAt <= current) {
          removeExactAndSession(key, route.sessionId);
          count++;
        }
      }
      for (const [sessId, route] of bySession) {
        if (route.expiresAt <= current) {
          bySession.delete(sessId);
        }
      }
      return count;
    },

    getReplicaBySession(sessionId: string): string | undefined {
      const route = bySession.get(sessionId);
      if (!route) {
        return;
      }
      if (isExpired(route)) {
        bySession.delete(sessionId);
        exact.delete(route.turnState);
        return;
      }
      return route.replicaId;
    },

    getReplicaId(turnState: string): string | undefined {
      const route = exact.get(turnState);
      if (!route) {
        return;
      }
      if (isExpired(route)) {
        removeExactAndSession(turnState, route.sessionId);
        return;
      }
      const updated = { ...route, lastUsedAt: now() };
      exact.set(turnState, updated);
      if (updated.sessionId) {
        bySession.set(updated.sessionId, updated);
      }
      return updated.replicaId;
    },

    getRoute(turnState: string): StickyRoute | undefined {
      const route = exact.get(turnState);
      if (!route) {
        return;
      }
      if (isExpired(route)) {
        removeExactAndSession(turnState, route.sessionId);
        return;
      }
      return { ...route };
    },

    hasRoute(turnState: string): boolean {
      return table.getReplicaId(turnState) !== undefined;
    },

    parseTurnStateHeader(value: string | null | undefined): TurnState | null {
      if (!value || typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }

      const directJson = tryParseJsonObject(trimmed);
      if (directJson) {
        return extractTurnStateFromObject(trimmed, directJson);
      }

      const isBase64Like = /^[A-Za-z0-9+/=_-]+$/.test(trimmed) && trimmed.length >= 8;
      if (isBase64Like) {
        const b64Json = tryParseBase64Json(trimmed);
        if (b64Json) {
          return extractTurnStateFromObject(trimmed, b64Json);
        }
      }

      const colon = parseColonSeparated(trimmed);
      if (colon) {
        return colon;
      }

      return { raw: trimmed };
    },

    removeRoute(turnState: string): boolean {
      const existing = exact.get(turnState);
      const deleted = exact.delete(turnState);
      if (existing?.sessionId) {
        const sessRoute = bySession.get(existing.sessionId);
        if (sessRoute?.turnState === turnState) {
          bySession.delete(existing.sessionId);
        }
      }
      return deleted;
    },

    resolveStickyReplica(turnState: string | null | undefined, availableReplicaIds: string[]): string | undefined {
      const result = table.resolveWithFallback(turnState, availableReplicaIds);
      if (result.isSticky && result.replicaId) {
        return result.replicaId;
      }
      return;
    },

    resolveWithFallback(
      turnState: string | null | undefined,
      availableReplicaIds: string[]
    ): {
      isFallback: boolean;
      isSticky: boolean;
      replicaId?: string;
      sessionAffinity: boolean;
    } {
      if (!turnState || availableReplicaIds.length === 0) {
        return { isFallback: false, isSticky: false, sessionAffinity: false };
      }

      table.evictExpired();

      const exactReplica = table.getReplicaId(turnState);
      if (exactReplica) {
        const available = availableReplicaIds.includes(exactReplica);
        if (available) {
          return { isFallback: false, isSticky: true, replicaId: exactReplica, sessionAffinity: false };
        }
        return { isFallback: true, isSticky: false, sessionAffinity: false };
      }

      const parsed = table.parseTurnStateHeader(turnState);
      const sessionId = parsed?.sessionId;
      if (sessionId) {
        const sessRoute = bySession.get(sessionId);
        const validRoute = sessRoute && !isExpired(sessRoute);
        if (validRoute && sessRoute) {
          const available = availableReplicaIds.includes(sessRoute.replicaId);
          if (available) {
            const updated = { ...sessRoute, lastUsedAt: now() };
            exact.set(sessRoute.turnState, updated);
            bySession.set(sessionId, updated);
            return {
              isFallback: false,
              isSticky: true,
              replicaId: sessRoute.replicaId,
              sessionAffinity: true
            };
          }
          return { isFallback: true, isSticky: false, sessionAffinity: true };
        }
      }

      return { isFallback: false, isSticky: false, sessionAffinity: false };
    },

    setRoute(turnState: string, replicaId: string, extras?: { sessionId?: string; turnId?: string }): StickyRoute {
      if (!turnState || turnState.trim().length === 0) {
        throw new Error('turnState must be a non-empty string');
      }
      if (!replicaId || replicaId.trim().length === 0) {
        throw new Error('replicaId must be a non-empty string');
      }

      const current = now();
      const parsed = table.parseTurnStateHeader(turnState);

      const sessionId = extras?.sessionId ?? parsed?.sessionId;
      const turnId = extras?.turnId ?? parsed?.turnId;

      const route: StickyRoute = {
        createdAt: current,
        expiresAt: current + ttlMs,
        lastUsedAt: current,
        replicaId,
        turnState,
        ...(sessionId ? { sessionId } : {}),
        ...(turnId ? { turnId } : {})
      };

      exact.set(turnState, route);
      if (sessionId) {
        bySession.set(sessionId, route);
      }

      evictIfNeeded();
      return { ...route };
    },

    get size(): number {
      return exact.size;
    }
  };

  return table;
}

// ── Standalone helpers ─────────────────────────────────────

export function parseTurnStateHeader(value: string | null | undefined): TurnState | null {
  return createStickyRoutingTable().parseTurnStateHeader(value);
}

export function buildTurnStateHeader(state: TurnState): string {
  return createStickyRoutingTable().buildTurnStateHeader(state);
}
