/**
 * AG-UI HTTP Server Helpers
 *
 * Provides request handlers for various frameworks that wrap an LLM pipeline
 * and emit AG-UI events as Server-Sent Events (SSE).
 *
 * This makes llm-stream-parser a complete AG-UI backend without additional code:
 * - Direct-to-LLM provider integration (OpenAI, Anthropic, Gemini, etc.)
 * - Automatic AG-UI event emission
 * - SSE streaming response
 * - Compatible with Node.js http, Hono, Express, Fastify, etc.
 */

import { randomUUID } from 'node:crypto';
import type { AgUiEvent } from '@agentsy/shared';

/**
 * Options for SSE stream creation.
 */
export interface SSEStreamOptions {
  /**
   * Custom event formatter. Default: JSON serialization.
   */
  formatEvent?: (event: AgUiEvent) => string;

  /**
   * Heartbeat interval in ms to keep connection alive (default: 30000).
   */
  heartbeatInterval?: number;

  /**
   * Whether to include comments (default: false).
   */
  includeComments?: boolean;
}

/**
 * Represents an SSE stream that can be piped or consumed.
 *
 * The stream emits:
 * - `event: <eventType>` (SSE event name)
 * - `data: <JSON>` (SSE data payload)
 * - Heartbeat `:` comments (optional, to keep connection alive)
 */
export interface SSEStream {
  /**
   * Web Streams API ReadableStream. Use for Hono, Deno, browser fetch.
   */
  readonly readable: ReadableStream<Uint8Array>;

  /**
   * AsyncIterable for manual consumption and Node.js compatibility.
   */
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}

/**
 * Converts an AsyncGenerator of AG-UI events into an SSE stream.
 *
 * Formats each event as:
 * event: <eventType>
 * data: <JSON>
 *
 * @param events - AsyncGenerator of AG-UI events
 * @param options - Configuration
 * @returns SSE stream (supports both Node.js and Web Streams APIs)
 */
export function createSSEStream(events: AsyncGenerator<AgUiEvent>, options: SSEStreamOptions = {}): SSEStream {
  const {
    formatEvent = defaultFormatEvent,
    includeComments: _includeComments = false,
    heartbeatInterval: _heartbeatInterval = 30_000
  } = options;

  // Create an async iterable that produces SSE-formatted chunks
  const createAsyncIterable = async function* createAsyncIterable() {
    const encoder = new TextEncoder();

    try {
      // Emit each event as SSE-formatted data
      for await (const event of events) {
        yield encoder.encode(formatEvent(event));
      }
    } finally {
      // Cleanup on stream end (no action needed currently)
    }
  };

  // Create Web Streams API ReadableStream
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of createAsyncIterable()) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return {
    readable,
    async *[Symbol.asyncIterator]() {
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }
  };
}

/**
 * Default SSE event formatter.
 *
 * Formats an AG-UI event as:
 * ```
 * event: <eventType>
 * data: <JSON>
 *
 * ```
 */
function defaultFormatEvent(event: AgUiEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

type NodeResponse = Record<string, unknown> & {
  writeHead?: (statusCode: number, headers: Record<string, unknown>) => void;
  write?: (chunk: Uint8Array | string) => void;
  end?: (data?: Uint8Array | string) => void;
  setHeader?: (name: string, value: string | string[]) => void;
  status?: (code: number) => { json: (data: Record<string, unknown>) => void };
};

type NodeRequest = Record<string, unknown> & {
  method?: string;
};

/**
 * Creates a simple HTTP response handler for Node.js.
 *
 * @param streamGenerator - Function that returns an AsyncGenerator of AG-UI events
 * @returns Handler function for Node.js http module
 */
export function createAgentRunHandler(streamGenerator: (runId: string) => AsyncGenerator<AgUiEvent>) {
  return async (req: NodeRequest, res: NodeResponse): Promise<void> => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead?.(200, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Origin': '*'
      });
      res.end?.();
      return;
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
      res.writeHead?.(405, { 'Content-Type': 'application/json' });
      res.end?.(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const runId = `run_${randomUUID()}`;

    try {
      const events = streamGenerator(runId);
      const sseStream = createSSEStream(events);

      res.writeHead?.(200, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream'
      });

      for await (const chunk of sseStream) {
        res.write?.(chunk);
      }

      res.end?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.writeHead?.(500, { 'Content-Type': 'application/json' });
      res.end?.(JSON.stringify({ error: errorMessage }));
    }
  };
}

/**
 * Creates an Express-compatible middleware for streaming AG-UI events.
 *
 * @param streamGenerator - Function that returns an AsyncGenerator of AG-UI events
 * @returns Express middleware
 */
export function createExpressMiddleware(streamGenerator: (runId: string) => AsyncGenerator<AgUiEvent>) {
  return async (_req: NodeRequest, res: NodeResponse) => {
    const runId = `run_${randomUUID()}`;

    try {
      const events = streamGenerator(runId);
      const sseStream = createSSEStream(events);

      res.setHeader?.('Content-Type', 'text/event-stream');
      res.setHeader?.('Cache-Control', 'no-cache');
      res.setHeader?.('Connection', 'keep-alive');
      res.setHeader?.('Access-Control-Allow-Origin', '*');

      for await (const chunk of sseStream) {
        res.write?.(chunk);
      }

      res.end?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const status = res.status?.(500);
      status?.json({ error: errorMessage });
    }
  };
}

/**
 * Helper to create a Hono handler for streaming AG-UI events.
 *
 * @param streamGenerator - Function that returns an AsyncGenerator of AG-UI events
 * @returns Hono handler
 */
export function createHonoHandler(streamGenerator: (runId: string) => AsyncGenerator<AgUiEvent>) {
  return (c: Record<string, unknown>) => {
    const runId = `run_${randomUUID()}`;

    try {
      const events = streamGenerator(runId);
      const sseStream = createSSEStream(events);

      const bodyFn = c.body as (
        stream: ReadableStream<Uint8Array> | AsyncGenerator<Uint8Array>,
        options: Record<string, unknown>
      ) => unknown;

      return bodyFn(sseStream.readable, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream'
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const _jsonFn = c.json as (data: Record<string, unknown>, status: number) => unknown;
      return _jsonFn({ error: errorMessage }, 500);
    }
  };
}
