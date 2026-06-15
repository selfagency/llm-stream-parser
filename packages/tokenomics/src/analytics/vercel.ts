/**
 * Vercel Analytics API adapter.
 *
 * Docs: https://vercel.com/docs/rest-api
 *
 * Environment variables:
 *   VERCEL_API_TOKEN  — required, Vercel API token
 *   VERCEL_TEAM_ID    — optional, team scope
 *   VERCEL_PROJECT_ID — required, project to query
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

function getConfig(): { apiToken: string; projectId: string; teamId?: string } | null {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!(apiToken && projectId)) {
    return null;
  }
  const cfg: { apiToken: string; projectId: string; teamId?: string } = { apiToken, projectId };
  const teamId = process.env.VERCEL_TEAM_ID;
  if (teamId) {
    cfg.teamId = teamId;
  }
  return cfg;
}

async function vercelFetch<T>(path: string, config: { apiToken: string; teamId?: string }): Promise<T | undefined> {
  const url = new URL(`https://api.vercel.com${path}`);
  if (config.teamId) {
    url.searchParams.set('teamId', config.teamId);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiToken}` }
  });
  if (!res.ok) {
    return;
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// Vercel API response shapes
// =============================================================================

interface VercelAnalyticsResponse {
  data?: Array<{
    totalPageviews?: number;
    totalVisitors?: number;
    date?: string;
  }>;
}

interface VercelDeploymentsResponse {
  deployments?: Array<{
    uid: string;
    createdAt: number;
    target?: string;
    meta?: { githubCommitSha?: string };
    state: 'READY' | 'ERROR' | 'CANCELED' | 'BUILDING' | string;
  }>;
}

// =============================================================================
// Adapter
// =============================================================================

export function createVercelAdapter(): DeployedAppAnalyticsAdapter {
  const config = getConfig();

  const adapter: DeployedAppAnalyticsAdapter = {
    name: 'Vercel',

    async getUsageMetrics(since: string): Promise<DeployedAppUsageMetrics | undefined> {
      if (!config) {
        return;
      }

      const data = await vercelFetch<VercelAnalyticsResponse>(
        `/v1/web/analytics/pageviews?projectId=${config.projectId}&from=${since}`,
        config
      );

      if (!data?.data) {
        return;
      }

      const totals = data.data.reduce(
        (acc, d) => {
          acc.pageviews += d.totalPageviews ?? 0;
          acc.visitors += d.totalVisitors ?? 0;
          return acc;
        },
        { pageviews: 0, visitors: 0 }
      );

      return omitUndefined({
        pageviews: totals.pageviews || undefined,
        activeUsers: totals.visitors || undefined,
        period: { since }
      }) as DeployedAppUsageMetrics;
    },

    getErrorMetrics(_since: string): Promise<DeployedAppErrorMetrics | undefined> {
      // Vercel Analytics does not expose error-rate or latency via the public API.
      return Promise.resolve(undefined);
    },

    async getDeploymentEvents(since: string): Promise<DeploymentEvent[]> {
      if (!config) {
        return [];
      }

      const sinceTs = new Date(since).getTime();
      const data = await vercelFetch<VercelDeploymentsResponse>(
        `/v6/deployments?projectId=${config.projectId}&limit=100`,
        config
      );

      if (!data?.deployments) {
        return [];
      }

      return data.deployments
        .filter(d => d.createdAt >= sinceTs)
        .map(
          d =>
            omitUndefined({
              id: d.uid,
              deployedAt: new Date(d.createdAt).toISOString(),
              environment: d.target ?? 'preview',
              commitSha: d.meta?.githubCommitSha,
              status: mapVercelState(d.state)
            }) as DeploymentEvent
        );
    }
  };

  return adapter;
}

function mapVercelState(state: string): DeploymentEvent['status'] {
  switch (state) {
    case 'READY':
      return 'success';
    case 'ERROR':
      return 'failure';
    case 'CANCELED':
      return 'rolled_back';
    case 'BUILDING':
      return 'in_progress';
    default:
      return state;
  }
}
