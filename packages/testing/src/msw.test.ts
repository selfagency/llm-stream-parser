/**
 * Smoke test: MSW test server bootstrap and handler coverage.
 *
 * Verifies that the MSW v2 test server correctly intercepts requests
 * to provider, memory, and retrieval endpoints.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestServer } from './msw/index.js';

const ts = createTestServer();

beforeAll(() => ts.server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => ts.server.resetHandlers());
afterAll(() => ts.server.close());

describe('MSW test server', () => {
  // -----------------------------------------------------------------------
  // Memory / RAG handlers
  // -----------------------------------------------------------------------

  describe('memory handlers', () => {
    it('returns health ok', async () => {
      const response = await fetch('http://localhost:3080/health');
      expect(response.status).toBe(200);
      const data = (await response.json()) as { status: string };
      expect(data.status).toBe('ok');
    });

    it('upserts and searches documents', async () => {
      // Upsert
      const upsertRes = await fetch('http://localhost:3080/documents', {
        body: JSON.stringify({ content: 'Test document content', id: 'doc-1', title: 'Test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      expect(upsertRes.status).toBe(200);

      // Seed search results via state
      ts.memoryState.searchResults.push({
        content: 'Test document content',
        score: 0.95,
        title: 'Test'
      });

      // Search
      const searchRes = await fetch('http://localhost:3080/search', {
        body: JSON.stringify({ limit: 10, query: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      expect(searchRes.status).toBe(200);
      const searchData = (await searchRes.json()) as { results: unknown[] };
      expect(searchData.results).toHaveLength(1);
    });

    it('returns 503 when health is down', async () => {
      ts.memoryState.healthy = false;
      const response = await fetch('http://localhost:3080/health');
      expect(response.status).toBe(503);
      ts.memoryState.healthy = true; // reset
    });
  });

  // -----------------------------------------------------------------------
  // Retrieval handlers
  // -----------------------------------------------------------------------

  describe('retrieval handlers', () => {
    it('returns health with dimensions', async () => {
      const response = await fetch('http://localhost:3081/health');
      expect(response.status).toBe(200);
      const data = (await response.json()) as { dimensions: number; status: string };
      expect(data.status).toBe('ok');
      expect(data.dimensions).toBe(1536);
    });

    it('generates embeddings for text inputs', async () => {
      const response = await fetch('http://localhost:3081/embed', {
        body: JSON.stringify({ texts: ['hello world', 'test document'] }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        embeddings: { embedding: number[]; index: number }[];
      };
      expect(data.embeddings).toHaveLength(2);
      expect(data.embeddings[0]?.embedding).toHaveLength(1536);
    });

    it('re-ranks documents by query relevance', async () => {
      const response = await fetch('http://localhost:3081/re-rank', {
        body: JSON.stringify({
          documents: ['The sky is blue', 'Pizza is a delicious food', 'Mountains are tall'],
          query: 'food'
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        results: { index: number; relevance_score: number }[];
      };
      expect(data.results).toHaveLength(3);
      // "Pizza is a delicious food" contains "food" → scores 0.95 - 1*0.05 = 0.90
      const foodDoc = data.results.find(r => r.index === 1);
      expect(foodDoc?.relevance_score).toBeCloseTo(0.9, 5);
    });
  });
});
