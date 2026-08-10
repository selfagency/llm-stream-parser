import { describe, expect, it } from 'vitest';

import { normalizeHuggingFaceTGIChunk } from './hf-tgi.js';

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
