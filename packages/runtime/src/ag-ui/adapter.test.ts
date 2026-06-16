/**
 * AG-UI Stream Adapter Tests
 *
 * Verifies that PipelineEvent streams are correctly translated to AG-UI events,
 * including proper event sequencing, lifecycle wrapping, and state tracking.
 */

import type {
  ReasoningMessageContentEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  TextMessageContentEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent
} from '@agentsy/shared';
import { EventType } from '@agentsy/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PipelineEvent } from './adapter.js';
import { toAgUiStream } from './adapter.js';

/**
 * Helper to consume an async generator into an array
 */
async function collectEvents<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/**
 * Helper to create a simple pipeline event generator
 */
// biome-ignore lint/suspicious/useAwait: async generator required for AsyncGenerator<PipelineEvent> compatibility
async function* createMockPipeline(events: PipelineEvent[]): AsyncGenerator<PipelineEvent> {
  for (const event of events) {
    yield event;
  }
}

describe('toAgUiStream', () => {
  const runId = 'test_run_123';
  const threadId = 'thread_456';

  it('should wrap stream with RUN_STARTED and RUN_FINISHED', async () => {
    const pipeline = createMockPipeline([
      { content: 'Hello', type: 'delta' },
      { type: 'message_done', usage: { inputTokens: 10, outputTokens: 5 } }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId, threadId }));

    // Should have at least 3 events: RUN_STARTED, TEXT_MESSAGE_CONTENT, RUN_FINISHED
    expect(events.length).toBeGreaterThanOrEqual(3);
    const startEvent = events[0];
    expect(startEvent?.type).toBe(EventType.RUN_STARTED);
    expect(startEvent?.runId).toBe(runId);
    expect(startEvent?.threadId).toBe(threadId);

    // Last event should be RUN_FINISHED
    const lastEvent = events.at(-1) as RunFinishedEvent;
    expect(lastEvent?.type).toBe(EventType.RUN_FINISHED);
    expect(lastEvent?.outcome?.type).toBe('success');
  });

  it('should convert delta events to TEXT_MESSAGE_CONTENT', async () => {
    const pipeline = createMockPipeline([
      { content: 'Hello ', type: 'delta' },
      { content: 'world!', type: 'delta' },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    // Filter for text message events (skip RUN_STARTED/RUN_FINISHED)
    const textEvents = events.filter((e): e is TextMessageContentEvent => e.type === EventType.TEXT_MESSAGE_CONTENT);

    expect(textEvents).toHaveLength(2);
    const firstText = textEvents[0];
    const secondText = textEvents[1];
    expect(firstText?.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(firstText?.content).toBe('Hello ');
    expect(secondText?.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(secondText?.content).toBe('world!');
  });

  it('should convert thinking events to REASONING_* sequence', async () => {
    const pipeline = createMockPipeline([
      { content: 'Thinking step 1', type: 'thinking' },
      { content: 'Thinking step 2', type: 'thinking' },
      { content: 'Answer', type: 'delta' },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    // Find reasoning events
    const reasoningEvents = events.filter(e => e.type.includes('reasoning'));

    // Should have: START, MESSAGE_START, CONTENT (x2), MESSAGE_END, END
    expect(reasoningEvents.length).toBeGreaterThanOrEqual(4);

    // Check sequence
    const reasoningStart = reasoningEvents[0];
    const reasoningMsgStart = reasoningEvents[1];
    expect(reasoningStart?.type).toBe(EventType.REASONING_START);
    expect(reasoningMsgStart?.type).toBe(EventType.REASONING_MESSAGE_START);

    // Content events should be consecutive
    const contentEvents = reasoningEvents.filter(
      (e): e is ReasoningMessageContentEvent => e.type === EventType.REASONING_MESSAGE_CONTENT
    );
    expect(contentEvents).toHaveLength(2);
    const firstContent = contentEvents[0];
    const secondContent = contentEvents[1];
    expect(firstContent?.content).toBe('Thinking step 1');
    expect(secondContent?.content).toBe('Thinking step 2');

    // Should end with MESSAGE_END and REASONING_END
    expect(reasoningEvents.at(-2)?.type).toBe(EventType.REASONING_MESSAGE_END);
    expect(reasoningEvents.at(-1)?.type).toBe(EventType.REASONING_END);
  });

  it('should convert tool_call events to TOOL_CALL_* sequence', async () => {
    const pipeline = createMockPipeline([
      {
        toolArgs: { query: 'AI trends' },
        toolCallId: 'call_123',
        toolName: 'search',
        type: 'tool_call'
      },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    // Find tool call events
    const toolEvents = events.filter(e => e.type.includes('tool_call'));

    expect(toolEvents.length).toBeGreaterThanOrEqual(3);
    const toolStart = toolEvents[0] as ToolCallStartEvent;
    const toolArgs = toolEvents[1] as ToolCallArgsEvent;
    const toolEnd = toolEvents[2];
    expect(toolStart?.type).toBe(EventType.TOOL_CALL_START);
    expect(toolStart?.toolName).toBe('search');
    expect(toolStart?.toolCallId).toBe('call_123');

    expect(toolArgs?.type).toBe(EventType.TOOL_CALL_ARGS);
    expect(toolArgs?.args).toStrictEqual({ query: 'AI trends' });

    expect(toolEnd?.type).toBe(EventType.TOOL_CALL_END);
  });

  it('should handle thinking followed by tool_call', async () => {
    const pipeline = createMockPipeline([
      { content: 'Need to search for info', type: 'thinking' },
      {
        toolArgs: { query: 'something' },
        toolCallId: 'call_456',
        toolName: 'search',
        type: 'tool_call'
      },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    // Verify reasoning is properly closed before tool call starts
    const reasoningEnd = events.find(e => e.type === EventType.REASONING_END);
    const toolStart = events.find(e => e.type === EventType.TOOL_CALL_START);

    expect(reasoningEnd).toBeDefined();
    expect(toolStart).toBeDefined();

    if (!(reasoningEnd && toolStart)) {
      throw new Error('Expected reasoning end and tool start events');
    }

    const reasoningEndIdx = events.indexOf(reasoningEnd);
    const toolStartIdx = events.indexOf(toolStart);
    expect(toolStartIdx).toBeGreaterThan(reasoningEndIdx);
  });

  it('should emit RUN_ERROR on error event', async () => {
    const pipeline = createMockPipeline([
      { content: 'Starting...', type: 'delta' },
      {
        code: 'RATE_LIMIT',
        message: 'API rate limit exceeded',
        type: 'error'
      }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    const errorEvent = events.find((e): e is RunErrorEvent => e.type === EventType.RUN_ERROR);
    expect(errorEvent).toBeDefined();
    if (!errorEvent) {
      throw new Error('Expected RUN_ERROR event');
    }

    expect(errorEvent.error).toStrictEqual(
      expect.objectContaining({
        code: 'RATE_LIMIT',
        message: 'API rate limit exceeded'
      })
    );
  });

  it('should include usage info in RUN_FINISHED', async () => {
    const pipeline = createMockPipeline([
      { content: 'Response', type: 'delta' },
      {
        type: 'message_done',
        usage: { inputTokens: 100, outputTokens: 50 }
      }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    const finished = events.find((e): e is RunFinishedEvent => e.type === EventType.RUN_FINISHED);
    expect(finished?.usage).toStrictEqual({
      inputTokens: 100,
      outputTokens: 50
    });
  });

  it('should support parentRunId for hierarchical workflows', async () => {
    const pipeline = createMockPipeline([{ content: 'Sub-agent response', type: 'delta' }, { type: 'message_done' }]);

    const parentRunId = 'parent_run_789';
    const events = await collectEvents(toAgUiStream(pipeline, { parentRunId, runId }));

    const started = events.find((e): e is RunStartedEvent => e.type === EventType.RUN_STARTED);
    expect(started?.parentRunId).toBe(parentRunId);
  });

  it('should maintain correct messageIds across events', async () => {
    const pipeline = createMockPipeline([
      { content: 'Part 1 ', type: 'delta' },
      { content: 'Part 2', type: 'delta' },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    const textEvents = events.filter((e): e is TextMessageContentEvent => e.type === EventType.TEXT_MESSAGE_CONTENT);

    // All text events should share the same messageId
    const firstMessageId = textEvents[0]?.messageId;
    for (const e of textEvents) {
      expect(e.messageId).toBe(firstMessageId);
    }
  });

  it('should handle empty delta gracefully', async () => {
    const pipeline = createMockPipeline([
      { content: '', type: 'delta' },
      { content: 'Real content', type: 'delta' },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    // Should still emit a text event for the real content
    const textEvents = events.filter((e): e is TextMessageContentEvent => e.type === EventType.TEXT_MESSAGE_CONTENT);
    expect(textEvents.some(e => e.content === 'Real content')).toBeTruthy();
  });

  it('should emit RUN_FINISHED after closing reasoning/tool_call', async () => {
    const pipeline = createMockPipeline([
      { content: 'Thinking...', type: 'thinking' },
      {
        toolArgs: { expression: '2+2' },
        toolCallId: 'call_789',
        toolName: 'calculate',
        type: 'tool_call'
      },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    // Find indices
    const reasoningEndIdx = events.findIndex(e => e.type === EventType.REASONING_END);
    const toolEndIdx = events.findIndex(e => e.type === EventType.TOOL_CALL_END);
    const finishedIdx = events.findIndex(e => e.type === EventType.RUN_FINISHED);

    expect(reasoningEndIdx).toBeGreaterThan(-1);
    expect(toolEndIdx).toBeGreaterThan(-1);
    expect(finishedIdx).toBeGreaterThan(Math.max(reasoningEndIdx, toolEndIdx));
  });

  it('should handle encryption option for reasoning', async () => {
    const pipeline = createMockPipeline([{ content: 'Secret thoughts', type: 'thinking' }, { type: 'message_done' }]);

    const events = await collectEvents(toAgUiStream(pipeline, { encryptReasoning: true, runId }));

    const contentEvent = events.find(
      (e): e is ReasoningMessageContentEvent => e.type === EventType.REASONING_MESSAGE_CONTENT
    );
    expect(contentEvent).toBeDefined();
    if (!contentEvent) {
      throw new Error('Expected reasoning content event');
    }
    expect(contentEvent.encryptedValue).toBe('encrypted');
  });

  it('should include timestamps on all events', async () => {
    const pipeline = createMockPipeline([{ content: 'Hello', type: 'delta' }, { type: 'message_done' }]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId }));

    for (const event of events) {
      expect(event.timestamp).toBeDefined();
      expectTypeOf(event.timestamp).toBeString();
      // Verify it's a valid ISO timestamp
      expect(() => new Date(event.timestamp)).not.toThrow();
    }
  });

  it('should pass through runId and threadId to all events', async () => {
    const pipeline = createMockPipeline([
      { content: 'Test', type: 'delta' },
      { content: 'Think', type: 'thinking' },
      {
        toolArgs: {},
        toolCallId: 'call_1',
        toolName: 'test',
        type: 'tool_call'
      },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId, threadId }));

    for (const event of events) {
      expect(event.runId).toBe(runId);
      expect(event.threadId).toBe(threadId);
    }
  });

  it('should handle consecutive tool calls with same ID', async () => {
    const pipeline = createMockPipeline([
      {
        toolArgs: { key: 'value1' },
        toolCallId: 'call_1',
        toolName: 'tool_a',
        type: 'tool_call'
      },
      {
        toolArgs: { key: 'value2' },
        toolCallId: 'call_1',
        toolName: 'tool_a',
        type: 'tool_call'
      },
      { type: 'message_done' }
    ]);

    const events = await collectEvents(toAgUiStream(pipeline, { runId, threadId }));

    // Filter tool call events
    const toolCallEvents = events.filter(
      (e): e is ToolCallStartEvent | ToolCallEndEvent =>
        e.type === EventType.TOOL_CALL_START || e.type === EventType.TOOL_CALL_END
    );

    // Should have tool call events
    expect(toolCallEvents.length).toBeGreaterThan(0);

    // All should reference the same tool call ID
    for (const event of toolCallEvents) {
      expect(event.toolCallId).toBe('call_1');
    }
  });
});
