import { AllProvidersExhaustedError, type ProviderFailureDetail } from './errors.js';
import type { ProviderHealthRegistry } from './health/provider-health-registry.js';
import type { QuotaTracker, QuotaTrackerRegistry } from './quota/tracker.js';
import { createStrategy, type StrategyOptions } from './strategies/strategies.js';
import type { RoutingStrategy } from './strategies/strategy.js';
import type { ProviderEntry, StrategyName } from './types.js';

export interface RetryWithFailoverContext {
  /** Per-provider health registry. Read+write through `recordSuccess`/`recordFailure`. */
  health: ProviderHealthRegistry;
  /** Concurrency counters (per providerId). The wrapper updates these around each call. */
  inFlight: Map<string, number>;
  /** Providers to consider in this failover run. */
  providers: readonly ProviderEntry[];
  /** Per-provider quota tracker registry. Read for pre-flight; updated on response. */
  quota: QuotaTracker;
  /** Per-provider quota tracker registry (optional). When set, used for per-provider snapshots. */
  quotaRegistry?: QuotaTrackerRegistry;
  /** Current request, used by the strategy for capability matching. */
  request: { estimatedInputTokens?: number; model?: string };
  /** Routing strategy used to pick the order. */
  strategy: RoutingStrategy;
}

export interface RetryWithFailoverOptions {
  /** Maximum attempts per provider before giving up. Default 2. */
  maxAttemptsPerProvider?: number;
  /** Optional hook to mutate a response (e.g. ingest rate-limit headers). */
  onResponse?: (providerId: string, response: unknown) => void;
}

/**
 * Run `operation` against providers, failing over when one errors. The
 * strategy decides the *order*; the retry loop decides how many attempts
 * to make against each provider before moving on. Records health + quota
 * side-effects and finally throws `AllProvidersExhaustedError` if no
 * provider succeeds.
 */
export async function retryWithFailover<T>(
  context: RetryWithFailoverContext,
  operation: (entry: ProviderEntry) => Promise<T>,
  options: RetryWithFailoverOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttemptsPerProvider ?? 2);
  const ordered = orderProviders(context);
  if (ordered.length === 0) {
    throw new AllProvidersExhaustedError([
      {
        attempts: 0,
        providerId: '<none>',
        reason: 'no eligible providers'
      }
    ]);
  }

  const failures: ProviderFailureDetail[] = [];
  let lastError: unknown;

  for (const entry of ordered) {
    const result = await attemptAgainstProvider(entry, context, operation, options, maxAttempts);
    if (result.outcome === 'success') {
      return result.value;
    }
    lastError = result.error;
    if (result.failure !== null) {
      failures.push(result.failure);
    }
  }

  if (failures.length === 0 && lastError !== undefined) {
    throw lastError;
  }
  throw new AllProvidersExhaustedError(
    failures.length > 0
      ? failures
      : [
          {
            attempts: 0,
            providerId: '<unknown>',
            reason: 'unknown'
          }
        ]
  );
}

type AttemptResult<T> =
  | { outcome: 'success'; value: T }
  | { outcome: 'failure'; error: unknown; failure: ProviderFailureDetail | null };

async function attemptAgainstProvider<T>(
  entry: ProviderEntry,
  context: RetryWithFailoverContext,
  operation: (entry: ProviderEntry) => Promise<T>,
  options: RetryWithFailoverOptions,
  maxAttempts: number
): Promise<AttemptResult<T>> {
  context.inFlight.set(entry.id, (context.inFlight.get(entry.id) ?? 0) + 1);
  try {
    let lastFailure: ProviderFailureDetail | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const outcome = await tryOnce(entry, context, operation, options);
      if (outcome.kind === 'success') {
        return { outcome: 'success', value: outcome.value };
      }
      lastFailure = { ...outcome.failure, attempts: attempt };
    }
    return {
      error: lastFailure === null ? new Error('error') : new Error(lastFailure.lastError ?? 'error'),
      failure: lastFailure,
      outcome: 'failure'
    };
  } finally {
    context.inFlight.set(entry.id, Math.max(0, (context.inFlight.get(entry.id) ?? 1) - 1));
  }
}

type TryOnceOutcome<T> = { kind: 'success'; value: T } | { kind: 'failure'; failure: ProviderFailureDetail };

async function tryOnce<T>(
  entry: ProviderEntry,
  context: RetryWithFailoverContext,
  operation: (entry: ProviderEntry) => Promise<T>,
  options: RetryWithFailoverOptions
): Promise<TryOnceOutcome<T>> {
  const startedAt = Date.now();
  try {
    const result = await operation(entry);
    context.health.recordSuccess(entry.id, Date.now() - startedAt);
    invokeOnResponse(options, entry.id, result);
    return { kind: 'success', value: result };
  } catch (error) {
    context.health.recordFailure(entry.id, errorMessage(error));
    return {
      kind: 'failure',
      failure: {
        attempts: 1,
        lastError: errorMessage(error),
        providerId: entry.id,
        reason: classifyReason(error)
      }
    };
  }
}

function invokeOnResponse<T>(options: RetryWithFailoverOptions, providerId: string, result: T): void {
  if (options.onResponse === undefined) {
    return;
  }
  try {
    options.onResponse(providerId, result);
  } catch {
    /* hook errors must not break the response path */
  }
}

function orderProviders(context: RetryWithFailoverContext): ProviderEntry[] {
  const healthMap = new Map<string, ReturnType<ProviderHealthRegistry['getStatus']>>();
  for (const entry of context.providers) {
    healthMap.set(entry.id, context.health.getStatus(entry.id));
  }
  const quotaMap = new Map<string, ReturnType<QuotaTracker['getUsageSnapshot']>>();
  for (const entry of context.providers) {
    // Use per-provider quota tracker when available, fall back to shared tracker
    const tracker = context.quotaRegistry?.getTracker(entry.id) ?? context.quota;
    quotaMap.set(entry.id, tracker.getUsageSnapshot());
  }
  const picked = context.strategy.select(context.providers, {
    health: healthMap,
    inFlight: context.inFlight,
    quota: quotaMap,
    request: context.request
  });
  if (picked === undefined) {
    return [];
  }
  // Strategy returns one provider. Walk the rest in declared order as
  // explicit fallback so that a single-pick strategy still gives us
  // failover semantics.
  const tail = context.providers.filter(entry => entry.id !== picked.id);
  return [picked, ...tail];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function classifyReason(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return 'timeout';
    }

    // Check for HTTP status codes first (most reliable)
    if (hasStatus(error, 429)) {
      return 'rate-limited';
    }
    if (hasStatus(error, 503)) {
      return 'service_unavailable';
    }
    if (hasStatus(error, 500)) {
      return 'server_error';
    }

    // Then check for known error patterns — be specific, not substring
    const lower = error.message.toLowerCase();
    if (/rate[\s_-]?limit/.test(lower) || /too[\s_-]?many[\s_-]?requests/.test(lower)) {
      return 'rate-limited';
    }
    if (/quota[\s_-]?exceeded/.test(lower) || /usage[\s_-]?limit/.test(lower)) {
      return 'quota_exceeded';
    }
    if (/timeout|timed?\s*out|deadline\s*exceeded/.test(lower)) {
      return 'timeout';
    }
    if (/connection[\s_-]?refused|econnreset|econnrefused/.test(lower)) {
      return 'connection_error';
    }
  }
  return 'error';
}

function hasStatus(error: Error, status: number): boolean {
  return 'status' in error && (error as unknown as { status: number }).status === status;
}

/**
 * Build a RoutingStrategy from a name + options. Centralized so the
 * client.ts wrapper and any direct callers share the same construction
 * logic.
 */
export function buildStrategy(name: StrategyName, options: StrategyOptions = {}): RoutingStrategy {
  return createStrategy(name, options);
}
