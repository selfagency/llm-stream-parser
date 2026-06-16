/**
 * Shared noop `LoadBalancedClient` implementation used by both
 * `client.ts` and `registry/index.ts` when no providers are configured.
 *
 * Keeping a single copy prevents interface drift when new methods are
 * added to `LoadBalancedClient`.
 */

import type { CompletionRequest, CompletionResponse, NormalizedChunk } from '@agentsy/shared';

import { DefaultTierAwareModelSelector } from './selector.js';
import { ModelSwitcher } from './switcher.js';
import type { LoadBalancedClient, ProviderUsageSnapshot, RoutingState, StrategyName } from './types.js';

const ROUTING_STATE: RoutingState = {
  providerCount: 0,
  providerId: 'unconfigured',
  providerStatus: 'unknown',
  strategy: 'adaptive'
};

const EMPTY_SNAPSHOT = {
  circuitTrips: 0,
  failureCount: 0,
  failoverCount: 0,
  latency: { p50: undefined, p95: undefined, p99: undefined, samples: 0 },
  perProvider: [],
  requestCount: 0,
  streamCount: 0,
  streamFailureCount: 0,
  streamSuccessCount: 0,
  successCount: 0,
  totalCostUsd: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalStreamChunks: 0,
  totalStreamDurationMs: 0,
  totalStreamTtfbMs: 0,
  totalTokens: 0
};

export function buildNoopClient(): LoadBalancedClient {
  return {
    complete(_request: CompletionRequest): Promise<CompletionResponse> {
      return Promise.resolve({
        content: '',
        model: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      });
    },
    stream(_request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
      return Promise.resolve(
        new ReadableStream<NormalizedChunk>({
          start(controller) {
            controller.close();
          }
        })
      );
    },
    createModelSwitcher(): ModelSwitcher {
      return new ModelSwitcher({ providers: [], setActiveModel: () => undefined });
    },
    getModelSelector() {
      return new DefaultTierAwareModelSelector();
    },
    getRoutingState(): RoutingState {
      return ROUTING_STATE;
    },
    getUsageSnapshot(): ProviderUsageSnapshot[] {
      return [];
    },
    markProviderHealthy(_providerId: string): void {
      /* noop */
    },
    markProviderUnhealthy(_providerId: string): void {
      /* noop */
    },
    setStrategy(_name: StrategyName, _options?: import('./strategies/strategies.js').StrategyOptions): void {
      /* noop */
    },
    getMetricsSnapshot() {
      return EMPTY_SNAPSHOT;
    },
    getMetricsProviderAggregate(_providerId: string) {
      return;
    },
    shutdown(): Promise<void> {
      return Promise.resolve();
    }
  };
}
