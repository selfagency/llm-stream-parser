/**
 * Langfuse observability adapter.
 *
 * Langfuse supports the OpenTelemetry Protocol (OTLP) natively, so this adapter
 * extends the standard `OtlpExporter` with Langfuse-specific configuration and
 * metadata conventions.
 *
 * @example
 * ```ts
 * import { LangfuseExporter } from '@agentsy/observability/exporters';
 *
 * const exporter = new LangfuseExporter({
 *   publicKey: process.env.LANGFUSE_PUBLIC_KEY,
 *   secretKey: process.env.LANGFUSE_SECRET_KEY,
 *   projectId: 'my-agent-project'
 * });
 * ```
 */

import { OtlpExporter, type OtlpExporterOptions } from './otlp.js';

/** Options for {@link LangfuseExporter}. */
export interface LangfuseExporterOptions {
  /** Custom Langfuse endpoint (default: 'https://cloud.langfuse.com/api/public/otlp/v1/traces'). */
  endpoint?: string;
  /** Flush interval in milliseconds (default: 5000). */
  flushIntervalMs?: number;
  /** Custom headers merged into every export request. */
  headers?: Record<string, string>;
  /** Maximum batch size before forcing a flush (default: 64). */
  maxBatchSize?: number;
  /** Langfuse project ID or name. */
  projectId?: string;
  /** Langfuse public key (sent as username in Basic auth). */
  publicKey: string;
  /** Langfuse secret key (sent as password in Basic auth). */
  secretKey: string;
}

const DEFAULT_LANGFUSE_ENDPOINT = 'https://cloud.langfuse.com/api/public/otlp/v1/traces';

/**
 * Langfuse-specific exporter.
 *
 * Configures Basic auth from public/secret key pair and sets the
 * default endpoint to Langfuse's OTLP ingestion URL.
 */
export class LangfuseExporter extends OtlpExporter {
  constructor(options: LangfuseExporterOptions) {
    const basicAuth = Buffer.from(`${options.publicKey}:${options.secretKey}`).toString('base64');

    const otlpOptions: OtlpExporterOptions = {
      endpoint: options.endpoint ?? DEFAULT_LANGFUSE_ENDPOINT,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        ...(options.projectId ? { 'X-Langfuse-Project': options.projectId } : {}),
        ...options.headers
      },
      ...(options.maxBatchSize === undefined ? {} : { maxBatchSize: options.maxBatchSize }),
      ...(options.flushIntervalMs === undefined ? {} : { flushIntervalMs: options.flushIntervalMs })
    };

    super(otlpOptions);
  }
}

// ── Env-var detection ──────────────────────────────────

/** Known Langfuse environment variables. */
export const LANGFUSE_ENV_VARS = [
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'LANGFUSE_HOST',
  'LANGFUSE_PROJECT_ID',
  'LANGFUSE_FLUSH_INTERVAL_MS',
  'LANGFUSE_MAX_BATCH_SIZE'
] as const;

/** Result of {@link detectLangfuseFromEnv}. */
export interface LangfuseEnvDetection {
  /** Whether Langfuse is enabled (both keys present and non-empty). */
  enabled: boolean;
  /** Resolved OTLP endpoint. */
  endpoint: string;
  flushIntervalMs?: number | undefined;
  maxBatchSize?: number | undefined;
  /** Parsed optional values. */
  projectId?: string | undefined;
  /** Human-readable reason for the detection result. */
  reason: string;
}

/**
 * Detect Langfuse configuration from environment variables.
 *
 * Langfuse is enabled if and only if both `LANGFUSE_PUBLIC_KEY` and
 * `LANGFUSE_SECRET_KEY` are present and non-empty after trimming.
 *
 * @param env - Optional env object (defaults to `process.env`).
 */
export function detectLangfuseFromEnv(env: Record<string, string | undefined> = process.env): LangfuseEnvDetection {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();

  if (!(publicKey && secretKey)) {
    const missing: string[] = [];
    if (!publicKey) {
      missing.push('LANGFUSE_PUBLIC_KEY');
    }
    if (!secretKey) {
      missing.push('LANGFUSE_SECRET_KEY');
    }
    return {
      enabled: false,
      endpoint: DEFAULT_LANGFUSE_ENDPOINT,
      reason: `Missing ${missing.join(' and/or ')} env vars`,
      projectId: env.LANGFUSE_PROJECT_ID?.trim() || undefined,
      flushIntervalMs: parsePositiveInt(env.LANGFUSE_FLUSH_INTERVAL_MS),
      maxBatchSize: parsePositiveInt(env.LANGFUSE_MAX_BATCH_SIZE)
    };
  }

  const host = env.LANGFUSE_HOST?.trim();
  const endpoint = host ? resolveLangfuseEndpoint(host) : DEFAULT_LANGFUSE_ENDPOINT;

  return {
    enabled: true,
    endpoint,
    reason: `Loaded from LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY; endpoint=${endpoint}`,
    projectId: env.LANGFUSE_PROJECT_ID?.trim() || undefined,
    flushIntervalMs: parsePositiveInt(env.LANGFUSE_FLUSH_INTERVAL_MS),
    maxBatchSize: parsePositiveInt(env.LANGFUSE_MAX_BATCH_SIZE)
  };
}

/**
 * Create a {@link LangfuseExporter} from environment variables.
 *
 * Returns `null` when Langfuse is not configured (missing keys).
 * Honors optional env vars: `LANGFUSE_HOST`, `LANGFUSE_PROJECT_ID`,
 * `LANGFUSE_FLUSH_INTERVAL_MS`, `LANGFUSE_MAX_BATCH_SIZE`.
 *
 * @param options - Optional overrides that take precedence over env vars.
 * @param env - Optional env object (defaults to `process.env`).
 */
export function createLangfuseExporterFromEnv(
  options?: {
    endpoint?: string;
    publicKey?: string;
    secretKey?: string;
    projectId?: string;
    flushIntervalMs?: number;
    maxBatchSize?: number;
  },
  env: Record<string, string | undefined> = process.env
): LangfuseExporter | null {
  const detection = detectLangfuseFromEnv(env);
  if (!detection.enabled) {
    return null;
  }

  // Overrides take precedence over env vars
  const publicKey = options?.publicKey ?? env.LANGFUSE_PUBLIC_KEY?.trim() ?? '';
  const secretKey = options?.secretKey ?? env.LANGFUSE_SECRET_KEY?.trim() ?? '';
  const endpoint = options?.endpoint ?? detection.endpoint;
  const projectId = options?.projectId ?? detection.projectId;
  const flushIntervalMs = options?.flushIntervalMs ?? detection.flushIntervalMs;
  const maxBatchSize = options?.maxBatchSize ?? detection.maxBatchSize;

  return new LangfuseExporter({
    publicKey,
    secretKey,
    endpoint,
    ...(projectId ? { projectId } : {}),
    ...(flushIntervalMs === undefined ? {} : { flushIntervalMs }),
    ...(maxBatchSize === undefined ? {} : { maxBatchSize })
  });
}

// ── Helpers ─────────────────────────────────────────────

/**
 * Resolve a Langfuse host URL to the OTLP traces endpoint.
 * Handles trailing slashes and existing OTLP path segments.
 */
function resolveLangfuseEndpoint(host: string): string {
  const base = host.replace(/\/+$/, '');
  if (base.endsWith('/api/public/otlp/v1/traces')) {
    return base;
  }
  if (base.endsWith('/api/public/otlp/v1')) {
    return `${base}/traces`;
  }
  if (base.endsWith('/api/public')) {
    return `${base}/otlp/v1/traces`;
  }
  if (base.endsWith('/api')) {
    return `${base}/public/otlp/v1/traces`;
  }
  return `${base}/api/public/otlp/v1/traces`;
}

/**
 * Parse a positive integer from a string, returning undefined on invalid input.
 */
function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return;
  }
  return n;
}
