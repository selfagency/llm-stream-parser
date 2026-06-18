import { ReadableStream } from 'node:stream/web';

import type { NormalizedChunk } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';

import { createSimpleTurnLoop, type TurnHandler } from './simple-turn.js';

describe('createSimpleTurnLoop', () => {
  it('should store tool calls in conversation history', async () => {
    const handler = createMockHandler([
      { content: 'Let me check' },
      {
        tool_calls: [
          {
            function: { name: 'read_file', arguments: '{"path":"test.txt"}' }
          }
        ]
      },
      { done: true, finishReason: 'tool-calls' }
    ]);

    const loop = createSimpleTurnLoop({ handler, model: 'test-model' });
    await loop.run('Read the file');

    const messages = loop.getMessages();
    const assistantMsg = messages.find(m => m.role === 'assistant');

    expect(assistantMsg).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls!).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls![0]!.function.name).toBe('read_file');
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls![0]!.function.arguments).toBe('{"path":"test.txt"}');
  });

  it('should store multiple tool calls with same name', async () => {
    const handler = createMockHandler([
      {
        tool_calls: [
          {
            function: { name: 'read_file', arguments: '{"path":"a.txt"}' }
          },
          {
            function: { name: 'read_file', arguments: '{"path":"b.txt"}' }
          }
        ]
      },
      { done: true, finishReason: 'tool-calls' }
    ]);

    const loop = createSimpleTurnLoop({ handler, model: 'test-model' });
    await loop.run('Read both files');

    const messages = loop.getMessages();
    const assistantMsg = messages.find(m => m.role === 'assistant');

    expect(assistantMsg).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls!).toHaveLength(2);
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls![0]!.function.name).toBe('read_file');
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls![1]!.function.name).toBe('read_file');
  });

  it('should set content to null when only tool calls are present', async () => {
    const handler = createMockHandler([
      {
        tool_calls: [
          {
            function: { name: 'search', arguments: '{"q":"test"}' }
          }
        ]
      },
      { done: true, finishReason: 'tool-calls' }
    ]);

    const loop = createSimpleTurnLoop({ handler, model: 'test-model' });
    await loop.run('Search');

    const messages = loop.getMessages();
    const assistantMsg = messages.find(m => m.role === 'assistant');

    expect(assistantMsg).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.content).toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls!).toHaveLength(1);
  });

  it('should include text content alongside tool calls', async () => {
    const handler = createMockHandler([
      { content: 'Searching...' },
      {
        tool_calls: [
          {
            function: { name: 'search', arguments: '{"q":"test"}' }
          }
        ]
      },
      { done: true, finishReason: 'tool-calls' }
    ]);

    const loop = createSimpleTurnLoop({ handler, model: 'test-model' });
    await loop.run('Search');

    const messages = loop.getMessages();
    const assistantMsg = messages.find(m => m.role === 'assistant');

    expect(assistantMsg).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.content).toBe('Searching...');
    // biome-ignore lint/style/noNonNullAssertion: guarded by toBeDefined above
    expect(assistantMsg!.tool_calls!).toHaveLength(1);
  });

  it('should forward tool calls to onToolCall callback', async () => {
    const handler = createMockHandler([
      {
        tool_calls: [
          {
            function: { name: 'search', arguments: '{"q":"test"}' }
          }
        ]
      },
      { done: true, finishReason: 'tool-calls' }
    ]);

    const capturedCalls: Array<{ id: string; name: string; args: unknown }> = [];
    const loop = createSimpleTurnLoop({ handler, model: 'test-model' });

    await loop.run('Search', {
      onToolCall(id, name, args) {
        capturedCalls.push({ id, name, args });
      }
    });

    expect(capturedCalls).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: guarded by toHaveLength above
    expect(capturedCalls[0]!.name).toBe('search');
  });

  it('should fail pending tool calls on stream error and emit tool_call_update', async () => {
    const onToolCallUpdate = vi.fn();
    const mockError = new Error('Stream failed');

    const handler: TurnHandler = {
      stream: vi.fn().mockImplementation(() => {
        // Create a stream that emits a tool call then errors
        return new ReadableStream<NormalizedChunk>({
          async start(controller) {
            // Emit a tool call chunk first
            controller.enqueue({
              tool_calls: [
                {
                  function: { name: 'read_file', arguments: '{"path":"test.txt"}' }
                }
              ]
            });
            // Give the reader time to process the chunk, then error
            await new Promise(resolve => setTimeout(resolve, 10));
            controller.error(mockError);
          }
        });
      })
    };

    const loop = createSimpleTurnLoop({
      handler,
      model: 'test-model'
    });

    await expect(loop.run('test input', { onToolCallUpdate })).rejects.toThrow('Stream failed');

    // Verify that onToolCallUpdate was called for the pending tool call
    expect(onToolCallUpdate).toHaveBeenCalledTimes(1);
  });
});

/**
 * Create a mock TurnHandler that returns a stream of NormalizedChunks.
 */
function createMockHandler(chunks: NormalizedChunk[]): TurnHandler {
  return {
    // biome-ignore lint/suspicious/useAwait: matches TurnHandler interface
    async stream() {
      return new ReadableStream<NormalizedChunk>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        }
      });
    }
  };
}
