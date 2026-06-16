import type { NormalizedChunk } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';

import { createStreamEventAdapter, type StreamRuntimeEvent, streamToEvents } from './stream-to-events.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a `ReadableStream<NormalizedChunk>` from an array of partial chunks. */
function chunkStream(chunks: Partial<NormalizedChunk>[]): ReadableStream<NormalizedChunk> {
  return new ReadableStream<NormalizedChunk>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(c);
      }
      controller.close();
    }
  });
}

/** Collect all events from an async generator into an array. */
async function collectEvents(stream: ReadableStream<NormalizedChunk>): Promise<StreamRuntimeEvent[]> {
  const events: StreamRuntimeEvent[] = [];
  for await (const event of streamToEvents(stream)) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// streamToEvents — AsyncGenerator
// ---------------------------------------------------------------------------

describe('streamToEvents', () => {
  it('emits text-delta events for content chunks', async () => {
    const events = await collectEvents(chunkStream([{ content: 'Hello' }, { content: ' World' }]));

    const textEvents = events.filter(e => e.type === 'text-delta');
    expect(textEvents).toHaveLength(2);
    expect(textEvents[0]).toMatchObject({ type: 'text-delta', payload: { delta: 'Hello' } });
    expect(textEvents[1]).toMatchObject({ type: 'text-delta', payload: { delta: ' World' } });
  });

  it('emits thinking-delta events for thinking chunks', async () => {
    const events = await collectEvents(
      chunkStream([{ thinking: 'step 1...' }, { thinking: 'step 2...' }, { content: 'answer' }])
    );

    const thinkingEvents = events.filter(e => e.type === 'thinking-delta');
    expect(thinkingEvents).toHaveLength(2);
    expect(thinkingEvents[0]).toMatchObject({
      type: 'thinking-delta',
      payload: { delta: 'step 1...' }
    });
    expect(thinkingEvents[1]).toMatchObject({
      type: 'thinking-delta',
      payload: { delta: 'step 2...' }
    });
  });

  it('emits tool-call-start for tool_call chunks', async () => {
    const events = await collectEvents(
      chunkStream([{ tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'NYC' } } }] }])
    );

    const toolStart = events.filter(e => e.type === 'tool-call-start');
    expect(toolStart).toHaveLength(1);
    expect(toolStart[0]).toMatchObject({
      type: 'tool-call-start',
      payload: { name: 'get_weather', args: { city: 'NYC' } }
    });
  });

  it('emits tool-call-start for nativeToolCallDeltas', async () => {
    const events = await collectEvents(
      chunkStream([
        {
          nativeToolCallDeltas: [
            { index: 0, id: 'call_1', name: 'search', argumentsDelta: '{"query":' },
            { index: 0, id: 'call_1', argumentsDelta: '"weather"}' }
          ]
        }
      ])
    );

    const toolStart = events.filter(e => e.type === 'tool-call-start');
    expect(toolStart).toHaveLength(1);
    expect(toolStart[0]).toMatchObject({
      type: 'tool-call-start',
      payload: { id: 'call_1', name: 'search' }
    });
  });

  it('emits tool-call-end for open tool calls on done', async () => {
    const events = await collectEvents(
      chunkStream([
        { tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'NYC' } } }] },
        { content: 'Here is the weather', done: true, finishReason: 'stop' as const }
      ])
    );

    expect(events.filter(e => e.type === 'tool-call-end')).toHaveLength(1);
  });

  it('emits done with finishReason and usage on final chunk', async () => {
    const events = await collectEvents(
      chunkStream([
        { content: 'Hi' },
        {
          content: ' done',
          done: true,
          finishReason: 'stop' as const,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        }
      ])
    );

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    if (doneEvent?.type === 'done') {
      expect(doneEvent.payload.finishReason).toBe('stop');
      expect(doneEvent.payload.usage).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      });
    }
  });

  it('emits done even without explicit done flag (finishReason alone)', async () => {
    const events = await collectEvents(chunkStream([{ content: 'ok', finishReason: 'stop' as const }]));

    expect(events.find(e => e.type === 'done')).toBeDefined();
  });

  it('emits error for stream errors', async () => {
    const errorStream = new ReadableStream<NormalizedChunk>({
      start(controller) {
        controller.enqueue({ content: 'before' } as NormalizedChunk);
        controller.error(new Error('connection lost'));
      }
    });

    const events = await collectEvents(errorStream);
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'error') {
      expect(errorEvent.payload.message).toBe('connection lost');
    }
  });

  it('assigns monotonically increasing chunkIndex values', async () => {
    const events = await collectEvents(
      chunkStream([{ content: 'a' }, { thinking: 'hmm' }, { content: 'b', done: true, finishReason: 'stop' as const }])
    );

    const indices = events.map(e => e.chunkIndex);
    for (let i = 1; i < indices.length; i++) {
      expect(indices.at(i)).toBeGreaterThanOrEqual(indices.at(i - 1) ?? 0);
    }
  });

  it('handles empty stream', async () => {
    const events = await collectEvents(chunkStream([]));
    expect(events).toHaveLength(0);
  });

  it('handles chunk with no content, thinking, or tool_calls', async () => {
    const events = await collectEvents(chunkStream([{}]));
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createStreamEventAdapter — Callback-based
// ---------------------------------------------------------------------------

describe('createStreamEventAdapter', () => {
  it('fires onEvent for each event', async () => {
    const onEvent = vi.fn();
    const adapter = createStreamEventAdapter({ onEvent });

    await adapter.start(
      Promise.resolve(chunkStream([{ content: 'hello' }, { done: true, finishReason: 'stop' as const }]))
    );

    expect(onEvent).toHaveBeenCalled();
    const types = onEvent.mock.calls.map(args => (args[0] as StreamRuntimeEvent).type);
    expect(types).toContain('text-delta');
    expect(types).toContain('done');
  });

  it('fires onText for text-delta events', async () => {
    const onText = vi.fn();
    const adapter = createStreamEventAdapter({ onText });

    await adapter.start(Promise.resolve(chunkStream([{ content: 'Hello' }, { content: ' World' }])));

    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onText).toHaveBeenNthCalledWith(2, ' World');
  });

  it('fires onThinking for thinking-delta events', async () => {
    const onThinking = vi.fn();
    const adapter = createStreamEventAdapter({ onThinking });

    await adapter.start(Promise.resolve(chunkStream([{ thinking: 'hmm...' }, { content: 'answer' }])));

    expect(onThinking).toHaveBeenCalledTimes(1);
    expect(onThinking).toHaveBeenCalledWith('hmm...');
  });

  it('fires onToolCallStart for tool calls', async () => {
    const onToolCallStart = vi.fn();
    const adapter = createStreamEventAdapter({ onToolCallStart });

    await adapter.start(
      Promise.resolve(
        chunkStream([
          { tool_calls: [{ function: { name: 'search', arguments: { q: 'test' } } }] },
          { done: true, finishReason: 'stop' as const }
        ])
      )
    );

    expect(onToolCallStart).toHaveBeenCalledTimes(1);
    expect(onToolCallStart).toHaveBeenCalledWith(expect.any(String), 'search', { q: 'test' });
  });

  it('fires onDone with finishReason', async () => {
    const onDone = vi.fn();
    const adapter = createStreamEventAdapter({ onDone });

    await adapter.start(Promise.resolve(chunkStream([{ content: 'done', done: true, finishReason: 'stop' as const }])));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('stop', expect.any(Object));
  });

  it('fires onError when stream errors', async () => {
    const onError = vi.fn();
    const adapter = createStreamEventAdapter({ onError });

    const errorStream = new ReadableStream<NormalizedChunk>({
      start(controller) {
        controller.error(new Error('stream exploded'));
      }
    });

    await adapter.start(Promise.resolve(errorStream));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream exploded' }));
  });

  it('abort() stops consumption early', async () => {
    const onText = vi.fn();
    const adapter = createStreamEventAdapter({ onText });

    const slowStream = new ReadableStream<NormalizedChunk>({
      start(controller) {
        controller.enqueue({ content: 'first' } as NormalizedChunk);
        // Don't close — stream stays open
      }
    });

    // Start and immediately abort
    const promise = adapter.start(Promise.resolve(slowStream));
    adapter.abort();
    await promise;

    // May or may not have received events before abort, but no crash
    expect(onText.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('handles stream promise rejection', async () => {
    const onError = vi.fn();
    const adapter = createStreamEventAdapter({ onError });

    await adapter.start(Promise.reject(new Error('stream not available')));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream not available' }));
  });
});
