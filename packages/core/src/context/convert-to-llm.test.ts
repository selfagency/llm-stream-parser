import type { CompletionMessage } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';

import { convertToAnthropic, convertToOpenAI } from './convert-to-llm.js';

const userMsg = (content: string): CompletionMessage => ({
  content,
  role: 'user'
});

const assistantMsg = (content: string): CompletionMessage => ({
  content,
  role: 'assistant'
});

const systemMsg = (content: string): CompletionMessage => ({
  content,
  role: 'system'
});

describe('convertToOpenAI', () => {
  it('formats basic messages for OpenAI', async () => {
    const messages: CompletionMessage[] = [systemMsg('You are a bot.'), userMsg('Hello'), assistantMsg('Hi!')];

    const body = await convertToOpenAI({ messages, provider: 'openai', model: 'gpt-4' });

    expect(body).toHaveProperty('model', 'gpt-4');
    expect(body).toHaveProperty('messages');
    const msgs = body.messages as Record<string, unknown>[];
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toMatchObject({ role: 'system', content: 'You are a bot.' });
    expect(msgs[1]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(msgs[2]).toMatchObject({ role: 'assistant', content: 'Hi!' });
  });

  it('includes tool_calls on assistant messages', async () => {
    const messages: CompletionMessage[] = [
      userMsg('What is the weather?'),
      {
        content: null,
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"London"}' }
          }
        ]
      }
    ];

    const body = await convertToOpenAI({ messages, provider: 'openai', model: 'gpt-4' });

    const msgs = body.messages as Record<string, unknown>[];
    const assistantBody = msgs[1] as Record<string, unknown>;
    expect(assistantBody.role).toBe('assistant');
    expect(assistantBody.tool_calls).toBeDefined();
    expect(assistantBody.tool_calls).toHaveLength(1);
  });

  it('includes tool_call_id on tool result messages', async () => {
    const messages: CompletionMessage[] = [
      {
        content: '{"temperature": 22}',
        role: 'tool',
        toolCallId: 'call_123'
      }
    ];

    const body = await convertToOpenAI({ messages, provider: 'openai', model: 'gpt-4' });

    const msgs = body.messages as Record<string, unknown>[];
    expect(msgs[0]).toMatchObject({
      content: '{"temperature": 22}',
      role: 'tool',
      tool_call_id: 'call_123'
    });
  });
});

describe('convertToAnthropic', () => {
  it('formats basic messages for Anthropic', async () => {
    const messages: CompletionMessage[] = [systemMsg('You are a bot.'), userMsg('Hello'), assistantMsg('Hi!')];

    const body = await convertToAnthropic({ messages, provider: 'anthropic', model: 'claude-3-opus' });

    expect(body).toHaveProperty('model', 'claude-3-opus');
    expect(body).toHaveProperty('system', 'You are a bot.');

    const msgs = body.messages as Record<string, unknown>[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ role: 'user' });
    expect(msgs[1]).toMatchObject({ role: 'assistant' });
  });

  it('maps tool calls to tool_use content blocks', async () => {
    const messages: CompletionMessage[] = [
      userMsg('Weather?'),
      {
        content: '',
        role: 'assistant',
        tool_calls: [
          {
            id: 'toolu_abc',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Paris"}' }
          }
        ]
      }
    ];

    const body = await convertToAnthropic({ messages, provider: 'anthropic', model: 'claude-3-opus' });

    const msgs = body.messages as Record<string, unknown>[];
    const assistantBody = msgs[1] as { content: unknown[] };
    expect(Array.isArray(assistantBody.content)).toBe(true);

    const toolUse = (assistantBody.content as Record<string, unknown>[]).find(c => c.type === 'tool_use');
    expect(toolUse).toBeDefined();
    expect(toolUse?.name).toBe('get_weather');
    expect(toolUse?.id).toBe('toolu_abc');
  });

  it('maps tool results to tool_result blocks', async () => {
    const messages: CompletionMessage[] = [
      {
        content: '{"temp": 18}',
        role: 'tool',
        toolCallId: 'toolu_abc'
      }
    ];

    const body = await convertToAnthropic({ messages, provider: 'anthropic', model: 'claude-3-opus' });

    const msgs = body.messages as Record<string, unknown>[];
    const toolResult = msgs[0] as { content: unknown[] };
    expect(Array.isArray(toolResult.content)).toBe(true);

    const block = (toolResult.content as Record<string, unknown>[]).find(c => c.type === 'tool_result');
    expect(block).toBeDefined();
    expect(block?.tool_use_id).toBe('toolu_abc');
  });

  it('extracts system messages into top-level system field', async () => {
    const messages: CompletionMessage[] = [
      systemMsg('System instruction A.'),
      userMsg('Hello'),
      systemMsg('System instruction B.')
    ];

    const body = await convertToAnthropic({ messages, provider: 'anthropic', model: 'claude-3-opus' });

    expect(body.system).toContain('System instruction A.');
    expect(body.system).toContain('System instruction B.');
    const msgs = body.messages as Record<string, unknown>[];
    expect(msgs).toHaveLength(1);
  });
});
