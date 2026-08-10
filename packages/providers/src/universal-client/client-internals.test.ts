// The functions under test are not exported, so we exercise them through
// their callers. We test the private-ish helpers indirectly by calling
// the createUniversalClient functions with different configs via mock fetch.
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

import { createUniversalClient } from './client.js';

describe('buildHeaders (via createUniversalClient)', () => {
  it('openai includes organization-id header', async () => {
    const client = createUniversalClient({
      provider: 'openai',
      apiKey: 'sk-test',
      organizationId: 'org-123'
    });

    let capturedHeaders: Record<string, string> | undefined;
    // biome-ignore lint/suspicious/useAwait: mock must return promise
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await client.complete({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] });
      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders?.['Content-Type']).toBe('application/json');
      expect(capturedHeaders?.Authorization).toBe('Bearer sk-test');
      expect(capturedHeaders?.['OpenAI-Organization']).toBe('org-123');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('anthropic adds version header', async () => {
    const client = createUniversalClient({ provider: 'anthropic', apiKey: 'sk-ant' });

    let capturedHeaders: Record<string, string> | undefined;
    // biome-ignore lint/suspicious/useAwait: mock must return promise
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ content: 'ok' }), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await client.complete({ model: 'claude-3', messages: [{ role: 'user', content: 'hi' }] });
      expect(capturedHeaders?.['x-api-key']).toBe('sk-ant');
      expect(capturedHeaders?.['anthropic-version']).toBe('2023-06-01');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('default handler works for unknown providers', async () => {
    const client = createUniversalClient({ provider: 'ollama', apiKey: '' });

    let capturedHeaders: Record<string, string> | undefined;
    // biome-ignore lint/suspicious/useAwait: mock must return promise
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await client.complete({ model: 'llama3', messages: [{ role: 'user', content: 'hi' }] });
      // No apiKey set, so buildHeaders skips the builder
      expect(capturedHeaders?.Authorization).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('gemini sets bearer token', async () => {
    const client = createUniversalClient({ provider: 'gemini', apiKey: 'gk-test' });

    let capturedHeaders: Record<string, string> | undefined;
    // biome-ignore lint/suspicious/useAwait: mock must return promise
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await client.complete({ model: 'gemini-pro', messages: [{ role: 'user', content: 'hi' }] });
      expect(capturedHeaders?.Authorization).toBe('Bearer gk-test');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stream passes stream: true to header builder', async () => {
    const client = createUniversalClient({ provider: 'anthropic', apiKey: 'sk-ant' });

    let capturedHeaders: Record<string, string> | undefined;
    // biome-ignore lint/suspicious/useAwait: mock must return promise
    const mockFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(
        new ReadableStream({
          start(ctl) {
            ctl.close();
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      );
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      await client.stream({ model: 'claude-3', messages: [{ role: 'user', content: 'hi' }] });
      expect(capturedHeaders?.accept).toBe('text/event-stream');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('parseProviderResponse (via createUniversalClient)', () => {
  it('handles response without choices', async () => {
    const client = createUniversalClient({ provider: 'openai', apiKey: 'sk-test' });

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ content: 'direct response' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    try {
      const result = await client.complete({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] });
      expect(result.content).toBe('direct response');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('handles non-ok response', async () => {
    const client = createUniversalClient({ provider: 'openai', apiKey: 'sk-test' });

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }));
    vi.stubGlobal('fetch', mockFetch);

    try {
      await expect(client.complete({ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
        'Provider request failed'
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
