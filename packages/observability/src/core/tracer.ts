/**
 * Tracer Implementation
 *
 * OpenTelemetry-based tracer implementation for distributed tracing
 */

import {
  type Attributes,
  type Context,
  context,
  type Span as OtelSpan,
  type SpanOptions as OtelSpanOptions,
  ROOT_CONTEXT,
  trace
} from '@opentelemetry/api';

import type { AttributeValue, Span, SpanEvent, SpanOptions, Tracer } from '../core/types.js';

/**
 * Internal span implementation
 */
export class InternalSpan implements Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentId?: string;
  readonly name: string;

  private readonly _attributes: Record<string, AttributeValue> = {};
  private _status: 'ok' | 'error' = 'ok';
  private readonly _events: SpanEvent[] = [];
  private readonly _startTime: number;
  private _endTime?: number;
  private readonly _otelSpan: OtelSpan;
  private readonly _context: Context;
  private readonly _children: InternalSpan[] = [];
  readonly _isRoot: boolean;
  readonly _contextKey: string;

  // fallow-ignore-next-line complexity
  constructor(name: string, options?: SpanOptions, parent?: InternalSpan, contextKey?: string) {
    this.name = name;
    this._startTime = options?.startTime ?? Date.now();
    if (parent) {
      parent._children.push(this);
    }
    this._isRoot = !parent;
    this._contextKey = contextKey ?? crypto.randomUUID();

    const parentContext = parent?._context;
    const otelTracer = trace.getTracer('agentsy');

    const startSpanOptions: OtelSpanOptions = {};
    if (options?.attributes) {
      startSpanOptions.attributes = this._otelAttributesToAttributes(options.attributes);
    }
    if (options?.startTime) {
      startSpanOptions.startTime = options.startTime;
    }

    this._otelSpan = otelTracer.startSpan(name, startSpanOptions, parentContext);

    this._context = trace.setSpan(parentContext ?? ROOT_CONTEXT, this._otelSpan);

    const otelSpanContext = this._otelSpan.spanContext();
    this.traceId = otelSpanContext.traceId;
    this.spanId = otelSpanContext.spanId;
    if (parent?.spanId) {
      this.parentId = parent.spanId;
    }

    if (options?.attributes) {
      this._attributes = { ...options.attributes };
    }
  }

  get attributes(): Record<string, AttributeValue> {
    return { ...this._attributes };
  }

  get status(): 'ok' | 'error' {
    return this._status;
  }

  get events(): SpanEvent[] {
    return [...this._events];
  }

  get startTime(): number {
    return this._startTime;
  }

  get endTime(): number | undefined {
    return this._endTime;
  }

  get duration(): number | undefined {
    return this._endTime ? this._endTime - this._startTime : undefined;
  }

  setAttribute(key: string, value: AttributeValue): void {
    this._attributes[key] = value;
    this._otelSpan.setAttribute(key, value);

    if (key === 'error.type' || key === 'error.message') {
      this._status = 'error';
    }
  }

  setAttributes(attributes: Record<string, AttributeValue>): void {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }
  }

  recordException(exception: unknown, attributes?: Record<string, AttributeValue>): void {
    this._status = 'error';

    const errorInfo = this._extractErrorInfo(exception);
    const timestamp = Date.now();

    if (exception instanceof Error || typeof exception === 'string') {
      this._otelSpan.recordException(exception);
    } else {
      this._otelSpan.recordException(new Error(String(exception)));
    }

    this._events.push({
      attributes: {
        ...errorInfo,
        ...attributes
      },
      name: 'exception',
      timestamp
    });
  }

  addEvent(name: string, attributes?: Record<string, AttributeValue>): void {
    if (attributes) {
      this._otelSpan.addEvent(name, attributes);
    } else {
      this._otelSpan.addEvent(name);
    }

    this._events.push({
      attributes: attributes ?? {},
      name,
      timestamp: Date.now()
    });
  }

  // fallow-ignore-next-line complexity
  end(endTime?: number): void {
    if (this._endTime !== undefined) {
      return;
    }

    this._endTime = endTime ?? Date.now();
    this._otelSpan.end(this._endTime);

    for (const child of this._children) {
      if (child._endTime === undefined) {
        child.end(this._endTime);
      }
    }
  }

  startChild(name: string, options?: SpanOptions): Span {
    return new InternalSpan(name, options, this);
  }

  private _otelAttributesToAttributes(attributes: Record<string, AttributeValue>): Attributes {
    return attributes;
  }

  // fallow-ignore-next-line complexity
  private _extractErrorInfo(exception: unknown): Record<string, string> {
    if (exception instanceof Error) {
      return {
        'error.message': exception.message,
        'error.stack': exception.stack ?? '(no stack trace)',
        'error.type': exception.constructor.name
      };
    }
    if (typeof exception === 'string') {
      return {
        'error.message': exception,
        'error.type': 'stringError'
      };
    }
    if (exception !== null && typeof exception === 'object') {
      const info: Record<string, string> = { 'error.type': exception.constructor.name };

      if ('message' in exception && typeof exception.message === 'string') {
        info['error.message'] = exception.message;
      }
      if ('stack' in exception && typeof exception.stack === 'string') {
        info['error.stack'] = exception.stack;
      }
      return info;
    }

    return {
      'error.message': String(exception),
      'error.type': 'unknown'
    };
  }
}

/**
 * Tracer implementation wrapping OpenTelemetry tracer
 */
export class TracerImpl implements Tracer {
  private readonly _currentTimeContextId: string = 'default';

  startSpan(name: string, options?: SpanOptions): Span {
    const currentSpan = trace.getSpan(context.active());
    const parentImpl = currentSpan instanceof InternalSpan ? currentSpan : undefined;

    return new InternalSpan(name, options, parentImpl, this._currentTimeContextId);
  }

  getCurrentSpan(): Span | null {
    const currentSpan = trace.getSpan(context.active());
    if (currentSpan instanceof InternalSpan) {
      return currentSpan;
    }
    return null;
  }
}
