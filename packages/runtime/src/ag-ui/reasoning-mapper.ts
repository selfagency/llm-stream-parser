/**
 * AG-UI Reasoning Event Mapper
 *
 * Maps reasoning content from agent loop steps to AG-UI reasoning events.
 * This allows step-level reasoning to be streamed as REASONING_* events.
 */

import type {
  ReasoningEndEvent,
  ReasoningMessageContentEvent,
  ReasoningMessageEndEvent,
  ReasoningMessageStartEvent,
  ReasoningStartEvent
} from '@agentsy/shared';
import { EventType } from '@agentsy/shared';
import { randomUUID } from 'node:crypto';

export interface ReasoningMapperOptions {
  encryptReasoning?: boolean;
  runId: string;
  threadId?: string;
}

/**
 * Creates AG-UI reasoning events from step reasoning content.
 * Emits a complete REASONING_* event sequence for a chunk of reasoning text.
 *
 * @param reasoning - Reasoning content to map
 * @param options - Configuration
 * @returns Array of AG-UI events
 */
export function mapReasoningToEvents(
  reasoning: string | undefined,
  options: ReasoningMapperOptions
): (
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
)[] {
  const events: (
    | ReasoningStartEvent
    | ReasoningMessageStartEvent
    | ReasoningMessageContentEvent
    | ReasoningMessageEndEvent
    | ReasoningEndEvent
  )[] = [];

  if (reasoning === undefined || reasoning === '') {
    return events;
  }

  const { runId, threadId, encryptReasoning } = options;
  const messageId = `msg_${randomUUID()}`;
  const timestamp = new Date().toISOString();

  // REASONING_START
  const reasoningStart: ReasoningStartEvent = {
    type: EventType.REASONING_START,
    runId,
    ...(threadId !== undefined && { threadId }),
    messageId,
    timestamp
  } as ReasoningStartEvent;
  events.push(reasoningStart);

  // REASONING_MESSAGE_START
  const msgStart: ReasoningMessageStartEvent = {
    type: EventType.REASONING_MESSAGE_START,
    runId,
    ...(threadId !== undefined && { threadId }),
    messageId,
    timestamp
  } as ReasoningMessageStartEvent;
  events.push(msgStart);

  // REASONING_MESSAGE_CONTENT
  const contentEvent: ReasoningMessageContentEvent = {
    type: EventType.REASONING_MESSAGE_CONTENT,
    runId,
    ...(threadId !== undefined && { threadId }),
    messageId,
    content: reasoning,
    ...(encryptReasoning === true && { encryptedValue: 'encrypted' }),
    timestamp
  } as ReasoningMessageContentEvent;
  events.push(contentEvent);

  // REASONING_MESSAGE_END
  const msgEnd: ReasoningMessageEndEvent = {
    type: EventType.REASONING_MESSAGE_END,
    runId,
    ...(threadId !== undefined && { threadId }),
    messageId,
    timestamp
  } as ReasoningMessageEndEvent;
  events.push(msgEnd);

  // REASONING_END
  const reasoningEnd: ReasoningEndEvent = {
    type: EventType.REASONING_END,
    runId,
    ...(threadId !== undefined && { threadId }),
    messageId,
    timestamp
  } as ReasoningEndEvent;
  events.push(reasoningEnd);

  return events;
}
