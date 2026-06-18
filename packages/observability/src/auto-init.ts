/**
 * Auto-init: create an observability engine from environment variables.
 *
 * Three-layer API:
 * 1. `detectLangfuseFromEnv()` — pure detection (in `exporters/langfuse.ts`)
 * 2. `createLangfuseExporterFromEnv()` — constructs exporter or returns null
 * 3. `createObservabilityFromEnv()` — builds engine, attaches sinks
 */

import { createObservabilityEngine, type ObservabilityEngineConfig } from './core/observability.js';
import type { ObservabilityEngine, ObservabilitySink } from './core/types.js';
import { createLangfuseExporterFromEnv, detectLangfuseFromEnv } from './exporters/langfuse.js';

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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-option env detection with fallback chains is inherently complex; refactoring would obscure the linear detection flow
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
    const detection = detectLangfuseFromEnv(env);

    if (detection.enabled) {
      try {
        const langfuseOverrides: Record<string, unknown> = {};
        if (options.langfuse?.endpoint !== undefined) {
          langfuseOverrides.endpoint = options.langfuse.endpoint;
        }
        if (options.langfuse?.publicKey !== undefined) {
          langfuseOverrides.publicKey = options.langfuse.publicKey;
        }
        if (options.langfuse?.secretKey !== undefined) {
          langfuseOverrides.secretKey = options.langfuse.secretKey;
        }
        const projectId = options.langfuse?.projectId ?? detection.projectId;
        if (projectId !== undefined) {
          langfuseOverrides.projectId = projectId;
        }
        const flushIntervalMs = options.langfuse?.flushIntervalMs ?? detection.flushIntervalMs;
        if (flushIntervalMs !== undefined) {
          langfuseOverrides.flushIntervalMs = flushIntervalMs;
        }
        const maxBatchSize = options.langfuse?.maxBatchSize ?? detection.maxBatchSize;
        if (maxBatchSize !== undefined) {
          langfuseOverrides.maxBatchSize = maxBatchSize;
        }

        const exporter = createLangfuseExporterFromEnv(
          Object.keys(langfuseOverrides).length > 0
            ? (langfuseOverrides as {
                endpoint?: string;
                publicKey?: string;
                secretKey?: string;
                projectId?: string;
                flushIntervalMs?: number;
                maxBatchSize?: number;
              })
            : undefined,
          env
        );

        if (exporter) {
          engine.setSink(exporter as unknown as ObservabilitySink);
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
    } else {
      sinks.push({ type: 'langfuse', enabled: false, reason: detection.reason });
      logger?.info(`[observability] langfuse disabled — ${detection.reason}`);
    }
  }

  return { engine, sinks };
}
