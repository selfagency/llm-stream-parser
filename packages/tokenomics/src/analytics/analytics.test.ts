import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCloudflareAdapter } from './cloudflare.js';
import { createHttpJsonAdapter } from './http-json.js';
import { createPlausibleAdapter } from './plausible.js';
import { createPostHogAdapter } from './posthog.js';
import { createSentryAdapter } from './sentry.js';
import { createVercelAdapter } from './vercel.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Stub `fetch` to return a JSON response. Returns the mock so callers
 * can assert on it.
 */
function mockFetch(response: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function mockFetchError(): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: 'unauthorized' })
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function clearEnv(...keys: string[]) {
  for (const k of keys) {
    delete process.env[k];
  }
}

// =============================================================================
// Plausible
// =============================================================================

describe('PlausibleAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv('PLAUSIBLE_API_KEY', 'PLAUSIBLE_SITE_ID');
  });

  it('returns undefined when not configured', async () => {
    const adapter = createPlausibleAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('returns usage metrics when configured', async () => {
    process.env.PLAUSIBLE_API_KEY = 'test-key';
    process.env.PLAUSIBLE_SITE_ID = 'example.com';

    mockFetch({
      results: { visitors: { value: 42 }, pageviews: { value: 100 } }
    });

    const adapter = createPlausibleAdapter();
    const metrics = await adapter.getUsageMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.pageviews).toBe(100);
    expect(metrics?.activeUsers).toBe(42);
    expect(metrics?.period.since).toBe('2026-01-01');
  });

  it('returns undefined for error metrics (not supported)', async () => {
    process.env.PLAUSIBLE_API_KEY = 'test-key';
    process.env.PLAUSIBLE_SITE_ID = 'example.com';

    const adapter = createPlausibleAdapter();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
  });

  it('returns empty array for deployment events (not supported)', async () => {
    process.env.PLAUSIBLE_API_KEY = 'test-key';
    process.env.PLAUSIBLE_SITE_ID = 'example.com';

    const adapter = createPlausibleAdapter();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('handles API error gracefully', async () => {
    process.env.PLAUSIBLE_API_KEY = 'test-key';
    process.env.PLAUSIBLE_SITE_ID = 'example.com';

    mockFetchError();

    const adapter = createPlausibleAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
  });
});

// =============================================================================
// PostHog
// =============================================================================

describe('PostHogAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv('POSTHOG_API_KEY', 'POSTHOG_PROJECT_ID');
  });

  it('returns undefined when not configured', async () => {
    const adapter = createPostHogAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('returns usage metrics when configured', async () => {
    process.env.POSTHOG_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '123';

    mockFetch({
      result: [{ count: 50 }, { count: 30 }]
    });

    const adapter = createPostHogAdapter();
    const metrics = await adapter.getUsageMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.activeUsers).toBe(80);
    expect(metrics?.period.since).toBe('2026-01-01');
  });

  it('returns undefined for error metrics (not supported)', async () => {
    process.env.POSTHOG_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '123';

    const adapter = createPostHogAdapter();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
  });

  it('returns deployment events when configured', async () => {
    process.env.POSTHOG_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '123';

    mockFetch({
      results: [
        {
          id: 'evt_1',
          event: '$plugin_updated',
          timestamp: '2026-06-01T00:00:00Z',
          properties: { environment: 'production', commit_sha: 'abc123' }
        }
      ]
    });

    const adapter = createPostHogAdapter();
    const events = await adapter.getDeploymentEvents('2026-01-01');

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('evt_1');
    expect(events[0]?.environment).toBe('production');
    expect(events[0]?.commitSha).toBe('abc123');
  });

  it('handles API error gracefully', async () => {
    process.env.POSTHOG_API_KEY = 'phx_test';
    process.env.POSTHOG_PROJECT_ID = '123';

    mockFetchError();

    const adapter = createPostHogAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
  });
});

// =============================================================================
// Vercel
// =============================================================================

describe('VercelAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv('VERCEL_API_TOKEN', 'VERCEL_PROJECT_ID');
  });

  it('returns undefined when not configured', async () => {
    const adapter = createVercelAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('returns usage metrics when configured', async () => {
    process.env.VERCEL_API_TOKEN = 'vct_test';
    process.env.VERCEL_PROJECT_ID = 'prj_test';

    mockFetch({
      data: [
        { totalPageviews: 200, totalVisitors: 50 },
        { totalPageviews: 150, totalVisitors: 30 }
      ]
    });

    const adapter = createVercelAdapter();
    const metrics = await adapter.getUsageMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.pageviews).toBe(350);
    expect(metrics?.activeUsers).toBe(80);
  });

  it('returns deployment events when configured', async () => {
    process.env.VERCEL_API_TOKEN = 'vct_test';
    process.env.VERCEL_PROJECT_ID = 'prj_test';

    const now = Date.now();
    mockFetch({
      deployments: [
        {
          uid: 'dpl_1',
          createdAt: now,
          target: 'production',
          meta: { githubCommitSha: 'def456' },
          state: 'READY'
        },
        {
          uid: 'dpl_2',
          createdAt: now - 86_400_000,
          target: 'preview',
          state: 'ERROR'
        }
      ]
    });

    const adapter = createVercelAdapter();
    const events = await adapter.getDeploymentEvents(new Date(now - 86_400_000 * 2).toISOString());

    expect(events).toHaveLength(2);
    expect(events[0]?.id).toBe('dpl_1');
    expect(events[0]?.status).toBe('success');
    expect(events[0]?.commitSha).toBe('def456');
    expect(events[1]?.status).toBe('failure');
  });

  it('filters deployments before since', async () => {
    process.env.VERCEL_API_TOKEN = 'vct_test';
    process.env.VERCEL_PROJECT_ID = 'prj_test';

    const now = Date.now();
    mockFetch({
      deployments: [
        {
          uid: 'dpl_old',
          createdAt: now - 86_400_000 * 10,
          state: 'READY'
        },
        {
          uid: 'dpl_new',
          createdAt: now,
          state: 'READY'
        }
      ]
    });

    const adapter = createVercelAdapter();
    const events = await adapter.getDeploymentEvents(new Date(now - 86_400_000 * 5).toISOString());

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('dpl_new');
  });

  it('handles API error gracefully', async () => {
    process.env.VERCEL_API_TOKEN = 'vct_test';
    process.env.VERCEL_PROJECT_ID = 'prj_test';

    mockFetchError();

    const adapter = createVercelAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
  });
});

// =============================================================================
// Cloudflare
// =============================================================================

describe('CloudflareAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_ACCOUNT_ID');
  });

  it('returns undefined when not configured', async () => {
    const adapter = createCloudflareAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('returns usage metrics when configured', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'cf_test';
    process.env.CLOUDFLARE_ZONE_ID = 'zone_1';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_1';

    mockFetch({
      success: true,
      result: {
        totals: { pageviews: 500, uniques: 100, requests: 2000 }
      }
    });

    const adapter = createCloudflareAdapter();
    const metrics = await adapter.getUsageMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.pageviews).toBe(500);
    expect(metrics?.activeUsers).toBe(100);
    expect(metrics?.apiCalls).toBe(2000);
  });

  it('returns undefined for error metrics (not supported)', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'cf_test';
    process.env.CLOUDFLARE_ZONE_ID = 'zone_1';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_1';

    const adapter = createCloudflareAdapter();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
  });

  it('handles API error gracefully', async () => {
    process.env.CLOUDFLARE_API_TOKEN = 'cf_test';
    process.env.CLOUDFLARE_ZONE_ID = 'zone_1';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_1';

    mockFetchError();

    const adapter = createCloudflareAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
  });
});

// =============================================================================
// Sentry
// =============================================================================

describe('SentryAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv('SENTRY_AUTH_TOKEN', 'SENTRY_ORG_SLUG', 'SENTRY_PROJECT_SLUG');
  });

  it('returns undefined when not configured', async () => {
    const adapter = createSentryAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('returns undefined for usage metrics (not supported)', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'snt_test';
    process.env.SENTRY_ORG_SLUG = 'myorg';
    process.env.SENTRY_PROJECT_SLUG = 'myproject';

    const adapter = createSentryAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
  });

  it('returns error metrics when configured', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'snt_test';
    process.env.SENTRY_ORG_SLUG = 'myorg';
    process.env.SENTRY_PROJECT_SLUG = 'myproject';

    // Mock three API calls: stats/received, issues, stats/p99
    const fetchMock = vi
      .fn()
      // First call: stats/received
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            [1_700_000_000, 10],
            [1_700_003_600, 5]
          ]
        })
      })
      // Second call: issues
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: '1',
              title: 'Error 1',
              count: 5,
              firstSeen: '2026-01-01',
              lastSeen: '2026-01-02',
              level: 'error',
              status: 'unresolved'
            },
            {
              id: '2',
              title: 'Error 2',
              count: 3,
              firstSeen: '2026-01-01',
              lastSeen: '2026-01-02',
              level: 'fatal',
              status: 'unresolved'
            }
          ]
        })
      })
      // Third call: stats/p99
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            [1_700_000_000, 500],
            [1_700_003_600, 1200]
          ]
        })
      });

    vi.stubGlobal('fetch', fetchMock);

    const adapter = createSentryAdapter();
    const metrics = await adapter.getErrorMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.incidentCount).toBe(2);
    expect(metrics?.p99LatencyMs).toBe(1200);
    expect(metrics?.errorRate).toBeGreaterThanOrEqual(0);
    expect(metrics?.period.since).toBe('2026-01-01');
  });

  it('returns deployment events when configured', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'snt_test';
    process.env.SENTRY_ORG_SLUG = 'myorg';
    process.env.SENTRY_PROJECT_SLUG = 'myproject';

    mockFetch({
      data: [
        {
          version: '1.0.0',
          dateCreated: '2026-06-01T00:00:00Z',
          projects: [{ slug: 'myproject' }],
          status: 'open'
        }
      ]
    });

    const adapter = createSentryAdapter();
    const events = await adapter.getDeploymentEvents('2026-01-01');

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('1.0.0');
    expect(events[0]?.commitSha).toBe('1.0.0');
    expect(events[0]?.status).toBe('success');
  });

  it('handles API error gracefully', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'snt_test';
    process.env.SENTRY_ORG_SLUG = 'myorg';
    process.env.SENTRY_PROJECT_SLUG = 'myproject';

    mockFetchError();

    const adapter = createSentryAdapter();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
  });
});

// =============================================================================
// HTTP JSON (generic)
// =============================================================================

describe('HttpJsonAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      'ANALYTICS_HTTP_URL',
      'ANALYTICS_HTTP_API_KEY',
      'ANALYTICS_HTTP_USAGE_PATH',
      'ANALYTICS_HTTP_ERROR_PATH',
      'ANALYTICS_HTTP_DEPLOY_PATH'
    );
  });

  it('returns undefined when not configured', async () => {
    const adapter = createHttpJsonAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getErrorMetrics('2026-01-01')).toBeUndefined();
    expect(await adapter.getDeploymentEvents('2026-01-01')).toEqual([]);
  });

  it('returns usage metrics from a custom endpoint', async () => {
    process.env.ANALYTICS_HTTP_URL = 'https://custom.example.com';
    process.env.ANALYTICS_HTTP_USAGE_PATH = '/api/usage';

    mockFetch({
      pageviews: 1000,
      activeUsers: 200,
      apiCalls: 5000,
      conversions: 50,
      conversionRate: 0.1
    });

    const adapter = createHttpJsonAdapter();
    const metrics = await adapter.getUsageMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.pageviews).toBe(1000);
    expect(metrics?.activeUsers).toBe(200);
    expect(metrics?.apiCalls).toBe(5000);
    expect(metrics?.conversions).toBe(50);
    expect(metrics?.conversionRate).toBe(0.1);
  });

  it('returns error metrics from a custom endpoint', async () => {
    process.env.ANALYTICS_HTTP_URL = 'https://custom.example.com';
    process.env.ANALYTICS_HTTP_ERROR_PATH = '/api/errors';

    mockFetch({
      errorRate: 0.02,
      p99LatencyMs: 1500,
      incidentCount: 3,
      mttrMs: 300_000
    });

    const adapter = createHttpJsonAdapter();
    const metrics = await adapter.getErrorMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.errorRate).toBe(0.02);
    expect(metrics?.p99LatencyMs).toBe(1500);
    expect(metrics?.incidentCount).toBe(3);
    expect(metrics?.mttrMs).toBe(300_000);
  });

  it('returns deployment events from a custom endpoint', async () => {
    process.env.ANALYTICS_HTTP_URL = 'https://custom.example.com';
    process.env.ANALYTICS_HTTP_DEPLOY_PATH = '/api/deploys';

    mockFetch({
      deployments: [
        {
          id: 'dep_1',
          deployedAt: '2026-06-01T00:00:00Z',
          environment: 'production',
          commitSha: 'abc',
          status: 'success'
        }
      ]
    });

    const adapter = createHttpJsonAdapter();
    const events = await adapter.getDeploymentEvents('2026-01-01');

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('dep_1');
    expect(events[0]?.environment).toBe('production');
  });

  it('accepts snake_case field names', async () => {
    process.env.ANALYTICS_HTTP_URL = 'https://custom.example.com';
    process.env.ANALYTICS_HTTP_USAGE_PATH = '/api/usage';

    mockFetch({
      pageviews: 100,
      active_users: 50,
      api_calls: 200
    });

    const adapter = createHttpJsonAdapter();
    const metrics = await adapter.getUsageMetrics('2026-01-01');

    expect(metrics).toBeDefined();
    expect(metrics?.pageviews).toBe(100);
    expect(metrics?.activeUsers).toBe(50);
    expect(metrics?.apiCalls).toBe(200);
  });

  it('handles API error gracefully', async () => {
    process.env.ANALYTICS_HTTP_URL = 'https://custom.example.com';
    process.env.ANALYTICS_HTTP_USAGE_PATH = '/api/usage';

    mockFetchError();

    const adapter = createHttpJsonAdapter();
    expect(await adapter.getUsageMetrics('2026-01-01')).toBeUndefined();
  });
});

// =============================================================================
// Adapter name property
// =============================================================================

describe('Adapter names', () => {
  it('reports correct names', () => {
    expect(createPlausibleAdapter().name).toBe('Plausible');
    expect(createPostHogAdapter().name).toBe('PostHog');
    expect(createVercelAdapter().name).toBe('Vercel');
    expect(createCloudflareAdapter().name).toBe('Cloudflare');
    expect(createSentryAdapter().name).toBe('Sentry');
    expect(createHttpJsonAdapter().name).toBe('HTTP JSON');
  });
});
