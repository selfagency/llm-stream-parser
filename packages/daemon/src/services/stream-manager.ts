/**
 * StreamManager — daemon service that owns all LLM provider connections.
 *
 * Clients request streams via IPC; the manager pipes events back as
 * JSON-RPC notifications (`stream.chunk`, `stream.end`, `stream.error`).
 * For ACP clients, the same events map to `session/update` notifications.
 *
 * Wraps each provider stream with:
 * - `wrapSSE` idle timeout (competitive gap #12 from opencode)
 * - `StreamingSecretsFilter` cross-chunk secret masking (from agent-zero)
 * - `failUnsettledTools` on stream error (Phase 3 integration)
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { StreamChunk } from '@agentsy/shared';
import type { IPCServer } from '../ipc/server.js';
import type { StreamingSecretsFilter } from '../streaming/secrets-filter.js';
import type { Logger } from '../types.js';
import type { RoutingService } from './routing-service.js';

// ── Types ──────────────────────────────────────────────

export interface StreamManagerDeps {
  /** Factory to create a filter for each new stream (or a singleton). */
  filterFactory?: () => StreamingSecretsFilter;
  /** Idle timeout in ms. Defaults to 30_000. */
  idleTimeoutMs?: number;
  ipc: IPCServer;
  logger: Logger;
  routing: RoutingService;
  /** Whether to mask secrets in streaming output. Defaults to true. */
  secretsFilterEnabled?: boolean;
}

export interface StreamRequest {
  /** The conversation messages. */
  messages: Array<{ role: string; content: string }>;
  /** Optional provider model override. */
  model?: string;
  /** Routing hints passed to the gateway. */
  routing?: Record<string, unknown>;
  /** Optional system prompt. */
  system?: string;
}

export interface PendingToolCall {
  arguments: string;
  id: string;
  name: string;
  startedAt: number;
}

export interface ActiveStream {
  abortController: AbortController;
  chunkIndex: number;
  id: string;
  pendingToolCalls: Map<string, PendingToolCall>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export interface StreamProvider {
  /**
   * Execute a streaming completion and return an async iterable of chunks.
   * The daemon wires this to the gateway's `LoadBalancedClient.stream()`
   * which handles retry/failover internally.
   */
  stream(request: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamChunk>;
}

// ── ACP Bridge Interface ───────────────────────────────

export interface ACPStreamBridge {
  emitChunk?(streamId: string, chunk: StreamChunk): void;
  emitEnd?(streamId: string, usage: ActiveStream['usage']): void;
  emitError?(streamId: string, error: Error): void;
}

// Helper: serialize errors for IPC transmission
function serializeError(error: unknown): { code: number; message: string; recoverable: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  return { code: -32_000, message, recoverable: false };
}

// Helper: emit unsettled tool call failure events (mirrors
// `failUnsettledTools` from `@agentsy/runtime` but adapted for
// IPC notification format).
function failUnsettledTools(
  pendingToolCalls: Map<string, PendingToolCall>,
  error: unknown,
  emit: (chunk: Record<string, unknown>) => void
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (pendingToolCalls.size > 0) {
    console.error(`[failUnsettledTools] Failing ${pendingToolCalls.size} pending tool call(s): ${errorMessage}`);
  }
  for (const [toolCallId, _pending] of pendingToolCalls) {
    emit({
      type: 'tool_call_end',
      toolCallId,
      status: 'output-error',
      output: `Provider stream error: ${errorMessage}`
    });
    pendingToolCalls.delete(toolCallId);
  }
}

// ── StreamManager ──────────────────────────────────────

export class StreamManager {
  readonly name = 'stream';
  #state: 'stopped' | 'running' = 'stopped';
  readonly #deps: StreamManagerDeps;
  readonly #activeStreams = new Map<string, ActiveStream>();

  constructor(deps: StreamManagerDeps) {
    this.#deps = deps;
  }

  // ── Lifecycle ────────────────────────────────────────

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async start(): Promise<void> {
    this.#state = 'running';
    this.#deps.logger.info('StreamManager started');
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return
  async stop(): Promise<void> {
    this.#state = 'stopped';
    for (const [id, stream] of this.#activeStreams) {
      stream.abortController.abort('StreamManager stopping');
      this.#activeStreams.delete(id);
    }
    this.#deps.logger.info('StreamManager stopped');
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return
  async sleep(): Promise<void> {
    this.#state = 'stopped';
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return
  async wakeup(): Promise<void> {
    this.#state = 'running';
  }

  get state(): string {
    return this.#state;
  }

  // ── Stream Management ────────────────────────────────

  /**
   * Start a new stream. Returns the stream ID synchronously; the stream
   * runs in the background and emits events via IPC notifications.
   */
  startStream(
    request: StreamRequest,
    streamProvider: StreamProvider,
    acpBridge?: ACPStreamBridge
  ): { streamId: string } {
    const streamId = `s-${randomUUID()}`;

    const stream: ActiveStream = {
      id: streamId,
      chunkIndex: 0,
      abortController: new AbortController(),
      pendingToolCalls: new Map<string, PendingToolCall>(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
    };

    this.#activeStreams.set(streamId, stream);

    // Kick off the stream in the background — emits notifications as chunks arrive
    this.#pipeStream(stream, request, streamProvider, acpBridge).catch((err: unknown) => {
      this.#handleStreamError(stream, err, acpBridge);
    });

    return { streamId };
  }

  /**
   * Cancel a running stream.
   */
  cancelStream(streamId: string): boolean {
    const stream = this.#activeStreams.get(streamId);
    if (!stream) {
      return false;
    }
    stream.abortController.abort('Client cancelled');
    this.#activeStreams.delete(streamId);
    return true;
  }

  /**
   * Get the number of active streams.
   */
  count(): number {
    return this.#activeStreams.size;
  }

  // ── Internal: stream pipeline ───────────────────────

  #secretsFilterEnabled(): boolean {
    return this.#deps.secretsFilterEnabled !== false;
  }

  async #pipeStream(
    stream: ActiveStream,
    request: StreamRequest,
    streamProvider: StreamProvider,
    acpBridge?: ACPStreamBridge
  ): Promise<void> {
    const { idleTimeoutMs = 30_000 } = this.#deps;

    const filter = this.#secretsFilterEnabled() ? (this.#deps.filterFactory?.() ?? undefined) : undefined;

    try {
      const { wrapSSE } = await import('../streaming/wrap-sse.js');

      const chunkIterable = streamProvider.stream({
        model: request.model ?? 'default',
        messages: request.messages,
        signal: stream.abortController.signal
      });

      const wrapped = wrapSSE(chunkIterable, {
        idleTimeout: idleTimeoutMs,
        signal: stream.abortController.signal
      });

      for await (const chunk of wrapped) {
        // Streaming secret masking
        const masked = this.#applyFilter(chunk, filter);

        this.#trackToolCalls(stream, masked);

        // Emit to IPC clients
        this.#emitChunk(stream, masked, acpBridge);
      }

      // Emit stream end
      this.#emitEnd(stream, acpBridge);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Idle timeout') {
        this.#deps.logger.warn('Stream idle timeout', { streamId: stream.id });
      }
      throw err; // re-throw for handleStreamError
    } finally {
      this.#activeStreams.delete(stream.id);
    }
  }

  #applyFilter(chunk: StreamChunk, filter: StreamingSecretsFilter | undefined): StreamChunk {
    if (filter && chunk.content) {
      const masked = filter.feed(chunk.content);
      if (masked === null) {
        return { ...chunk, content: undefined };
      }
      return { ...chunk, content: masked };
    }
    return chunk;
  }

  #trackToolCalls(stream: ActiveStream, chunk: StreamChunk): void {
    if (chunk.nativeToolCallDeltas) {
      for (const delta of chunk.nativeToolCallDeltas) {
        if (delta.id && delta.name) {
          stream.pendingToolCalls.set(delta.id, {
            id: delta.id,
            name: delta.name,
            arguments: delta.argumentsDelta ?? '',
            startedAt: Date.now()
          });
        }
      }
    }
  }

  #emitChunk(stream: ActiveStream, chunk: StreamChunk, acpBridge?: ACPStreamBridge): void {
    const hasContent =
      chunk.content !== undefined ||
      chunk.thinking !== undefined ||
      chunk.nativeToolCallDeltas !== undefined ||
      chunk.done === true;
    if (!hasContent) {
      return;
    }

    const index = stream.chunkIndex++;

    // Update usage tracking
    if (chunk.usage) {
      stream.usage.inputTokens += chunk.usage.inputTokens ?? 0;
      stream.usage.outputTokens += chunk.usage.outputTokens ?? 0;
      // costUsd is an estimate per chunk — accumulated at stream.end
    }

    if (chunk.stepUsage) {
      stream.usage.inputTokens += chunk.stepUsage.inputTokens ?? 0;
      stream.usage.outputTokens += chunk.stepUsage.outputTokens ?? 0;
    }

    // IPC notification — broadcast to all connected clients
    this.#deps.ipc.broadcast('stream.chunk', {
      streamId: stream.id,
      chunk: chunk as unknown as Record<string, unknown>,
      index
    });

    // ACP bridge
    acpBridge?.emitChunk?.(stream.id, chunk);
  }

  #emitEnd(stream: ActiveStream, acpBridge?: ACPStreamBridge): void {
    const { usage } = stream;

    this.#deps.ipc.broadcast('stream.end', {
      streamId: stream.id,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd
      },
      totalChunks: stream.chunkIndex
    });

    acpBridge?.emitEnd?.(stream.id, usage);
  }

  #handleStreamError(stream: ActiveStream, error: unknown, acpBridge?: ACPStreamBridge): void {
    // failUnsettledTools — emit failed updates for orphaned tool calls
    failUnsettledTools(stream.pendingToolCalls, error, (chunk: Record<string, unknown>) => {
      this.#deps.ipc.broadcast('stream.chunk', {
        streamId: stream.id,
        chunk,
        index: stream.chunkIndex++
      });
    });

    const serialized = serializeError(error);
    this.#deps.ipc.broadcast('stream.error', {
      streamId: stream.id,
      error: serialized
    });

    if (error instanceof Error) {
      acpBridge?.emitError?.(stream.id, error);
    }

    this.#deps.logger.error('Stream error', { streamId: stream.id, error: serialized.message });
  }
}
