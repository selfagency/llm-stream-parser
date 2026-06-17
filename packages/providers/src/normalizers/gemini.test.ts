import { describe, expect, it } from 'vitest';

import { normalizeGeminiChunk } from './gemini.js';

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
