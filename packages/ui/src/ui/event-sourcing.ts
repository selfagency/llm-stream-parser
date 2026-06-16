import { addPartToMessage, finishMessage, updateToolCallInMessage } from './event-helpers.js';
import type { ConversationEvent, UIConversation, UIMessage } from './types.js';

/**
 * Handle message_started event: create new message.
 * @internal
 */
function handleMessageStarted(state: UIConversation, messageId: string, role: string, now: Date): UIConversation {
  const newMessage: UIMessage = {
    createdAt: now,
    id: messageId,
    parts: [],
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    role: role as 'user' | 'assistant'
  };

  return {
    ...state,
    lastEventAt: now,
    messages: [...state.messages, newMessage],
    status: 'streaming'
  };
}

/**
 * Handle step_updated event: update current step index.
 * @internal
 */
function handleStepUpdated(state: UIConversation, stepIndex: number, now: Date): UIConversation {
  return {
    ...state,
    lastEventAt: now,
    status: state.status,
    stepIndex
  };
}

/**
 * Handle conversation_reset event: reset to empty conversation.
 * @internal
 */
function handleConversationReset(state: UIConversation, now: Date): UIConversation {
  return {
    id: state.id,
    lastEventAt: now,
    messages: [],
    metadata: undefined,
    status: 'idle',
    stepIndex: 0,
    totalTokens: 0,
    totalUsage: {}
  };
}

function addStepPart(
  state: UIConversation,
  event: Extract<ConversationEvent, { type: 'step_started' | 'step_finished' }>
): UIConversation {
  const nextState = handleStepUpdated(state, event.stepIndex, new Date());
  if (event.messageId === undefined) {
    return nextState;
  }

  return addPartToMessage(nextState, event.messageId, {
    status: event.type === 'step_started' ? 'started' : 'finished',
    stepIndex: event.stepIndex,
    type: 'step',
    ...(event.usage === undefined ? {} : { usage: event.usage })
  });
}

/**
 * Pure function: Apply a single event to conversation state, returning new state.
 * Original state is never mutated.
 *
 * @param state - Current conversation state
 * @param event - Event to apply
 * @returns New conversation state with event applied
 */
// eslint-disable-next-line complexity
export function applyConversationEvent(state: UIConversation, event: ConversationEvent): UIConversation {
  const now = new Date();

  switch (event.type) {
    case 'message_started': {
      return handleMessageStarted(state, event.messageId, event.role, now);
    }

    case 'text_part_added': {
      return addPartToMessage(state, event.messageId, {
        text: event.text,
        type: 'text'
      } as const);
    }

    case 'thinking_part_added': {
      return addPartToMessage(state, event.messageId, {
        text: event.text,
        type: 'thinking'
      } as const);
    }

    case 'tool_call_part_added': {
      return addPartToMessage(state, event.messageId, {
        id: event.toolCall.id,
        name: event.toolCall.name,
        parameters: event.toolCall.parameters,
        state: event.toolCall.state ?? 'input-complete',
        type: 'tool_call',
        ...(event.toolCall.argumentsText === undefined ? {} : { argumentsText: event.toolCall.argumentsText })
      } as const);
    }

    case 'tool_call_updated': {
      return updateToolCallInMessage(state, event.messageId, event.toolCallId, {
        ...(event.state === undefined ? {} : { state: event.state }),
        ...(event.argumentsTextDelta === undefined ? {} : { argumentsText: event.argumentsTextDelta }),
        ...(event.parameters === undefined ? {} : { parameters: event.parameters })
      });
    }

    case 'tool_call_result_added': {
      return updateToolCallInMessage(state, event.messageId, event.toolCallId, {
        ...(event.isError ? { error: String(event.result), state: 'output-error' } : { state: 'output-available' }),
        ...(event.isError ? {} : { result: event.result })
      });
    }

    case 'message_finished': {
      return finishMessage(state, event.messageId, event.finishReason, event.usage);
    }

    case 'step_started':
    case 'step_finished': {
      return addStepPart(state, event);
    }

    case 'step_updated': {
      return handleStepUpdated(state, event.stepIndex, now);
    }

    case 'error_part_added': {
      const nextState = addPartToMessage(state, event.messageId, {
        message: event.message,
        type: 'error',
        ...(event.code === undefined ? {} : { code: event.code })
      });

      return {
        ...nextState,
        status: 'error'
      };
    }

    case 'conversation_reset': {
      return handleConversationReset(state, now);
    }

    default: {
      // Exhaustiveness check: if we reach here, TypeScript knows event is never
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
