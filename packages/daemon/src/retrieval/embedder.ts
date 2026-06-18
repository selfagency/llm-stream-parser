/**
 * Embedding provider for the daemon's RAG service.
 *
 * Defaults to OpenAI `text-embedding-3-small` via the provider infrastructure,
 * with a local bag-of-words fallback for offline/development use.
 *
 * @module
 */

// ── Types ──────────────────────────────────────────────

export interface EmbeddingProvider {
  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts in batch. */
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ── Local fallback (bag-of-words hash embeddings) ───────

/**
 * Hash a word to a deterministic 32-bit integer.
 */
function hashWord(word: string): number {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    const charCode = word.codePointAt(i) ?? 0;
    hash = Math.floor(hash * 31 + charCode);
  }
  return Math.abs(hash);
}

/**
 * L2-normalize a vector (returns a new array).
 */
function normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return vec.map(val => val / magnitude);
  }
  return vec;
}

/**
 * Generate a local bag-of-words embedding vector (32-dimensional).
 *
 * Used as a fallback when no remote embedding provider is configured.
 */
function localEmbed(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/u);
  const embedding = Array.from({ length: 32 }, () => 0);

  for (const word of words) {
    const index = hashWord(word) % embedding.length;
    embedding[index] = (embedding[index] ?? 0) + 1;
  }

  return normalize(embedding);
}

// ── Factory ─────────────────────────────────────────────

export interface CreateEmbeddingProviderOptions {
  /** API key for the remote embedding service. */
  apiKey?: string;
  /** Base URL for the OpenAI-compatible embedding API. */
  baseUrl?: string;
  /** Model name for the remote embedding service (default: text-embedding-3-small). */
  model?: string;
  /** Whether to use the remote API (default: false). */
  remoteEnabled?: boolean;
}

/**
 * Create an EmbeddingProvider.
 *
 * When `remoteEnabled` is true and an `apiKey` is available, uses the
 * OpenAI-compatible embeddings API.  Otherwise falls back to a local
 * bag-of-words embedding (suitable for development / offline use).
 */
export function createEmbeddingProvider(options: CreateEmbeddingProviderOptions = {}): EmbeddingProvider {
  const {
    remoteEnabled = false,
    apiKey,
    model = 'text-embedding-3-small',
    baseUrl = 'https://api.openai.com/v1'
  } = options;

  if (remoteEnabled && apiKey) {
    return createRemoteEmbedder({ baseUrl, apiKey, model });
  }

  return createLocalEmbedder();
}

// ── Remote (OpenAI-compatible) embedder ─────────────────

interface RemoteEmbedderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function createRemoteEmbedder(opts: RemoteEmbedderOptions): EmbeddingProvider {
  const { apiKey, baseUrl, model } = opts;

  async function embedSingle(text: string): Promise<number[]> {
    const url = `${baseUrl.replace(/\/$/, '')}/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    const dims = data.data?.[0]?.embedding;
    if (!dims) {
      throw new Error('Embedding API returned empty data');
    }

    return dims;
  }

  return {
    embed(text: string): Promise<number[]> {
      return embedSingle(text);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return Promise.resolve([]);
      }

      const url = `${baseUrl.replace(/\/$/, '')}/embeddings`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: texts,
          model
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      return data.data.map(d => d.embedding);
    }
  };
}

// ── Local (bag-of-words) embedder ───────────────────────

function createLocalEmbedder(): EmbeddingProvider {
  return {
    embed(text: string): Promise<number[]> {
      return Promise.resolve(localEmbed(text));
    },
    embedBatch(texts: string[]): Promise<number[][]> {
      return Promise.resolve(texts.map(t => localEmbed(t)));
    }
  };
}
