import type { OutboundAdapterOptions, OutboundMessage, OutboundPart } from './types.js';

export const OPENAI_COMPATIBLE_PROVIDERS = ['openai', 'deepseek', 'kimi', 'qwen', 'llama', 'granite'] as const;

export type OpenAICompatibleProvider = (typeof OPENAI_COMPATIBLE_PROVIDERS)[number];

export function isOpenAICompatibleProvider(value: string): value is OpenAICompatibleProvider {
  return (OPENAI_COMPATIBLE_PROVIDERS as readonly string[]).includes(value);
}

export interface OpenAICompatibleToolCall {
  function: {
    name: string;
    arguments: string;
  };
  id: string;
  type: 'function';
}

export type OpenAICompatibleMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenAICompatibleToolCall[];
    }
  | { role: 'tool'; content: string; tool_call_id: string };

/**
 * Shared outbound mapper for OpenAI-compatible chat APIs.
 */
export function toOpenAICompatibleMessages(
  messages: readonly OutboundMessage[],
  _options: OutboundAdapterOptions = {}
): OpenAICompatibleMessage[] {
  return messages.map(mapOutboundMessage);
}

/** Map a single outbound message to the OpenAI-compatible wire shape. */
function mapOutboundMessage(msg: OutboundMessage): OpenAICompatibleMessage {
  const text = msg.parts
    .filter((p: OutboundPart): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('\n');

  const toolCallPart = msg.parts.find(p => p.type === 'tool-call');
  const toolResultPart = msg.parts.find(p => p.type === 'tool-result');

  if (toolResultPart?.type === 'tool-result') {
    return {
      content: toolResultPart.content,
      role: 'tool',
      tool_call_id: toolResultPart.callId
    };
  }

  if (msg.role === 'system') {
    return { content: text, role: 'system' };
  }
  if (msg.role === 'user') {
    return { content: text, role: 'user' };
  }

  if (toolCallPart?.type === 'tool-call') {
    return {
      content: text || null,
      role: 'assistant',
      tool_calls: [
        {
          function: {
            arguments: JSON.stringify(toolCallPart.input ?? {}),
            name: toolCallPart.name
          },
          id: toolCallPart.callId,
          type: 'function'
        }
      ]
    };
  }

  return { content: text, role: 'assistant' };
}

/**
 * Provider-aware alias that validates the provider belongs to the OpenAI-compatible set.
 */
export function toOpenAICompatibleProviderMessages(
  provider: OpenAICompatibleProvider,
  messages: readonly OutboundMessage[],
  options: OutboundAdapterOptions = {}
): OpenAICompatibleMessage[] {
  if (!isOpenAICompatibleProvider(provider)) {
    return [];
  }

  return toOpenAICompatibleMessages(messages, options);
}
