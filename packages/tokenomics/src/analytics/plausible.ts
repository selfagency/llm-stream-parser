/**
 * Plausible Analytics REST API adapter.
 *
 * Docs: https://plausible.io/docs/stats-api
 *
 * Environment variables:
 *   PLAUSIBLE_API_KEY  — required, API key (shared link or API key)
 *   PLAUSIBLE_SITE_ID  — required, site domain (e.g. "example.com")
 *   PLAUSIBLE_BASE_URL — optional, defaults to "https://plausible.io"
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

function getConfig(): { apiKey: string; siteId: string; baseUrl: string } | null {
  const apiKey = process.env.PLAUSIBLE_API_KEY;
  const siteId = process.env.PLAUSIBLE_SITE_ID;
  if (!(apiKey && siteId)) {
    return null;
  }
  return { apiKey, siteId, baseUrl: process.env.PLAUSIBLE_BASE_URL ?? 'https://plausible.io' };
}

async function plausibleFetch<T>(
  path: string,
  params: Record<string, string>,
  config: { apiKey: string; siteId: string; baseUrl: string }
): Promise<T | undefined> {
  const url = new URL(path, config.baseUrl);
  url.searchParams.set('site_id', config.siteId);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });
  if (!res.ok) {
    return;
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// Plausible stats API response shapes
// =============================================================================

interface PlausibleAggregateResponse {
  results: {
    visitors?: { value: number };
    pageviews?: { value: number };
    bounce_rate?: { value: number };
    visit_duration?: { value: number };
    events?: { value: number };
  };
}

// =============================================================================
// Adapter
// =============================================================================

export function createPlausibleAdapter(): DeployedAppAnalyticsAdapter {
  const config = getConfig();

  const adapter: DeployedAppAnalyticsAdapter = {
    name: 'Plausible',

    async getUsageMetrics(since: string): Promise<DeployedAppUsageMetrics | undefined> {
      if (!config) {
        return;
      }

      const data = await plausibleFetch<PlausibleAggregateResponse>(
        '/api/v1/stats/aggregate',
        { period: 'custom', date: `${since},${new Date().toISOString().slice(0, 10)}` },
        config
      );
      if (!data?.results) {
        return;
      }

      return omitUndefined({
        pageviews: data.results.pageviews?.value,
        activeUsers: data.results.visitors?.value,
        period: { since }
      }) as DeployedAppUsageMetrics;
    },

    getErrorMetrics(_since: string): Promise<DeployedAppErrorMetrics | undefined> {
      // Plausible does not expose error metrics via the public API.
      return Promise.resolve(undefined);
    },

    getDeploymentEvents(_since: string): Promise<DeploymentEvent[]> {
      // Plausible does not expose deployment events.
      return Promise.resolve([]);
    }
  };

  return adapter;
}
