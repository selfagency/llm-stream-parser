/**
 * PostHog events API adapter.
 *
 * Docs: https://posthog.com/docs/api
 *
 * Environment variables:
 *   POSTHOG_API_KEY    — required, personal API key
 *   POSTHOG_PROJECT_ID — required, project ID (string or number)
 *   POSTHOG_BASE_URL   — optional, defaults to "https://app.posthog.com"
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

function getConfig(): { apiKey: string; projectId: string; baseUrl: string } | null {
  const apiKey = process.env['POSTHOG_API_KEY'];
  const projectId = process.env['POSTHOG_PROJECT_ID'];
  if (!(apiKey && projectId)) {
    return null;
  }
  return { apiKey, projectId, baseUrl: process.env['POSTHOG_BASE_URL'] ?? 'https://app.posthog.com' };
}

async function posthogFetch<T>(
  path: string,
  config: { apiKey: string; projectId: string; baseUrl: string }
): Promise<T | undefined> {
  const url = new URL(`/api/projects/${config.projectId}${path}`, config.baseUrl);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiKey}` }
  });
  if (!res.ok) {
    return;
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// PostHog API response shapes
// =============================================================================

interface PostHogInsightResult {
  result?: Array<{ data?: number[]; labels?: string[]; count?: number }>;
}

interface PostHogEventsResult {
  results?: Array<{
    id: string;
    event: string;
    timestamp: string;
    properties?: Record<string, unknown>;
  }>;
}

// =============================================================================
// Adapter
// =============================================================================

export function createPostHogAdapter(): DeployedAppAnalyticsAdapter {
  const config = getConfig();

  const adapter: DeployedAppAnalyticsAdapter = {
    name: 'PostHog',

    async getUsageMetrics(since: string): Promise<DeployedAppUsageMetrics | undefined> {
      if (!config) {
        return;
      }

      // Query unique users via PostHog insights API (trends)
      const data = await posthogFetch<PostHogInsightResult>(
        `/api/insights/trend/?events=&display=ActionsLineGraph&date_from=${since}`,
        config
      );

      if (!data?.result) {
        return;
      }

      // Sum across all series for a rough total
      let activeUsers = 0;
      for (const series of data.result) {
        if (series.count !== undefined) {
          activeUsers += series.count;
        } else if (series.data) {
          activeUsers += series.data.reduce((a: number, b: number) => a + b, 0);
        }
      }

      return omitUndefined({
        activeUsers: activeUsers || undefined,
        period: { since }
      }) as DeployedAppUsageMetrics;
    },

    async getErrorMetrics(_since: string): Promise<DeployedAppErrorMetrics | undefined> {
      // PostHog does not have a dedicated error-metrics endpoint.
      // For error tracking, use Sentry (see sentry.ts).
      return;
    },

    async getDeploymentEvents(since: string): Promise<DeploymentEvent[]> {
      if (!config) {
        return [];
      }

      const data = await posthogFetch<PostHogEventsResult>(`/api/events/?event=$plugin_updated&after=${since}`, config);

      if (!data?.results) {
        return [];
      }

      return data.results.map(
        ev =>
          omitUndefined({
            id: ev.id,
            deployedAt: ev.timestamp,
            environment: (ev.properties?.['environment'] as string) ?? 'unknown',
            commitSha: ev.properties?.['commit_sha'] as string | undefined,
            status: 'success'
          }) as DeploymentEvent
      );
    }
  };

  return adapter;
}
