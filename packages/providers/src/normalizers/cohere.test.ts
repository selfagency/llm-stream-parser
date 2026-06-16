import { describe, expect, it } from 'vitest';

import { normalizeCohereEvent } from './cohere.js';

// ---------------------------------------------------------------------------
// Cohere v2 Chat streaming event normalizer
// ---------------------------------------------------------------------------

describe('normalizeCohereEvent', () => {
  it('maps content-delta with text to chunk.content', () => {
    const result = normalizeCohereEvent({
      type: 'content-delta',
      delta: {
        message: {
          content: { text: 'Hello from Cohere' }
        }
      }
    });
    expect(result?.chunk.content).toBe('Hello from Cohere');
    expect(result?.chunk.done).toBeUndefined();
  });

  it('returns null for content-delta with no text', () => {
    const result = normalizeCohereEvent({
      type: 'content-delta',
      delta: { message: { content: {} } }
    });
    expect(result).toBeNull();
  });

  it('maps tool-plan-delta to chunk.thinking', () => {
    const result = normalizeCohereEvent({
      type: 'tool-plan-delta',
      delta: {
        message: { tool_plan: 'I need to look up the weather...' }
      }
    });
    expect(result?.chunk.thinking).toBe('I need to look up the weather...');
  });

  it('maps tool-call-start to nativeToolCallDeltas with id and name', () => {
    const result = normalizeCohereEvent({
      type: 'tool-call-start',
      index: 0,
      delta: {
        message: {
          tool_calls: { id: 'call_abc', function: { name: 'get_weather' } }
        }
      }
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.id).toBe('call_abc');
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.name).toBe('get_weather');
  });

  it('maps tool-call-delta to nativeToolCallDeltas with argumentsDelta', () => {
    const result = normalizeCohereEvent({
      type: 'tool-call-delta',
      index: 0,
      delta: {
        message: {
          tool_calls: { function: { arguments: '{"city":"London"}' } }
        }
      }
    });
    expect(result?.chunk.nativeToolCallDeltas).toHaveLength(1);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.index).toBe(0);
    expect(result?.chunk.nativeToolCallDeltas?.[0]?.argumentsDelta).toBe('{"city":"London"}');
  });

  it('maps message-end with COMPLETE to done=true + finishReason stop', () => {
    const result = normalizeCohereEvent({
      type: 'message-end',
      delta: { finish_reason: 'COMPLETE' }
    });
    expect(result?.chunk.done).toBeTruthy();
    expect(result?.chunk.finishReason).toBe('stop');
  });

  it('maps message-end with TOOL_CALL to finishReason tool-calls', () => {
    const result = normalizeCohereEvent({
      type: 'message-end',
      delta: { finish_reason: 'TOOL_CALL' }
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps message-end with MAX_TOKENS to finishReason length', () => {
    const result = normalizeCohereEvent({
      type: 'message-end',
      delta: { finish_reason: 'MAX_TOKENS' }
    });
    expect(result?.chunk.finishReason).toBe('length');
  });

  it('maps message-end with ERROR to finishReason error', () => {
    const result = normalizeCohereEvent({
      type: 'message-end',
      delta: { finish_reason: 'ERROR' }
    });
    expect(result?.chunk.finishReason).toBe('error');
  });

  it('maps message-end with ERROR_LIMIT to finishReason error', () => {
    const result = normalizeCohereEvent({
      type: 'message-end',
      delta: { finish_reason: 'ERROR_LIMIT' }
    });
    expect(result?.chunk.finishReason).toBe('error');
  });

  it('extracts usage from delta.usage.tokens on message-end', () => {
    const result = normalizeCohereEvent({
      type: 'message-end',
      delta: {
        finish_reason: 'COMPLETE',
        usage: {
          tokens: { input_tokens: 10, output_tokens: 35 }
        }
      }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(10);
    expect(result?.chunk.usage?.outputTokens).toBe(35);
  });

  it('returns null for informational event types', () => {
    expect(normalizeCohereEvent({ type: 'message-start' })).toBeNull();
    expect(normalizeCohereEvent({ type: 'content-start' })).toBeNull();
    expect(normalizeCohereEvent({ type: 'citation-start' })).toBeNull();
  });

  it('returns null for non-object or missing type', () => {
    expect(normalizeCohereEvent(null)).toBeNull();
    expect(normalizeCohereEvent('string')).toBeNull();
    expect(normalizeCohereEvent({})).toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() =>
      normalizeCohereEvent({
        type: 'content-delta',
        delta: { message: { content: { text: 42 } } }
      })
    ).not.toThrow();
    expect(() =>
      normalizeCohereEvent({
        type: 'tool-call-start',
        delta: { message: { tool_calls: null } }
      })
    ).not.toThrow();
    expect(() =>
      normalizeCohereEvent({
        type: 'message-end',
        delta: { finish_reason: null }
      })
    ).not.toThrow();
    expect(() => normalizeCohereEvent(undefined)).not.toThrow();
  });
});
