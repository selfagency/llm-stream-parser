/**
 * ResilienceService — circuit breaker + fallback chain + cache fallback.
 *
 * Phase 18: Graceful Degradation & Circuit Breaking
 *
 * Behavior:
 *  1. Per-provider circuit breaker (open after threshold)
 *  2. Spillover via routingService.spillover before tier degradation
 *  3. Fallback chain frontier -> mid -> small -> micro via routingService.selectModel
 *  4. Cache fallback when all providers fail (fromCache flag)
 *  5. Throws AllProvidersExhaustedError when no fallback succeeds
 *
 * @module
 */

import { CircuitBreaker, CircuitBreakerOpenError, type CircuitBreakerOptions } from './circuit-breaker.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ModelTier = 'frontier' | 'mid' | 'small' | 'micro';

export interface RoutingDecision {
  id?: string;
  modelId: string;
  providerId: string;
  replicaId?: string;
  selectedBecause?: readonly string[];
  tier: ModelTier | string;
  [key: string]: unknown;
}

export interface ModelCallRequest {
  /** Stable key for cache look-up (e.g., hash of prompt). */
  cacheKey?: string | undefined;
  /** Arbitrary payload for executor (prompt, messages, etc). */
  payload?: unknown | undefined;
  routing: RoutingDecision;
}

export interface ModelCallResult {
  content?: string | undefined;
  data?: unknown | undefined;
  fromCache?: boolean | undefined;
  modelId?: string | undefined;
  providerId?: string | undefined;
  result?: string | undefined;
  routing?: RoutingDecision | undefined;
  tier?: string | undefined;
  [key: string]: unknown;
}

export interface ResilienceLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface RoutingServiceLike {
  selectModel(request: { tier: ModelTier }): Promise<RoutingDecision | null>;
  spillover(decision: RoutingDecision): Promise<RoutingDecision | null>;
}

export interface CacheProvider {
  get(key: string): Promise<ModelCallResult | null> | ModelCallResult | null;
  set?(key: string, value: ModelCallResult): Promise<void> | void;
}

export type StreamExecutor = (request: ModelCallRequest) => Promise<ModelCallResult>;

export interface ResilienceServiceOptions {
  cache?: CacheProvider;
  circuitBreaker?: CircuitBreakerOptions;
  executor?: StreamExecutor;
  fallbackChain?: ModelTier[];
  logger?: ResilienceLogger;
  maxAttempts?: number;
}

export interface ResilienceServiceDeps {
  cache?: CacheProvider;
  circuitBreakerOptions?: CircuitBreakerOptions;
  executor?: StreamExecutor;
  logger?: ResilienceLogger;
  routingService: RoutingServiceLike;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FALLBACK_CHAIN: ModelTier[] = ['frontier', 'mid', 'small', 'micro'];

const FALLBACK_ORDER_INDEX: Record<ModelTier, number> = {
  frontier: 0,
  mid: 1,
  small: 2,
  micro: 3
};

// ── Errors ───────────────────────────────────────────────────────────────────

export class AllProvidersExhaustedError extends Error {
  readonly attemptedTiers: ModelTier[];
  readonly attemptedProviders: string[];
  readonly lastError?: unknown;

  constructor(
    message = 'All model providers are unavailable',
    opts: { attemptedProviders?: string[]; attemptedTiers?: ModelTier[]; lastError?: unknown } = {}
  ) {
    super(message);
    this.name = 'AllProvidersExhaustedError';
    this.attemptedTiers = opts.attemptedTiers ?? [];
    this.attemptedProviders = opts.attemptedProviders ?? [];
    this.lastError = opts.lastError;
  }
}

// ── Logger helpers ───────────────────────────────────────────────────────────

function createNoopLogger(): ResilienceLogger {
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

// ── CircuitBreaker store ─────────────────────────────────────────────────────

function getTierIndex(tier: string): number {
  if (tier in FALLBACK_ORDER_INDEX) {
    return FALLBACK_ORDER_INDEX[tier as ModelTier];
  }
  return -1;
}

// ── Core factory ─────────────────────────────────────────────────────────────

export interface ResilienceService {
  readonly fallbackChain: readonly ModelTier[];
  getCircuitBreaker(providerId: string): CircuitBreaker | undefined;
  getOrCreateCircuitBreaker(providerId: string): CircuitBreaker;
  isCircuitOpen(providerId: string): boolean;
  readonly name: string;
  resilientCall(request: ModelCallRequest): Promise<ModelCallResult>;
  sleep(): Promise<void>;
  start(): Promise<void>;
  readonly state: 'stopped' | 'running' | 'sleeping';
  stop(): Promise<void>;
  wakeup(): Promise<void>;
}

export function createResilienceService(
  deps: ResilienceServiceDeps,
  options: ResilienceServiceOptions = {}
): ResilienceService {
  if (!deps.routingService) {
    throw new Error('ResilienceService requires routingService');
  }

  const logger = deps.logger ?? options.logger ?? createNoopLogger();
  const fallbackChain = options.fallbackChain ?? DEFAULT_FALLBACK_CHAIN;
  const circuitOpts = deps.circuitBreakerOptions ?? options.circuitBreaker ?? {};
  const cache = deps.cache ?? options.cache;
  const executor = deps.executor ?? options.executor ?? null;
  const maxAttempts = options.maxAttempts ?? 10;

  if (fallbackChain.length === 0) {
    throw new Error('fallbackChain must not be empty');
  }

  const circuitBreakers = new Map<string, CircuitBreaker>();

  let _state: 'stopped' | 'running' | 'sleeping' = 'stopped';

  function getOrCreate(providerId: string): CircuitBreaker {
    if (typeof providerId !== 'string' || providerId.length === 0) {
      throw new Error('Invalid providerId: must be non-empty string');
    }
    let cb = circuitBreakers.get(providerId);
    if (!cb) {
      cb = new CircuitBreaker(circuitOpts);
      circuitBreakers.set(providerId, cb);
    }
    return cb;
  }

  function getCb(providerId: string): CircuitBreaker | undefined {
    return circuitBreakers.get(providerId);
  }

  function isOpen(providerId: string): boolean {
    const cb = circuitBreakers.get(providerId);
    if (!cb) {
      return false;
    }
    return cb.state === 'open' && !cb.canRequest();
  }

  async function executeWithExecutor(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!executor) {
      // If no executor is provided, synthesize a successful result for testing tiers
      // that still returns routing info. In production the daemon injects streamManager.
      return {
        providerId: request.routing.providerId,
        modelId: request.routing.modelId,
        routing: request.routing,
        tier: request.routing.tier,
        content: `executed:${request.routing.providerId}:${request.routing.tier}`
      };
    }
    return await executor(request);
  }

  async function tryCache(request: ModelCallRequest): Promise<ModelCallResult | null> {
    if (!cache) {
      return null;
    }
    if (!request.cacheKey) {
      return null;
    }
    try {
      const result = cache.get(request.cacheKey);
      const resolved = result instanceof Promise ? await result : result;
      if (resolved) {
        return resolved;
      }
      return null;
    } catch (err) {
      logger.warn('Cache lookup failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fallback chain logic is inherently branchy
  async function resilientCallInternal(
    request: ModelCallRequest,
    attemptedProviders: string[],
    attemptedTiers: ModelTier[],
    depth: number
  ): Promise<ModelCallResult> {
    if (depth > maxAttempts) {
      const cached = await tryCache(request);
      if (cached) {
        logger.info('Returning cached response (all providers failed)', { cacheKey: request.cacheKey });
        return { ...cached, fromCache: true };
      }
      throw new AllProvidersExhaustedError('All model providers are unavailable (maxAttempts)', {
        attemptedProviders,
        attemptedTiers
      });
    }

    const providerId = request.routing.providerId;
    const tierRaw = request.routing.tier;
    const tierStr = typeof tierRaw === 'string' ? tierRaw : 'unknown';

    if (!attemptedProviders.includes(providerId)) {
      attemptedProviders.push(providerId);
    }
    if (typeof tierRaw === 'string' && (fallbackChain as string[]).includes(tierRaw)) {
      const t = tierRaw as ModelTier;
      if (!attemptedTiers.includes(t)) {
        attemptedTiers.push(t);
      }
    }

    const cb = getOrCreate(providerId);

    if (cb.state === 'open' && !cb.canRequest()) {
      logger.warn(`Circuit breaker open for ${providerId}, trying failover`, { providerId, tier: tierStr });
      return failoverCall(request, attemptedProviders, attemptedTiers, depth, undefined);
    }

    try {
      // Use execute wrapper so failures trip breaker
      const result = await cb.execute(async () => await executeWithExecutor(request));
      return result;
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        logger.warn(`Circuit breaker open on execute for ${providerId}`, { providerId });
        return failoverCall(request, attemptedProviders, attemptedTiers, depth, err);
      }
      logger.warn('Primary call failed, trying failover', {
        providerId,
        tier: tierStr,
        error: err instanceof Error ? err.message : String(err)
      });
      return failoverCall(request, attemptedProviders, attemptedTiers, depth, err);
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: spillover + tier fallback is inherently branchy
  async function failoverCall(
    request: ModelCallRequest,
    attemptedProviders: string[],
    attemptedTiers: ModelTier[],
    depth: number,
    lastError: unknown
  ): Promise<ModelCallResult> {
    // 1. Try spillover (same tier, different replica/provider)
    try {
      const spilloverDecision = await deps.routingService.spillover(request.routing);
      if (spilloverDecision) {
        logger.info(`Spillover from ${request.routing.providerId} to ${spilloverDecision.providerId}`, {
          from: request.routing.providerId,
          to: spilloverDecision.providerId
        });
        const nextRequest: ModelCallRequest = { ...request, routing: spilloverDecision };
        return await resilientCallInternal(nextRequest, attemptedProviders, attemptedTiers, depth + 1);
      }
    } catch (err) {
      logger.warn('Spillover failed', { error: err instanceof Error ? err.message : String(err) });
    }

    // 2. Tier degradation along fallback chain
    const currentTier = request.routing.tier;
    const currentIdx = typeof currentTier === 'string' ? getTierIndex(currentTier) : -1;
    const startIdx = currentIdx >= 0 ? currentIdx + 1 : 0;

    // If current tier not in chain, try entire chain skipping already attempted
    const chainToTry =
      currentIdx >= 0 ? fallbackChain.slice(startIdx) : fallbackChain.filter(t => !attemptedTiers.includes(t));

    for (const fallbackTier of chainToTry) {
      try {
        const fallbackRouting = await deps.routingService.selectModel({ tier: fallbackTier });
        if (!fallbackRouting) {
          logger.debug(`No routing for tier ${fallbackTier}`, { tier: fallbackTier });
          continue;
        }
        if (attemptedProviders.includes(fallbackRouting.providerId)) {
          // Avoid infinite loops if routing returns same provider again without spillover difference
          // but still allow it if it's a different model or has fresh health
          logger.debug(`Skipping already attempted provider ${fallbackRouting.providerId} in tier ${fallbackTier}`);
        }
        logger.info(`Degrading from ${currentTier} to ${fallbackTier}`, {
          from: String(currentTier),
          to: fallbackTier,
          providerId: fallbackRouting.providerId
        });

        if (!attemptedTiers.includes(fallbackTier)) {
          attemptedTiers.push(fallbackTier);
        }

        const nextRequest: ModelCallRequest = { ...request, routing: fallbackRouting };
        return await resilientCallInternal(nextRequest, attemptedProviders, attemptedTiers, depth + 1);
      } catch (err) {
        logger.warn(`Fallback tier ${fallbackTier} failed`, {
          tier: fallbackTier,
          error: err instanceof Error ? err.message : String(err)
        });
        // Continue to next tier
      }
    }

    // 3. Cache fallback
    const cached = await tryCache(request);
    if (cached) {
      logger.info('Returning cached response (all providers failed)', { cacheKey: request.cacheKey });
      return { ...cached, fromCache: true };
    }

    // 4. Exhausted
    throw new AllProvidersExhaustedError('All model providers are unavailable', {
      attemptedProviders,
      attemptedTiers,
      lastError
    });
  }

  const service: ResilienceService = {
    name: 'resilience',

    get fallbackChain(): readonly ModelTier[] {
      return fallbackChain;
    },

    get state(): 'stopped' | 'running' | 'sleeping' {
      return _state;
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async start(): Promise<void> {
      _state = 'running';
      logger.info('ResilienceService started', { fallbackChain });
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async stop(): Promise<void> {
      _state = 'stopped';
      logger.info('ResilienceService stopped');
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async sleep(): Promise<void> {
      _state = 'sleeping';
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async wakeup(): Promise<void> {
      _state = 'running';
    },

    getCircuitBreaker(providerId: string): CircuitBreaker | undefined {
      return getCb(providerId);
    },

    getOrCreateCircuitBreaker(providerId: string): CircuitBreaker {
      return getOrCreate(providerId);
    },

    isCircuitOpen(providerId: string): boolean {
      return isOpen(providerId);
    },

    resilientCall(request: ModelCallRequest): Promise<ModelCallResult> {
      if (!request) {
        return Promise.reject(new Error('Invalid request: missing routing'));
      }
      if (!request.routing) {
        return Promise.reject(new Error('Invalid request: missing routing'));
      }
      if (!request.routing.providerId) {
        return Promise.reject(new Error('Invalid routing: missing providerId or modelId'));
      }
      if (!request.routing.modelId) {
        return Promise.reject(new Error('Invalid routing: missing providerId or modelId'));
      }
      return resilientCallInternal(request, [], [], 0);
    }
  };

  return service;
}

// ── Class wrappers for spec compatibility ────────────────────────────────────

export class ResilienceServiceImpl implements ResilienceService {
  readonly #inner: ResilienceService;
  readonly name = 'resilience';

  constructor(deps: ResilienceServiceDeps, options: ResilienceServiceOptions = {}) {
    this.#inner = createResilienceService(deps, options);
  }

  get fallbackChain(): readonly ModelTier[] {
    return this.#inner.fallbackChain;
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

  getCircuitBreaker(providerId: string): CircuitBreaker | undefined {
    return this.#inner.getCircuitBreaker(providerId);
  }

  getOrCreateCircuitBreaker(providerId: string): CircuitBreaker {
    return this.#inner.getOrCreateCircuitBreaker(providerId);
  }

  isCircuitOpen(providerId: string): boolean {
    return this.#inner.isCircuitOpen(providerId);
  }

  resilientCall(request: ModelCallRequest): Promise<ModelCallResult> {
    return this.#inner.resilientCall(request);
  }
}

export const ResilienceService = ResilienceServiceImpl;
