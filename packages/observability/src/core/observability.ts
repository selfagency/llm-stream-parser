/**
 * Observability Engine
 *
 * Main observability engine that orchestrates tracing, metrics, and logging
 */

import type {
  AttributeValue,
  Counter,
  Gauge,
  Histogram,
  MetricOptions,
  ObservabilityEngine,
  ObservabilitySink,
  RedactionPolicy,
  Span
} from '../core/types.js';
import type { LoggerConfig, LogLevel } from './logger.js';
import { LoggerImpl } from './logger.js';
import { MeterImpl } from './meter.js';
import { TracerImpl } from './tracer.js';

/**
 * Configuration for initializing the observability engine
 */
export interface ObservabilityEngineConfig {
  /** Logging configuration */
  logging?: {
    /** Minimum log level to output (INFO, DEBUG, WARN, ERROR) */
    minLevel?: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
    /** Whether to include timestamps in logs */
    includeTimestamp?: boolean;
  };
  /** Metrics configuration */
  metrics?: {
    /** Prometheus endpoint for metrics scraping */
    prometheusEndpoint?: string;
    /** Interval for metrics export in milliseconds */
    interval?: number;
  };
  /** Service name for telemetry (e.g., 'ai-agent-runtime') */
  serviceName: string;
  /** Service version string */
  serviceVersion?: string;
  /** Tracing configuration */
  tracing?: {
    /** Sampling strategy ('always_on', 'never', 'parentBased') */
    sampling?: 'always_on' | 'never' | 'parentBased';
    /** Jaeger endpoint for distributed tracing */
    jaegerEndpoint?: string;
  };
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  DEBUG: 0,
  ERROR: 3,
  INFO: 1,
  WARN: 2
};

export { LOG_LEVEL_MAP };

/**
 * Main observability engine implementation
 * Provides unified entry point for all tracing, metrics, and logging operations
 */
export class ObservabilityEngineImpl implements ObservabilityEngine {
  readonly tracer: TracerImpl;
  readonly meter: MeterImpl;
  readonly logger: LoggerImpl;
  private readonly _sinks: ObservabilitySink[] = [];
  private _redactionPolicy: RedactionPolicy | null = null;
  private _isShutdown = false;

  // fallow-ignore-next-line complexity
  constructor(config: ObservabilityEngineConfig) {
    this.tracer = new TracerImpl();
    this.meter = new MeterImpl();

    const minLevel = LOG_LEVEL_MAP[config.logging?.minLevel?.toUpperCase() ?? ''];
    const loggerConfig: LoggerConfig = {
      includeTimestamp: config.logging?.includeTimestamp ?? true
    };
    if (minLevel !== undefined) {
      loggerConfig.minLevel = minLevel;
    }

    this.logger = new LoggerImpl(loggerConfig);
  }

  setSink(sink: ObservabilitySink): void {
    this._sinks.push(sink);
  }

  setRedactionPolicy(policy: RedactionPolicy): void {
    this._redactionPolicy = policy;
  }

  async shutdown(): Promise<void> {
    if (this._isShutdown) {
      return;
    }
    this._isShutdown = true;

    this.logger.info('Shutting down observability engine...');

    for (const sink of this._sinks) {
      try {
        await sink.flush();
      } catch (error) {
        this.logger.error('Failed to flush sink during shutdown', { error });
      }
    }

    this.logger.info('Observability engine shut down complete');
  }

  getCurrentSpan(): Span | null {
    return this.tracer.getCurrentSpan();
  }

  startSpan(name: string, attributes?: Record<string, AttributeValue>): Span {
    const span = this.tracer.startSpan(name);
    if (attributes) {
      span.setAttributes(attributes);
    }
    return span;
  }

  recordCounter(name: string, value: number, attributes?: Record<string, AttributeValue>): void {
    const counter = this.meter.createCounter(name);
    counter.record(value, attributes);
  }

  recordHistogram(name: string, value: number, attributes?: Record<string, AttributeValue>): void {
    const histogram = this.meter.createHistogram(name);
    histogram.record(value, attributes);
  }

  recordGauge(name: string, value: number, attributes?: Record<string, AttributeValue>): void {
    const gauge = this.meter.createGauge(name);
    gauge.record(value, attributes);
  }

  createCounter(name: string, options?: { description?: string; unit?: string }): Counter {
    const metricOptions: MetricOptions = {};
    if (options?.description) {
      metricOptions.description = options.description;
    }
    if (options?.unit) {
      metricOptions.unit = options.unit;
    }
    return this.meter.createCounter(name, metricOptions);
  }

  createHistogram(name: string, options?: { description?: string; unit?: string }): Histogram {
    const metricOptions: MetricOptions = {};
    if (options?.description) {
      metricOptions.description = options.description;
    }
    if (options?.unit) {
      metricOptions.unit = options.unit;
    }
    return this.meter.createHistogram(name, metricOptions);
  }

  createGauge(name: string, options?: { description?: string; unit?: string }): Gauge {
    const metricOptions: MetricOptions = {};
    if (options?.description) {
      metricOptions.description = options.description;
    }
    if (options?.unit) {
      metricOptions.unit = options.unit;
    }
    return this.meter.createGauge(name, metricOptions);
  }

  applyRedaction(attributes: Record<string, AttributeValue>): Record<string, AttributeValue> {
    if (!this._redactionPolicy) {
      return attributes;
    }

    const result: Record<string, AttributeValue> = {};

    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'string') {
        result[key] = this._redactionPolicy.redact(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item => (this._redactionPolicy ? this._redactionPolicy.redact(item) : item));
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}

export const createObservabilityEngine = (config: ObservabilityEngineConfig): ObservabilityEngine =>
  new ObservabilityEngineImpl(config);

let _defaultEngine: ObservabilityEngineImpl | null = null;

export const getDefaultEngine = (): ObservabilityEngine => {
  _defaultEngine ??= new ObservabilityEngineImpl({
    serviceName: 'agentsy-runtime',
    serviceVersion: '0.0.0'
  });
  return _defaultEngine;
};

// fallow-ignore-next-line complexity
export const createSimpleEngine = (
  name: string,
  options?: {
    serviceName?: string;
    sampling?: 'always_on' | 'never' | 'parentBased';
    jaegerEndpoint?: string;
  }
): ObservabilityEngine => {
  const config: ObservabilityEngineConfig = {
    serviceName: options?.serviceName ?? name,
    serviceVersion: '0.0.0'
  };

  if (options?.sampling || options?.jaegerEndpoint) {
    config.tracing = {};
    if (options.sampling) {
      config.tracing.sampling = options.sampling;
    }
    if (options.jaegerEndpoint) {
      config.tracing.jaegerEndpoint = options.jaegerEndpoint;
    }
  }

  return createObservabilityEngine(config);
};
