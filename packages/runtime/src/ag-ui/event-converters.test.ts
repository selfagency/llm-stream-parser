/**
 * AG-UI Event Converters Tests
 *
 * Verifies conversion to CopilotKit and custom UI event formats
 */

import type {
  ReasoningMessageContentEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StepFinishedEvent,
  StepStartedEvent,
  TextMessageContentEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent
} from '@agentsy/shared';
import { EventType } from '@agentsy/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CopilotKitEvent, CustomUIEvent } from './event-converters.js';
import { convertEventStream, createEventConverter, toCopilotKitEvent, toCustomUIEvent } from './event-converters.js';

// Test fixtures
function createMockStream() {
  const events: RunStartedEvent[] = [
    {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    },
    {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:01Z',
      type: EventType.RUN_STARTED
    }
  ];

  // biome-ignore lint/suspicious/useAwait: async generator required for AsyncGenerator<AgUiEvent> compatibility
  async function* generate() {
    for (const event of events) {
      yield event;
    }
  }

  return generate();
}

// biome-ignore lint/suspicious/useAwait: async generator required for AsyncGenerator<AgUiEvent> compatibility
async function* multiEventGenerator() {
  const events: RunStartedEvent[] = [
    {
      runId: 'run_a',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    },
    {
      runId: 'run_b',
      timestamp: '2024-01-01T00:00:01Z',
      type: EventType.RUN_STARTED
    },
    {
      runId: 'run_c',
      timestamp: '2024-01-01T00:00:02Z',
      type: EventType.RUN_STARTED
    }
  ];
  for (const event of events) {
    yield event;
  }
}

describe('toCopilotKitEvent', () => {
  it('should convert RUN_STARTED to runStarted', () => {
    const event: RunStartedEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    };

    const result = toCopilotKitEvent(event);

    expect(result.type).toBe('run:started');
    expect(result.runId).toBe('run_123');
  });

  it('should convert TEXT_MESSAGE_CONTENT to text_message:content', () => {
    const event: TextMessageContentEvent = {
      content: 'Hello',
      messageId: 'msg_123',
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.TEXT_MESSAGE_CONTENT
    };

    const result = toCopilotKitEvent(event);

    expect(result.type).toBe('text_message:content');
    expect(result.messageId).toBe('msg_123');
    expect(result.content).toBe('Hello');
  });

  it('should convert TOOL_CALL_START to tool_call:start', () => {
    const event: ToolCallStartEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      toolCallId: 'call_123',
      toolName: 'search',
      type: EventType.TOOL_CALL_START
    };

    const result = toCopilotKitEvent(event);

    expect(result.type).toBe('tool_call:start');
    expect(result.toolCallId).toBe('call_123');
    expect(result.toolName).toBe('search');
  });

  it('should fallback to original type if not in mapping', () => {
    const unknownEvent = {
      payload: 'data',
      type: 'EXTREMELY_UNKNOWN_TYPE'
    };
    const result = toCopilotKitEvent(unknownEvent as unknown as RunStartedEvent);
    expect(result.type).toBe('EXTREMELY_UNKNOWN_TYPE');
  });

  it('should default to "unknown" if type is missing', () => {
    const missingTypeEvent = {
      payload: 'data'
    };
    const result = toCopilotKitEvent(missingTypeEvent as unknown as RunStartedEvent);
    expect(result.type).toBe('unknown');
  });

  it('should convert all event types to their mapped values', () => {
    const testCases = [
      { eventType: EventType.RUN_STARTED, expected: 'run:started' },
      { eventType: EventType.RUN_FINISHED, expected: 'run:finished' },
      { eventType: EventType.RUN_ERROR, expected: 'run:error' },
      { eventType: EventType.STEP_STARTED, expected: 'step:started' },
      { eventType: EventType.STEP_FINISHED, expected: 'step:finished' },
      {
        eventType: EventType.TEXT_MESSAGE_CONTENT,
        expected: 'text_message:content'
      },
      {
        eventType: EventType.REASONING_MESSAGE_CONTENT,
        expected: 'reasoning_message:content'
      },
      { eventType: EventType.TOOL_CALL_START, expected: 'tool_call:start' },
      { eventType: EventType.TOOL_CALL_ARGS, expected: 'tool_call:args' },
      { eventType: EventType.TOOL_CALL_END, expected: 'tool_call:end' }
    ];

    for (const { eventType, expected } of testCases) {
      const event: Record<string, unknown> = {
        runId: 'run_123',
        timestamp: '2024-01-01T00:00:00Z',
        type: eventType
      };

      const result = toCopilotKitEvent(event as unknown as RunStartedEvent);
      expect(result.type).toBe(expected);
    }
  });

  it('should preserve all event properties', () => {
    const event: TextMessageContentEvent = {
      content: 'Test content',
      messageId: 'msg_123',
      runId: 'run_123',
      threadId: 'thread_456',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.TEXT_MESSAGE_CONTENT
    };

    const result = toCopilotKitEvent(event);

    expect(result.runId).toBe('run_123');
    expect(result.messageId).toBe('msg_123');
    expect(result.content).toBe('Test content');
    expect(result.threadId).toBe('thread_456');
  });
});

describe('toCustomUIEvent', () => {
  it('should create custom event with common fields', () => {
    const event: RunStartedEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    };

    const result = toCustomUIEvent(event);

    expect(result.eventType).toBe(EventType.RUN_STARTED);
    expect(result.runId).toBe('run_123');
    expect(result.timestamp).toBe('2024-01-01T00:00:00Z');
  });

  it('should include threadId in custom event', () => {
    const event: RunStartedEvent = {
      runId: 'run_123',
      threadId: 'thread_456',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    };

    const result = toCustomUIEvent(event);

    expect(result.threadId).toBe('thread_456');
  });

  it('should build payload for TEXT_MESSAGE_CONTENT', () => {
    const event: TextMessageContentEvent = {
      content: 'Hello world',
      messageId: 'msg_123',
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.TEXT_MESSAGE_CONTENT
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.messageId).toBe('msg_123');
    expect(result.payload.content).toBe('Hello world');
  });

  it('should build payload for TOOL_CALL_START', () => {
    const event: ToolCallStartEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      toolCallId: 'call_123',
      toolName: 'search',
      type: EventType.TOOL_CALL_START
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.toolCallId).toBe('call_123');
    expect(result.payload.toolName).toBe('search');
  });

  it('should build payload for REASONING_MESSAGE_CONTENT', () => {
    const event: ReasoningMessageContentEvent = {
      content: 'Thinking...',
      encryptedValue: 'secret',
      messageId: 'msg_123',
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.REASONING_MESSAGE_CONTENT
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.messageId).toBe('msg_123');
    expect(result.payload.content).toBe('Thinking...');
    expect(result.payload.encrypted).toBeTruthy();
  });

  it('should build payload for TOOL_CALL_ARGS', () => {
    const event: ToolCallArgsEvent = {
      args: '{"query": "test"}',
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      toolCallId: 'call_123',
      type: EventType.TOOL_CALL_ARGS
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.toolCallId).toBe('call_123');
    expect(result.payload.args).toBe('{"query": "test"}');
  });

  it('should build payload for TOOL_CALL_END', () => {
    const event: ToolCallEndEvent = {
      output: 'Success',
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      toolCallId: 'call_123',
      type: EventType.TOOL_CALL_END
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.toolCallId).toBe('call_123');
    expect(result.payload.output).toBe('Success');
  });

  it('should build payload for RUN_FINISHED', () => {
    const event: RunFinishedEvent = {
      outcome: { type: 'success' },
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_FINISHED
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.outcome).toStrictEqual({ type: 'success' });
  });

  it('should build payload for RUN_ERROR', () => {
    const event: RunErrorEvent = {
      error: { message: 'Something went wrong' },
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_ERROR
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.error).toStrictEqual({
      message: 'Something went wrong'
    });
  });

  it('should build payload for STEP_STARTED', () => {
    const event: StepStartedEvent = {
      runId: 'run_123',
      stepIndex: 1,
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.STEP_STARTED
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.stepIndex).toBe(1);
  });

  it('should build payload for STEP_FINISHED', () => {
    const event: StepFinishedEvent = {
      outputLength: 100,
      runId: 'run_123',
      stepIndex: 1,
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.STEP_FINISHED
    };

    const result = toCustomUIEvent(event);

    expect(result.payload.stepIndex).toBe(1);
    expect(result.payload.outputLength).toBe(100);
  });

  it('should handle unmapped event types via default case', () => {
    const unknownEvent = {
      foo: 'bar',
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: 'UNKNOWN_EVENT_TYPE'
    };
    const result = toCustomUIEvent(unknownEvent as unknown as RunStartedEvent);
    expect(result.eventType).toBe('UNKNOWN_EVENT_TYPE');
    expect(result.payload.foo).toBe('bar');
  });

  it('should not include undefined threadId', () => {
    const event: RunStartedEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    };

    const result = toCustomUIEvent(event);

    expect('threadId' in result).toBeFalsy();
  });
});

describe('createEventConverter', () => {
  it('should create copilot-kit converter', () => {
    const converter = createEventConverter('copilot-kit');

    const event: RunStartedEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    };

    const result = converter(event);

    expect((result as Record<string, unknown>).type).toBe('run:started');
  });

  it('should create custom converter', () => {
    const converter = createEventConverter('custom');

    const event: RunStartedEvent = {
      runId: 'run_123',
      timestamp: '2024-01-01T00:00:00Z',
      type: EventType.RUN_STARTED
    };

    const result = converter(event);

    expect(result.eventType).toBe(EventType.RUN_STARTED);
  });

  it('should throw on unknown format', () => {
    expect(() => {
      createEventConverter('unknown' as unknown as 'copilot-kit' | 'custom');
    }).toThrow(/Unknown format/);
  });

  it('should return converter function', () => {
    const converter = createEventConverter('copilot-kit');

    expectTypeOf(converter).toBeFunction();
  });
});

describe('convertEventStream', () => {
  it('should convert stream to copilot-kit format', async () => {
    const source = createMockStream();
    const converted = convertEventStream(source, 'copilot-kit');

    const results: (CopilotKitEvent | CustomUIEvent)[] = [];
    for await (const event of converted) {
      results.push(event);
    }

    expect(results).toHaveLength(2);
    const firstEvent = results[0];
    expect(firstEvent).toBeDefined();
    expect((firstEvent as unknown as Record<string, unknown>).type).toBe('run:started');
  });

  it('should convert stream to custom format', async () => {
    const source = createMockStream();
    const converted = convertEventStream(source, 'custom');

    const results: (CopilotKitEvent | CustomUIEvent)[] = [];
    for await (const event of converted) {
      results.push(event);
    }

    expect(results).toHaveLength(2);
    const firstEvent = results[0];
    if (!firstEvent) {
      throw new Error('Expected firstEvent');
    }
    expect((firstEvent as CustomUIEvent).eventType).toBe(EventType.RUN_STARTED);
  });

  it('should return async generator', () => {
    const source = createMockStream();
    const converted = convertEventStream(source, 'copilot-kit');

    expectTypeOf(converted[Symbol.asyncIterator]).toBeFunction(); // nosemgrep: detect-object-injection -- Symbol.asyncIterator is a well-known symbol, not user input
  });

  it('should handle multiple event orders distinctly', async () => {
    const converted = convertEventStream(multiEventGenerator(), 'custom');

    const results: (CopilotKitEvent | CustomUIEvent)[] = [];
    for await (const event of converted) {
      results.push(event);
    }

    expect(results).toHaveLength(3);
    const first = results[0];
    const second = results[1];
    const third = results[2];
    if (!(first && second && third)) {
      throw new Error('Expected 3 results');
    }
    expect((first as CustomUIEvent).runId).toBe('run_a');
    expect((second as CustomUIEvent).runId).toBe('run_b');
    expect((third as CustomUIEvent).runId).toBe('run_c');
  });
});
