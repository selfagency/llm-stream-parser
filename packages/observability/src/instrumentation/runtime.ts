/**
 * Runtime hook instrumentation.
 *
 * Wraps `RuntimeOptions` callbacks (`onTaskStart`, `onTaskComplete`, `onError`)
 * with OpenTelemetry spans so every task execution is automatically traced.
 *
 * @example
 * ```ts
 * import { instrumentRuntime } from '@agentsy/observability/instrumentation';
 *
 * const tracer = createAgentsyTracer('my-service');
 * const hookedOptions = instrumentRuntime(tracer, runtimeOptions, {
 *   serviceName: 'my-service'
 * });
 * ```
 */

import type { RuntimeOptions, RuntimeTask, RuntimeTaskResult } from '@agentsy/shared';

import type { Span, Tracer } from '../core/types.js';

/**
 * Semantic attribute keys for runtime task instrumentation.
 * Follows OTel semantic convention patterns with agent-specific extensions.
 */
export const RuntimeSpanAttributes = {
  TASK_ID: 'task.id',
  TASK_STATUS: 'task.status',
  SESSION_ID: 'session.id',
  EXECUTION_DEPTH: 'execution.depth',
  ERROR_TYPE: 'error.type',
  ERROR_MESSAGE: 'error.message'
} as const;

/** Options for {@link instrumentRuntime}. */
export interface InstrumentRuntimeOptions {
  /** Additional attributes merged into every task span. */
  globalAttributes?: Record<string, string | number | boolean>;
  /** Service name attached to all root spans. */
  serviceName?: string;
  /** Session identifier, if known, attached to all task spans. */
  sessionId?: string;
}

/**
 * Wraps `RuntimeOptions` callbacks so each lifecycle event creates an OTel span.
 *
 * - `onTaskStart` → starts a new span named `runtime.task.{taskId}`
 * - `onTaskComplete` → ends the span, sets status + duration
 * - `onError` → records exception on the active span, sets span error
 *
 * Returns a new `RuntimeOptions` object with instrumented callbacks while
 * calling the original callbacks (if any) as child operations.
 *
 * @param tracer - OpenTelemetry-compatible tracer
 * @param options - Original runtime options
 * @param opts - Instrumentation configuration
 * @returns Wrapped runtime options
 */
export function instrumentRuntime(
  tracer: Tracer,
  options?: RuntimeOptions,
  opts?: InstrumentRuntimeOptions
): RuntimeOptions {
  const taskSpans = new Map<string, Span>();

  return {
    ...options,

    onTaskStart(task: RuntimeTask): void {
      const span = tracer.startSpan(`runtime.task.${task.id}`, {
        attributes: {
          [RuntimeSpanAttributes.TASK_ID]: task.id,
          ...(opts?.sessionId ? { [RuntimeSpanAttributes.SESSION_ID]: opts.sessionId } : {}),
          ...opts?.globalAttributes
        }
      });

      taskSpans.set(task.id, span);

      // Call original callback inside the span context
      try {
        options?.onTaskStart?.(task);
      } catch (err) {
        span.recordException(err);
      }
    },

    onTaskComplete(result: RuntimeTaskResult, task: RuntimeTask): void {
      const span = taskSpans.get(task.id);
      if (span) {
        span.setAttribute(RuntimeSpanAttributes.TASK_STATUS, result.status);
        if (result.error) {
          span.recordException(result.error);
        }
        span.end(result.finishedAt);
        taskSpans.delete(task.id);
      }

      options?.onTaskComplete?.(result, task);
    },

    onError(error: Error, task: RuntimeTask): void {
      // Try to find and end the span for the failed task
      const span = taskSpans.get(task.id);
      if (span) {
        span.setAttribute(RuntimeSpanAttributes.TASK_STATUS, 'failed');
        span.recordException(error);
        span.end();
        taskSpans.delete(task.id);
      } else {
        // Task might have completed without a span; create a standalone error span
        const errorSpan = tracer.startSpan(`runtime.error.${task.id}`, {
          attributes: {
            [RuntimeSpanAttributes.TASK_ID]: task.id,
            [RuntimeSpanAttributes.ERROR_TYPE]: error.name,
            [RuntimeSpanAttributes.ERROR_MESSAGE]: error.message,
            [RuntimeSpanAttributes.TASK_STATUS]: 'failed',
            ...(opts?.sessionId ? { [RuntimeSpanAttributes.SESSION_ID]: opts.sessionId } : {}),
            ...opts?.globalAttributes
          }
        });
        errorSpan.recordException(error);
        errorSpan.end();
      }

      options?.onError?.(error, task);
    }
  };
}
