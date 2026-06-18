import { describe, expect, it } from 'vitest';

import { normalizeAnthropicEvent } from './anthropic.js';

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
