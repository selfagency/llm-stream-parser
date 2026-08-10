/**
 * Tests for EmbeddingProvider.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';
import { createEmbeddingProvider } from './embedder.js';

describe('createEmbeddingProvider', () => {
  describe('local embedder', () => {
    it('creates a local embedder by default', () => {
      const provider = createEmbeddingProvider();
      expect(provider).toBeDefined();
      expect(typeof provider.embed).toBe('function');
      expect(typeof provider.embedBatch).toBe('function');
    });

    it('generates a 32-dimensional embedding', async () => {
      const provider = createEmbeddingProvider();
      const embedding = await provider.embed('hello world');
      expect(embedding).toHaveLength(32);
    });

    it('generates consistent embeddings for the same text', async () => {
      const provider = createEmbeddingProvider();
      const a = await provider.embed('test text');
      const b = await provider.embed('test text');
      expect(a).toEqual(b);
    });

    it('generates different embeddings for different text', async () => {
      const provider = createEmbeddingProvider();
      const a = await provider.embed('the quick brown fox');
      const b = await provider.embed('jumps over the lazy dog');
      expect(a).not.toEqual(b);
    });

    it('handles empty text', async () => {
      const provider = createEmbeddingProvider();
      const embedding = await provider.embed('');
      expect(embedding).toHaveLength(32);
    });

    it('handles batch embedding', async () => {
      const provider = createEmbeddingProvider();
      const embeddings = await provider.embedBatch(['hello', 'world']);
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(32);
      expect(embeddings[1]).toHaveLength(32);
    });

    it('handles empty batch', async () => {
      const provider = createEmbeddingProvider();
      const embeddings = await provider.embedBatch([]);
      expect(embeddings).toEqual([]);
    });
  });

  describe('remote embedder', () => {
    it('creates a remote embedder when remoteEnabled and apiKey are set', () => {
      const provider = createEmbeddingProvider({ remoteEnabled: true, apiKey: 'test-key' });
      expect(provider).toBeDefined();
    });

    it('falls back to local when remoteEnabled but no apiKey', () => {
      const provider = createEmbeddingProvider({ remoteEnabled: true });
      const embedding = provider.embed('test');
      expect(embedding).resolves.toHaveLength(32);
    });
  });
});
