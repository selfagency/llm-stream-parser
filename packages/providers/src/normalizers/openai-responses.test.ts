import { describe, expect, it } from 'vitest';

import { normalizeOpenAIResponseEvent } from './openai-responses.js';

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
