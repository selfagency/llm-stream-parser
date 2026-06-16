import { describe, expect, it } from 'vitest';

import { AllProvidersExhaustedError } from './errors.js';
import { ProviderHealthRegistry } from './health/provider-health-registry.js';
import { QuotaTrackerRegistry } from './quota/tracker.js';
import { retryWithFailover } from './retry.js';
import { createStrategy } from './strategies/strategies.js';
import type { ProviderEntry } from './types.js';

const ENTRIES: ProviderEntry[] = [
  { id: 'a', name: 'A', provider: 'openai' },
  { id: 'b', name: 'B', provider: 'anthropic' }
];

function context(
  overrides: Partial<Parameters<typeof retryWithFailover>[0]> = {}
): Parameters<typeof retryWithFailover>[0] {
  const health = overrides.health ?? new ProviderHealthRegistry();
  const quotaRegistry = new QuotaTrackerRegistry();
  return {
    health,
    inFlight: new Map(),
    providers: ENTRIES,
    quota: quotaRegistry.for('a'),
    request: { model: 'gpt-4o' },
    strategy: createStrategy('round-robin'),
    ...overrides
  };
}

describe('retryWithFailover', () => {
  it('returns the result of the first successful provider', async () => {
    const ctx = context();
    const result = await retryWithFailover(ctx, entry => {
      if (entry.id === 'a') {
        return Promise.resolve('from-a');
      }
      return Promise.resolve('from-b');
    });
    expect(result).toBe('from-a');
  });

  it('records success on the chosen provider', async () => {
    const health = new ProviderHealthRegistry();
    const ctx = context({ health });
    await retryWithFailover(ctx, async entry => `${entry.id}-ok`);
    expect(health.getStatus('a').successCount).toBeGreaterThanOrEqual(1);
    expect(health.getStatus('b').successCount).toBe(0);
  });

  it('fails over to the next provider on error and surfaces the result', async () => {
    const health = new ProviderHealthRegistry();
    const ctx = context({ health });
    const result = await retryWithFailover(
      ctx,
      entry => {
        if (entry.id === 'a') {
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve(`${entry.id}-ok`);
      },
      { maxAttemptsPerProvider: 1 }
    );
    expect(result).toBe('b-ok');
    expect(health.getStatus('a').errorCount).toBe(1);
    expect(health.getStatus('b').successCount).toBe(1);
  });

  it('throws AllProvidersExhaustedError when every provider fails', async () => {
    const ctx = context();
    await expect(
      retryWithFailover(ctx, () => Promise.reject(new Error('always fails')), { maxAttemptsPerProvider: 1 })
    ).rejects.toBeInstanceOf(AllProvidersExhaustedError);
  });

  it('retries within a single provider before failing over', async () => {
    const health = new ProviderHealthRegistry();
    const ctx = context({ health });
    let calls = 0;
    await retryWithFailover(
      ctx,
      entry => {
        if (entry.id === 'a') {
          calls += 1;
          return Promise.reject(new Error('flaky'));
        }
        return Promise.resolve('b-ok');
      },
      { maxAttemptsPerProvider: 3 }
    );
    expect(calls).toBe(3);
  });

  it('records final failure on the last provider when retries exhaust', async () => {
    const health = new ProviderHealthRegistry();
    const ctx = context({ health });
    await expect(
      retryWithFailover(ctx, () => Promise.reject(new Error('always')), { maxAttemptsPerProvider: 1 })
    ).rejects.toBeInstanceOf(AllProvidersExhaustedError);
    expect(health.getStatus('a').errorCount).toBe(1);
    expect(health.getStatus('b').errorCount).toBe(1);
  });

  it('runs onResponse hook with the provider id and result', async () => {
    const ctx = context();
    const seen: [string, unknown][] = [];
    await retryWithFailover(ctx, async entry => `result-${entry.id}`, {
      onResponse: (providerId, result) => {
        seen.push([providerId, result]);
      }
    });
    expect(seen).toEqual([['a', 'result-a']]);
  });

  describe('classifyReason', () => {
    const singleProvider: ProviderEntry[] = [{ id: 'a', name: 'A', provider: 'openai' }];

    it('should classify rate-limit errors by status code 429', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });
      const err = new Error('Too Many Requests');
      (err as { status?: number }).status = 429;

      await expect(
        retryWithFailover(ctx, () => Promise.reject(err), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'rate-limited' }]
      });
    });

    it('should classify rate-limit errors by message pattern', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });

      await expect(
        retryWithFailover(ctx, () => Promise.reject(new Error('rate limit exceeded')), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'rate-limited' }]
      });
    });

    it('should not match "rate" substring in non-rate errors', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });

      await expect(
        retryWithFailover(ctx, () => Promise.reject(new Error('iterate at a fast rate')), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'error' }]
      });
    });

    it('should classify timeout errors', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });

      await expect(
        retryWithFailover(ctx, () => Promise.reject(new Error('Request timed out')), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'timeout' }]
      });
    });

    it('should classify connection errors', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });

      await expect(
        retryWithFailover(ctx, () => Promise.reject(new Error('connection refused')), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'connection_error' }]
      });
    });

    it('should classify service_unavailable by status 503', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });
      const err = new Error('Service Unavailable');
      (err as { status?: number }).status = 503;

      await expect(
        retryWithFailover(ctx, () => Promise.reject(err), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'service_unavailable' }]
      });
    });

    it('should classify server_error by status 500', async () => {
      const health = new ProviderHealthRegistry();
      const ctx = context({ health, providers: singleProvider });
      const err = new Error('Internal Server Error');
      (err as { status?: number }).status = 500;

      await expect(
        retryWithFailover(ctx, () => Promise.reject(err), { maxAttemptsPerProvider: 1 })
      ).rejects.toMatchObject({
        failures: [{ providerId: 'a', reason: 'server_error' }]
      });
    });
  });
});
