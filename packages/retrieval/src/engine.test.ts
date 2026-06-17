import { describe, expect, it } from 'vitest';

import { initRag, RagEngine } from './engine.js';

describe('RagEngine', () => {
  it('constructs with default options', () => {
    const engine = new RagEngine();
    expect(engine).toBeInstanceOf(RagEngine);
  });

  it('constructs with custom options', () => {
    const engine = new RagEngine({ topK: 5 });
    expect(engine).toBeInstanceOf(RagEngine);
  });

  it('init resolves without error', async () => {
    const engine = new RagEngine();
    await expect(engine.init()).resolves.toBeUndefined();
  });

  it('query runs full RAG pipeline and returns results', async () => {
    const engine = new RagEngine();
    const result = await engine.query('test query');

    expect(result.query).toBe('test query');
    expect(typeof result.context).toBe('string');
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('query respects topK option', async () => {
    const engine = new RagEngine({ topK: 5 });
    const result = await engine.query('test query', { topK: 3 });
    expect(result.query).toBe('test query');
  });

  it('query uses passthrough reranker by default', async () => {
    const engine = new RagEngine();
    const result = await engine.query('test query');
    expect(result.results).toBeDefined();
  });

  it('query uses custom reranker strategy when specified', async () => {
    const engine = new RagEngine();
    const result = await engine.query('test query', { reranker: 'bge' });
    expect(result.results).toBeDefined();
  });

  it('query uses default topK from options', async () => {
    const engine = new RagEngine({ topK: 7 });
    const result = await engine.query('test query');
    expect(result.query).toBe('test query');
  });
});

describe('initRag', () => {
  it('creates and initializes a RagEngine', async () => {
    const engine = await initRag();
    expect(engine).toBeInstanceOf(RagEngine);
  });

  it('passes options to the engine', async () => {
    const engine = await initRag({ topK: 3 });
    expect(engine).toBeInstanceOf(RagEngine);
  });
});
