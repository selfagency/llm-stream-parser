/**
 * Console exporter for local development.
 *
 * Outputs spans and metrics as formatted JSON to stdout, with colour-coded
 * log lines for human readability. Designed for `--debug` mode in the CLI.
 *
 * @example
 * ```ts
 * import { createAgentsyTracer } from '@agentsy/observability';
 * import { ConsoleExporter } from '@agentsy/observability/exporters';
 *
 * const exporter = new ConsoleExporter({ pretty: true });
 * exporter.export(mySpanData);
 * ```
 */

import type { MetricData, ObservabilitySink, SpanData } from '../core/types.js';

/** Options for {@link ConsoleExporter}. */
export interface ConsoleExporterOptions {
  /** Prefix for all output lines. */
  prefix?: string;
  /** When true, outputs human-readable lines. When false, compact JSON. Default: true. */
  pretty?: boolean;
  /** Writes to a specific stream (default: stdout via console.log). */
  write?: (line: string) => void;
}

const PREFIX = '[observability]';

/**
 * A sink that writes span and metric data to the console.
 *
 * Spans are rendered as formatted blocks with colour-coded status.
 * Metrics are rendered as single-line key=value pairs.
 */
export class ConsoleExporter implements ObservabilitySink {
  readonly type = 'console';
  readonly enabled = true;

  private readonly _pretty: boolean;
  private readonly _write: (line: string) => void;
  private readonly _prefix: string;

  // fallow-ignore-next-line complexity
  constructor(options?: ConsoleExporterOptions) {
    this._pretty = options?.pretty ?? true;
    this._write = options?.write ?? ((line: string) => console.log(line));
    this._prefix = options?.prefix ?? PREFIX;
  }

  // fallow-ignore-next-line complexity
  export(span: SpanData): Promise<void> | void {
    if (this._pretty) {
      this._write(
        `${this._prefix} span  ${span.name}  [${span.status}]  ${span.duration?.toFixed(0) ?? '?'}ms` +
          `  trace=${span.traceId.slice(0, 8)} span=${span.spanId.slice(0, 8)}`
      );

      // Print attributes indented
      const attrKeys = Object.keys(span.attributes);
      if (attrKeys.length > 0) {
        for (const key of attrKeys) {
          // nosemgrep: typescript.lang.security.detect-object-injection.detect-object-injection — iterating own keys of span.attributes
          this._write(`  ${this._prefix} attr  ${key}=${String(span.attributes[key])}`);
        }
      }

      // Print events
      for (const event of span.events) {
        this._write(`  ${this._prefix} event ${event.name}`);
      }
    } else {
      this._write(JSON.stringify({ recordType: 'span', ...span }));
    }
  }

  exportMetric(metric: MetricData): Promise<void> | void {
    if (this._pretty) {
      const attrs = Object.entries(metric.attributes)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' ');
      this._write(`${this._prefix} metric ${metric.name}  ${metric.value}  ${metric.unit ?? ''}  ${attrs}`);
    } else {
      this._write(JSON.stringify({ recordType: 'metric', ...metric }));
    }
  }

  async flush(): Promise<void> {
    // Console is synchronous; no-op.
  }

  async shutdown(): Promise<void> {
    // Console is synchronous; no-op.
  }
}
