import { describe, expect, it } from 'vitest';

import { normalizeDeepSeekChunk } from './deepseek.js';

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
