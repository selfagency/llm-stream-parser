/**
 * Mock provider client for testing the CLI chat command without live API keys.
 *
 * Returns deterministic streaming responses so chat command behavior
 * can be verified in unit tests and manual dogfooding sessions.
 */

import { ReadableStream } from 'node:stream/web';

import type { CompletionRequest, CompletionResponse, NormalizedChunk } from '@agentsy/shared';

/** Minimum delay between mock chunks in milliseconds. */
const DEFAULT_CHUNK_DELAY_MS = 15;

/** Default mock response content returned by the mock client. */
const DEFAULT_MOCK_RESPONSE = 'Hello! I am a mock LLM response. This simulates a streaming reply.';

export interface MockClientOptions {
  /**
   * Delay between emitted chunks in milliseconds.
   * Set to 0 for tests, >0 for realistic simulation.
   * @default 15
   */
  chunkDelayMs?: number | undefined;
  /**
   * The text content the mock client should return.
   * @default 'Hello! I am a mock LLM response. This simulates a streaming reply.'
   */
  responseText?: string | undefined;
}

/**
 * Creates a mock UniversalClient-compatible object for testing.
 *
 * The mock client returns configurable deterministic responses and
 * does not connect to any external provider.
 */
export function createMockClient(options: MockClientOptions = {}): {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>>;
} {
  const responseText = options.responseText ?? DEFAULT_MOCK_RESPONSE;
  const chunkDelayMs = options.chunkDelayMs ?? DEFAULT_CHUNK_DELAY_MS;

  return {
    // biome-ignore lint/suspicious/useAwait: must match interface return type Promise<CompletionResponse>
    async complete(_request: CompletionRequest): Promise<CompletionResponse> {
      return {
        content: responseText,
        model: 'mock-model',
        usage: {
          inputTokens: 10,
          outputTokens: responseText.split(' ').length,
          totalTokens: 10 + responseText.split(' ').length
        }
      };
    },

    // biome-ignore lint/suspicious/useAwait: must match interface return type Promise<ReadableStream<NormalizedChunk>>
    async stream(_request: CompletionRequest): Promise<ReadableStream<NormalizedChunk>> {
      return new ReadableStream<NormalizedChunk>({
        async start(controller): Promise<void> {
          // Emit thinking block first
          controller.enqueue({ thinking: 'Mock thinking...', done: false });

          await sleep(chunkDelayMs);

          // Emit content word by word for realistic streaming feel
          const words = responseText.split(' ');
          for (const word of words) {
            const content = word === words[0] ? word : ` ${word}`;
            controller.enqueue({ content, done: false });
            await sleep(chunkDelayMs);
          }

          // Emit final chunk with usage
          const allWords = responseText.split(' ');
          controller.enqueue({
            done: true,
            finishReason: 'stop',
            usage: {
              inputTokens: 10,
              outputTokens: allWords.length,
              totalTokens: 10 + allWords.length
            }
          });

          controller.close();
        }
      });
    }
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
