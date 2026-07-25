/**
 * Provider-specific message format converter.
 *
 * Runs second in the two-stage context preparation.  Converts the
 * internal `CompletionMessage` array into the request body format
 * expected by a specific LLM provider (OpenAI, Anthropic, etc.).
 */

import type { CompletionMessage } from '@agentsy/shared';

export interface ConvertToLlmInput {
  /** The (already transformed) internal messages. */
  messages: CompletionMessage[];
  /** Target model identifier. */
  model: string;
  /** Target provider identifier (e.g. 'openai', 'anthropic', 'gemini'). */
  provider: string;
}

/**
 * A function that converts internal messages to a provider-specific format.
 *
 * Returns a plain object suitable for serialisation as the JSON request
 * body to the provider's chat completions endpoint.
 */
export type ConvertToLlmFn = (input: ConvertToLlmInput) => unknown;

/**
 * Convert internal `CompletionMessage[]` to the OpenAI Chat Completion
 * request body format.
 *
 * Each message is mapped with its role and string content.  Tool calls
 * on assistant messages and tool result ids on tool messages are
 * included when present.
 */
export function convertToOpenAI(input: ConvertToLlmInput): Record<string, unknown> {
  const { messages, model } = input;

  return {
    messages: messages.map(msg => {
      const entry: Record<string, unknown> = {
        content: normalizeContent(msg.content),
        role: msg.role
      };

      if (msg.tool_calls !== undefined && msg.role === 'assistant') {
        entry.tool_calls = msg.tool_calls;
      }

      if (msg.toolCallId !== undefined) {
        entry.tool_call_id = msg.toolCallId;
      }

      return entry;
    }),
    model
  };
}

/**
 * Convert internal `CompletionMessage[]` to the Anthropic Messages API
 * request body format.
 *
 * System messages are extracted into a top-level `system` field.
 * Tool calls and tool results are mapped to Anthropic's content-block
 * format.
 */
export function convertToAnthropic(input: ConvertToLlmInput): Record<string, unknown> {
  const { messages, model } = input;

  const systemMessages: CompletionMessage[] = [];
  const nonSystemMessages: CompletionMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  const body: Record<string, unknown> = {
    messages: nonSystemMessages.map(msg => mapAnthropicMessage(msg)),
    model
  };

  if (systemMessages.length > 0) {
    body.system = extractSystemText(systemMessages);
  }

  return body;
}

/**
 * Extract system message text content into a single string.
 */
function extractSystemText(messages: CompletionMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      if (msg.content) {
        parts.push(msg.content);
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text') {
          parts.push(part.text);
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * Map a single internal message to Anthropic's message format.
 */
function mapAnthropicMessage(msg: CompletionMessage): Record<string, unknown> {
  const content: unknown[] = [];

  // Push the text content if present.
  const text = normalizeContent(msg.content);
  if (text !== null) {
    content.push({ text, type: 'text' });
  }

  // Map tool calls to Anthropic's tool_use content blocks.
  if (msg.tool_calls !== undefined && msg.role === 'assistant') {
    for (const tc of msg.tool_calls) {
      content.push({
        id: tc.id,
        input: (() => {
          try {
            return JSON.parse(tc.function.arguments);
          } catch {
            return {};
          }
        })(),
        name: tc.function.name,
        type: 'tool_use'
      });
    }
  }

  // Map tool results.
  if (msg.role === 'tool' && msg.toolCallId !== undefined) {
    content.push({
      content: msg.content,
      tool_use_id: msg.toolCallId,
      type: 'tool_result'
    });
  }

  return {
    content: content.length > 0 ? content : '',
    role: msg.role === 'tool' ? 'user' : msg.role
  };
}

/**
 * Normalise message content to a string or null.
 */
function normalizeContent(content: string | import('@agentsy/shared').ContentPart[] | null): string | null {
  if (content === null || content === undefined) {
    return null;
  }
  if (typeof content === 'string') {
    return content || null;
  }
  const parts: string[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      parts.push(part.text);
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}
