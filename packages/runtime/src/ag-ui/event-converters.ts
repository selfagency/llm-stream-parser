/**
 * AG-UI Format Converters
 *
 * Transforms AG-UI events into other frontend-specific formats.
 * Allows the same event stream to be consumed by different UI frameworks.
 */

import type { AgUiEvent } from '@agentsy/shared';
import { EventType } from '@agentsy/shared';

/**
 * CopilotKit event format (simplified).
 * Maps AG-UI events to CopilotKit's internal event format.
 */
export interface CopilotKitEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Generic custom UI event format.
 * Provides a simple, framework-agnostic event structure.
 */
export interface CustomUIEvent {
  eventType: string;
  payload: Record<string, unknown>;
  runId: string;
  threadId?: string;
  timestamp: string;
}

/**
 * Converts AG-UI events to CopilotKit format.
 *
 * @param event - AG-UI event
 * @returns CopilotKit-compatible event
 */
export function toCopilotKitEvent(event: AgUiEvent): CopilotKitEvent {
  // Map AG-UI event type to CopilotKit equivalents
  const copilotKitMapping: Record<string, string> = {
    [EventType.RUN_STARTED]: 'run:started',
    [EventType.RUN_FINISHED]: 'run:finished',
    [EventType.RUN_ERROR]: 'run:error',
    [EventType.STEP_STARTED]: 'step:started',
    [EventType.STEP_FINISHED]: 'step:finished',
    [EventType.TEXT_MESSAGE_CONTENT]: 'text_message:content',
    [EventType.REASONING_MESSAGE_CONTENT]: 'reasoning_message:content',
    [EventType.TOOL_CALL_START]: 'tool_call:start',
    [EventType.TOOL_CALL_ARGS]: 'tool_call:args',
    [EventType.TOOL_CALL_END]: 'tool_call:end'
  };

  const eventRec = event as unknown as Record<string, unknown>;
  const eventType = eventRec.type as string | undefined;
  const copilotKitType = (eventType && copilotKitMapping[eventType]) ?? eventType ?? 'unknown';

  return {
    type: copilotKitType,
    ...eventRec
  };
}

/**
 * Converts AG-UI events to generic custom UI format.
 *
 * @param event - AG-UI event
 * @returns Custom UI event
 */
export function toCustomUIEvent(event: AgUiEvent): CustomUIEvent {
  const agEvent = event as unknown as Record<string, unknown>;

  // Extract common fields
  const runId = (agEvent.runId as string) || '';
  const threadId = agEvent.threadId as string | undefined;
  const timestamp = (agEvent.timestamp as string) || new Date().toISOString();

  // Build event-specific payload
  let payload: Record<string, unknown> = {};
  const eventType = agEvent.type as string;

  switch (eventType) {
    case EventType.RUN_STARTED: {
      payload = { capabilities: agEvent.capabilities, runId };
      break;
    }

    case EventType.RUN_FINISHED: {
      payload = { outcome: agEvent.outcome, usage: agEvent.usage };
      break;
    }

    case EventType.RUN_ERROR: {
      payload = { error: agEvent.error };
      break;
    }

    case EventType.STEP_STARTED: {
      payload = { stepId: agEvent.stepId, stepIndex: agEvent.stepIndex };
      break;
    }

    case EventType.STEP_FINISHED: {
      payload = {
        duration: agEvent.duration,
        outputLength: agEvent.outputLength,
        stepId: agEvent.stepId,
        stepIndex: agEvent.stepIndex
      };
      break;
    }

    case EventType.TEXT_MESSAGE_CONTENT: {
      payload = {
        content: agEvent.content,
        messageId: agEvent.messageId
      };
      break;
    }

    case EventType.REASONING_MESSAGE_CONTENT: {
      payload = {
        content: agEvent.content,
        encrypted: !!agEvent.encryptedValue,
        messageId: agEvent.messageId
      };
      break;
    }

    case EventType.TOOL_CALL_START: {
      payload = {
        toolCallId: agEvent.toolCallId,
        toolName: agEvent.toolName
      };
      break;
    }

    case EventType.TOOL_CALL_ARGS: {
      payload = {
        args: agEvent.args,
        toolCallId: agEvent.toolCallId
      };
      break;
    }

    case EventType.TOOL_CALL_END: {
      payload = {
        output: agEvent.output,
        toolCallId: agEvent.toolCallId
      };
      break;
    }

    default: {
      // Fallback: copy all non-standard fields
      payload = { ...agEvent };
      break;
    }
  }

  return {
    eventType: agEvent.type as string,
    runId,
    ...(threadId !== undefined && { threadId }),
    timestamp,
    payload
  };
}

/**
 * Creates a converter function that transforms AG-UI events to a target format.
 *
 * @param format - Target format ('copilot-kit' or 'custom')
 * @returns Converter function
 */
export function createEventConverter(
  format: 'copilot-kit' | 'custom'
): (event: AgUiEvent) => CopilotKitEvent | CustomUIEvent {
  if (format === 'copilot-kit') {
    return toCopilotKitEvent;
  }
  if (format === 'custom') {
    return toCustomUIEvent;
  }
  throw new Error(`Unknown format: ${String(format)}`);
}

/**
 * Converts an async generator of AG-UI events to a target format.
 *
 * @param source - Source stream of AG-UI events
 * @param format - Target format
 * @returns Async generator of converted events
 */
export async function* convertEventStream(
  source: AsyncGenerator<AgUiEvent>,
  format: 'copilot-kit' | 'custom'
): AsyncGenerator<CopilotKitEvent | CustomUIEvent> {
  const converter = createEventConverter(format);
  for await (const event of source) {
    yield converter(event);
  }
}
