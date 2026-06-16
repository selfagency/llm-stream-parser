import { describe, expect, it } from 'vitest';

import { normalizeAnthropicEvent } from './anthropic.js';
import { normalizeBedrockConverseEvent } from './bedrock.js';
import { normalizeCohereEvent } from './cohere.js';
import { normalizeDeepSeekChunk } from './deepseek.js';
import { normalizeGeminiChunk } from './gemini.js';
import { normalizeHuggingFaceTGIChunk } from './hf-tgi.js';
import { normalizeMistralChunk } from './mistral.js';
import { normalizeOllamaChatChunk, normalizeOllamaGenerateChunk } from './ollama.js';
import { normalizeOpenAIChatChunk } from './openai.js';
import {
  isOpenAICompatibleNormalizerProvider,
  normalizeOpenAICompatibleChunk,
  OPENAI_COMPATIBLE_NORMALIZER_PROVIDERS
} from './openai-compatible.js';
import { normalizeOpenAIResponseEvent } from './openai-responses.js';
import { normalizeZAiChunk } from './zai.js';

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
  });

  it('does not set finishReason on mid-stream chunks', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: { content: 'hi' }, finish_reason: null, index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBeUndefined();
  });

  it('sets done=true on finish_reason tool_calls', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }],
      created: 1_700_000_000,
      id: 'chatcmpl-abc',
      model: 'gpt-4o',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('sets done=true on other terminal finish reasons (length, content_filter)', () => {
    for (const finish_reason of ['length', 'content_filter']) {
      const result = normalizeOpenAIChatChunk({
        choices: [{ delta: {}, finish_reason, index: 0 }],
        created: 1_700_000_000,
        id: 'chatcmpl-abc',
        model: 'gpt-4o',
        object: 'chat.completion.chunk'
      });
      expect(result?.chunk.done).toBeTruthy();
    }
  });

  it('maps tool_call delta to nativeToolCallDeltas', () => {
    const result = normalizeOpenAIChatChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                function: { arguments: '', name: 'get_weather' },
                id: 'call_xyz',
                index: 0,
                type: 'function'
              }
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

describe('openai-compatible normalizer', () => {
  it('exposes expected provider registry', () => {
    expect(OPENAI_COMPATIBLE_NORMALIZER_PROVIDERS).toStrictEqual(['openai', 'kimi', 'qwen', 'llama', 'granite']);
  });

  it('checks provider compatibility', () => {
    expect(isOpenAICompatibleNormalizerProvider('openai')).toBeTruthy();
    expect(isOpenAICompatibleNormalizerProvider('qwen')).toBeTruthy();
    expect(isOpenAICompatibleNormalizerProvider('mistral')).toBeFalsy();
  });

  it('normalizes openai-compatible chunks through shared helper', () => {
    const result = normalizeOpenAICompatibleChunk('kimi', {
      choices: [
        {
          delta: { content: 'Hello from kimi' },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      id: 'chatcmpl-kimi-1',
      model: 'kimi-k2',
      object: 'chat.completion.chunk'
    });

    expect(result?.chunk.content).toBe('Hello from kimi');
  });
});

// ---------------------------------------------------------------------------
// OpenAI Responses API streaming event normalizer
// ---------------------------------------------------------------------------

describe('normalizeOpenAIResponseEvent', () => {
  it('maps response.output_text.delta to chunk.content', () => {
    const result = normalizeOpenAIResponseEvent({
      content_index: 0,
      delta: 'Hello ',
      event_id: 'ev_001',
      item_id: 'item_001',
      output_index: 0,
      type: 'response.output_text.delta'
    });
    expect(result?.chunk.content).toBe('Hello ');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps response.output_text.delta with empty delta to empty content', () => {
    const result = normalizeOpenAIResponseEvent({
      delta: '',
      type: 'response.output_text.delta'
    });
    expect(result?.chunk.content).toBe('');
  });

  it('maps response.refusal.delta to chunk.content (refusal text)', () => {
    const result = normalizeOpenAIResponseEvent({
      content_index: 0,
      delta: 'I cannot help with that.',
      event_id: 'ev_002',
      item_id: 'item_001',
      output_index: 0,
      type: 'response.refusal.delta'
    });
    expect(result?.chunk.content).toBe('I cannot help with that.');
  });

  it('maps response.output_item.added for function_call to nativeToolCallDeltas', () => {
    const result = normalizeOpenAIResponseEvent({
      event_id: 'ev_003',
      item: {
        call_id: 'call_abc',
        id: 'item_001',
        name: 'get_weather',
        status: 'in_progress',
        type: 'function_call'
      },
      output_index: 0,
      type: 'response.output_item.added'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('call_abc');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBeUndefined();
  });

  it('maps response.function_call_arguments.delta to nativeToolCallDeltas', () => {
    const result = normalizeOpenAIResponseEvent({
      call_id: 'call_abc',
      delta: '{"city"',
      event_id: 'ev_004',
      item_id: 'item_001',
      output_index: 0,
      type: 'response.function_call_arguments.delta'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('call_abc');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"city"');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBeUndefined();
  });

  it('maps response.completed to done=true with usage', () => {
    const result = normalizeOpenAIResponseEvent({
      event_id: 'ev_005',
      response: {
        id: 'resp_001',
        status: 'completed',
        usage: { input_tokens: 15, output_tokens: 25, total_tokens: 40 }
      },
      type: 'response.completed'
    });
    expect(result?.chunk.done).toBeTruthy();
    expect(result?.chunk.usage?.inputTokens).toBe(15);
    expect(result?.chunk.usage?.outputTokens).toBe(25);
    expect(result?.chunk.usage?.totalTokens).toBe(40);
  });

  it('maps response.completed to finishReason stop', () => {
    const result = normalizeOpenAIResponseEvent({
      response: { id: 'resp_001', status: 'completed' },
      type: 'response.completed'
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('returns null for unknown event types', () => {
    expect(normalizeOpenAIResponseEvent({ type: 'response.created' })).toBeNull();
    expect(normalizeOpenAIResponseEvent({ type: 'response.in_progress' })).toBeNull();
    expect(normalizeOpenAIResponseEvent({ type: 'response.output_item.done' })).toBeNull();
    expect(normalizeOpenAIResponseEvent({ type: 'something.unknown' })).toBeNull();
  });

  it('returns null for non-object or missing type', () => {
    expect(normalizeOpenAIResponseEvent(null)).toBeNull();
    expect(normalizeOpenAIResponseEvent('raw string')).toBeNull();
    expect(normalizeOpenAIResponseEvent({})).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() =>
      normalizeOpenAIResponseEvent({
        delta: null,
        type: 'response.output_text.delta'
      })
    ).not.toThrow();
    expect(() =>
      normalizeOpenAIResponseEvent({
        response: null,
        type: 'response.completed'
      })
    ).not.toThrow();
    expect(() => normalizeOpenAIResponseEvent(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Anthropic Claude SSE streaming event normalizer
// ---------------------------------------------------------------------------

describe('normalizeAnthropicEvent', () => {
  it('extracts input token usage from message_start', () => {
    const result = normalizeAnthropicEvent({
      message: {
        content: [],
        id: 'msg_01',
        model: 'claude-opus-4-6',
        role: 'assistant',
        stop_reason: null,
        type: 'message',
        usage: { input_tokens: 25, output_tokens: 1 }
      },
      type: 'message_start'
    });
    expect(result?.chunk.usage?.inputTokens).toBe(25);
  });

  it('maps content_block_delta text_delta to chunk.content', () => {
    const result = normalizeAnthropicEvent({
      delta: { text: 'Hello!', type: 'text_delta' },
      index: 0,
      type: 'content_block_delta'
    });
    expect(result?.chunk.content).toBe('Hello!');
  });

  it('maps content_block_delta thinking_delta to chunk.thinking', () => {
    const result = normalizeAnthropicEvent({
      delta: { thinking: 'Let me reason...', type: 'thinking_delta' },
      index: 0,
      type: 'content_block_delta'
    });
    expect(result?.chunk.thinking).toBe('Let me reason...');
  });

  it('maps content_block_delta input_json_delta to nativeToolCallDeltas', () => {
    const result = normalizeAnthropicEvent({
      delta: { partial_json: '{"location":"', type: 'input_json_delta' },
      index: 1,
      type: 'content_block_delta'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"location":"');
  });

  it('maps content_block_start tool_use to nativeToolCallDeltas with name+id', () => {
    const result = normalizeAnthropicEvent({
      content_block: {
        id: 'toolu_01A09',
        input: {},
        name: 'get_weather',
        type: 'tool_use'
      },
      index: 1,
      type: 'content_block_start'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('toolu_01A09');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBeUndefined();
  });

  it('returns null for content_block_start with text type', () => {
    const result = normalizeAnthropicEvent({
      content_block: { text: '', type: 'text' },
      index: 0,
      type: 'content_block_start'
    });
    expect(result).toBeNull();
  });

  it('maps message_delta stop_reason end_turn to done=true with output tokens', () => {
    const result = normalizeAnthropicEvent({
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      type: 'message_delta',
      usage: { output_tokens: 42 }
    });
    expect(result?.chunk.done).toBeTruthy();
    expect(result?.chunk.usage?.outputTokens).toBe(42);
  });

  it('maps message_delta stop_reason end_turn to finishReason stop', () => {
    const result = normalizeAnthropicEvent({
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      type: 'message_delta',
      usage: { output_tokens: 5 }
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps message_delta stop_reason tool_use to finishReason tool-calls', () => {
    const result = normalizeAnthropicEvent({
      delta: { stop_reason: 'tool_use' },
      type: 'message_delta',
      usage: { output_tokens: 10 }
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
  });

  it('maps message_delta stop_reason max_tokens to finishReason length', () => {
    const result = normalizeAnthropicEvent({
      delta: { stop_reason: 'max_tokens' },
      type: 'message_delta',
      usage: { output_tokens: 100 }
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps message_delta stop_reason tool_use to done=true', () => {
    const result = normalizeAnthropicEvent({
      delta: { stop_reason: 'tool_use' },
      type: 'message_delta',
      usage: { output_tokens: 10 }
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps message_stop to done=true', () => {
    const result = normalizeAnthropicEvent({ type: 'message_stop' });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('returns null for unknown/informational event types', () => {
    expect(normalizeAnthropicEvent({ index: 0, type: 'content_block_stop' })).toBeNull();
    expect(normalizeAnthropicEvent({ type: 'ping' })).toBeNull();
  });

  it('returns null for non-object or missing type', () => {
    expect(normalizeAnthropicEvent(null)).toBeNull();
    expect(normalizeAnthropicEvent('text')).toBeNull();
    expect(normalizeAnthropicEvent({})).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeAnthropicEvent({ delta: null, type: 'content_block_delta' })).not.toThrow();
    expect(() => normalizeAnthropicEvent({ message: null, type: 'message_start' })).not.toThrow();
    expect(() => normalizeAnthropicEvent(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Ollama NDJSON normalizer
// ---------------------------------------------------------------------------

describe('normalizeOllamaChatChunk', () => {
  it('maps message.content to chunk.content', () => {
    const result = normalizeOllamaChatChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: false,
      message: { content: 'Hello ', role: 'assistant' },
      model: 'llama3.2'
    });
    expect(result?.chunk.content).toBe('Hello ');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('sets done=true on done:true chunk and extracts usage', () => {
    const result = normalizeOllamaChatChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: true,
      eval_count: 150,
      message: { content: '', role: 'assistant' },
      model: 'llama3.2',
      prompt_eval_count: 26
    });
    expect(result?.chunk.done).toBeTruthy();
    expect(result?.chunk.usage?.inputTokens).toBe(26);
    expect(result?.chunk.usage?.outputTokens).toBe(150);
  });

  it('sets finishReason stop on done:true chunk', () => {
    const result = normalizeOllamaChatChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: true,
      message: { content: '', role: 'assistant' },
      model: 'llama3.2'
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('does not set finishReason on mid-stream ollama chat chunk', () => {
    const result = normalizeOllamaChatChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: false,
      message: { content: 'hi', role: 'assistant' },
      model: 'llama3.2'
    });
    expect(result?.chunk.finishReason).toBeUndefined();
  });

  it('maps message.tool_calls to nativeToolCallDeltas', () => {
    const result = normalizeOllamaChatChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: false,
      message: {
        content: '',
        role: 'assistant',
        tool_calls: [
          {
            function: {
              arguments: { location: 'Boston' },
              name: 'get_weather'
            }
          }
        ]
      },
      model: 'llama3.2'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe(JSON.stringify({ location: 'Boston' }));
  });

  it('returns null when message field is absent', () => {
    expect(
      normalizeOllamaChatChunk({
        done: false,
        model: 'llama3.2',
        response: 'hello'
      })
    ).toBeNull();
    expect(normalizeOllamaChatChunk(null)).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeOllamaChatChunk({ message: null })).not.toThrow();
    expect(() => normalizeOllamaChatChunk({ message: { tool_calls: 'bad' } })).not.toThrow();
    expect(() => normalizeOllamaChatChunk(undefined)).not.toThrow();
  });
});

describe('normalizeOllamaGenerateChunk', () => {
  it('maps response field to chunk.content', () => {
    const result = normalizeOllamaGenerateChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: false,
      model: 'llama3.2',
      response: 'The capital'
    });
    expect(result?.chunk.content).toBe('The capital');
  });

  it('sets done=true on done:true and extracts usage', () => {
    const result = normalizeOllamaGenerateChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: true,
      eval_count: 80,
      model: 'llama3.2',
      prompt_eval_count: 10,
      response: ''
    });
    expect(result?.chunk.done).toBeTruthy();
    expect(result?.chunk.usage?.inputTokens).toBe(10);
    expect(result?.chunk.usage?.outputTokens).toBe(80);
  });

  it('sets finishReason stop on done:true generate chunk', () => {
    const result = normalizeOllamaGenerateChunk({
      created_at: '2024-01-01T00:00:00Z',
      done: true,
      model: 'llama3.2',
      response: ''
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('returns null when response field is absent', () => {
    expect(
      normalizeOllamaGenerateChunk({
        done: false,
        message: {},
        model: 'llama3.2'
      })
    ).toBeNull();
    expect(normalizeOllamaGenerateChunk(null)).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeOllamaGenerateChunk({ response: 42 })).not.toThrow();
    expect(() => normalizeOllamaGenerateChunk(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Gemini normalizer
// ---------------------------------------------------------------------------

describe('normalizeGeminiChunk', () => {
  it('maps candidates[0].content.parts[0].text to chunk.content', () => {
    const result = normalizeGeminiChunk({
      candidates: [
        {
          content: { parts: [{ text: 'Hello ' }], role: 'model' },
          finishReason: 'FINISH_REASON_UNSPECIFIED',
          index: 0
        }
      ]
    });
    expect(result?.chunk.content).toBe('Hello ');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('concatenates multiple text parts into chunk.content', () => {
    const result = normalizeGeminiChunk({
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello' }, { text: ' world' }],
            role: 'model'
          },
          finishReason: 'FINISH_REASON_UNSPECIFIED'
        }
      ]
    });
    expect(result?.chunk.content).toBe('Hello world');
  });

  it('maps thought:true parts to chunk.thinking', () => {
    const result = normalizeGeminiChunk({
      candidates: [
        {
          content: {
            parts: [{ text: 'Let me reason...', thought: true }, { text: 'The answer is 42.' }],
            role: 'model'
          },
          finishReason: 'FINISH_REASON_UNSPECIFIED'
        }
      ]
    });
    expect(result?.chunk.thinking).toBe('Let me reason...');
    expect(result?.chunk.content).toBe('The answer is 42.');
  });

  it('maps functionCall parts to nativeToolCallDeltas', () => {
    const result = normalizeGeminiChunk({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  args: { location: 'Boston' },
                  name: 'get_weather'
                }
              }
            ],
            role: 'model'
          },
          finishReason: 'STOP'
        }
      ]
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe(JSON.stringify({ location: 'Boston' }));
  });

  it('sets done=true on finishReason STOP', () => {
    const result = normalizeGeminiChunk({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }]
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps Gemini finishReason STOP to finishReason stop', () => {
    const result = normalizeGeminiChunk({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }]
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps Gemini finishReason MAX_TOKENS to finishReason length', () => {
    const result = normalizeGeminiChunk({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'MAX_TOKENS' }]
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps Gemini finishReason SAFETY to finishReason content-filter', () => {
    const result = normalizeGeminiChunk({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'SAFETY' }]
    });
    expect(result?.chunk.finishReason).toBe('content-filter');
  });

  it('sets done=true on finishReason MAX_TOKENS', () => {
    const result = normalizeGeminiChunk({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'MAX_TOKENS' }]
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('extracts usageMetadata tokens', () => {
    const result = normalizeGeminiChunk({
      candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }],
      usageMetadata: {
        candidatesTokenCount: 30,
        promptTokenCount: 10,
        totalTokenCount: 40
      }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(10);
    expect(result?.chunk.usage?.outputTokens).toBe(30);
    expect(result?.chunk.usage?.totalTokens).toBe(40);
  });

  it('returns null for non-object or missing candidates', () => {
    expect(normalizeGeminiChunk(null)).toBeNull();
    expect(normalizeGeminiChunk('text')).toBeNull();
    expect(normalizeGeminiChunk({ model: 'gemini' })).toBeNull();
    expect(normalizeGeminiChunk({ candidates: [] })).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeGeminiChunk({ candidates: [null] })).not.toThrow();
    expect(() => normalizeGeminiChunk({ candidates: [{ content: null }] })).not.toThrow();
    expect(() => normalizeGeminiChunk(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Mistral normalizer (OpenAI-compatible format)
// ---------------------------------------------------------------------------

describe('normalizeMistralChunk', () => {
  it('maps delta.content to chunk.content (OpenAI-compatible)', () => {
    const result = normalizeMistralChunk({
      choices: [{ delta: { content: 'Bonjour' }, finish_reason: null, index: 0 }],
      id: 'cmpl-abc',
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.content).toBe('Bonjour');
  });

  it('sets done=true on finish_reason stop', () => {
    const result = normalizeMistralChunk({
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      id: 'cmpl-abc',
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps tool_call delta to nativeToolCallDeltas', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                function: { arguments: '', name: 'search' },
                id: 'call_1',
                index: 0,
                type: 'function'
              }
            ]
          },
          finish_reason: null,
          index: 0
        }
      ],
      id: 'cmpl-abc',
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('search');
  });

  it('extracts thinking from structured content array (Magistral native reasoning)', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: {
            content: [
              {
                thinking: [{ text: 'Let me reason...', type: 'text' }],
                type: 'thinking'
              }
            ]
          },
          finish_reason: null,
          index: 0
        }
      ],
      id: 'cmpl-abc',
      model: 'magistral-medium-latest',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.thinking).toBe('Let me reason...');
    expect(result?.chunk.content).toBeUndefined();
  });

  it('extracts text from structured content array (Magistral native reasoning)', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: {
            content: [{ text: 'The answer is 42.', type: 'text' }]
          },
          finish_reason: null,
          index: 0
        }
      ],
      id: 'cmpl-abc',
      model: 'magistral-medium-latest',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.content).toBe('The answer is 42.');
    expect(result?.chunk.thinking).toBeUndefined();
  });

  it('extracts both content and thinking when both appear in one chunk', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: {
            content: [
              {
                thinking: [{ text: 'reasoning', type: 'text' }],
                type: 'thinking'
              },
              { text: 'answer', type: 'text' }
            ]
          },
          finish_reason: null,
          index: 0
        }
      ],
      id: 'cmpl-abc',
      model: 'magistral-medium-latest',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.thinking).toBe('reasoning');
    expect(result?.chunk.content).toBe('answer');
  });

  it('preserves tool call deltas alongside structured content', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: {
            content: [{ text: 'ok', type: 'text' }],
            tool_calls: [
              {
                function: { arguments: '', name: 'fn' },
                id: 'call_1',
                index: 0,
                type: 'function'
              }
            ]
          },
          finish_reason: null,
          index: 0
        }
      ],
      id: 'cmpl-abc',
      model: 'magistral-medium-latest',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.content).toBe('ok');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('fn');
  });

  it('returns null for unrecognizable input', () => {
    expect(normalizeMistralChunk(null)).toBeNull();
    expect(normalizeMistralChunk('string')).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeMistralChunk({ choices: null })).not.toThrow();
    expect(() => normalizeMistralChunk(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cohere v2 streaming event normalizer
// ---------------------------------------------------------------------------

describe('normalizeCohereEvent', () => {
  it('maps content-delta to chunk.content', () => {
    const result = normalizeCohereEvent({
      delta: { message: { content: { text: 'Hello' } } },
      index: 0,
      type: 'content-delta'
    });
    expect(result?.chunk.content).toBe('Hello');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps tool-plan-delta to chunk.thinking', () => {
    const result = normalizeCohereEvent({
      delta: { message: { tool_plan: 'I will check the weather.' } },
      type: 'tool-plan-delta'
    });
    expect(result?.chunk.thinking).toBe('I will check the weather.');
  });

  it('maps tool-call-start to nativeToolCallDeltas with id+name', () => {
    const result = normalizeCohereEvent({
      delta: {
        message: {
          tool_calls: {
            function: { arguments: '', name: 'get_weather' },
            id: 'get_weather_abc123',
            type: 'function'
          }
        }
      },
      index: 0,
      type: 'tool-call-start'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('get_weather_abc123');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
  });

  it('maps tool-call-delta to nativeToolCallDeltas with argumentsDelta', () => {
    const result = normalizeCohereEvent({
      delta: {
        message: { tool_calls: { function: { arguments: '{"location":' } } }
      },
      index: 0,
      type: 'tool-call-delta'
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"location":');
  });

  it('sets done=true on message-end', () => {
    const result = normalizeCohereEvent({
      delta: { finish_reason: 'COMPLETE' },
      type: 'message-end'
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps Cohere message-end COMPLETE to finishReason stop', () => {
    const result = normalizeCohereEvent({
      delta: { finish_reason: 'COMPLETE' },
      type: 'message-end'
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps Cohere message-end MAX_TOKENS to finishReason length', () => {
    const result = normalizeCohereEvent({
      delta: { finish_reason: 'MAX_TOKENS' },
      type: 'message-end'
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps Cohere message-end TOOL_CALL to finishReason tool-calls', () => {
    const result = normalizeCohereEvent({
      delta: { finish_reason: 'TOOL_CALL' },
      type: 'message-end'
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
  });

  it('maps Cohere message-end ERROR to finishReason error', () => {
    const result = normalizeCohereEvent({
      delta: { finish_reason: 'ERROR' },
      type: 'message-end'
    });
    expect(result?.chunk.finishReason).toBe('error');
  });

  it('extracts usage tokens from message-end', () => {
    const result = normalizeCohereEvent({
      delta: {
        finish_reason: 'COMPLETE',
        usage: { tokens: { input_tokens: 71, output_tokens: 418 } }
      },
      type: 'message-end'
    });
    expect(result?.chunk.usage?.inputTokens).toBe(71);
    expect(result?.chunk.usage?.outputTokens).toBe(418);
  });

  it('returns null for informational event types', () => {
    expect(normalizeCohereEvent({ id: 'abc', type: 'message-start' })).toBeNull();
    expect(normalizeCohereEvent({ index: 0, type: 'content-start' })).toBeNull();
    expect(normalizeCohereEvent({ index: 0, type: 'content-end' })).toBeNull();
    expect(normalizeCohereEvent({ index: 0, type: 'citation-start' })).toBeNull();
  });

  it('returns null for non-object or missing type', () => {
    expect(normalizeCohereEvent(null)).toBeNull();
    expect(normalizeCohereEvent('string')).toBeNull();
    expect(normalizeCohereEvent({})).toBeNull();
    expect(normalizeCohereEvent({ type: 42 })).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeCohereEvent({ delta: null, type: 'content-delta' })).not.toThrow();
    expect(() =>
      normalizeCohereEvent({
        delta: { message: null },
        type: 'tool-call-start'
      })
    ).not.toThrow();
    expect(() => normalizeCohereEvent(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AWS Bedrock Converse API streaming event normalizer
// ---------------------------------------------------------------------------

describe('normalizeBedrockConverseEvent', () => {
  it('maps contentBlockDelta.delta.text to chunk.content', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello' } }
    });
    expect(result?.chunk.content).toBe('Hello');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps contentBlockDelta.delta.reasoningContent.text to chunk.thinking', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { reasoningContent: { text: 'Let me think...' } }
      }
    });
    expect(result?.chunk.thinking).toBe('Let me think...');
  });

  it('maps contentBlockDelta.delta.toolUse.input to nativeToolCallDeltas', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockDelta: {
        contentBlockIndex: 1,
        delta: { toolUse: { input: '{"location":' } }
      }
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"location":');
  });

  it('maps contentBlockStart.start.toolUse to nativeToolCallDeltas with id+name', () => {
    const result = normalizeBedrockConverseEvent({
      contentBlockStart: {
        contentBlockIndex: 1,
        start: { toolUse: { name: 'get_weather', toolUseId: 'tooluse_abc' } }
      }
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('tooluse_abc');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
  });

  it('sets done=true on messageStop event', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'end_turn' }
    });
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps Bedrock messageStop end_turn to finishReason stop', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'end_turn' }
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps Bedrock messageStop tool_use to finishReason tool-calls', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'tool_use' }
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
  });

  it('maps Bedrock messageStop max_tokens to finishReason length', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'max_tokens' }
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps Bedrock messageStop guardrail_intervened to finishReason content-filter', () => {
    const result = normalizeBedrockConverseEvent({
      messageStop: { stopReason: 'guardrail_intervened' }
    });
    expect(result?.chunk.finishReason).toBe('content-filter');
  });

  it('sets done=true for all messageStop stopReason values', () => {
    expect(normalizeBedrockConverseEvent({ messageStop: { stopReason: 'tool_use' } })?.chunk.done).toBeTruthy();
    expect(
      normalizeBedrockConverseEvent({
        messageStop: { stopReason: 'max_tokens' }
      })?.chunk.done
    ).toBeTruthy();
  });

  it('extracts usage from metadata event', () => {
    const result = normalizeBedrockConverseEvent({
      metadata: {
        usage: { inputTokens: 15, outputTokens: 42, totalTokens: 57 }
      }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(15);
    expect(result?.chunk.usage?.outputTokens).toBe(42);
    expect(result?.chunk.usage?.totalTokens).toBe(57);
  });

  it('returns null for contentBlockStop and messageStart', () => {
    expect(
      normalizeBedrockConverseEvent({
        contentBlockStop: { contentBlockIndex: 0 }
      })
    ).toBeNull();
    expect(normalizeBedrockConverseEvent({ messageStart: { role: 'assistant' } })).toBeNull();
  });

  it('returns null for non-Bedrock objects', () => {
    expect(normalizeBedrockConverseEvent(null)).toBeNull();
    expect(normalizeBedrockConverseEvent({ choices: [] })).toBeNull();
    expect(normalizeBedrockConverseEvent('string')).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeBedrockConverseEvent({ contentBlockDelta: null })).not.toThrow();
    expect(() => normalizeBedrockConverseEvent({ contentBlockDelta: { delta: null } })).not.toThrow();
    expect(() => normalizeBedrockConverseEvent(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Z.ai normalizer
// ---------------------------------------------------------------------------

describe('normalizeZAiChunk', () => {
  it('maps content delta to chunk.content', () => {
    const result = normalizeZAiChunk({
      choices: [
        {
          delta: { content: 'Hello from Z.ai' },
          finish_reason: null,
          index: 0
        }
      ]
    });

    expect(result?.chunk.content).toBe('Hello from Z.ai');
    expect(result?.chunk.done).toBeUndefined();
  });

  it('maps finish reasons to canonical finishReason and done', () => {
    expect(
      normalizeZAiChunk({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }]
      })?.chunk.finishReason
    ).toBe('stop');
    expect(
      normalizeZAiChunk({
        choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }]
      })?.chunk.finishReason
    ).toBe('tool-calls');
    expect(
      normalizeZAiChunk({
        choices: [{ delta: {}, finish_reason: 'length', index: 0 }]
      })?.chunk.finishReason
    ).toBe('length');
    expect(
      normalizeZAiChunk({
        choices: [{ delta: {}, finish_reason: 'sensitive', index: 0 }]
      })?.chunk.finishReason
    ).toBe('content-filter');
    expect(
      normalizeZAiChunk({
        choices: [
          {
            delta: {},
            finish_reason: 'model_context_window_exceeded',
            index: 0
          }
        ]
      })?.chunk.finishReason
    ).toBe('error');
    expect(
      normalizeZAiChunk({
        choices: [{ delta: {}, finish_reason: 'network_error', index: 0 }]
      })?.chunk.finishReason
    ).toBe('error');

    expect(
      normalizeZAiChunk({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }]
      })?.chunk.done
    ).toBeTruthy();
  });

  it('extracts usage from z.ai usage fields', () => {
    const result = normalizeZAiChunk({
      choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      usage: { input_tokens: 7, output_tokens: 13 }
    });

    expect(result?.chunk.usage).toStrictEqual({
      inputTokens: 7,
      outputTokens: 13,
      totalTokens: 20
    });
  });

  it('returns null for unrecognized payloads', () => {
    expect(normalizeZAiChunk(null)).toBeNull();
    expect(normalizeZAiChunk({})).toBeNull();
    expect(normalizeZAiChunk({ choices: [] })).toBeNull();
  });

  it('filters invalid tool_calls and keeps valid native deltas', () => {
    const result = normalizeZAiChunk({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                function: { arguments: '{"q":"x"}', name: 'lookup' },
                id: '',
                index: 0
              },
              { invalid: true }
            ]
          },
          finish_reason: null,
          index: 0
        }
      ]
    });

    expect(result?.chunk.nativeToolCallDeltas).toStrictEqual([
      { argumentsDelta: '{"q":"x"}', index: 0, name: 'lookup' }
    ]);
  });

  it('preserves explicit total_tokens usage when provided', () => {
    const result = normalizeZAiChunk({
      choices: [{ delta: { content: 'ok' }, finish_reason: null, index: 0 }],
      usage: { completion_tokens: 4, prompt_tokens: 3, total_tokens: 99 }
    });

    expect(result?.chunk.usage).toStrictEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 99
    });
  });
});

// ---------------------------------------------------------------------------
// HuggingFace Text Generation Inference (TGI) streaming chunk normalizer
// ---------------------------------------------------------------------------

describe('normalizeHuggingFaceTGIChunk', () => {
  it('maps token.text to chunk.content for non-special tokens', () => {
    const result = normalizeHuggingFaceTGIChunk({
      details: null,
      generated_text: null,
      index: 0,
      token: { id: 15_496, logprob: -0.5, special: false, text: ' Hello' }
    });
    expect(result?.chunk.content).toBe(' Hello');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('omits content for special tokens (e.g., EOS)', () => {
    const result = normalizeHuggingFaceTGIChunk({
      details: {
        finish_reason: 'eos_token',
        generated_tokens: 5,
        input_length: 10
      },
      generated_text: 'Hello world',
      index: 5,
      token: { id: 2, logprob: 0, special: true, text: '</s>' }
    });
    expect(result?.chunk.content).toBeUndefined();
    expect(result?.chunk.done).toBeTruthy();
  });

  it('sets done=true and extracts usage on final event with details', () => {
    const result = normalizeHuggingFaceTGIChunk({
      details: {
        finish_reason: 'eos_token',
        generated_tokens: 5,
        input_length: 10
      },
      generated_text: 'Hello world.',
      index: 4,
      token: { id: 13, logprob: -0.1, special: false, text: '.' }
    });
    expect(result?.chunk.content).toBe('.');
    expect(result?.chunk.done).toBeTruthy();
    expect(result?.chunk.usage?.inputTokens).toBe(10);
    expect(result?.chunk.usage?.outputTokens).toBe(5);
  });

  it('maps HF TGI eos_token to finishReason stop', () => {
    const result = normalizeHuggingFaceTGIChunk({
      details: {
        finish_reason: 'eos_token',
        generated_tokens: 3,
        input_length: 5
      },
      index: 1,
      token: { id: 2, special: true, text: '</s>' }
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps HF TGI length to finishReason length', () => {
    const result = normalizeHuggingFaceTGIChunk({
      details: {
        finish_reason: 'length',
        generated_tokens: 10,
        input_length: 5
      },
      index: 1,
      token: { id: 1, special: false, text: 'x' }
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps HF TGI stop_sequence to finishReason stop', () => {
    const result = normalizeHuggingFaceTGIChunk({
      details: {
        finish_reason: 'stop_sequence',
        generated_tokens: 5,
        input_length: 3
      },
      index: 1,
      token: { id: 1, special: false, text: '.' }
    });
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('sets done=true for stop_sequence and length finish reasons', () => {
    const make = (finish_reason: string) =>
      normalizeHuggingFaceTGIChunk({
        details: { finish_reason, generated_tokens: 1, input_length: 5 },
        index: 1,
        token: { id: 1, special: false, text: 'x' }
      });
    expect(make('stop_sequence')?.chunk.done).toBeTruthy();
    expect(make('length')?.chunk.done).toBeTruthy();
  });

  it('returns null for missing or non-object token field', () => {
    expect(normalizeHuggingFaceTGIChunk({ generated_text: null, index: 0 })).toBeNull();
    expect(normalizeHuggingFaceTGIChunk({ token: 'bad' })).toBeNull();
    expect(normalizeHuggingFaceTGIChunk(null)).toBeNull();
  });

  it('returns null for special-only event with no details', () => {
    expect(
      normalizeHuggingFaceTGIChunk({
        details: null,
        token: { id: 0, special: true, text: '<pad>' }
      })
    ).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeHuggingFaceTGIChunk({ token: null })).not.toThrow();
    expect(() => normalizeHuggingFaceTGIChunk({ token: { text: null } })).not.toThrow();
    expect(() => normalizeHuggingFaceTGIChunk(undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DeepSeek Chat streaming chunk normalizer
// ---------------------------------------------------------------------------

describe('normalizeDeepSeekChunk', () => {
  it('maps content delta to chunk.content', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: 'Hello' }, finish_reason: null, index: 0 }]
    });
    expect(result?.chunk.content).toBe('Hello');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps reasoning_content to chunk.thinking', () => {
    const result = normalizeDeepSeekChunk({
      choices: [
        {
          delta: { content: '', reasoning_content: 'Thinking step-by-step...' },
          finish_reason: null,
          index: 0
        }
      ]
    });
    expect(result?.chunk.thinking).toBe('Thinking step-by-step...');
    expect(result?.chunk.done).toBeFalsy();
  });

  it('maps finish_reason stop → stop with done=true', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: '' }, finish_reason: 'stop', index: 0 }]
    });
    expect(result?.chunk.finishReason).toBe('stop');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason length → length', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: '' }, finish_reason: 'length', index: 0 }]
    });
    expect(result?.chunk.finishReason).toBe('length');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason content_filter → content-filter', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: '' }, finish_reason: 'content_filter', index: 0 }]
    });
    expect(result?.chunk.finishReason).toBe('content-filter');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason insufficient_balance → error', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: '' }, finish_reason: 'insufficient_balance', index: 0 }]
    });
    expect(result?.chunk.finishReason).toBe('error');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason tool_calls → tool-calls', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: '' }, finish_reason: 'tool_calls', index: 0 }]
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('extracts tool_calls from delta', () => {
    const result = normalizeDeepSeekChunk({
      choices: [
        {
          delta: {
            content: '',
            tool_calls: [
              {
                function: { name: 'get_weather', arguments: '{"city":"London"}' },
                id: 'call_1',
                index: 0
              }
            ]
          },
          finish_reason: 'tool_calls',
          index: 0
        }
      ]
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('call_1');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"city":"London"}');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('filters invalid tool_calls with missing index', () => {
    const result = normalizeDeepSeekChunk({
      choices: [
        {
          delta: {
            content: '',
            tool_calls: [
              { function: { name: 'valid' }, id: 'call_1', index: 0 },
              { function: { name: 'invalid_no_index' }, id: 'call_2' }
            ]
          },
          finish_reason: 'tool_calls',
          index: 0
        }
      ]
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('valid');
  });

  it('extracts usage from top-level object', () => {
    const result = normalizeDeepSeekChunk({
      choices: [{ delta: { content: 'Done' }, finish_reason: 'stop', index: 0 }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(10);
    expect(result?.chunk.usage?.outputTokens).toBe(20);
    expect(result?.chunk.usage?.totalTokens).toBe(30);
  });

  it('returns null for non-object input', () => {
    expect(normalizeDeepSeekChunk(null)).toBeNull();
    expect(normalizeDeepSeekChunk('string')).toBeNull();
    expect(normalizeDeepSeekChunk(undefined)).toBeNull();
  });

  it('returns null for empty choices array', () => {
    expect(normalizeDeepSeekChunk({ choices: [] })).toBeNull();
  });

  it('handles adversarial null choices gracefully', () => {
    expect(normalizeDeepSeekChunk({ choices: null })).toBeNull();
    expect(normalizeDeepSeekChunk({ choices: [null] })).toBeNull();
    // {delta: null} is handled by the null delta guard — returns empty chunk, not null
    expect(normalizeDeepSeekChunk({ choices: [{ delta: null }] })?.chunk.done).toBeFalsy();
    expect(normalizeDeepSeekChunk({ choices: [{ delta: { content: null } }] })?.chunk.content).toBeUndefined();
  });
});
