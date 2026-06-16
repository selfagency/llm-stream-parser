import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

import { createUniversalClient } from './client.js';

/**
 * Create a mock SSE response body that emits chunks with configurable delays.
 * Each chunk is a complete SSE event line.
 */
function createMockSSEStream(chunks: string[], delaysMs: number[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[index];
      index++;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      const delay = delaysMs[index - 1] ?? 0;
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      controller.enqueue(new TextEncoder().encode(chunk));
    }
  });
}

describe('createUniversalClient', () => {
  describe('stream', () => {
    it('should yield chunks incrementally, not batch', async () => {
      const client = createUniversalClient({ provider: 'openai', apiKey: 'sk-test' });

      // Mock fetch to return a delayed SSE stream
      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          createMockSSEStream(
            [
              'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
              'data: {"choices":[{"delta":{"content":" "}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
              'data: [DONE]\n\n'
            ],
            [0, 50, 50, 50] // First chunk immediate, rest delayed
          ),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        )
      );

      vi.stubGlobal('fetch', mockFetch);

      try {
        const stream = await client.stream({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        });

        const reader = stream.getReader();
        const chunks: string[] = [];
        let firstChunkTime = 0;
        let streamEndTime = 0;

        // Read first chunk (should arrive immediately)
        const first = await reader.read();
        firstChunkTime = Date.now();
        if (first.value?.content) {
          chunks.push(first.value.content);
        }

        // Read remaining chunks
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value?.content) {
            chunks.push(value.content);
          }
        }
        streamEndTime = Date.now();

        // First chunk should arrive well before stream end (due to delays)
        expect(firstChunkTime).toBeLessThan(streamEndTime);
        expect(chunks.join('')).toBe('Hello world');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('should handle tool call chunks in stream', async () => {
      const client = createUniversalClient({ provider: 'openai', apiKey: 'sk-test' });

      const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          createMockSSEStream(
            [
              'data: {"choices":[{"delta":{"content":"Let me search"}}]}\n\n',
              'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"search","arguments":"{\\"q\\":\\"test\\"}"},"id":"call_1"}]}}]}\n\n',
              'data: [DONE]\n\n'
            ],
            [0, 0, 0]
          ),
          {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' }
          }
        )
      );

      vi.stubGlobal('fetch', mockFetch);

      try {
        const stream = await client.stream({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Search something' }]
        });

        const reader = stream.getReader();
        const textChunks: string[] = [];
        let hasToolCall = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value?.content) {
            textChunks.push(value.content);
          }
          if (value?.tool_calls) {
            hasToolCall = true;
          }
        }

        expect(textChunks.join('')).toBe('Let me search');
        expect(hasToolCall).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
