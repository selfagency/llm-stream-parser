// nosemgrep: export-from-syntax
// Types are imported for use in local interfaces below and then re-exported.
import type { ConversationEvent, FinishReason, JsonObject, ToolCallState, UsageInfo } from '@agentsy/shared';

export type { ConversationEvent, FinishReason, JsonObject, ToolCallState, UsageInfo };

/**
 * Represents a single UI message in a conversation.
 * Messages are immutable and events are applied to create new states.
 */
export interface UIMessage {
  /** Timestamp when message was created. */
  createdAt: Date;

  /** Finish reason if assistant message. */
  finishReason?: FinishReason;
  /** Unique message identifier. */
  id: string;

  /** Metadata: custom key-value pairs. */
  metadata?: JsonObject;

  /** Message parts (text, thinking, tool calls). */
  parts: UIMessagePart[];

  /** Message role: 'user' or 'assistant'. */
  role: 'user' | 'assistant';

  /** Token usage if assistant message. */
  usage?: UsageInfo;
}

/**
 * Union type for all possible message parts.
 */
export type UIMessagePart = UITextPart | UIThinkingPart | UIToolCallPart | UIStepPart | UIErrorPart;

/**
 * Message part types without createdAt (for event handlers that auto-add timestamps).
 * @internal
 */
export type UIMessagePartWithoutCreatedAt =
  | Omit<UITextPart, 'createdAt'>
  | Omit<UIThinkingPart, 'createdAt'>
  | Omit<UIToolCallPart, 'createdAt'>
  | Omit<UIStepPart, 'createdAt'>
  | Omit<UIErrorPart, 'createdAt'>;

/**
 * Text content part.
 */
export interface UITextPart {
  createdAt: Date;
  text: string;
  type: 'text';
}

/**
 * Thinking block part (Claude model internals).
 */
export interface UIThinkingPart {
  createdAt: Date;
  text: string;
  type: 'thinking';
}

/**
 * Tool call part (function invocation).
 */
export interface UIToolCallPart {
  argumentsText?: string;
  createdAt: Date;
  error?: string;
  id: string;
  name: string;
  parameters: JsonObject;
  result?: unknown;
  state: ToolCallState;
  type: 'tool_call';
}

/**
 * Step lifecycle marker for agent-loop aware UIs.
 */
export interface UIStepPart {
  createdAt: Date;
  status: 'started' | 'finished';
  stepIndex: number;
  type: 'step';
  usage?: UsageInfo;
}

/**
 * Error part associated with a message.
 */
export interface UIErrorPart {
  code?: string;
  createdAt: Date;
  message: string;
  type: 'error';
}

/**
 * Complete conversation state (read-only).
 */
export interface UIConversation {
  /** Unique conversation identifier. */
  id: string;

  /** Last applied event timestamp. */
  lastEventAt: Date;

  /** All messages in order. */
  messages: UIMessage[];

  /** Metadata: custom key-value pairs. */
  metadata?: JsonObject | undefined;

  /** Current streaming status for the conversation. */
  status: 'idle' | 'streaming' | 'error';

  /** Current step index in agent loop. */
  stepIndex: number;

  /** Total token count across all messages. */
  totalTokens: number;

  /** Aggregated usage across all messages. */
  totalUsage: UsageInfo;
}
