import { describe, expect, it } from 'vitest';

import { normalizeMistralChunk } from './mistral.js';

// ---------------------------------------------------------------------------
// Mistral normalizer
// ---------------------------------------------------------------------------

describe('normalizeMistralChunk', () => {
  it('maps choice.delta.content to chunk.content', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: 'Bonjour', role: 'assistant' },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      id: 'mistral-abc',
      model: 'mistral-large',
      object: 'chat.completion.chunk',
      usage: null
    });
    expect(result?.chunk.content).toBe('Bonjour');
    expect(result?.chunk.done).toBeFalsy();
  });

  // Mistral sends tool calls in OpenAI `tool_calls` format, not `function_call`.
  // The normalizer delegates to normalizeOpenAIChatChunk which only reads
  // delta.tool_calls. A pure `function_call` delta produces a chunk but no
  // nativeToolCallDeltas — Mistral rarely emits this shape in practice.
  it('does not extract nativeToolCallDeltas from delta.function_call', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: {
            content: '',
            function_call: { arguments: '{"city":"Paris"}', name: 'get_weather' }
          },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result).not.toBeNull();
    expect(result?.chunk.nativeToolCallDeltas).toBeUndefined();
  });

  it('maps finish_reason stop → stop + done=true', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: 'Done', role: 'assistant' },
          finish_reason: 'stop',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('stop');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason length → length', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: '', role: 'assistant' },
          finish_reason: 'length',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('length');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason tool_calls → tool-calls', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: '', role: 'assistant' },
          finish_reason: 'tool_calls',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('tool-calls');
    expect(result?.chunk.done).toBeTruthy();
  });

  // The OpenAI normalizer maps unknown finish reasons to 'other'.
  // Mistral's 'error' is not in the known set, so it falls through.
  it('maps finish_reason error → other', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: '', role: 'assistant' },
          finish_reason: 'error',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('other');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('maps finish_reason content_filter → content-filter', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: '', role: 'assistant' },
          finish_reason: 'content_filter',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('content-filter');
    expect(result?.chunk.done).toBeTruthy();
  });

  // Mistral's 'model_length' is not in the OpenAI known set, so it falls
  // through to 'other'. Mistral full-parity would add this mapping.
  it('maps finish_reason model_length → other', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: '', role: 'assistant' },
          finish_reason: 'model_length',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.finishReason).toBe('other');
    expect(result?.chunk.done).toBeTruthy();
  });

  it('extracts usage from the top-level usage field', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: '', role: 'assistant' },
          finish_reason: 'stop',
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk',
      usage: { completion_tokens: 15, prompt_tokens: 8, total_tokens: 23 }
    });
    expect(result?.chunk.usage?.inputTokens).toBe(8);
    expect(result?.chunk.usage?.outputTokens).toBe(15);
    expect(result?.chunk.usage?.totalTokens).toBe(23);
  });

  it('does not set done or finishReason mid-stream', () => {
    const result = normalizeMistralChunk({
      choices: [
        {
          delta: { content: 'stream', role: 'assistant' },
          finish_reason: null,
          index: 0
        }
      ],
      created: 1_700_000_000,
      model: 'mistral-large',
      object: 'chat.completion.chunk'
    });
    expect(result?.chunk.done).toBeFalsy();
    expect(result?.chunk.finishReason).toBeUndefined();
  });

  it('returns null for non-object or missing choices', () => {
    expect(normalizeMistralChunk(null)).toBeNull();
    expect(normalizeMistralChunk('str')).toBeNull();
    expect(normalizeMistralChunk({})).toBeNull();
    // Empty choices returns a bare chunk (OpenAI normalizer accepts it)
    expect(normalizeMistralChunk({ choices: [] })).not.toBeNull();
  });

  it('never throws on adversarial input', () => {
    expect(() => normalizeMistralChunk({ choices: [null] })).not.toThrow();
    expect(() => normalizeMistralChunk({ choices: [{ delta: null }] })).not.toThrow();
    expect(() => normalizeMistralChunk(undefined)).not.toThrow();
  });
});
