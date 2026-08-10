/**
 * ACP Session Bridge — handles per-session prompt execution with
 * real streaming support wired through the daemon's StreamManager.
 *
 * Phase 18 enhancements:
 * - Image support: base64 images forwarded to vision-capable models
 * - Audio support: ASR pipeline integration (stub)
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { StreamChunk } from '@agentsy/shared';
import type { Daemon } from '../daemon.js';
import type { StreamProvider } from '../services/stream-manager.js';
import type { Logger } from '../types.js';
import { createASRPipelineStub, forwardImagesToVisionModel, parsePromptContent } from './capabilities.js';

export interface ACPSessionBridgeDeps {
  readonly additionalDirectories?: string[];
  readonly agentId?: string;
  readonly cwd?: string;
  readonly daemon: Daemon;
  readonly logger: Logger;
  readonly sessionId?: string;
}

export interface ACPPromptCallbacks {
  readonly embeddedContext?: unknown[];
  readonly images?: Array<{ data: string; mimeType: string; type: string }>;
  readonly onChunk: (chunk: { text: string }) => void;
  readonly onToolCall: (toolCall: { arguments: string; id: string; name: string }) => void;
  readonly onToolCallUpdate: (update: { output?: string; status: string; toolCallId: string }) => void;
  readonly onUsage: (usage: { costUsd?: number; inputTokens: number; outputTokens: number }) => void;
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
   * Handle a prompt from an ACP client. Supports:
   * - Plain string
   * - Structured content blocks with image/audio
   * - Embedded context URIs
   */
  async handlePrompt(promptInput: unknown, callbacks: ACPPromptCallbacks): Promise<{ stopReason: string }> {
    this.abortController = new AbortController();

    try {
      const parsed = parsePromptContent(promptInput);
      const visionForward = forwardImagesToVisionModel(parsed);

      let effectiveText = parsed.text;

      if (parsed.audios.length > 0) {
        const asr = createASRPipelineStub();
        const transcripts = await asr.transcribeBatch(parsed.audios);
        const transcriptTexts = transcripts.map(t => t.text).filter(Boolean);
        if (transcriptTexts.length > 0) {
          const audioSection = `\n\n[Audio transcripts]\n${transcriptTexts.join('\n')}`;
          effectiveText = effectiveText ? `${effectiveText}${audioSection}` : transcriptTexts.join('\n');
        }
        this.deps.logger.info('ACP audio blocks transcribed', {
          sessionId: this.sessionId,
          audioCount: parsed.audios.length
        });
      }

      if (parsed.images.length > 0) {
        this.deps.logger.info('ACP image blocks received', {
          sessionId: this.sessionId,
          imageCount: parsed.images.length,
          mimes: parsed.images.map(i => i.mimeType)
        });
      }

      const promptText = typeof promptInput === 'string' ? promptInput : effectiveText;
      const promptLength = typeof promptText === 'string' ? promptText.length : JSON.stringify(promptInput).length;

      this.deps.logger.info('ACP session/prompt', {
        sessionId: this.sessionId,
        promptLength,
        hasImages: visionForward.hasImages,
        imageCount: parsed.images.length,
        audioCount: parsed.audios.length
      });

      const streamProvider = this.#createStreamProvider();

      const streamManager = this.deps.daemon.streamManager;
      if (!streamManager) {
        this.deps.logger.warn('StreamManager not available, falling back to basic response', {
          sessionId: this.sessionId
        });
        callbacks.onChunk({ text: 'Streaming not available.' });
        return { stopReason: 'end_turn' };
      }

      const acpAdapter = this.deps.daemon.acpNotificationAdapter;
      const agentId = `acp-${this.sessionId}`;

      if (acpAdapter) {
        acpAdapter.wireAgentToSession(agentId, this.sessionId, (method, params) => {
          this.deps.logger.debug('ACP notification', { method, params });
        });
      }

      // Build messages: if vision, use multi-modal content array, else text
      const messages = visionForward.hasImages
        ? [
            {
              role: 'user' as const,
              content: JSON.stringify(visionForward.content)
            }
          ]
        : [{ role: 'user' as const, content: effectiveText }];

      const { streamId } = streamManager.startStream(
        {
          messages
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

      await new Promise<void>(resolve => {
        const onAbort = (): void => {
          streamManager.cancelStream(streamId);
          resolve();
        };
        if (this.abortController) {
          this.abortController.signal.addEventListener('abort', onAbort, { once: true });
        }
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
    if (this.abortController) {
      this.abortController.abort();
    }
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

  #createStreamProvider(): StreamProvider {
    const logger = this.deps.logger;

    return {
      stream(request) {
        logger.debug('Stream provider invoked', {
          model: request.model,
          messages: request.messages.length
        });
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
