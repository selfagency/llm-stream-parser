import { describe, expect, it } from 'vitest';

import {
  isOpenAICompatibleNormalizerProvider,
  normalizeOpenAICompatibleChunk,
  OPENAI_COMPATIBLE_NORMALIZER_PROVIDERS
} from './openai-compatible.js';

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
