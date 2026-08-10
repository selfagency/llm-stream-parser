/**
 * Analytics adapters module — uniform interface for querying
 * third-party analytics/observability platforms.
 *
 * Each adapter is opt-in: it returns `undefined` / `[]` when the
 * required environment variables are not configured.
 */

export { createCloudflareAdapter } from './cloudflare.js';
export { createHttpJsonAdapter } from './http-json.js';
export { createPlausibleAdapter } from './plausible.js';
export { createPostHogAdapter } from './posthog.js';
export { createSentryAdapter } from './sentry.js';
export type {
  DeployedAppAnalyticsAdapter,
  DeployedAppErrorMetrics,
  DeployedAppUsageMetrics,
  DeploymentEvent,
  MetricPeriod
} from './types.js';
export { createVercelAdapter } from './vercel.js';
