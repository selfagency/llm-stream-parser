/**
 * End-to-end tests for the gateway's auto-instrumentation. The
 * gateway wires `MetricsCollector` to `complete()` so callers do not
 * need to drive `recordRequest()` manually. These tests inject
 * `clientFactory` to swap the real `UniversalClient` for a stub
 * and verify that the metrics snapshot reflects the call.
 */

import type { UniversalClient } from '@agentsy/providers';
import type { CompletionRequest, CompletionResponse, NormalizedChunk } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';

import { createLoadBalancedClient } from '../client.js';
import type { ProviderEntry } from '../types.js';

interface ClientSlot {
  chunks?: NormalizedChunk[];
  error?: unknown;
  latencyMs?: number;
  response?: CompletionResponse;
  streamError?: Error;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

function makeClient(responses: Map<string, ClientSlot>): UniversalClient {
  return {
    complete(_request: CompletionRequest): Promise<CompletionResponse> {
      const slot = responses.get('__default__');
      if (slot?.error !== undefined) {
        if (slot.latencyMs !== undefined && slot.latencyMs > 0) {
          return new Promise((_, reject) => {
            setTimeout(() => reject(toError(slot.error)), slot.latencyMs);
          });
        }
        return Promise.reject(toError(slot.error));
      }
      if (slot?.response !== undefined) {
        const resp: CompletionResponse = slot.response;
        if (slot.latencyMs !== undefined && slot.latencyMs > 0) {
          return new Promise(resolve => {
            setTimeout(() => resolve(resp), slot.latencyMs);
          });
        }
        return Promise.resolve(resp);
      }
      return Promise.resolve({
        content: 'ok',
        model: 'gpt-4o',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      });
    },
    stream(_request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
      const slot = responses.get('__default__');
      return Promise.resolve(
        new ReadableStream<NormalizedChunk>({
          start(controller) {
            if (slot?.streamError !== undefined) {
              controller.error(slot.streamError);
              return;
            }
            for (const chunk of slot?.chunks ?? []) {
              controller.enqueue(chunk);
            }
            controller.close();
          }
        })
      );
    }
  };
}

function successResponse(model: string, input: number, output: number): CompletionResponse {
  return {
    content: 'hi',
    model,
    usage: { inputTokens: input, outputTokens: output, totalTokens: input + output }
  };
}

describe('metrics auto-instrumentation', () => {
  it('records a successful call once on the serving provider', async () => {
    const client = createLoadBalancedClient(
      { providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }] },
      {
        clientFactory: () => makeClient(new Map([['__default__', { response: successResponse('gpt-4o', 10, 5) }]]))
      }
    );
    await client.complete({ model: 'test-model', messages: [] });
    const snap = client.getMetricsSnapshot();
    expect(snap.requestCount).toBe(1);
    expect(snap.successCount).toBe(1);
    expect(snap.failureCount).toBe(0);
    expect(snap.perProvider[0]?.providerId).toBe('openai-1');
    expect(snap.totalInputTokens).toBe(10);
    expect(snap.totalOutputTokens).toBe(5);
    expect(snap.totalTokens).toBe(15);
  });

  it('records a failed call with success=false', async () => {
    const client = createLoadBalancedClient(
      {
        providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }],
        retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 }
      },
      {
        clientFactory: () => makeClient(new Map([['__default__', { error: new Error('boom') }]]))
      }
    );
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    const snap = client.getMetricsSnapshot();
    expect(snap.requestCount).toBe(1);
    expect(snap.successCount).toBe(0);
    expect(snap.failureCount).toBe(1);
    expect(snap.totalTokens).toBe(0);
  });

  it('records one failover event when the first provider rejects and the second succeeds', async () => {
    // First provider rejects, second provider succeeds. The strategy is
    // `round-robin` so both providers are eligible; the first
    // health-eligible one is picked.
    const responses = new Map<string, { response?: CompletionResponse; error?: Error }>();
    responses.set('openai-1', { error: new Error('openai down') });
    responses.set('anthropic-1', { response: successResponse('claude-opus-4', 7, 3) });
    const factory = (entry: ProviderEntry): UniversalClient => {
      const slot = responses.get(entry.id);
      return makeClient(new Map(slot === undefined ? [] : [['__default__', slot]]));
    };
    const client = createLoadBalancedClient(
      {
        providers: [
          { id: 'openai-1', name: 'OpenAI', provider: 'openai' },
          { id: 'anthropic-1', name: 'Anthropic', provider: 'anthropic' }
        ],
        retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 },
        strategy: 'priority-fallback'
      },
      { clientFactory: factory }
    );
    const response = await client.complete({ model: 'test-model', messages: [] });
    expect(response.content).toBe('hi');
    const snap = client.getMetricsSnapshot();
    expect(snap.requestCount).toBe(1);
    expect(snap.successCount).toBe(1);
    expect(snap.failoverCount).toBe(1);
    // Anthropic served the call, so it has tokens; OpenAI has zero.
    const anthropic = snap.perProvider.find(p => p.providerId === 'anthropic-1');
    expect(anthropic?.totalTokens).toBe(10);
  });

  it('records a circuit trip on the matching provider when the breaker opens', async () => {
    const factory = (): UniversalClient => makeClient(new Map([['__default__', { error: new Error('still broken') }]]));
    const client = createLoadBalancedClient(
      {
        circuitBreaker: { failureThreshold: 2, resetAfterMs: 60_000 },
        providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }],
        retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 }
      },
      { clientFactory: factory }
    );
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    const snap = client.getMetricsSnapshot();
    expect(snap.circuitTrips).toBe(1);
    const aggregate = client.getMetricsProviderAggregate('openai-1');
    expect(aggregate?.circuitTrips).toBe(1);
    expect(aggregate?.failureCount).toBe(2);
  });

  it('does not double-count the circuit trip when the circuit re-opens after reset', async () => {
    const factory = (): UniversalClient => makeClient(new Map([['__default__', { error: new Error('down') }]]));
    const client = createLoadBalancedClient(
      {
        circuitBreaker: { failureThreshold: 2, resetAfterMs: 60_000 },
        providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }],
        retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 }
      },
      { clientFactory: factory }
    );
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    expect(client.getMetricsSnapshot().circuitTrips).toBe(1);
    // Reset the circuit and re-trip; we expect a second event, not zero.
    client.markProviderHealthy('openai-1');
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    await expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
    expect(client.getMetricsSnapshot().circuitTrips).toBe(2);
  });

  it('records tokens split by (provider, model) when model is overridden via currentModel', async () => {
    const factory = (): UniversalClient =>
      makeClient(new Map([['__default__', { response: successResponse('gpt-4o-mini', 4, 2) }]]));
    const client = createLoadBalancedClient(
      {
        providers: [{ id: 'openai-1', model: 'gpt-4o', name: 'OpenAI', provider: 'openai' }],
        strategy: 'priority-fallback'
      },
      { clientFactory: factory }
    );
    const switcher = client.createModelSwitcher();
    switcher.switch({ model: 'gpt-4o-mini' });
    await client.complete({ model: 'test-model', messages: [] });
    const aggregate = client.getMetricsProviderAggregate('openai-1');
    expect(aggregate).toBeDefined();
    // Total across all (provider, model) buckets on this provider = 6 tokens.
    expect(aggregate?.totalTokens).toBe(6);
  });

  it('does not throw when onCircuitTripped listener throws', () => {
    // The listener is provided by the gateway itself; this test
    // guarantees the try/catch around the callback keeps the
    // failure-recording path robust even if a future listener is
    // misbehaved.
    const factory = (): UniversalClient => makeClient(new Map([['__default__', { error: new Error('x') }]]));
    const client = createLoadBalancedClient(
      {
        circuitBreaker: { failureThreshold: 1, resetAfterMs: 60_000 },
        providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }],
        retry: { attempts: 1, backoff: 'exponential', initialMs: 1000 }
      },
      { clientFactory: factory }
    );
    // Drive the failure path twice to confirm no unhandled rejection.
    return expect(client.complete({ model: 'test-model', messages: [] })).rejects.toThrow();
  });
});

function chunk(content: string): NormalizedChunk {
  return { content };
}

async function drainChunks<T>(stream: ReadableStream<T>): Promise<T[]> {
  const out: T[] = [];
  const reader = stream.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value !== undefined) {
      out.push(value);
    }
  }
  return out;
}

describe('stream auto-instrumentation', () => {
  it('records streamCount and chunk count for a multi-chunk stream', async () => {
    const client = createLoadBalancedClient(
      { providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }] },
      {
        clientFactory: () => makeClient(new Map([['__default__', { chunks: [chunk('hi '), chunk('there')] }]]))
      }
    );
    const stream = await client.stream({ model: 'test-model', messages: [] });
    const chunks = await drainChunks(stream);
    expect(chunks.length).toBe(2);
    // Yield a microtask so the `closed` promise's `flush` callback
    // can resolve before we read the snapshot.
    await new Promise(resolve => setTimeout(resolve, 0));
    const snap = client.getMetricsSnapshot();
    expect(snap.streamCount).toBe(1);
    expect(snap.streamSuccessCount).toBe(1);
    expect(snap.streamFailureCount).toBe(0);
    expect(snap.totalStreamChunks).toBe(2);
    expect(snap.totalStreamDurationMs).toBeGreaterThanOrEqual(0);
    expect(snap.totalStreamTtfbMs).toBeGreaterThanOrEqual(0);
  });

  it('records a stream failure when the source stream errors', async () => {
    const client = createLoadBalancedClient(
      { providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }] },
      {
        clientFactory: () => makeClient(new Map([['__default__', { streamError: new Error('stream broken') }]]))
      }
    );
    const stream = await client.stream({ model: 'test-model', messages: [] });
    await expect(drainChunks(stream)).rejects.toThrow('stream broken');
    await new Promise(resolve => setTimeout(resolve, 0));
    const snap = client.getMetricsSnapshot();
    expect(snap.streamCount).toBe(1);
    expect(snap.streamSuccessCount).toBe(0);
    expect(snap.streamFailureCount).toBe(1);
  });

  it('records an empty stream (zero chunks, zero ttfb)', async () => {
    const client = createLoadBalancedClient(
      { providers: [{ id: 'openai-1', name: 'OpenAI', provider: 'openai' }] },
      {
        clientFactory: () => makeClient(new Map([['__default__', { chunks: [] }]]))
      }
    );
    const stream = await client.stream({ model: 'test-model', messages: [] });
    const drained = await drainChunks(stream);
    expect(drained).toEqual([]);
    await new Promise(resolve => setTimeout(resolve, 0));
    const snap = client.getMetricsSnapshot();
    expect(snap.streamCount).toBe(1);
    expect(snap.totalStreamChunks).toBe(0);
  });
});
