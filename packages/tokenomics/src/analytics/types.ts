/**
 * Analytics adapter interfaces for the tokenomics system.
 *
 * Each adapter wraps a third-party analytics/observability API and
 * exposes a uniform interface for querying usage metrics, error
 * metrics, and deployment events.
 *
 * All adapters are opt-in — they are disabled unless the required
 * environment variables are configured.
 */

// =============================================================================
// Helpers for building objects with exactOptionalPropertyTypes
// =============================================================================

/**
 * Build an object omitting keys whose value is `undefined`.
 * Required for `exactOptionalPropertyTypes` compliance — setting
 * an optional field to `undefined` is a type error.
 */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      result[k as keyof T] = v as T[keyof T];
    }
  }
  return result;
}

// =============================================================================
// Shared metric types
// =============================================================================

/** Time period that a metric snapshot covers. */
export interface MetricPeriod {
  /** Inclusive start of the window (ISO 8601). */
  since: string;
  /** Exclusive end of the window (ISO 8601). Omitted = "up to now". */
  until?: string;
}

/** Usage metrics for a deployed application. */
export interface DeployedAppUsageMetrics {
  /** Unique active users in the period. */
  activeUsers?: number;
  /** Total API calls in the period. */
  apiCalls?: number;
  /** Conversion rate as a decimal 0-1. */
  conversionRate?: number;
  /** Total conversions (sign-ups, purchases, etc.). */
  conversions?: number;
  /** Total page views in the period. */
  pageviews?: number;
  /** Time period these metrics cover. */
  period: MetricPeriod;
}

/** Error/incident metrics for a deployed application. */
export interface DeployedAppErrorMetrics {
  /** Error rate as a decimal 0-1 (errors / total requests). */
  errorRate: number;
  /** Number of distinct incidents in the period. */
  incidentCount: number;
  /** Mean time to resolve in milliseconds. */
  mttrMs?: number;
  /** P99 latency in milliseconds. */
  p99LatencyMs: number;
  /** Time period these metrics cover. */
  period: MetricPeriod;
}

/** A deployment event. */
export interface DeploymentEvent {
  /** Git commit SHA deployed. */
  commitSha?: string;
  /** When the deployment occurred (ISO 8601). */
  deployedAt: string;
  /** Target environment. */
  environment: 'production' | 'staging' | 'development' | string;
  /** Unique deployment identifier. */
  id: string;
  /** Deployment status. */
  status: 'success' | 'failure' | 'rolled_back' | 'in_progress' | string;
}

// =============================================================================
// Adapter interface
// =============================================================================

/**
 * Analytics adapter for a deployed application.
 *
 * Implementations are thin HTTP clients against the respective
 * platform API. All credentials are sourced from environment
 * variables — never hardcoded.
 */
export interface DeployedAppAnalyticsAdapter {
  /**
   * Fetch deployment events since the given ISO 8601 timestamp.
   * Returns an empty array if the adapter is not configured.
   */
  getDeploymentEvents(since: string): Promise<DeploymentEvent[]>;

  /**
   * Fetch error/incident metrics since the given ISO 8601 timestamp.
   * Returns `undefined` if the adapter is not configured.
   */
  getErrorMetrics(since: string): Promise<DeployedAppErrorMetrics | undefined>;

  /**
   * Fetch usage metrics since the given ISO 8601 timestamp.
   * Returns `undefined` if the adapter is not configured.
   */
  getUsageMetrics(since: string): Promise<DeployedAppUsageMetrics | undefined>;
  /** Human-readable adapter name (e.g. "Plausible", "PostHog"). */
  readonly name: string;
}
