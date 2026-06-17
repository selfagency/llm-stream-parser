/**
 * AG-UI Stream Adapter
 *
 * Translates llm-stream-parser's PipelineEvent stream into AG-UI-compatible events.
 * This allows any LLM provider (OpenAI, Anthropic, Gemini, etc.) to output AG-UI events
 * for consumption by any AG-UI frontend (CopilotKit, custom, etc.).
 */

import { randomUUID } from 'node:crypto';
import type {
  AgUiEvent,
  ReasoningEndEvent,
  ReasoningMessageContentEvent,
  ReasoningMessageEndEvent,
  ReasoningMessageStartEvent,
  ReasoningStartEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  TextMessageContentEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent
} from '@agentsy/shared';
import { EventType } from '@agentsy/shared';

/**
 * Represents events from createPipeline.
 * See src/pipeline/createPipeline.ts for full definition.
 */
export interface PipelineEvent {
  code?: string;
  content?: string;
  message?: string;
  reasoning?: string;
  toolArgs?: Record<string, unknown>;
  toolArgsJson?: string;
  toolCallId?: string;
  toolName?: string;
  type: 'delta' | 'thinking' | 'tool_call' | 'message_done' | 'error';
  usage?: { inputTokens?: number; outputTokens?: number };
  [key: string]: unknown;
}

export interface AdapterOptions {
  /**
   * Emit the REASONING_ENCRYPTED_VALUE placeholder (default: false).
   */
  encryptReasoning?: boolean;

  /**
   * Parent run ID for hierarchical multi-turn workflows (optional).
   */
  parentRunId?: string;
  /**
   * Unique identifier for this run (e.g., UUID).
   */
  runId: string;

  /**
   * Thread ID for this conversation (optional).
   */
  threadId?: string;
}

/**
 * Creates a unique message ID for tracking separate message streams.
 */
function generateMessageId(): string {
  return `msg_${randomUUID()}`;
}

/**
 * Enriches an event object with optional threadId.
 */
function enrichEvent<T extends Record<string, unknown>>(event: T, threadId: string | undefined): T {
  if (threadId === undefined) {
    return event;
  }
  return { ...event, threadId } as T;
}

/**
 * Handles delta (text content) events.
 */
function* handleDelta(
  event: PipelineEvent,
  runId: string,
  currentTextMessageId: string,
  threadId: string | undefined
): Generator<AgUiEvent> {
  if (event.content) {
    const textEventBase: TextMessageContentEvent = {
      content: event.content,
      messageId: currentTextMessageId,
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.TEXT_MESSAGE_CONTENT
    };
    if (threadId) {
      textEventBase.threadId = threadId;
    }
    yield textEventBase;
  }
}

/**
 * Handles thinking (reasoning) events and state management.
 */
function* handleThinking(
  event: PipelineEvent,
  runId: string,
  threadId: string | undefined,
  encryptReasoning: boolean,
  inReasoning: { value: boolean },
  currentReasoningMessageId: { value: string | null }
): Generator<AgUiEvent> {
  if (!inReasoning.value) {
    currentReasoningMessageId.value = generateMessageId();
    inReasoning.value = true;

    const reasoningStartBase: ReasoningStartEvent = {
      messageId: currentReasoningMessageId.value,
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.REASONING_START
    };
    if (threadId) {
      reasoningStartBase.threadId = threadId;
    }
    yield reasoningStartBase;

    const msgStartBase: ReasoningMessageStartEvent = {
      messageId: currentReasoningMessageId.value,
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.REASONING_MESSAGE_START
    };
    if (threadId) {
      msgStartBase.threadId = threadId;
    }
    yield msgStartBase;
  }

  if (event.content && currentReasoningMessageId.value) {
    const contentEventBase: ReasoningMessageContentEvent = {
      content: event.content,
      messageId: currentReasoningMessageId.value,
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.REASONING_MESSAGE_CONTENT
    };
    if (encryptReasoning) {
      contentEventBase.encryptedValue = 'encrypted';
    }
    if (threadId) {
      contentEventBase.threadId = threadId;
    }
    yield contentEventBase;
  }
}

/**
 * Closes open reasoning and tool call sessions.
 */
function* closeOpenSessions(
  runId: string,
  threadId: string | undefined,
  inReasoning: { value: boolean },
  currentReasoningMessageId: { value: string | null },
  currentToolCallId: { value: string | null }
): Generator<AgUiEvent> {
  if (inReasoning.value && currentReasoningMessageId.value) {
    const msgEndBase: ReasoningMessageEndEvent = {
      messageId: currentReasoningMessageId.value,
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.REASONING_MESSAGE_END
    };
    if (threadId) {
      msgEndBase.threadId = threadId;
    }
    yield msgEndBase;

    const reasoningEndBase: ReasoningEndEvent = {
      messageId: currentReasoningMessageId.value,
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.REASONING_END
    };
    if (threadId) {
      reasoningEndBase.threadId = threadId;
    }
    yield reasoningEndBase;

    inReasoning.value = false;
    currentReasoningMessageId.value = null;
  }

  if (currentToolCallId.value) {
    const toolEndBase: ToolCallEndEvent = {
      runId,
      timestamp: new Date().toISOString(),
      toolCallId: currentToolCallId.value,
      type: EventType.TOOL_CALL_END
    };
    if (threadId) {
      toolEndBase.threadId = threadId;
    }
    yield toolEndBase;
    currentToolCallId.value = null;
  }
}

/**
 * Handles tool_call events.
 */
async function* handleToolCall(
  event: PipelineEvent,
  runId: string,
  threadId: string | undefined,
  inReasoning: { value: boolean },
  currentReasoningMessageId: { value: string | null },
  currentToolCallId: { value: string | null }
): AsyncGenerator<AgUiEvent> {
  if (currentToolCallId.value !== event.toolCallId && event.toolCallId) {
    yield* closeOpenSessions(runId, threadId, inReasoning, currentReasoningMessageId, {
      value: currentToolCallId.value
    });

    currentToolCallId.value = event.toolCallId;
    const toolStartBase: ToolCallStartEvent = {
      runId,
      timestamp: new Date().toISOString(),
      toolCallId: currentToolCallId.value,
      toolName: event.toolName ?? 'unknown',
      type: EventType.TOOL_CALL_START
    };
    if (threadId) {
      toolStartBase.threadId = threadId;
    }
    yield toolStartBase;
  }

  if (currentToolCallId.value && event.toolArgs) {
    const toolArgsBase: ToolCallArgsEvent = {
      args: event.toolArgs,
      runId,
      timestamp: new Date().toISOString(),
      toolCallId: currentToolCallId.value,
      type: EventType.TOOL_CALL_ARGS
    };
    if (threadId) {
      toolArgsBase.threadId = threadId;
    }
    yield toolArgsBase;
  }
}

/**
 * Handles message_done events.
 */
async function* handleMessageDone(
  event: PipelineEvent,
  runId: string,
  threadId: string | undefined,
  inReasoning: { value: boolean },
  currentReasoningMessageId: { value: string | null },
  currentToolCallId: { value: string | null }
): AsyncGenerator<AgUiEvent> {
  yield* closeOpenSessions(runId, threadId, inReasoning, currentReasoningMessageId, currentToolCallId);

  const runFinishedBase: RunFinishedEvent = {
    outcome: { type: 'success' },
    runId,
    timestamp: new Date().toISOString(),
    type: EventType.RUN_FINISHED
  };
  if (event.usage) {
    runFinishedBase.usage = event.usage;
  }
  if (threadId) {
    runFinishedBase.threadId = threadId;
  }
  yield runFinishedBase;
}

/**
 * Handles error events.
 */
async function* handleError(
  event: PipelineEvent,
  runId: string,
  threadId: string | undefined,
  inReasoning: { value: boolean },
  currentReasoningMessageId: { value: string | null },
  currentToolCallId: { value: string | null }
): AsyncGenerator<AgUiEvent> {
  yield* closeOpenSessions(runId, threadId, inReasoning, currentReasoningMessageId, currentToolCallId);

  const runErrorBase: RunErrorEvent = {
    error: {
      message: event.message ?? 'Unknown error'
    },
    runId,
    timestamp: new Date().toISOString(),
    type: EventType.RUN_ERROR
  };
  if (event.code) {
    runErrorBase.error.code = event.code;
  }
  if (threadId) {
    runErrorBase.threadId = threadId;
  }
  yield runErrorBase;
}

/**
 * Converts an AsyncGenerator of PipelineEvents into an AsyncGenerator of AG-UI events.
 *
 * @param source - Stream of pipeline events
 * @param options - Configuration (runId required, threadId/parentRunId optional)
 * @returns AsyncGenerator emitting AG-UI events
 */
export async function* toAgUiStream(
  source: AsyncGenerator<PipelineEvent>,
  options: AdapterOptions
): AsyncGenerator<AgUiEvent> {
  const { runId, threadId, parentRunId, encryptReasoning } = options;

  // Initialize message tracking - use mutable refs for state
  let currentTextMessageId = generateMessageId();
  const inReasoning = { value: false };
  const currentReasoningMessageId = { value: null as string | null };
  const currentToolCallId = { value: null as string | null };

  // Emit RUN_STARTED
  const runStartedBase = {
    runId,
    timestamp: new Date().toISOString(),
    type: EventType.RUN_STARTED
  };
  const runStarted = enrichEvent(runStartedBase, threadId);
  if (parentRunId) {
    yield { ...runStarted, parentRunId } as RunStartedEvent;
  } else {
    yield runStarted as RunStartedEvent;
  }

  try {
    for await (const event of source) {
      switch (event.type) {
        case 'delta': {
          yield* handleDelta(event, runId, currentTextMessageId, threadId);
          break;
        }

        case 'thinking': {
          yield* handleThinking(
            event,
            runId,
            threadId,
            encryptReasoning === true,
            inReasoning,
            currentReasoningMessageId
          );
          break;
        }

        case 'tool_call': {
          yield* handleToolCall(event, runId, threadId, inReasoning, currentReasoningMessageId, currentToolCallId);
          break;
        }

        case 'message_done': {
          yield* handleMessageDone(event, runId, threadId, inReasoning, currentReasoningMessageId, currentToolCallId);
          currentTextMessageId = generateMessageId();
          break;
        }

        case 'error': {
          yield* handleError(event, runId, threadId, inReasoning, currentReasoningMessageId, currentToolCallId);
          break;
        }
        default: {
          break;
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown stream error';
    const runErrorBase = {
      error: {
        message: errorMessage
      },
      runId,
      timestamp: new Date().toISOString(),
      type: EventType.RUN_ERROR
    };
    yield enrichEvent(runErrorBase, threadId) as RunErrorEvent;
  }
}
