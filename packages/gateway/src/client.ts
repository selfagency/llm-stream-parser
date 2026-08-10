import type { CompletionRequest, CompletionResponse, NormalizedChunk } from '@agentsy/shared';
import { ProviderHealthRegistry } from './health/provider-health-registry.js';
import { buildNoopClient } from './noop-client.js';
import { MetricsCollector } from './observability/metrics-collector.js';
import { instrumentStream } from './observability/stream-tracker.js';
import { type QuotaTracker, QuotaTrackerRegistry } from './quota/tracker.js';
import { createProviderRegistry } from './registry/index.js';
import { buildStrategy, retryWithFailover } from './retry.js';
import { DefaultTierAwareModelSelector } from './selector.js';
import type { StrategyOptions } from './strategies/strategies.js';
import { ModelSwitcher } from './switcher.js';
import type { LoadBalancedClient, LoadBalancerConfig, ProviderEntry, RoutingState } from './types.js';

function buildRoutingState(
  config: LoadBalancerConfig,
  health: ProviderHealthRegistry,
  activeStrategy: import('./types.js').StrategyName
): RoutingState {
  const primary = config.providers[0];
  if (primary === undefined) {
    return {
      providerCount: 0,
      providerId: 'unconfigured',
      providerStatus: 'unknown',
      strategy: activeStrategy
    };
  }
  const status = health.getStatus(primary.id);
  return {
    providerCount: config.providers.length,
    providerId: primary.id,
    providerStatus: status.status,
    strategy: activeStrategy
  };
}

/**
 * Build the load-balanced client. The gateway:
 * - holds a per-provider `UniversalClient` in `ProviderRegistry`,
 * - tracks health via `ProviderHealthRegistry` (circuit-breaker per provider),
 * - tracks rate-limit budget via `QuotaTracker` (one tracker per provider),
 * - uses the configured `StrategyName` to pick the next provider,
 * - retries each provider up to `retry.maxAttempts` times before
 *   failing over; surfaces `AllProvidersExhaustedError` if every
 *   provider has been tried.
 */
export function createLoadBalancedClient(
  config: LoadBalancerConfig,
  options: {
    /**
     * Optional override for the per-provider client factory. The
     * default wires each provider through
     * `createProviderRegistry(config)`, which constructs a real
     * `UniversalClient` for each entry. Tests inject a mock factory
     * to drive the gateway without hitting the network.
     */
    clientFactory?: (entry: ProviderEntry) => import('@agentsy/providers').UniversalClient;
    strategyOptions?: StrategyOptions;
  } = {}
): LoadBalancedClient {
  if (config.providers.length === 0) {
    return buildNoopClient();
  }

  const registry = createProviderRegistry(config, options.clientFactory);
  const metrics = new MetricsCollector();
  const health = new ProviderHealthRegistry({
    ...(config.circuitBreaker === undefined ? {} : { breaker: config.circuitBreaker }),
    onCircuitTripped: providerId => {
      metrics.recordCircuitTrip(providerId);
    }
  });
  const quota = new QuotaTrackerRegistry();
  // Strategy is a `let` so the `setStrategy()` method on the
  // returned client can swap it mid-session (e.g. via a CLI slash
  // command). The default is the configured strategy or
  // `'adaptive'`.
  let activeStrategyName: import('./types.js').StrategyName = config.strategy ?? 'adaptive';
  let strategy = buildStrategy(activeStrategyName, options.strategyOptions ?? {});
  const inFlight = new Map<string, number>();
  const maxAttempts = config.retry?.attempts ?? 2;
  // Mutable model pointer: ModelSwitcher rewrites this without
  // rebuilding the provider tree, so `config.model` (frozen) is
  // not the source of truth. Defaults to the config value.
  let currentModel: string = config.model ?? config.providers[0]?.model ?? '';

  function providersForRequest(request: CompletionRequest): ProviderEntry[] {
    const model = request.model ?? currentModel;
    if (model.length === 0) {
      return config.providers;
    }
    // Override the model on every provider so failover targets
    // also use the switched model, not their original one.
    return config.providers.map(p => ({ ...p, model }));
  }

  function executeWithRetry<R>(
    request: CompletionRequest,
    callClient: (client: import('@agentsy/providers').UniversalClient) => Promise<R>,
    lastTried: { current: ProviderEntry | undefined }
  ): Promise<R> {
    return retryWithFailover(
      {
        health,
        inFlight,
        providers: providersForRequest(request),
        quota: pickTracker(quota, providersForRequest(request)[0]?.id ?? ''),
        request: { model: request.model },
        strategy
      },
      entry => {
        if (lastTried.current !== undefined && lastTried.current.id !== entry.id) {
          metrics.recordFailover(entry.id);
        }
        lastTried.current = entry;
        const client = registry.get(entry.id)?.client;
        if (client === undefined) {
          return Promise.reject(new Error(`No client registered for provider ${entry.id}`));
        }
        return callClient(client);
      },
      { maxAttemptsPerProvider: maxAttempts }
    );
  }

  function complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startedAt = Date.now();
    const lastTried: { current: ProviderEntry | undefined } = { current: undefined };
    return executeWithRetry(request, client => client.complete(request), lastTried).then(
      (response): CompletionResponse => {
        const providerId = lastTried.current?.id ?? '<unconfigured>';
        const modelId = lastTried.current?.model ?? currentModel;
        const metric: import('./observability/metrics-collector.js').RequestMetric = {
          latencyMs: Date.now() - startedAt,
          modelId,
          providerId,
          success: true
        };
        if (response.usage !== undefined) {
          const input = response.usage.inputTokens ?? 0;
          const output = response.usage.outputTokens ?? 0;
          metric.tokens = {
            inputTokens: input,
            outputTokens: output,
            totalTokens: response.usage.totalTokens ?? input + output
          };
        }
        metrics.recordRequest(metric);
        return response;
      },
      (error: unknown): never => {
        const providerId = lastTried.current?.id ?? '<unconfigured>';
        const modelId = lastTried.current?.model ?? currentModel;
        metrics.recordRequest({
          latencyMs: Date.now() - startedAt,
          modelId,
          providerId,
          success: false
        });
        throw error;
      }
    );
  }

  function stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
    const startedAt = Date.now();
    const lastTried: { current: ProviderEntry | undefined } = { current: undefined };
    return executeWithRetry(request, client => client.stream(request), lastTried).then(source => {
      const providerId = lastTried.current?.id ?? '<unconfigured>';
      const modelId = lastTried.current?.model ?? currentModel;
      const { stream: wrapped, closed } = instrumentStream(source);
      closed
        .then(summary => {
          metrics.recordStreamComplete({
            chunkCount: summary.chunkCount,
            durationMs: summary.durationMs,
            modelId,
            providerId,
            success: true,
            ttfbMs: summary.ttfbMs
          });
        })
        .catch(() => {
          metrics.recordStreamComplete({
            chunkCount: 0,
            durationMs: Date.now() - startedAt,
            modelId,
            providerId,
            success: false,
            ttfbMs: 0
          });
        });
      return wrapped;
    });
  }

  return {
    complete,
    stream,
    createModelSwitcher(): ModelSwitcher {
      return new ModelSwitcher({
        providers: config.providers,
        setActiveModel(upstreamModel: string, _provider: ProviderEntry): void {
          currentModel = upstreamModel;
        }
      });
    },
    getRoutingState(): RoutingState {
      return buildRoutingState(config, health, activeStrategyName);
    },
    getModelSelector() {
      return new DefaultTierAwareModelSelector();
    },
    getUsageSnapshot() {
      return registry.list().map((entry): import('./types.js').ProviderUsageSnapshot => {
        const healthEntry = health.getStatus(entry.providerId);
        const quotaSnapshot = quota.for(entry.providerId).getUsageSnapshot();
        const snapshot: import('./types.js').ProviderUsageSnapshot = {
          providerId: entry.providerId
        };
        if (healthEntry.averageLatencyMs !== undefined) {
          snapshot.averageLatencyMs = healthEntry.averageLatencyMs;
        }
        snapshot.errorRate = healthEntry.requestCount === 0 ? 0 : 1 - healthEntry.uptimeRatio;
        if (quotaSnapshot.rpmLimit > 0) {
          snapshot.rpmRemaining = quotaSnapshot.rpmRemaining;
        }
        if (quotaSnapshot.tpmLimit > 0) {
          snapshot.tpmRemaining = quotaSnapshot.tpmRemaining;
        }
        return snapshot;
      });
    },
    markProviderHealthy(providerId: string): void {
      health.resetCircuit(providerId);
    },
    markProviderUnhealthy(providerId: string): void {
      for (let i = 0; i < 5; i++) {
        health.recordFailure(providerId, 'manually marked unhealthy');
      }
    },
    setStrategy(name, options) {
      activeStrategyName = name;
      strategy = buildStrategy(name, options ?? {});
    },
    getMetricsSnapshot() {
      return metrics.getUsageSnapshot();
    },
    getMetricsProviderAggregate(providerId: string) {
      return metrics.getProviderAggregate(providerId);
    },
    shutdown(): Promise<void> {
      return Promise.resolve();
    }
  };
}

function pickTracker(quota: QuotaTrackerRegistry, providerId: string): QuotaTracker {
  if (providerId.length === 0) {
    return quota.for('__unconfigured__');
  }
  return quota.for(providerId);
}
