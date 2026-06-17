import { describe, expect, it } from 'vitest';

import { normalizeZAiChunk } from './zai.js';

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
