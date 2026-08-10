/**
 * Conversation event types for state machine transitions.
 *
 * These events drive conversation state transitions in response to LLM
 * streaming output, tool execution, and user interactions.
 */

import type { JsonObject } from 'type-fest';

import type { FinishReason, ToolCallState } from './tool-calls.js';
import type { UsageInfo } from './usage.js';

/**
 * Events that drive conversation state transitions.
 */
export type ConversationEvent =
  | { type: 'message_started'; role: 'user' | 'assistant'; messageId: string }
  | { type: 'text_part_added'; messageId: string; text: string }
  | { type: 'thinking_part_added'; messageId: string; text: string }
  | {
      type: 'tool_call_part_added';
      messageId: string;
      toolCall: {
        id: string;
        name: string;
        parameters: JsonObject;
        state?: ToolCallState;
        argumentsText?: string;
      };
    }
  | {
      type: 'tool_call_updated';
      messageId: string;
      toolCallId: string;
      state?: ToolCallState;
      argumentsTextDelta?: string;
      parameters?: JsonObject;
    }
  | {
      type: 'tool_call_result_added';
      messageId: string;
      toolCallId: string;
      result: unknown;
      isError?: boolean;
    }
  | {
      type: 'message_finished';
      messageId: string;
      finishReason?: FinishReason;
      usage?: UsageInfo;
    }
  | {
      type: 'step_started';
      stepIndex: number;
      messageId?: string;
      usage?: UsageInfo;
    }
  | {
      type: 'step_finished';
      stepIndex: number;
      messageId?: string;
      usage?: UsageInfo;
    }
  | { type: 'step_updated'; stepIndex: number }
  | {
      type: 'error_part_added';
      messageId: string;
      message: string;
      code?: string;
    }
  | { type: 'conversation_reset' };
