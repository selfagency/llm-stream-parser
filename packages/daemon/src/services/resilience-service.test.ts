/**
 * ResilienceService tests — circuit breaker + fallback chain + cache
 *
 * TDD for Phase 18: Graceful Degradation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';
import {
  AllProvidersExhaustedError,
  createResilienceService,
  type ModelCallRequest,
  type ModelCallResult,
  type ModelTier,
  type RoutingDecision,
  type RoutingServiceLike
} from './resilience-service.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRouting(tier: ModelTier, providerId = `provider-${tier}`): RoutingDecision {
  return {
    id: `${providerId}-${tier}`,
    modelId: `model-${tier}`,
    providerId,
    replicaId: `replica-${providerId}`,
    tier,
    selectedBecause: ['test']
  };
}

function makeRequest(tier: ModelTier, overrides: Partial<ModelCallRequest> = {}): ModelCallRequest {
  const base: ModelCallRequest = {
    routing: makeRouting(tier, overrides.routing?.providerId ?? `provider-${tier}`)
  };
  if (overrides.cacheKey !== undefined) {
    base.cacheKey = overrides.cacheKey;
  }
  if (overrides.payload !== undefined) {
    base.payload = overrides.payload;
  }
  if (overrides.routing) {
    base.routing = overrides.routing;
  }
  return base;
}

function createMockRoutingService(
  impls: {
    selectModel?: (req: { tier: ModelTier }) => Promise<RoutingDecision | null>;
    spillover?: (d: RoutingDecision) => Promise<RoutingDecision | null>;
  } = {}
): RoutingServiceLike {
  return {
    selectModel: vi.fn().mockImplementation((req: { tier: ModelTier }) => {
      if (impls.selectModel) {
        return impls.selectModel(req);
      }
      return Promise.resolve(null);
    }),
    spillover: vi.fn().mockImplementation((decision: RoutingDecision) => {
      if (impls.spillover) {
        return impls.spillover(decision);
      }
      return Promise.resolve(null);
    })
  };
}

// ── CircuitBreaker unit (daemon local copy) ──────────────────────────────────

describe('CircuitBreaker (daemon local)', () => {
  it('starts closed', () => {
    const cb = new CircuitBreaker();
    expect(cb.state).toBe('closed');
    expect(cb.canRequest()).toBe(true);
  });

  it('opens after threshold', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetAfterMs: 1000 });
    cb.recordFailure(0);
    expect(cb.state).toBe('closed');
    cb.recordFailure(1);
    expect(cb.state).toBe('closed');
    cb.recordFailure(2);
    expect(cb.state).toBe('open');
    expect(cb.canRequest(2)).toBe(false);
  });

  it('half-open after resetAfterMs', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetAfterMs: 100 });
    cb.recordFailure(0);
    cb.recordFailure(0);
    expect(cb.state).toBe('open');
    expect(cb.canRequest(50)).toBe(false);
    expect(cb.canRequest(150)).toBe(true);
    expect(cb.state).toBe('half-open');
  });

  it('execute records success and resets', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure();
    expect(cb.failures).toBe(1);
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.state).toBe('closed');
    expect(cb.failures).toBe(0);
  });

  it('execute records failure and opens', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb.failures).toBe(1);
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb.state).toBe('open');
  });

  it('execute throws CircuitBreakerOpenError when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.state).toBe('open');
    await expect(cb.execute(() => Promise.resolve('should not run'))).rejects.toThrow(/open/i);
  });
});

// ── ResilienceService creation ───────────────────────────────────────────────

describe('createResilienceService validation', () => {
  it('throws if routingService missing', () => {
    // @ts-expect-error testing invalid input
    expect(() => createResilienceService({})).toThrow(/routingService/);
  });

  it('creates with default fallback chain frontier->mid->small->micro', () => {
    const svc = createResilienceService({
      routingService: createMockRoutingService()
    });
    expect(svc.fallbackChain).toEqual(['frontier', 'mid', 'small', 'micro']);
  });
});

// ── Circuit breaker per provider ─────────────────────────────────────────────

describe('ResilienceService circuit breaker per provider', () => {
  it('OPEN after threshold prevents calls', async () => {
    let callCount = 0;
    const routingService = createMockRoutingService();

    const svc = createResilienceService(
      {
        routingService,
        executor: () => {
          callCount++;
          return Promise.reject(new Error('provider failure'));
        }
      },
      {
        circuitBreaker: { failureThreshold: 2, resetAfterMs: 60_000 }
      }
    );
    await svc.start();

    const req = makeRequest('frontier', { routing: makeRouting('frontier', 'provider-a') });

    // First failure
    await expect(svc.resilientCall(req)).rejects.toThrow(AllProvidersExhaustedError);
    expect(callCount).toBe(1);

    // Second failure -> breaker opens for provider-a
    await expect(svc.resilientCall(req)).rejects.toThrow(AllProvidersExhaustedError);
    expect(callCount).toBe(2);

    const cb = svc.getCircuitBreaker('provider-a');
    expect(cb).toBeDefined();
    expect(cb?.state).toBe('open');
    expect(svc.isCircuitOpen('provider-a')).toBe(true);

    // Third call should not invoke executor for provider-a at all because breaker is open
    callCount = 0;
    await expect(svc.resilientCall(req)).rejects.toThrow(AllProvidersExhaustedError);
    expect(callCount).toBe(0);
  });

  it('per-provider isolation — open breaker on A does not affect B', async () => {
    const routingService = createMockRoutingService();

    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          if (req.routing.providerId === 'provider-a') {
            return Promise.reject(new Error('A fails'));
          }
          return Promise.resolve({ content: 'ok B', providerId: req.routing.providerId });
        }
      },
      { circuitBreaker: { failureThreshold: 1, resetAfterMs: 60_000 } }
    );
    await svc.start();

    const reqA = makeRequest('frontier', { routing: makeRouting('frontier', 'provider-a') });
    await expect(svc.resilientCall(reqA)).rejects.toThrow(AllProvidersExhaustedError);

    expect(svc.isCircuitOpen('provider-a')).toBe(true);
    expect(svc.isCircuitOpen('provider-b')).toBe(false);

    const reqB = makeRequest('frontier', { routing: makeRouting('frontier', 'provider-b') });
    const resB = await svc.resilientCall(reqB);
    expect(resB.content).toBe('ok B');
  });
});

// ── Fallback chain ───────────────────────────────────────────────────────────

describe('ResilienceService fallback chain frontier->mid->small->micro', () => {
  let tierCalls: ModelTier[];
  let providerForTier: Record<string, string>;

  beforeEach(() => {
    tierCalls = [];
    providerForTier = {
      frontier: 'p-frontier',
      mid: 'p-mid',
      small: 'p-small',
      micro: 'p-micro'
    };
  });

  function makeTierRoutingService(availableTiers: ModelTier[]): RoutingServiceLike {
    return createMockRoutingService({
      selectModel: req => {
        tierCalls.push(req.tier);
        if (!availableTiers.includes(req.tier)) {
          return Promise.resolve(null);
        }
        const providerId = providerForTier[req.tier] ?? `p-${req.tier}`;
        return Promise.resolve(makeRouting(req.tier, providerId));
      },
      spillover: () => Promise.resolve(null)
    });
  }

  it('degrades frontier -> mid when primary fails', async () => {
    const routingService = makeTierRoutingService(['mid', 'small', 'micro']);

    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          if (req.routing.tier === 'frontier') {
            return Promise.reject(new Error('frontier down'));
          }
          return Promise.resolve({
            providerId: req.routing.providerId,
            tier: String(req.routing.tier),
            content: `fallback to ${String(req.routing.tier)}`
          });
        }
      },
      { circuitBreaker: { failureThreshold: 5 } }
    );
    await svc.start();

    const req = makeRequest('frontier');
    const result = await svc.resilientCall(req);
    expect(result.content).toBe('fallback to mid');
    expect(tierCalls).toContain('mid');
  });

  it('traverses full chain frontier->mid->small->micro', async () => {
    const routingService = makeTierRoutingService(['mid', 'small', 'micro']);

    const attempted: string[] = [];
    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          attempted.push(`${req.routing.tier}:${req.routing.providerId}`);
          if (req.routing.tier === 'frontier' || req.routing.tier === 'mid' || req.routing.tier === 'small') {
            return Promise.reject(new Error(`${String(req.routing.tier)} fails`));
          }
          return Promise.resolve({
            tier: String(req.routing.tier),
            providerId: req.routing.providerId,
            content: 'micro ok'
          });
        }
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req = makeRequest('frontier');
    const result = await svc.resilientCall(req);
    expect(result.content).toBe('micro ok');
    expect(result.tier).toBe('micro');
    expect(attempted[0]).toMatch(/frontier/);
    expect(attempted[1]).toMatch(/mid/);
    expect(attempted[2]).toMatch(/small/);
    expect(attempted[3]).toMatch(/micro/);
  });
});

// ── Spillover before tier degradation ────────────────────────────────────────

describe('ResilienceService spillover check before tier degradation', () => {
  it('tries spillover before tier degradation', async () => {
    const spilloverRouting = makeRouting('frontier', 'provider-frontier-spill');

    let selectModelCalled = false;

    const routingService = createMockRoutingService({
      selectModel: () => {
        selectModelCalled = true;
        return Promise.resolve(makeRouting('mid', 'provider-mid'));
      },
      spillover: decision => {
        if (decision.providerId === 'provider-frontier') {
          return Promise.resolve(spilloverRouting);
        }
        return Promise.resolve(null);
      }
    });

    const executorCalls: string[] = [];
    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          executorCalls.push(req.routing.providerId);
          if (req.routing.providerId === 'provider-frontier') {
            return Promise.reject(new Error('primary fails'));
          }
          if (req.routing.providerId === 'provider-frontier-spill') {
            return Promise.resolve({ providerId: req.routing.providerId, content: 'spillover ok' });
          }
          return Promise.resolve({ providerId: req.routing.providerId, content: 'should not reach tier' });
        }
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req = makeRequest('frontier', { routing: makeRouting('frontier', 'provider-frontier') });
    const result = await svc.resilientCall(req);

    expect(result.content).toBe('spillover ok');
    expect(executorCalls).toEqual(['provider-frontier', 'provider-frontier-spill']);
    expect(selectModelCalled).toBe(false);
  });

  it('falls back to tier degradation when spillover returns null', async () => {
    let spilloverCalled = false;
    let selectModelCalled = false;

    const routingService = createMockRoutingService({
      selectModel: () => {
        selectModelCalled = true;
        return Promise.resolve(makeRouting('mid', 'provider-mid'));
      },
      spillover: () => {
        spilloverCalled = true;
        return Promise.resolve(null);
      }
    });

    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          if (req.routing.tier === 'frontier') {
            return Promise.reject(new Error('frontier fails'));
          }
          return Promise.resolve({ content: 'mid ok', providerId: req.routing.providerId });
        }
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req = makeRequest('frontier');
    const result = await svc.resilientCall(req);
    expect(spilloverCalled).toBe(true);
    expect(selectModelCalled).toBe(true);
    expect(result.content).toBe('mid ok');
  });
});

// ── Cache fallback ───────────────────────────────────────────────────────────

describe('ResilienceService cache fallback when all providers fail', () => {
  it('returns cached result with fromCache flag', async () => {
    const cachedResult: ModelCallResult = { content: 'cached response', providerId: 'cache' };
    const cache = {
      get: vi.fn().mockReturnValue(cachedResult)
    };

    const routingService = createMockRoutingService({
      selectModel: () => Promise.resolve(null),
      spillover: () => Promise.resolve(null)
    });

    const svc = createResilienceService(
      {
        routingService,
        cache,
        executor: () => Promise.reject(new Error('all providers down'))
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req: ModelCallRequest = {
      routing: makeRouting('frontier', 'provider-frontier'),
      cacheKey: 'prompt-hash-123'
    };

    const result = await svc.resilientCall(req);
    expect(result.content).toBe('cached response');
    expect(result.fromCache).toBe(true);
    expect(cache.get).toHaveBeenCalledWith('prompt-hash-123');
  });

  it('cache not consulted when cacheKey missing', async () => {
    const cache = {
      get: vi.fn().mockReturnValue({ content: 'should not be used' })
    };

    const routingService = createMockRoutingService();

    const svc = createResilienceService(
      {
        routingService,
        cache,
        executor: () => Promise.reject(new Error('fail'))
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req: ModelCallRequest = {
      routing: makeRouting('frontier', 'provider-frontier')
    };

    await expect(svc.resilientCall(req)).rejects.toThrow(AllProvidersExhaustedError);
    expect(cache.get).not.toHaveBeenCalled();
  });
});

// ── All providers exhausted ──────────────────────────────────────────────────

describe('ResilienceService AllProvidersExhaustedError when no fallback succeeds', () => {
  it('throws AllProvidersExhaustedError with attempted lists', async () => {
    const routingService = createMockRoutingService({
      selectModel: () => Promise.resolve(null),
      spillover: () => Promise.resolve(null)
    });

    const svc = createResilienceService(
      {
        routingService,
        executor: () => Promise.reject(new Error('provider down'))
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req = makeRequest('frontier', { cacheKey: 'no-cache' });

    await expect(svc.resilientCall(req)).rejects.toThrow(AllProvidersExhaustedError);

    try {
      await svc.resilientCall(req);
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersExhaustedError);
      const exErr = err as AllProvidersExhaustedError;
      expect(exErr.attemptedProviders.length).toBeGreaterThan(0);
      expect(exErr.attemptedTiers).toContain('frontier');
    }
  });

  it('includes lastError', async () => {
    const routingService = createMockRoutingService();

    const svc = createResilienceService(
      {
        routingService,
        executor: () => Promise.reject(new Error('last failure reason'))
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req = makeRequest('frontier');

    try {
      await svc.resilientCall(req);
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersExhaustedError);
      const e = err as AllProvidersExhaustedError;
      expect(String(e.lastError)).toMatch(/last failure/i);
    }
  });
});

// ── Integration: resilient call succeeds via fallback ────────────────────────

describe('ResilienceService integration: resilientCall with failing primary succeeds via fallback', () => {
  it('integration: primary fails, fallback succeeds', async () => {
    const midRouting = makeRouting('mid', 'provider-mid');
    const routingService = createMockRoutingService({
      selectModel: req => {
        if (req.tier === 'mid') {
          return Promise.resolve(midRouting);
        }
        return Promise.resolve(null);
      },
      spillover: () => Promise.resolve(null)
    });

    let primaryAttempted = false;
    let fallbackAttempted = false;

    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          if (req.routing.tier === 'frontier') {
            primaryAttempted = true;
            return Promise.reject(new Error('frontier provider timeout'));
          }
          if (req.routing.tier === 'mid') {
            fallbackAttempted = true;
            return Promise.resolve({
              providerId: req.routing.providerId,
              modelId: req.routing.modelId,
              tier: String(req.routing.tier),
              content: 'response from mid-tier fallback',
              routing: req.routing
            });
          }
          return Promise.reject(new Error('unexpected tier'));
        }
      },
      { circuitBreaker: { failureThreshold: 5 } }
    );
    await svc.start();

    const req = makeRequest('frontier', { payload: { prompt: 'hello world' } });
    const result = await svc.resilientCall(req);

    expect(primaryAttempted).toBe(true);
    expect(fallbackAttempted).toBe(true);
    expect(result.content).toBe('response from mid-tier fallback');
    expect(result.tier).toBe('mid');
  });

  it('integration: spillover chain + tier degradation', async () => {
    const spillRouting = makeRouting('frontier', 'provider-frontier-2');
    const smallRouting = makeRouting('small', 'provider-small');

    const routingService = createMockRoutingService({
      selectModel: req => {
        if (req.tier === 'small') {
          return Promise.resolve(smallRouting);
        }
        return Promise.resolve(null);
      },
      spillover: decision => {
        if (decision.providerId === 'provider-frontier') {
          return Promise.resolve(spillRouting);
        }
        return Promise.resolve(null);
      }
    });

    const attemptOrder: string[] = [];
    const svc = createResilienceService(
      {
        routingService,
        executor: req => {
          attemptOrder.push(`${String(req.routing.tier)}:${req.routing.providerId}`);
          if (req.routing.providerId === 'provider-frontier') {
            return Promise.reject(new Error('p1 fails'));
          }
          if (req.routing.providerId === 'provider-frontier-2') {
            return Promise.reject(new Error('p1 spillover fails'));
          }
          return Promise.resolve({
            tier: String(req.routing.tier),
            providerId: req.routing.providerId,
            content: 'small ok'
          });
        }
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req = makeRequest('frontier', { routing: makeRouting('frontier', 'provider-frontier') });
    const result = await svc.resilientCall(req);

    expect(result.content).toBe('small ok');
    expect(attemptOrder).toEqual([
      'frontier:provider-frontier',
      'frontier:provider-frontier-2',
      'small:provider-small'
    ]);
  });

  it('integration: cache fallback after spillover and tier fail', async () => {
    const routingService = createMockRoutingService({
      selectModel: () => Promise.resolve(null),
      spillover: () => Promise.resolve(null)
    });

    const cached: ModelCallResult = { content: 'stale cached but better than nothing' };
    const cache = { get: vi.fn().mockResolvedValue(cached) };

    const svc = createResilienceService(
      {
        routingService,
        cache,
        executor: () => Promise.reject(new Error('all down'))
      },
      { circuitBreaker: { failureThreshold: 10 } }
    );
    await svc.start();

    const req: ModelCallRequest = {
      routing: makeRouting('frontier', 'provider-frontier'),
      cacheKey: 'abc-123'
    };

    const result = await svc.resilientCall(req);
    expect(result.fromCache).toBe(true);
    expect(result.content).toBe('stale cached but better than nothing');
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

describe('ResilienceService lifecycle', () => {
  it('starts in stopped and transitions to running', async () => {
    const svc = createResilienceService({ routingService: createMockRoutingService() });
    expect(svc.state).toBe('stopped');
    await svc.start();
    expect(svc.state).toBe('running');
  });

  it('sleep and wakeup transitions', async () => {
    const svc = createResilienceService({ routingService: createMockRoutingService() });
    await svc.start();
    await svc.sleep();
    expect(svc.state).toBe('sleeping');
    await svc.wakeup();
    expect(svc.state).toBe('running');
  });

  it('stop transitions to stopped', async () => {
    const svc = createResilienceService({ routingService: createMockRoutingService() });
    await svc.start();
    await svc.stop();
    expect(svc.state).toBe('stopped');
  });
});
