/**
 * Cloudflare Analytics API adapter.
 *
 * Docs: https://developers.cloudflare.com/api/operations/analytics-dashboard-get
 *
 * Environment variables:
 *   CLOUDFLARE_API_TOKEN  — required, API token with Analytics read scope
 *   CLOUDFLARE_ZONE_ID    — required, zone (domain) identifier
 *   CLOUDFLARE_ACCOUNT_ID — required, account identifier
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

function getConfig(): { apiToken: string; zoneId: string; accountId: string } | null {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!(apiToken && zoneId && accountId)) {
    return null;
  }
  return { apiToken, zoneId, accountId };
}

async function cfFetch<T>(path: string, config: { apiToken: string }): Promise<T | undefined> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    return;
  }
  const body = (await res.json()) as { success: boolean; result?: T; errors?: unknown[] };
  if (!body.success) {
    return;
  }
  return body.result;
}

// =============================================================================
// Cloudflare API response shapes
// =============================================================================

interface CfAnalyticsResult {
  data?: Record<string, unknown>[];
  totals?: {
    pageviews?: number;
    uniques?: number;
    requests?: number;
    bandwidth?: number;
    threats?: number;
  };
}

interface CfDeploymentsResult {
  deployments?: Array<{
    id: string;
    created_on: string;
    environment: string;
    metadata?: { commit_sha?: string };
    status: string;
  }>;
}

function mapDeploymentStatus(status: string): DeploymentEvent['status'] {
  if (status === 'success') {
    return 'success';
  }
  if (status === 'failure') {
    return 'failed';
  }
  return 'rolled-back';
}

// =============================================================================
// Adapter
// =============================================================================

export function createCloudflareAdapter(): DeployedAppAnalyticsAdapter {
  const config = getConfig();

  const adapter: DeployedAppAnalyticsAdapter = {
    name: 'Cloudflare',

    async getUsageMetrics(since: string): Promise<DeployedAppUsageMetrics | undefined> {
      if (!config) {
        return;
      }

      const data = await cfFetch<CfAnalyticsResult>(
        `/zones/${config.zoneId}/analytics/dashboard?since=${since}`,
        config
      );

      if (!data?.totals) {
        return;
      }

      return omitUndefined({
        pageviews: data.totals.pageviews,
        activeUsers: data.totals.uniques,
        apiCalls: data.totals.requests,
        period: { since }
      }) as DeployedAppUsageMetrics;
    },

    getErrorMetrics(_since: string): Promise<DeployedAppErrorMetrics | undefined> {
      // Cloudflare Analytics dashboard does not expose p99 latency or error rate
      // via the simple dashboard endpoint. Use Cloudflare GraphQL for that.
      return Promise.resolve(undefined);
    },

    async getDeploymentEvents(since: string): Promise<DeploymentEvent[]> {
      if (!config) {
        return [];
      }

      const data = await cfFetch<CfDeploymentsResult>(
        `/accounts/${config.accountId}/pages/projects/deployments`,
        config
      );

      if (!data?.deployments) {
        return [];
      }

      const sinceTs = new Date(since).getTime();

      return data.deployments
        .filter(d => new Date(d.created_on).getTime() >= sinceTs)
        .map(
          d =>
            omitUndefined({
              id: d.id,
              deployedAt: d.created_on,
              environment: d.environment,
              commitSha: d.metadata?.commit_sha,
              status: mapDeploymentStatus(d.status)
            }) as DeploymentEvent
        );
    }
  };

  return adapter;
}
