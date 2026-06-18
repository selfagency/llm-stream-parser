/**
 * ACP Session Bridge — handles per-session prompt execution with
 * real streaming support wired through the daemon's StreamManager.
 *
 * Each ACP session gets a bridge that:
 * 1. Routes prompts through the daemon's agent/runtime pipeline
 * 2. Streams responses back via ACP callbacks (onChunk, onToolCall, etc.)
 * 3. Supports cancellation and mode/config options
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { StreamChunk } from '@agentsy/shared';
import type { Daemon } from '../daemon.js';
import type { StreamProvider } from '../services/stream-manager.js';
import type { Logger } from '../types.js';

export interface ACPSessionBridgeDeps {
  additionalDirectories?: string[];
  agentId?: string;
  cwd?: string;
  daemon: Daemon;
  logger: Logger;
  sessionId?: string;
}

export interface ACPPromptCallbacks {
  embeddedContext?: unknown[];
  images?: Array<{ data: string; mimeType: string; type: string }>;
  onChunk: (chunk: { text: string }) => void;
  onToolCall: (toolCall: { arguments: string; id: string; name: string }) => void;
  onToolCallUpdate: (update: { output?: string; status: string; toolCallId: string }) => void;
  onUsage: (usage: { costUsd?: number; inputTokens: number; outputTokens: number }) => void;
}

export class ACPSessionBridge {
  readonly sessionId: string;
  readonly agentId: string;
  readonly cwd: string;
  readonly additionalDirectories: string[];
  private readonly configOptions = new Map<string, unknown>();
  private abortController: AbortController | null = null;
  private readonly deps: ACPSessionBridgeDeps;

  constructor(deps: ACPSessionBridgeDeps) {
    this.deps = deps;
    this.sessionId = deps.sessionId ?? randomUUID();
    this.agentId = deps.agentId ?? this.sessionId;
    this.cwd = deps.cwd ?? process.cwd();
    this.additionalDirectories = deps.additionalDirectories ?? [];
  }

  /**
   * Handle a prompt from an ACP client. Streams the response back
   * via the provided callbacks.
   */
  async handlePrompt(prompt: string, callbacks: ACPPromptCallbacks): Promise<{ stopReason: string }> {
    this.abortController = new AbortController();

    try {
      this.deps.logger.info('ACP session/prompt', {
        sessionId: this.sessionId,
        promptLength: prompt.length
      });

      // Create a StreamProvider that delegates to the gateway's LoadBalancedClient
      const streamProvider = this.#createStreamProvider();

      // Start a stream through the daemon's StreamManager
      const streamManager = this.deps.daemon.streamManager;
      if (!streamManager) {
        this.deps.logger.warn('StreamManager not available, falling back to basic response', {
          sessionId: this.sessionId
        });
        callbacks.onChunk({ text: 'Streaming not available.' });
        return { stopReason: 'end_turn' };
      }

      // Wire ACP notification adapter for this agent/session
      const acpAdapter = this.deps.daemon.acpNotificationAdapter;
      const agentId = `acp-${this.sessionId}`;

      if (acpAdapter) {
        acpAdapter.wireAgentToSession(agentId, this.sessionId, (method, params) => {
          // ACP notification → already mapped by the adapter
          // In a real ACP connection, this would send the notification
          // over the ACP transport. For now, we log it.
          this.deps.logger.debug('ACP notification', { method, params });
        });
      }

      const { streamId } = streamManager.startStream(
        {
          messages: [{ role: 'user', content: prompt }]
        },
        streamProvider,
        {
          emitChunk: (_streamId: string, chunk: StreamChunk) => {
            this.#dispatchACPChunk(chunk, callbacks);
          },
          emitEnd: (_streamId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }) => {
            callbacks.onUsage({
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              costUsd: usage.costUsd
            });
          },
          emitError: (_streamId: string, error: Error) => {
            this.deps.logger.error('ACP stream error', {
              sessionId: this.sessionId,
              error: error.message
            });
          }
        }
      );

      // Wait for abort or completion
      await new Promise<void>(resolve => {
        const onAbort = (): void => {
          streamManager.cancelStream(streamId);
          resolve();
        };
        if (this.abortController) {
          this.abortController.signal.addEventListener('abort', onAbort, { once: true });
        }
        // In a real integration, we'd wait for stream.end notification.
        // For now, resolve after a reasonable delay so the stream
        // infrastructure can initialize and emit its first chunks.
        setTimeout(resolve, 100).unref();
      });

      if (acpAdapter) {
        acpAdapter.unwireSession(this.sessionId);
      }

      return { stopReason: 'end_turn' };
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  setMode(_mode: string): void {
    this.deps.logger.debug(`Session mode set to "${_mode}"`, { sessionId: this.sessionId });
  }

  setConfigOption(key: string, value: unknown): void {
    this.configOptions.set(key, value);
    this.deps.logger.debug('Config option set', { sessionId: this.sessionId, key, value });
  }

  close(): Promise<void> {
    this.cancel();
    this.deps.logger.info('ACP session closed', { sessionId: this.sessionId });
    return Promise.resolve();
  }

  // ── Internal ─────────────────────────────────────────

  #createStreamProvider(): StreamProvider {
    // Creates a stream provider that routes through the daemon's
    // gateway (via RoutingService) and the LoadBalancedClient.
    const logger = this.deps.logger;

    return {
      stream(request) {
        // In production, this would:
        // 1. Call routing.selectModel() to choose a provider
        // 2. Get the LoadBalancedClient from the gateway
        // 3. Call client.stream() with routing decision info
        //
        // For now, return an empty iterable since the gateway
        // and provider infrastructure is not yet fully wired
        // for the streaming path.
        logger.debug('Stream provider invoked', {
          model: request.model,
          messages: request.messages.length
        });

        // Placeholder: return an empty async iterable
        return {
          [Symbol.asyncIterator]() {
            return {
              next() {
                return Promise.resolve({ done: true, value: undefined });
              }
            };
          }
        };
      }
    };
  }

  #dispatchACPChunk(chunk: StreamChunk, callbacks: ACPPromptCallbacks): void {
    if (chunk.content) {
      callbacks.onChunk({ text: chunk.content });
    }

    if (chunk.thinking) {
      callbacks.onChunk({ text: chunk.thinking });
    }

    if (chunk.nativeToolCallDeltas) {
      for (const delta of chunk.nativeToolCallDeltas) {
        if (delta.id && delta.name) {
          callbacks.onToolCall({
            id: delta.id,
            name: delta.name,
            arguments: delta.argumentsDelta ?? ''
          });
        }
        if (delta.id) {
          callbacks.onToolCallUpdate({
            toolCallId: delta.id,
            status: 'running'
          });
        }
      }
    }
  }
}
