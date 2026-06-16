import type { NormalizedChunk } from '@agentsy/shared';

/**
 * Typed runtime events emitted by the stream-to-events adapter.
 *
 * Each event carries a monotonically increasing `chunkIndex` (derived from
 * the position in the chunk stream) and a high-resolution `timestamp` so
 * downstream consumers (TASK-010 runtime turn loop, renderer bridge) can
 * order, coalesce, or replay events without inspecting global clock state.
 */
export type StreamRuntimeEvent =
  | {
      type: 'text-delta';
      chunkIndex: number;
      timestamp: number;
      payload: { delta: string };
    }
  | {
      type: 'thinking-delta';
      chunkIndex: number;
      timestamp: number;
      payload: { delta: string };
    }
  | {
      type: 'tool-call-start';
      chunkIndex: number;
      timestamp: number;
      payload: { id: string; name: string; args: unknown };
    }
  | {
      type: 'tool-call-end';
      chunkIndex: number;
      timestamp: number;
      payload: { id: string; result?: unknown };
    }
  | {
      type: 'error';
      chunkIndex: number;
      timestamp: number;
      payload: { message: string; code?: string };
    }
  | {
      type: 'done';
      chunkIndex: number;
      timestamp: number;
      payload: {
        finishReason?: string;
        usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
      };
    };

/**
 * Callback-style options for {@link createStreamEventAdapter}.
 *
 * Consumers can wire either the catch-all `onEvent` for routing, or the
 * individual semantic callbacks (`onText`, `onThinking`, etc.) for quick
 * access to specific event types. Both can be used simultaneously.
 */
export interface StreamEventAdapterOptions {
  onDone?: (
    finishReason?: string,
    usage?: StreamRuntimeEvent & { type: 'done' } extends never ? never : StreamRuntimeEvent['payload']
  ) => void;
  onError?: (error: Error) => void;
  /** Catch-all: fired for every event. */
  onEvent?: (event: StreamRuntimeEvent) => void;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCallEnd?: (id: string, result?: unknown) => void;
  onToolCallStart?: (id: string, name: string, args: unknown) => void;
}

/** Track running tool call IDs across chunks. */
interface ToolCallCursor {
  argsBuffer: string;
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Per-chunk event emission helpers
// ---------------------------------------------------------------------------

function* emitContentEvent(
  chunk: NormalizedChunk,
  meta: { chunkIndex: number; timestamp: number }
): Generator<StreamRuntimeEvent> {
  if (chunk.content) {
    yield {
      type: 'text-delta',
      chunkIndex: meta.chunkIndex,
      timestamp: meta.timestamp,
      payload: { delta: chunk.content }
    };
  }
}

function* emitThinkingEvent(
  chunk: NormalizedChunk,
  meta: { chunkIndex: number; timestamp: number }
): Generator<StreamRuntimeEvent> {
  if (chunk.thinking) {
    yield {
      type: 'thinking-delta',
      chunkIndex: meta.chunkIndex,
      timestamp: meta.timestamp,
      payload: { delta: chunk.thinking }
    };
  }
}

function* emitNativeToolCallDeltas(
  chunk: NormalizedChunk,
  toolCursors: Map<string, ToolCallCursor>,
  meta: { chunkIndex: number; timestamp: number }
): Generator<StreamRuntimeEvent> {
  if (!chunk.nativeToolCallDeltas) {
    return;
  }
  for (const delta of chunk.nativeToolCallDeltas) {
    const deltaId = delta.id ?? `tc_${meta.chunkIndex}_${delta.index}`;
    const cursor = toolCursors.get(deltaId) ?? {
      id: deltaId,
      name: delta.name ?? 'unknown',
      argsBuffer: ''
    };
    if (delta.name) {
      cursor.name = delta.name;
    }
    if (delta.argumentsDelta) {
      cursor.argsBuffer += delta.argumentsDelta;
    }
    if (!toolCursors.has(deltaId)) {
      toolCursors.set(deltaId, cursor);
      yield {
        type: 'tool-call-start',
        chunkIndex: meta.chunkIndex,
        timestamp: meta.timestamp,
        payload: { id: cursor.id, name: cursor.name, args: cursor.argsBuffer }
      };
    }
  }
}

function* emitToolCallsEvent(
  chunk: NormalizedChunk,
  toolCursors: Map<string, ToolCallCursor>,
  meta: { chunkIndex: number; timestamp: number }
): Generator<StreamRuntimeEvent> {
  if (!chunk.tool_calls) {
    return;
  }
  // Per-function-name counter to disambiguate same-named tool calls
  const nameCounters = new Map<string, number>();
  for (const tc of chunk.tool_calls) {
    const name = tc.function?.name ?? 'unknown';
    const count = nameCounters.get(name) ?? 0;
    nameCounters.set(name, count + 1);
    const id = `${name}_${count}`;
    if (!toolCursors.has(id)) {
      const cursor: ToolCallCursor = {
        id,
        name,
        argsBuffer: ''
      };
      toolCursors.set(id, cursor);
      yield {
        type: 'tool-call-start',
        chunkIndex: meta.chunkIndex,
        timestamp: meta.timestamp,
        payload: {
          id,
          name,
          args: tc.function?.arguments ?? null
        }
      };
    }
  }
}

function* emitDoneEvent(
  chunk: NormalizedChunk,
  toolCursors: Map<string, ToolCallCursor>,
  meta: { chunkIndex: number; timestamp: number }
): Generator<StreamRuntimeEvent> {
  if (!(chunk.done || chunk.finishReason)) {
    return;
  }
  // Emit tool-call-end for any open tool calls
  for (const [toolId] of toolCursors) {
    yield {
      type: 'tool-call-end',
      chunkIndex: meta.chunkIndex,
      timestamp: meta.timestamp,
      payload: { id: toolId }
    };
  }
  yield {
    type: 'done',
    chunkIndex: meta.chunkIndex,
    timestamp: meta.timestamp,
    payload: {
      ...(chunk.finishReason === undefined ? {} : { finishReason: chunk.finishReason }),
      ...(chunk.usage === undefined
        ? {}
        : {
            usage: {
              inputTokens: chunk.usage.inputTokens ?? 0,
              outputTokens: chunk.usage.outputTokens ?? 0,
              totalTokens: (chunk.usage.inputTokens ?? 0) + (chunk.usage.outputTokens ?? 0)
            }
          })
    }
  };
}

// ---------------------------------------------------------------------------
// AsyncGenerator-based adapter
// ---------------------------------------------------------------------------

/**
 * Reads a `ReadableStream<NormalizedChunk>` and yields typed
 * {@link StreamRuntimeEvent} values as they arrive.
 *
 * @example
 * ```ts
 * const response = await client.stream(request);
 * for await (const event of streamToEvents(response)) {
 *   if (event.type === 'text-delta') process.stdout.write(event.payload.delta);
 * }
 * ```
 */
export async function* streamToEvents(stream: ReadableStream<NormalizedChunk>): AsyncGenerator<StreamRuntimeEvent> {
  const reader = stream.getReader();
  let chunkIndex = 0;
  const toolCursors = new Map<string, ToolCallCursor>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const meta = { chunkIndex, timestamp: performance.now() };

      yield* emitContentEvent(value, meta);
      yield* emitThinkingEvent(value, meta);
      yield* emitNativeToolCallDeltas(value, toolCursors, meta);
      yield* emitToolCallsEvent(value, toolCursors, meta);
      yield* emitDoneEvent(value, toolCursors, meta);

      chunkIndex++;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    yield {
      type: 'error',
      chunkIndex,
      timestamp: performance.now(),
      payload: { message }
    };
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Callback-based adapter
// ---------------------------------------------------------------------------

/**
 * Wraps {@link streamToEvents} in a callback-driven interface.
 *
 * Returns `{ start, abort }` so callers can initiate consumption from a
 * promise-based stream (as returned by `UniversalClient.stream()`) and
 * cancel mid-flight.
 *
 * @example
 * ```ts
 * const adapter = createStreamEventAdapter({
 *   onText: (d) => process.stdout.write(d),
 *   onDone: (reason) => console.log('finished:', reason),
 * });
 * await adapter.start(client.stream(request));
 * ```
 */
export function createStreamEventAdapter(options: StreamEventAdapterOptions): {
  start: (streamPromise: Promise<ReadableStream<NormalizedChunk>>) => Promise<void>;
  abort: () => void;
} {
  let abortController: AbortController | undefined;

  async function start(streamPromise: Promise<ReadableStream<NormalizedChunk>>): Promise<void> {
    abortController = new AbortController();
    const signal = abortController.signal;

    try {
      const stream = await streamPromise;

      if (signal.aborted) {
        stream.getReader().releaseLock();
        return;
      }

      for await (const event of streamToEvents(stream)) {
        if (signal.aborted) {
          break;
        }

        options.onEvent?.(event);

        switch (event.type) {
          case 'text-delta':
            options.onText?.(event.payload.delta);
            break;
          case 'thinking-delta':
            options.onThinking?.(event.payload.delta);
            break;
          case 'tool-call-start':
            options.onToolCallStart?.(event.payload.id, event.payload.name, event.payload.args);
            break;
          case 'tool-call-end':
            options.onToolCallEnd?.(event.payload.id, event.payload.result);
            break;
          case 'done':
            options.onDone?.(event.payload.finishReason, event.payload);
            break;
          case 'error':
            options.onError?.(new Error(event.payload.message));
            break;
          default: {
            break;
          }
        }
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      options.onEvent?.({
        type: 'error',
        chunkIndex: -1,
        timestamp: performance.now(),
        payload: { message: error.message }
      });
      options.onError?.(error);
    }
  }

  function abort(): void {
    abortController?.abort();
  }

  return { start, abort };
}
