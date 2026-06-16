import { describe, expect, it } from 'vitest';

import { normalizeOllamaChatChunk, normalizeOllamaGenerateChunk } from './ollama.js';

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
