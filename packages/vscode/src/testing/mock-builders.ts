import type { StreamChunk } from '@agentsy/core/processor';
import type { RendererHandle } from '@agentsy/ui';

import type { ApiKeyChangeListener } from '../types/index.js';

export interface MockApiKeyManager {
  deleteApiKey(): Promise<void>;
  getApiKey(): Promise<string | undefined>;
  hasApiKey(): Promise<boolean>;
  initialize(): Promise<void>;
  onDidChangeApiKey(listener: ApiKeyChangeListener): { dispose(): void };
  setApiKey(key?: string): Promise<void>;
}

/**
 * Create a lightweight in-memory API key manager stub for integration tests.
 */
export function createMockApiKeyManager(initialKey?: string): MockApiKeyManager {
  let key = initialKey;
  const listeners = new Set<ApiKeyChangeListener>();

  function emit(event: 'updated' | 'deleted', nextKey?: string): void {
    for (const listener of listeners) {
      listener(event, nextKey);
    }
  }

  return {
    // biome-ignore lint/suspicious/useAwait: implements MockApiKeyManager interface
    async deleteApiKey(): Promise<void> {
      key = undefined;
      emit('deleted');
    },
    // biome-ignore lint/suspicious/useAwait: implements MockApiKeyManager interface
    async getApiKey(): Promise<string | undefined> {
      return key;
    },
    // biome-ignore lint/suspicious/useAwait: implements MockApiKeyManager interface
    async hasApiKey(): Promise<boolean> {
      return key !== undefined && key.length > 0;
    },
    async initialize(): Promise<void> {
      // no-op
    },
    onDidChangeApiKey(listener: ApiKeyChangeListener): { dispose(): void } {
      listeners.add(listener);
      return {
        dispose(): void {
          listeners.delete(listener);
        }
      };
    },
    // biome-ignore lint/suspicious/useAwait: implements MockApiKeyManager interface
    async setApiKey(nextKey?: string): Promise<void> {
      key = nextKey;
      emit('updated', key);
    }
  };
}

export interface MockRendererHandle extends RendererHandle {
  chunks: StreamChunk[];
  ended: boolean;
  writes: string[];
}

/**
 * Create a renderer handle test double that records writes/chunks.
 */
export function createMockRendererHandle(): MockRendererHandle {
  const writes: string[] = [];
  const chunks: StreamChunk[] = [];
  let ended = false;

  return {
    chunks,
    // biome-ignore lint/suspicious/useAwait: implements MockRendererHandle interface
    async end(): Promise<void> {
      ended = true;
    },
    get ended() {
      return ended;
    },
    // biome-ignore lint/suspicious/useAwait: implements MockRendererHandle interface
    async write(chunk: string): Promise<void> {
      writes.push(chunk);
    },
    // biome-ignore lint/suspicious/useAwait: implements MockRendererHandle interface
    async writeChunk(chunk: StreamChunk): Promise<void> {
      chunks.push(chunk);
    },
    writes
  };
}

/**
 * Build a normalizer stub that maps arbitrary source events into stream chunks.
 */
export function createChunkNormalizerStub<TEvent>(
  mapper: (event: TEvent) => StreamChunk | null
): (source: AsyncIterable<TEvent>) => AsyncIterable<StreamChunk> {
  return async function* normalize(source: AsyncIterable<TEvent>): AsyncIterable<StreamChunk> {
    for await (const event of source) {
      const chunk = mapper(event);
      if (chunk !== null) {
        yield chunk;
      }
    }
  };
}
