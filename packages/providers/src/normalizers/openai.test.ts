import { describe, expect, it } from 'vitest';

import { normalizeOpenAIChatChunk } from './openai.js';

// ---------------------------------------------------------------------------
// OpenAI Chat Completions streaming chunk normalizer
// ---------------------------------------------------------------------------

describe('normalizeOpenAIChatChunk', () => {
  it('maps content delta to chunk.content', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [
        {
          delta: { content: 'Hello', role: 'assistant' },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.content).toBe('Hello');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps thinking/reasoning_content delta to chunk.thinking', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [
        {
          delta: { reasoning_content: 'Thinking...', role: 'assistant' },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.thinking).toBe('Thinking...');
  });

  it('sets done=true on finish_reason stop', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason stop to finishReason stop', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps finish_reason tool_calls to finishReason tool-calls', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason length to finishReason length', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: {}, finish_reason: 'length', index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('length');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason content_filter to finishReason content-filter', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: {}, finish_reason: 'content_filter', index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('content-filter');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('extracts tool_call start from delta with id+name', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              { function: { arguments: '', name: 'get_weather' }, id: 'call_xyz', index: 0, type: 'function' }
            ]
          },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('call_xyz');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
  });

  it('maps tool_call argument delta', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [
        {
          delta: {
            tool_calls: [{ function: { arguments: '{"city"', name: null }, index: 0 }]
          },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"city"');
  });

  it('extracts usage from final chunk', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk',
      usage: { completion_tokens: 20, prompt_tokens: 10, total_tokens: 30 }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(10);
    expect(result?.chunk.usage?.outputTokens).toBe(20);
    expect(result?.chunk.usage?.totalTokens).toBe(30);
  });

  it('returns null for unrecognizable input', () => {
    expect(normalizeOpenAIChatChunk(null)).toBeNull();
    expect(normalizeOpenAIChatChunk({ object: 'something.else' })).toBeNull();
    expect(normalizeOpenAIChatChunk('raw string')).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeOpenAIChatChunk({ choices: 'not-an-array' })).not.toThrow();
    expect(() => normalizeOpenAIChatChunk({ choices: [null] })).not.toThrow();
    expect(() => normalizeOpenAIChatChunk(undefined)).not.toThrow();
  });
});
