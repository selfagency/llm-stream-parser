/**
 * OTLP exporter for production observability backends.
 *
 * Sends spans and metrics via the OpenTelemetry Protocol (OTLP) over HTTP,
 * compatible with Langfuse, Honeycomb, Datadog, Grafana Tempo, and any
 * OTLP-compatible backend.
 *
 * @example
 * ```ts
 * import { OtlpExporter } from '@agentsy/observability/exporters';
 *
 * const exporter = new OtlpExporter({
 *   endpoint: 'https://api.honeycomb.io/v1/traces',
 *   apiKey: process.env.HONEYCOMB_API_KEY
 * });
 * ```
 */

import type { MetricData, ObservabilitySink, SpanData } from '../core/types.js';

/** Options for {@link OtlpExporter}. */
export interface OtlpExporterOptions {
  /** Optional API key or authorization header value. */
  apiKey?: string;
  /** OTLP HTTP endpoint (e.g. 'https://api.honeycomb.io/v1/traces'). */
  endpoint: string;
  /** Flush interval in milliseconds (default: 5000). */
  flushIntervalMs?: number;
  /** Custom headers merged into every export request. */
  headers?: Record<string, string>;
  /** Maximum batch size before forcing a flush (default: 64). */
  maxBatchSize?: number;
}

/** Internal buffer entry for batched export. */
interface BufferEntry {
  data: SpanData | MetricData;
  type: 'span' | 'metric';
}

/**
 * OTLP-compatible exporter that batches spans and metrics and sends them
 * via HTTP POST to a configurable endpoint.
 *
 * Batching reduces network overhead: entries are queued until either
 * `maxBatchSize` is reached or `flushIntervalMs` elapses.
 */
export class OtlpExporter implements ObservabilitySink {
  readonly type = 'otlp';
  readonly enabled = true;

  private readonly _endpoint: string;
  private readonly _headers: Record<string, string>;
  private readonly _maxBatchSize: number;
  private readonly _buffer: BufferEntry[] = [];
  private _flushTimer: ReturnType<typeof setInterval> | null = null;
  private _shutdown = false;

  constructor(options: OtlpExporterOptions) {
    this._endpoint = options.endpoint;
    this._maxBatchSize = options.maxBatchSize ?? 64;
    this._headers = {
      'Content-Type': 'application/json',
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      ...options.headers
    };

    const interval = options.flushIntervalMs ?? 5000;
    if (interval > 0) {
      this._flushTimer = setInterval(() => {
        this.flush().catch(() => {
          // Periodic flush errors are handled internally
        });
      }, interval);
      this._flushTimer.unref();
    }
  }

  export(span: SpanData): Promise<void> | void {
    if (this._shutdown) {
      return;
    }

    this._buffer.push({ data: span, type: 'span' });

    if (this._buffer.length >= this._maxBatchSize) {
      this.flush().catch(() => {
        // Batch flush errors are handled internally
      });
    }
  }

  exportMetric(metric: MetricData): Promise<void> | void {
    if (this._shutdown) {
      return;
    }

    this._buffer.push({ data: metric, type: 'metric' });

    if (this._buffer.length >= this._maxBatchSize) {
      this.flush().catch(() => {
        // Batch flush errors are handled internally
      });
    }
  }

  // fallow-ignore-next-line complexity — buffer flush with shutdown guard and batch slice
  async flush(): Promise<void> {
    if (this._buffer.length === 0 || this._shutdown) {
      return;
    }

    const batch = this._buffer.splice(0, this._maxBatchSize);
    const payload = {
      resourceSpans: batch.filter(e => e.type === 'span').map(e => this._spanToOtlp(e.data as SpanData)),
      resourceMetrics: batch.filter(e => e.type === 'metric').map(e => this._metricToOtlp(e.data as MetricData))
    };

    try {
      const response = await fetch(this._endpoint, {
        body: JSON.stringify(payload),
        headers: this._headers,
        method: 'POST'
      });

      if (!response.ok) {
        console.warn(`[observability] OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.warn('[observability] OTLP export error:', err instanceof Error ? err.message : err);
    }
  }

  async shutdown(): Promise<void> {
    this._shutdown = true;
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    await this.flush();
  }

  private _spanToOtlp(span: SpanData): Record<string, unknown> {
    return {
      name: span.name,
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentId,
      startTimeUnixNano: (span.startTime * 1_000_000).toString(),
      endTimeUnixNano: ((span.endTime ?? Date.now()) * 1_000_000).toString(),
      status: span.status === 'error' ? { code: 2, message: 'error' } : { code: 1 },
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: { stringValue: String(value) }
      })),
      events: span.events.map(e => ({
        name: e.name,
        timeUnixNano: (e.timestamp * 1_000_000).toString(),
        attributes: Object.entries(e.attributes).map(([key, value]) => ({
          key,
          value: { stringValue: String(value) }
        }))
      }))
    };
  }

  private _metricToOtlp(metric: MetricData): Record<string, unknown> {
    let metricKind: string;
    if (metric.type === 'counter') {
      metricKind = 'sum';
    } else if (metric.type === 'histogram') {
      metricKind = 'histogram';
    } else {
      metricKind = 'gauge';
    }

    return {
      name: metric.name,
      description: '',
      unit: metric.unit ?? '',
      [metricKind]: {
        dataPoints: [
          {
            startTimeUnixNano: '0',
            timeUnixNano: (metric.timestamp * 1_000_000).toString(),
            asDouble: metric.value,
            attributes: Object.entries(metric.attributes).map(([key, value]) => ({
              key,
              value: { stringValue: String(value) }
            }))
          }
        ]
      }
    };
  }
}
