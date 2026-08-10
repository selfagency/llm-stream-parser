/**
 * E2E integration tests for the gateway's full transport path.
 *
 * These tests use MSW to intercept real HTTP calls made by `UniversalClient`
 * — not stubs or `clientFactory` overrides. Every `complete()` call goes
 * through `fetch()` → MSW → mock response, exercising the real provider
 * transport, response parsing, retry/failover loop, circuit breaker, and
 * metrics instrumentation.
 *
 * Unlike the metrics-instrumentation tests (which swap the client factory
 * for a stub), these tests run the real code path end-to-end.
 */

import type { NormalizedChunk } from '@agentsy/shared';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createLoadBalancedClient } from '../../client.js';
import { AllProvidersExhaustedError } from '../../errors.js';

// ---------------------------------------------------------------------------
// Mock provider endpoints (arbitrary URLs intercepted by MSW)
// ---------------------------------------------------------------------------

const A_ENDPOINT = 'http://localhost/e2e/gw/provider-a';
const B_ENDPOINT = 'http://localhost/e2e/gw/provider-b';

// ---------------------------------------------------------------------------
// MSW server — shared across all tests in this file
// ---------------------------------------------------------------------------

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * OpenAI-compatible success body. The `UniversalClient` parses
 * `choices[0].message.content` regardless of the `provider` field
 * when `toOpenAIFormat` was used to build the request.
 */
function successBody(content: string) {
  return {
    choices: [
      {
        finish_reason: 'stop' as const,
        index: 0,
        message: { content, role: 'assistant' as const }
      }
    ],
    created: Math.floor(Date.now() / 1000),
    id: 'chatcmpl-e2e',
    model: 'mock-model',
    object: 'chat.completion',
    usage: { completion_tokens: content.length, prompt_tokens: 10, total_tokens: 10 + content.length }
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: 429 rate-limit → graceful failover
// ---------------------------------------------------------------------------

describe('E2E: 429 rate-limit failover', () => {
  const hits: { url: string; status: number }[] = [];

  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => {
        hits.push({ url: A_ENDPOINT, status: 429 });
        return new HttpResponse(null, { status: 429 });
      }),
      http.post(B_ENDPOINT, () => {
        hits.push({ url: B_ENDPOINT, status: 200 });
        return HttpResponse.json(successBody('from-b'), { status: 200 });
      })
    );
  });

  it('fails over when the first provider returns 429', async () => {
    const client = createLoadBalancedClient({
      providers: [
        { id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT },
        { id: 'provider-b', name: 'Provider B', provider: 'openai', baseUrl: B_ENDPOINT }
      ],
      retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
      strategy: 'priority-fallback'
    });

    const response = await client.complete({ model: 'test-model', messages: [{ role: 'user', content: 'hi' }] });
    expect(response.content).toBe('from-b');
    // First hit: provider-a got 429
    expect(hits[0]?.url).toBe(A_ENDPOINT);
    expect(hits[0]?.status).toBe(429);
    // Second hit: provider-b served the request
    expect(hits[1]?.url).toBe(B_ENDPOINT);
    expect(hits[1]?.status).toBe(200);
    // Metrics reflect the failover
    const snap = client.getMetricsSnapshot();
    expect(snap.failoverCount).toBe(1);
    expect(snap.requestCount).toBe(1);
    expect(snap.successCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: All providers exhausted
// ---------------------------------------------------------------------------

describe('E2E: all providers exhausted', () => {
  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => new HttpResponse(null, { status: 429 })),
      http.post(B_ENDPOINT, () => new HttpResponse(null, { status: 429 }))
    );
  });

  it('throws AllProvidersExhaustedError when every provider returns 429', async () => {
    const client = createLoadBalancedClient({
      providers: [
        { id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT },
        { id: 'provider-b', name: 'Provider B', provider: 'openai', baseUrl: B_ENDPOINT }
      ],
      retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
      strategy: 'priority-fallback'
    });

    await expect(client.complete({ model: 'test-model', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      AllProvidersExhaustedError
    );
    // Failure recorded in metrics
    const snap = client.getMetricsSnapshot();
    expect(snap.requestCount).toBe(1);
    expect(snap.failureCount).toBe(1);
    expect(snap.successCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Circuit breaker opens and prevents further HTTP calls
// ---------------------------------------------------------------------------

describe('E2E: circuit breaker', () => {
  let callCount = 0;

  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => {
        callCount++;
        return new HttpResponse(null, { status: 500 });
      })
    );
  });

  it('opens after the configured failure threshold, then skips HTTP calls', async () => {
    const client = createLoadBalancedClient({
      circuitBreaker: { failureThreshold: 3, resetAfterMs: 60_000 },
      providers: [{ id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT }],
      retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
      strategy: 'priority-fallback'
    });

    // Drive three failures to open the circuit
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    const callsBefore = callCount;

    // Next call — circuit is OPEN, so the strategy should
    // pre-filter this provider and skip the HTTP call entirely.
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    expect(callCount).toBe(callsBefore);

    // Metrics reflect the circuit trip
    const snap = client.getMetricsSnapshot();
    expect(snap.circuitTrips).toBe(1);
    expect(snap.failureCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Mid-session strategy change
// ---------------------------------------------------------------------------

describe('E2E: mid-session strategy change', () => {
  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => HttpResponse.json(successBody('from-a'), { status: 200 })),
      http.post(B_ENDPOINT, () => HttpResponse.json(successBody('from-b'), { status: 200 }))
    );
  });

  it('switches strategy at runtime and subsequent calls use the new config', async () => {
    const client = createLoadBalancedClient({
      providers: [
        { id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT },
        { id: 'provider-b', name: 'Provider B', provider: 'openai', baseUrl: B_ENDPOINT }
      ],
      retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
      strategy: 'priority-fallback'
    });

    // Verify initial state
    expect(client.getRoutingState().strategy).toBe('priority-fallback');

    // Switch strategy
    client.setStrategy('round-robin');
    expect(client.getRoutingState().strategy).toBe('round-robin');

    // Calls should still work after the switch
    const response = await client.complete({ model: 'test-model', messages: [{ role: 'user', content: 'go' }] });
    expect(response.content.length).toBeGreaterThan(0);
    expect(client.getMetricsSnapshot().requestCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Cost-based selection
// ---------------------------------------------------------------------------

describe('E2E: cost-based selection', () => {
  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => HttpResponse.json(successBody('cheap'), { status: 200 })),
      http.post(B_ENDPOINT, () => HttpResponse.json(successBody('expensive'), { status: 200 }))
    );
  });

  it('selects the cheapest eligible provider', async () => {
    const client = createLoadBalancedClient(
      {
        providers: [
          { id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT },
          { id: 'provider-b', name: 'Provider B', provider: 'openai', baseUrl: B_ENDPOINT }
        ],
        retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
        strategy: 'cost-based'
      },
      {
        strategyOptions: { costs: { 'provider-a': 0.5, 'provider-b': 5 } }
      }
    );

    const response = await client.complete({
      model: 'test-model',
      messages: [{ role: 'user', content: 'pick cheap' }]
    });
    // Cheapest provider (provider-a) should be selected
    expect(response.content).toBe('cheap');

    const snap = client.getMetricsSnapshot();
    expect(snap.requestCount).toBe(1);
    expect(snap.successCount).toBe(1);
    // Only one provider was hit (no failover)
    expect(snap.failoverCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Multiple providers fail, circuit breaker, then reset
// ---------------------------------------------------------------------------

describe('E2E: circuit reset restores traffic', () => {
  let aCalls = 0;

  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => {
        aCalls++;
        // First 3 calls fail (circuit opens at threshold 3). After
        // reset the 4th call succeeds.
        return aCalls > 3
          ? HttpResponse.json(successBody('restored'), { status: 200 })
          : new HttpResponse(null, { status: 502 });
      }),
      http.post(B_ENDPOINT, () => HttpResponse.json(successBody('fallback-ok'), { status: 200 }))
    );
  });

  it('fails over to a healthy provider while the primary is down, then recovers after reset', async () => {
    const client = createLoadBalancedClient({
      circuitBreaker: { failureThreshold: 3, resetAfterMs: 60_000 },
      providers: [
        { id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT },
        { id: 'provider-b', name: 'Provider B', provider: 'openai', baseUrl: B_ENDPOINT }
      ],
      retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
      strategy: 'priority-fallback'
    });

    // First three calls: provider-a fails, provider-b serves the fallback
    for (let i = 0; i < 3; i++) {
      const resp = await client.complete({ model: 'test-model', messages: [] });
      expect(resp.content).toBe('fallback-ok');
    }

    // Circuit is now open on provider-a. provider-b still works.
    const respB = await client.complete({ model: 'test-model', messages: [] });
    expect(respB.content).toBe('fallback-ok');

    // Reset the circuit on provider-a — it should now serve again
    client.markProviderHealthy('provider-a');

    // provider-a should now succeed
    const respA = await client.complete({ model: 'test-model', messages: [] });
    expect(respA.content).toBe('restored');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Stream E2E with real SSE response
// ---------------------------------------------------------------------------

describe('E2E: stream with real SSE transport', () => {
  beforeAll(() => {
    server.use(
      http.post(A_ENDPOINT, () => {
        // OpenAI SSE streaming response — matches the format used by
        // the existing pipeline test (mockOpenAIStream).
        const sseLines = [
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
          'data: [DONE]\n\n'
        ];
        return new HttpResponse(sseLines.join(''), {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200
        });
      })
    );
  });

  it('returns chunked content from a real SSE response', async () => {
    const client = createLoadBalancedClient({
      providers: [{ id: 'provider-a', name: 'Provider A', provider: 'openai', baseUrl: A_ENDPOINT }],
      retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
      strategy: 'priority-fallback'
    });

    const stream = await client.stream({ model: 'test-model', messages: [{ role: 'user', content: 'hi' }] });
    const chunks: NormalizedChunk[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        chunks.push(value);
      }
    }

    expect(chunks.length).toBe(3);
    expect(chunks[0]?.content).toBe('Hello');
    expect(chunks[1]?.content).toBe(' ');
    expect(chunks[2]?.content).toBe('world');

    // Metrics reflect the stream
    await new Promise(resolve => setTimeout(resolve, 0));
    const snap = client.getMetricsSnapshot();
    expect(snap.streamCount).toBe(1);
    expect(snap.streamSuccessCount).toBe(1);
    expect(snap.totalStreamChunks).toBe(3);
  });
});
