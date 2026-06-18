/**
 * Auto-init: create an observability engine from environment variables.
 *
 * Three-layer API:
 * 1. `detectLangfuseFromEnv()` — pure detection (in `exporters/langfuse.ts`)
 * 2. `createLangfuseExporterFromEnv()` — constructs exporter or returns null
 * 3. `createObservabilityFromEnv()` — builds engine, attaches sinks
 */

import { createObservabilityEngine, type ObservabilityEngineConfig } from './core/observability.js';
import type { ObservabilityEngine } from './core/types.js';
import {
  createLangfuseExporterFromEnv,
  detectLangfuseFromEnv,
  type LangfuseEnvDetection
} from './exporters/langfuse.js';

/** Options for {@link createObservabilityFromEnv}. */
export interface AutoInitOptions {
  /** Optional env object (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Override env vars for Langfuse config. */
  langfuse?:
    | {
        endpoint?: string | undefined;
        publicKey?: string | undefined;
        secretKey?: string | undefined;
        projectId?: string | undefined;
        flushIntervalMs?: number | undefined;
        maxBatchSize?: number | undefined;
      }
    | undefined;
  /** Whether Langfuse auto-detection is enabled (default: true). */
  langfuseEnabled?: boolean | undefined;
  /** Service name for telemetry (default: 'agentsy-daemon'). */
  serviceName?: string | undefined;
  /** Service version string (default: '0.0.0'). */
  serviceVersion?: string | undefined;
}

/** Result of {@link createObservabilityFromEnv}. */
export interface AutoInitResult {
  /** The observability engine. */
  engine: ObservabilityEngine;
  /** Attached sinks with their enabled/disabled status. */
  sinks: Array<{ type: string; enabled: boolean; reason: string }>;
}

/**
 * Create an observability engine from environment variables.
 *
 * Detects Langfuse configuration from env vars and wires a Langfuse exporter
 * as a sink when configured. Returns an engine with a disabled sink when env
 * vars are absent.
 *
 * @param options - Auto-init options.
 * @param logger - Optional logger for startup messages.
 */
export function createObservabilityFromEnv(
  options: AutoInitOptions = {},
  logger?: { info: (msg: string) => void; warn: (msg: string) => void }
): AutoInitResult {
  const serviceName = options.serviceName ?? 'agentsy-daemon';
  const serviceVersion = options.serviceVersion ?? '0.0.0';
  const env = options.env ?? process.env;
  const sinks: AutoInitResult['sinks'] = [];

  const engineConfig: ObservabilityEngineConfig = {
    serviceName,
    serviceVersion
  };

  const engine = createObservabilityEngine(engineConfig);

  // Langfuse sink
  if (options.langfuseEnabled === false) {
    sinks.push({ type: 'langfuse', enabled: false, reason: 'Disabled by config (langfuseEnabled = false)' });
    logger?.info('[observability] langfuse disabled — Disabled by config (langfuseEnabled = false)');
  } else {
    tryAttachLangfuseSink(engine, sinks, options, env, logger);
  }

  return { engine, sinks };
}

/**
 * Build the Langfuse override object from options and detection.
 */
function buildLangfuseOverrides(
  options: AutoInitOptions,
  detection: LangfuseEnvDetection
): Record<string, unknown> | undefined {
  const overrides: Record<string, unknown> = {};
  const lf = options.langfuse;

  // Direct override fields (passed straight through)
  if (lf?.endpoint !== undefined) overrides.endpoint = lf.endpoint;
  if (lf?.publicKey !== undefined) overrides.publicKey = lf.publicKey;
  if (lf?.secretKey !== undefined) overrides.secretKey = lf.secretKey;

  // Fallback fields (option ?? detection)
  const fallbackFields: Array<[string, string | undefined, string | number | undefined]> = [
    ['projectId', lf?.projectId, detection.projectId],
    ['flushIntervalMs', lf?.flushIntervalMs, detection.flushIntervalMs],
    ['maxBatchSize', lf?.maxBatchSize, detection.maxBatchSize]
  ];

  for (const [key, optVal, detVal] of fallbackFields) {
    const val = optVal ?? detVal;
    if (val !== undefined) {
      overrides[key] = val;
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Try to attach a Langfuse sink to the engine.
 */
function tryAttachLangfuseSink(
  engine: ObservabilityEngine,
  sinks: AutoInitResult['sinks'],
  options: AutoInitOptions,
  env: Record<string, string | undefined>,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void }
): void {
  const detection = detectLangfuseFromEnv(env);

  if (!detection.enabled) {
    sinks.push({ type: 'langfuse', enabled: false, reason: detection.reason });
    logger?.info(`[observability] langfuse disabled — ${detection.reason}`);
    return;
  }

  try {
    const overrides = buildLangfuseOverrides(options, detection);
    const exporter = createLangfuseExporterFromEnv(overrides, env);

    if (exporter) {
      engine.setSink(exporter);
      sinks.push({ type: 'langfuse', enabled: true, reason: detection.reason });
      logger?.info(`[observability] langfuse enabled — ${detection.reason}`);
    } else {
      sinks.push({ type: 'langfuse', enabled: false, reason: 'Exporter construction returned null' });
      logger?.warn('[observability] langfuse exporter construction returned null');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sinks.push({ type: 'langfuse', enabled: false, reason: `Exporter construction failed: ${msg}` });
    logger?.warn(`[observability] langfuse exporter construction failed: ${msg}`);
  }
}
