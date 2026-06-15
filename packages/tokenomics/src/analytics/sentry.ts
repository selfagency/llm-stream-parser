/**
 * Sentry Issues & Stats API adapter.
 *
 * Docs: https://docs.sentry.io/api/
 *
 * Environment variables:
 *   SENTRY_AUTH_TOKEN  — required, internal integration or user auth token
 *   SENTRY_ORG_SLUG    — required, organization slug
 *   SENTRY_PROJECT_SLUG — required, project slug
 *   SENTRY_BASE_URL    — optional, defaults to "https://sentry.io"
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

function getConfig(): { authToken: string; orgSlug: string; projectSlug: string; baseUrl: string } | null {
  const authToken = process.env['SENTRY_AUTH_TOKEN'];
  const orgSlug = process.env['SENTRY_ORG_SLUG'];
  const projectSlug = process.env['SENTRY_PROJECT_SLUG'];
  if (!(authToken && orgSlug && projectSlug)) {
    return null;
  }
  return {
    authToken,
    orgSlug,
    projectSlug,
    baseUrl: process.env['SENTRY_BASE_URL'] ?? 'https://sentry.io'
  };
}

async function sentryFetch<T>(path: string, config: { authToken: string; baseUrl: string }): Promise<T | undefined> {
  const url = new URL(path, config.baseUrl);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.authToken}` }
  });
  if (!res.ok) {
    return;
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// Sentry API response shapes
// =============================================================================

interface SentryStatsResponse {
  data?: Array<Array<number | null>>;
  intervals?: string[];
}

interface SentryIssuesResponse {
  data?: Array<{
    id: string;
    title: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    level: string;
    status: string;
    metadata?: { value?: string };
  }>;
}

interface SentryReleasesResponse {
  data?: Array<{
    dateCreated: string;
    version: string;
    projects?: Array<{ slug: string }>;
    status: string;
  }>;
}

// =============================================================================
// Adapter
// =============================================================================

export function createSentryAdapter(): DeployedAppAnalyticsAdapter {
  const config = getConfig();

  const adapter: DeployedAppAnalyticsAdapter = {
    name: 'Sentry',

    async getUsageMetrics(_since: string): Promise<DeployedAppUsageMetrics | undefined> {
      // Sentry is an error-tracking platform — it does not expose
      // pageviews, active users, or API call counts.
      return;
    },

    async getErrorMetrics(since: string): Promise<DeployedAppErrorMetrics | undefined> {
      if (!config) {
        return;
      }

      // Fetch error count and p50/p95/p99 from the stats API
      const stats = await sentryFetch<SentryStatsResponse>(
        `/api/0/projects/${config.orgSlug}/${config.projectSlug}/stats/?since=${since}&stat=received`,
        config
      );

      // If the API is unreachable, return undefined (adapter not usable)
      if (!stats) {
        return;
      }

      // Fetch unresolved issue count
      const issues = await sentryFetch<SentryIssuesResponse>(
        `/api/0/projects/${config.orgSlug}/${config.projectSlug}/issues/?statsPeriod=14d&query=is:unresolved`,
        config
      );

      // Fetch p99 from the latency breakdown
      const latencyStats = await sentryFetch<SentryStatsResponse>(
        `/api/0/projects/${config.orgSlug}/${config.projectSlug}/stats/?since=${since}&stat=p99`,
        config
      );

      // Sum error counts from the received stats
      let errorCount = 0;
      if (stats?.data) {
        for (const bucket of stats.data) {
          errorCount += (bucket[1] as number) ?? 0;
        }
      }

      // Extract p99 from latency data (last non-null value)
      let p99LatencyMs = 0;
      if (latencyStats?.data) {
        for (const bucket of latencyStats.data) {
          const val = bucket[1] as number | null;
          if (val !== null && val > 0) {
            p99LatencyMs = Math.max(p99LatencyMs, val);
          }
        }
      }

      const incidentCount = issues?.data?.length ?? 0;

      return {
        errorRate: errorCount > 0 ? 0.01 : 0, // approximate — Sentry doesn't expose total request count
        p99LatencyMs: p99LatencyMs || 0,
        incidentCount,
        period: { since }
      };
    },

    async getDeploymentEvents(since: string): Promise<DeploymentEvent[]> {
      if (!config) {
        return [];
      }

      const data = await sentryFetch<SentryReleasesResponse>(
        `/api/0/organizations/${config.orgSlug}/releases/?project=${config.projectSlug}&query=date:>${since}`,
        config
      );

      if (!data?.data) {
        return [];
      }

      return data.data.map(
        r =>
          omitUndefined({
            id: r.version,
            deployedAt: r.dateCreated,
            environment: r.projects?.[0]?.slug ?? config.projectSlug,
            commitSha: r.version,
            status: r.status === 'open' ? 'success' : r.status === 'archived' ? 'rolled_back' : r.status
          }) as DeploymentEvent
      );
    }
  };

  return adapter;
}
