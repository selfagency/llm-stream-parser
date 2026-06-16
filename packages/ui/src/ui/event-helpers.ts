import type { FinishReason, UsageInfo } from '@agentsy/shared';

import type { UIConversation, UIMessagePart, UIMessagePartWithoutCreatedAt, UIToolCallPart } from './types.js';

/**
 * Helper to reduce duplication in event handlers that add parts to messages.
 * Finds message by ID and appends a new part to it. Automatically adds createdAt.
 *
 * @internal
 */
export function addPartToMessage(
  state: UIConversation,
  messageId: string,
  part: UIMessagePartWithoutCreatedAt
): UIConversation {
  const now = new Date();

  const messages = state.messages.map(msg => {
    if (msg.id === messageId) {
      return {
        ...msg,
        parts: [...msg.parts, { ...part, createdAt: now } satisfies UIMessagePart]
      };
    }
    return msg;
  });

  return {
    ...state,
    lastEventAt: now,
    messages
  };
}

/**
 * Helper to update message finish state (finishReason, usage, token accumulation).
 * @internal
 */
export function finishMessage(
  state: UIConversation,
  messageId: string,
  finishReason: FinishReason | undefined,
  usage: UsageInfo | undefined
): UIConversation {
  const now = new Date();
  let { totalTokens } = state;
  const totalUsage: UsageInfo = { ...state.totalUsage };

  const messages = state.messages.map(msg => {
    if (msg.id === messageId) {
      totalTokens += usage?.totalTokens ?? 0;
      totalUsage.inputTokens = (totalUsage.inputTokens ?? 0) + (usage?.inputTokens ?? 0);
      totalUsage.outputTokens = (totalUsage.outputTokens ?? 0) + (usage?.outputTokens ?? 0);
      totalUsage.totalTokens = (totalUsage.totalTokens ?? 0) + (usage?.totalTokens ?? 0);

      return {
        ...msg,
        ...(finishReason === undefined ? {} : { finishReason }),
        ...(usage === undefined ? {} : { usage })
      };
    }
    return msg;
  });

  return {
    ...state,
    lastEventAt: now,
    messages,
    status: state.status === 'error' ? 'error' : 'idle',
    totalTokens,
    totalUsage
  };
}

/**
 * Update an existing tool-call part in a message.
 * @internal
 */
export function updateToolCallInMessage(
  state: UIConversation,
  messageId: string,
  toolCallId: string,
  updates: Partial<Pick<UIToolCallPart, 'state' | 'argumentsText' | 'parameters' | 'result' | 'error'>>
): UIConversation {
  const now = new Date();

  const messages = state.messages.map(msg => {
    if (msg.id !== messageId) {
      return msg;
    }

    return {
      ...msg,
      parts: msg.parts.map(part => {
        if (part.type !== 'tool_call' || part.id !== toolCallId) {
          return part;
        }

        return {
          ...part,
          ...(updates.state === undefined ? {} : { state: updates.state }),
          ...(updates.parameters === undefined ? {} : { parameters: updates.parameters }),
          ...(updates.result === undefined ? {} : { result: updates.result }),
          ...(updates.error === undefined ? {} : { error: updates.error }),
          ...(updates.argumentsText === undefined
            ? {}
            : {
                argumentsText: (part.argumentsText ?? '') + updates.argumentsText
              })
        };
      })
    };
  });

  return {
    ...state,
    lastEventAt: now,
    messages
  };
}
