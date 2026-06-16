/**
 * HTTP Server SSE Stream Tests
 *
 * Verifies SSE streaming, CORS preflight, and error handling
 */

import type { AgUiEvent } from '@agentsy/shared';
import { EventType } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';

import { createAgentRunHandler, createExpressMiddleware, createHonoHandler, createSSEStream } from './http-server.js';

// Test fixtures
// biome-ignore lint/suspicious/useAwait: async generator required for AsyncGenerator<AgUiEvent> compatibility
async function* mockEventGenerator() {
  yield {
    runId: 'run_123',
    timestamp: '2024-01-01T00:00:00Z',
    type: EventType.RUN_STARTED
  } as AgUiEvent;
}

async function* emptyGenerator() {
  // Empty generator - doesn't yield any events
  yield* [];
}

// biome-ignore lint/suspicious/useAwait: async generator required for AsyncGenerator<AgUiEvent> compatibility
async function* errorGeneratorWithYield() {
  yield {
    runId: 'run_123',
    timestamp: '2024-01-01T00:00:00Z',
    type: EventType.RUN_STARTED
  } as AgUiEvent;
  throw new Error('Generator error');
}

// biome-ignore lint/suspicious/useAwait: async generator required for AsyncGenerator<AgUiEvent> compatibility
async function* mockErrorGenerator() {
  yield {
    runId: 'run_123',
    timestamp: '2024-01-01T00:00:00Z',
    type: EventType.RUN_STARTED
  } as AgUiEvent;
  throw new Error('Mock generator error');
}

describe('createSSEStream', () => {
  it('should convert async generator to SSE stream', async () => {
    const stream = createSSEStream(mockEventGenerator());
    const chunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    // Verify SSE format (contains "data:" prefix)
    const text = new TextDecoder().decode(chunks[0]);
    expect(text).toContain('data:');
  });

  it('should handle empty event stream', async () => {
    const stream = createSSEStream(emptyGenerator());
    const chunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(0);
  });

  it('should handle stream errors gracefully', async () => {
    const stream = createSSEStream(errorGeneratorWithYield());

    await expect(async () => {
      for await (const _chunk of stream) {
        // chunks received
      }
    }).rejects.toThrow('Generator error');
  });

  it('should support async iteration directly', async () => {
    const stream = createSSEStream(mockEventGenerator());

    // Use Symbol.asyncIterator
    const iterator = stream[Symbol.asyncIterator]();
    const { value } = await iterator.next();

    expect(value).toBeInstanceOf(Uint8Array);
  });
});

describe('createAgentRunHandler', () => {
  it('should handle CORS OPTIONS preflight request', async () => {
    const handler = createAgentRunHandler(() => mockEventGenerator());

    const req = { method: 'OPTIONS' };
    const res = {
      end: vi.fn(),
      writeHead: vi.fn()
    };

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Origin': '*'
      })
    );
    expect(res.end).toHaveBeenCalledWith();
  });

  it('should reject unsupported HTTP methods', async () => {
    const handler = createAgentRunHandler(() => mockEventGenerator());

    const req = { method: 'DELETE' };
    const res = {
      end: vi.fn(),
      write: vi.fn(),
      writeHead: vi.fn()
    };

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });

  it('should handle POST requests and stream events', async () => {
    const handler = createAgentRunHandler(() => mockEventGenerator());

    const res = {
      end: vi.fn(),
      write: vi.fn().mockImplementation((chunk: unknown) => {
        // Verify chunk is data (Uint8Array)
        expect(chunk).toBeInstanceOf(Uint8Array);
      }),
      writeHead: vi.fn()
    };
    const req = { method: 'POST' };

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(res.write).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it('should handle streaming errors', async () => {
    const handler = createAgentRunHandler(() => mockErrorGenerator());

    const res = {
      end: vi.fn(),
      write: vi.fn(),
      writeHead: vi.fn()
    };
    const req = { method: 'POST' };

    await handler(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
  });
});

describe('createExpressMiddleware', () => {
  it('should stream events via Express response', async () => {
    const middleware = createExpressMiddleware(() => mockEventGenerator());

    const res = {
      end: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => ({
        json: vi.fn()
      })),
      write: vi.fn()
    };
    const req: Record<string, unknown> = {};

    await middleware(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.end).toHaveBeenCalled();
  });

  it('should handle errors in Express middleware', async () => {
    const middleware = createExpressMiddleware(() => mockErrorGenerator());

    const res = {
      end: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => ({
        json: vi.fn()
      })),
      write: vi.fn()
    };
    const req: Record<string, unknown> = {};

    await middleware(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('createHonoHandler', () => {
  it('should return Hono body stream', async () => {
    const handler = createHonoHandler(() => mockEventGenerator());

    const c = {
      body: vi.fn(() => ({ status: 200 }))
    };

    const result = await handler(c);

    expect(c.body).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'text/event-stream'
        })
      })
    );
    expect(result).toBeDefined();
  });

  it('should handle Hono errors', async () => {
    const handler = createHonoHandler(() => mockErrorGenerator());

    const c = {
      body: vi.fn(() => ({ status: 200 })),
      status: vi.fn(() => ({
        json: vi.fn()
      }))
    };

    await handler(c);

    // Handler should attempt to use body() or handle error gracefully
    expect(c.body).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'text/event-stream'
        })
      })
    );
  });
});
