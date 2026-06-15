/**
 * Generic configurable HTTP JSON endpoint adapter.
 *
 * Allows users to wire up any REST API that returns JSON by
 * providing URL templates and JSONPath-like field selectors.
 *
 * Environment variables:
 *   ANALYTICS_HTTP_URL          — required, base URL for the analytics endpoint
 *   ANALYTICS_HTTP_API_KEY      — optional, Bearer token for Authorization header
 *   ANALYTICS_HTTP_USAGE_PATH   — optional, path appended to base for usage metrics
 *   ANALYTICS_HTTP_ERROR_PATH   — optional, path appended to base for error metrics
 *   ANALYTICS_HTTP_DEPLOY_PATH  — optional, path appended to base for deployment events
 */

import type {
  DeployedAppAnalyticsAdapter,
  DeployedAppErrorMetrics,
  DeployedAppUsageMetrics,
  DeploymentEvent
} from './types.js';
import { omitUndefined } from './types.js';

// =============================================================================
// Helpers
// =============================================================================

function getConfig(): {
  baseUrl: string;
  apiKey?: string;
  usagePath?: string;
  errorPath?: string;
  deployPath?: string;
} | null {
  const baseUrl = process.env['ANALYTICS_HTTP_URL'];
  if (!baseUrl) {
    return null;
  }
  const cfg: {
    baseUrl: string;
    apiKey?: string;
    usagePath?: string;
    errorPath?: string;
    deployPath?: string;
  } = { baseUrl };
  const apiKey = process.env['ANALYTICS_HTTP_API_KEY'];
  if (apiKey) {
    cfg.apiKey = apiKey;
  }
  const usagePath = process.env['ANALYTICS_HTTP_USAGE_PATH'];
  if (usagePath) {
    cfg.usagePath = usagePath;
  }
  const errorPath = process.env['ANALYTICS_HTTP_ERROR_PATH'];
  if (errorPath) {
    cfg.errorPath = errorPath;
  }
  const deployPath = process.env['ANALYTICS_HTTP_DEPLOY_PATH'];
  if (deployPath) {
    cfg.deployPath = deployPath;
  }
  return cfg;
}

async function httpFetch<T>(url: string, apiKey?: string): Promise<T | undefined> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    return;
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// Adapter
// =============================================================================

export function createHttpJsonAdapter(): DeployedAppAnalyticsAdapter {
  const config = getConfig();

  const adapter: DeployedAppAnalyticsAdapter = {
    name: 'HTTP JSON',

    async getUsageMetrics(since: string): Promise<DeployedAppUsageMetrics | undefined> {
      if (!config) {
        return;
      }
      if (!config.usagePath) {
        return;
      }

      const url = new URL(config.usagePath, config.baseUrl);
      url.searchParams.set('since', since);

      const data = await httpFetch<Record<string, unknown>>(url.toString(), config.apiKey);
      if (!data) {
        return;
      }

      return omitUndefined({
        pageviews: coerceNumber(data['pageviews']),
        activeUsers: coerceNumber(data['activeUsers'] ?? data['active_users']),
        apiCalls: coerceNumber(data['apiCalls'] ?? data['api_calls']),
        conversions: coerceNumber(data['conversions']),
        conversionRate: coerceNumber(data['conversionRate'] ?? data['conversion_rate']),
        period: { since }
      }) as DeployedAppUsageMetrics;
    },

    async getErrorMetrics(since: string): Promise<DeployedAppErrorMetrics | undefined> {
      if (!config) {
        return;
      }
      if (!config.errorPath) {
        return;
      }

      const url = new URL(config.errorPath, config.baseUrl);
      url.searchParams.set('since', since);

      const data = await httpFetch<Record<string, unknown>>(url.toString(), config.apiKey);
      if (!data) {
        return;
      }

      return omitUndefined({
        errorRate: coerceNumber(data['errorRate'] ?? data['error_rate']) ?? 0,
        p99LatencyMs: coerceNumber(data['p99LatencyMs'] ?? data['p99_latency_ms']) ?? 0,
        incidentCount: coerceNumber(data['incidentCount'] ?? data['incident_count']) ?? 0,
        mttrMs: coerceNumber(data['mttrMs'] ?? data['mttr_ms']),
        period: { since }
      }) as DeployedAppErrorMetrics;
    },

    async getDeploymentEvents(since: string): Promise<DeploymentEvent[]> {
      if (!config) {
        return [];
      }
      if (!config.deployPath) {
        return [];
      }

      const url = new URL(config.deployPath, config.baseUrl);
      url.searchParams.set('since', since);

      const data = await httpFetch<unknown>(url.toString(), config.apiKey);
      if (!data) {
        return [];
      }

      // Accept either an array directly or { deployments: [...] }
      const list: Array<Record<string, unknown>> = Array.isArray(data)
        ? (data as Array<Record<string, unknown>>)
        : (((data as Record<string, unknown>)['deployments'] as Array<Record<string, unknown>>) ?? []);

      return list.map(
        item =>
          omitUndefined({
            id: String(item['id'] ?? ''),
            deployedAt: String(item['deployedAt'] ?? item['deployed_at'] ?? ''),
            environment: String(item['environment'] ?? 'unknown'),
            commitSha: (item['commitSha'] as string | undefined) ?? (item['commit_sha'] as string | undefined),
            status: String(item['status'] ?? 'success') as DeploymentEvent['status']
          }) as DeploymentEvent
      );
    }
  };

  return adapter;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return;
}
