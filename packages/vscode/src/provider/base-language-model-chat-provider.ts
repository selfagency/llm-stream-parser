import { errorCodeToMessage, errorToProviderCode } from '../error-handling/error-mapper.js';
import type { ChatMessage } from '../message-conversion/index.js';
import { convertMessages } from '../message-conversion/index.js';
import type { ProviderApiRequest, ProviderConfig, ProviderStreamChunk } from '../types/errors.js';

/**
 * Empty async generator for error responses.
 */
async function* emptyStream(): AsyncIterable<LanguageModelChatResponseChunk> {
  // Empty stream - yields nothing
}

/**
 * Minimal duck-typed interfaces to avoid hard vscode import.
 * These match the shapes used by VS Code's LanguageModelChatProvider.
 */
export interface LanguageModelChatRequest {
  justification?: string;
  messages: unknown[];
  model?: { id: string; [key: string]: unknown };
  options?: {
    temperature?: number;
    stopSequences?: string[];
    [key: string]: unknown;
  };
  toolMode?: unknown;
  tools?: unknown[];
  [key: string]: unknown;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: (handler: () => void) => { dispose(): void };
}

export interface LanguageModelChatResponseChunk {
  part: unknown;
}

export interface LanguageModelChatResponse {
  stream: AsyncIterable<LanguageModelChatResponseChunk>;
  text: Thenable<string>;
}

export interface ExtensionContext {
  secrets: {
    get(key: string): Thenable<string | undefined>;
    store(key: string, value: string): Thenable<void>;
    delete(key: string): Thenable<void>;
  };
  [key: string]: unknown;
}

/**
 * Abstract base class for all VS Code LanguageModelChatProvider implementations.
 * Subclasses must implement buildRequest, normalizeStream, and mapErrorToCode.
 */
export abstract class BaseLanguageModelChatProvider {
  protected readonly context: ExtensionContext;
  protected readonly config: ProviderConfig;

  constructor(context: ExtensionContext, config: ProviderConfig) {
    this.context = context;
    this.config = config;
  }

  get id(): string {
    return this.config.providerId;
  }

  get vendor(): string {
    return this.config.vendor;
  }

  get family(): string {
    return this.config.family;
  }

  get name(): string {
    return this.config.displayName;
  }

  get maxInputTokens(): number {
    return this.config.maxInputTokens;
  }

  countTokens(text: string, _model: string): number {
    // Simple approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  async makeRequest(request: LanguageModelChatRequest, token: CancellationToken): Promise<LanguageModelChatResponse> {
    if (token.isCancellationRequested) {
      return this.createErrorResponse(new Error('Cancelled'), 'Request was cancelled.');
    }

    let abortController: AbortController | undefined;
    let onCancel: { dispose(): void } | undefined;

    try {
      abortController = new AbortController();
      onCancel = token.onCancellationRequested(() => abortController?.abort());

      const messages = convertMessages(request.messages);
      const providerRequest = await this.buildRequest(messages, request);

      //
      const rawStream = await this.streamChat({ ...providerRequest, signal: abortController.signal }, token);
      const normalizedStream = this.normalizeStream(rawStream);

      let fullText = '';
      let resolveText: (value: string) => void;
      const textPromise = new Promise<string>(resolve => {
        resolveText = resolve;
      });

      const generateStream = async function* generateStream(): AsyncIterable<LanguageModelChatResponseChunk> {
        try {
          for await (const chunk of normalizedStream) {
            if (chunk.part && typeof chunk.part === 'object') {
              const p = chunk.part as Record<string, unknown>;
              if (typeof p.value === 'string') {
                fullText += String(p.value);
              }
            }
            yield chunk;
          }
        } finally {
          resolveText(fullText);
        }
      };

      return {
        stream: generateStream(),
        text: textPromise
      };
    } catch (error) {
      abortController?.abort();
      return this.createErrorResponse(error, errorCodeToMessage(errorToProviderCode(error)));
    } finally {
      onCancel?.dispose();
    }
  }

  /**
   * Performs the HTTP streaming request to the provider API.
   * Uses the signal from the request for cancellation.
   */
  protected async streamChat(
    request: ProviderApiRequest & { signal?: AbortSignal },
    _token: CancellationToken
  ): Promise<AsyncIterable<ProviderStreamChunk>> {
    const { url, method, headers, body, signal } = request;
    if (url === undefined || url === null) {
      throw new Error('Provider API request URL is required');
    }

    const response = await fetch(url, {
      body: body === undefined ? null : JSON.stringify(body),
      headers: headers as NonNullable<RequestInit['headers']>,
      method: method ?? 'POST',
      ...(signal && { signal })
    });

    if (response.ok) {
      const { body } = response;
      if (body === null) {
        throw new Error('HTTP response has no body');
      }
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Streaming parser with multi-line SSE protocol handling — tightly coupled by design
      return (async function* (): AsyncIterable<ProviderStreamChunk> {
        //
        const reader = (body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') {
                continue;
              }
              const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
              try {
                yield JSON.parse(data) as ProviderStreamChunk;
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } finally {
          reader.releaseLock();
          // Flush any remaining partial characters
          buffer += decoder.decode();
        }
      })();
    }

    // Handle error response
    const text = await response.text().catch(() => '');
    const err = new Error(`HTTP ${response.status}: ${text}`) as Error & {
      status: number;
    };
    err.status = response.status;
    throw err;
  }

  protected createErrorResponse(error: unknown, userMessage: string): LanguageModelChatResponse {
    const msg = userMessage || errorCodeToMessage(errorToProviderCode(error));

    return {
      stream: emptyStream(),
      text: Promise.resolve(msg)
    };
  }

  /**
   * Convert VS Code messages and request options to provider-specific API format.
   */
  protected abstract buildRequest(
    messages: ChatMessage[],
    request: LanguageModelChatRequest
  ): Promise<ProviderApiRequest>;

  /**
   * Normalize raw provider stream chunks into VS Code LanguageModelChatResponseChunks.
   */
  protected abstract normalizeStream(
    response: AsyncIterable<ProviderStreamChunk>
  ): AsyncIterable<LanguageModelChatResponseChunk>;

  /**
   * Map provider-specific errors to ProviderErrorCode values.
   */
  protected abstract mapErrorToCode(error: unknown): string;
}
