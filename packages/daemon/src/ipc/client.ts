import { randomUUID } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import type { IPCRequest } from './protocol.js';

export class IPCClient {
  private socket: Socket | null = null;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly streamListeners = new Map<string, StreamListener>();
  private buffer = '';

  async connect(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = connect(socketPath, () => resolve());

      this.socket.on('data', (data: Buffer) => {
        this.buffer += data.toString('utf-8');
        this.processBuffer();
      });

      this.socket.on('error', reject);
    });
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = randomUUID();
    const request: IPCRequest = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket?.write(`${JSON.stringify(request)}\n`);

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`IPC request timeout: ${method}`));
        }
      }, 30_000).unref();
    });
  }

  async *stream(method: string, params?: Record<string, unknown>): AsyncGenerator<Record<string, unknown>> {
    const streamId = randomUUID();

    // Register stream listener before sending request
    const listener = new StreamListener(streamId);
    this.streamListeners.set(streamId, listener);

    // Send the stream start request
    await this.request(method, { ...params, streamId });

    // Yield chunks as they arrive
    try {
      for await (const chunk of listener) {
        if ('error' in chunk) {
          const err = chunk as unknown as { error: Error };
          throw new Error(err.error.message);
        }
        if ('end' in chunk) {
          return; // Stream complete
        }
        yield chunk;
      }
    } finally {
      this.streamListeners.delete(streamId);
    }
  }

  private processBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line.trim()) {
        continue;
      }

      try {
        const message = JSON.parse(line) as Record<string, unknown>;

        // Response to a pending request
        if (message.id && this.pendingRequests.has(message.id as string)) {
          const { resolve, reject } = this.pendingRequests.get(message.id as string)!;
          this.pendingRequests.delete(message.id as string);
          if (message.error) {
            reject(new Error((message.error as { message: string }).message));
          } else {
            resolve(message.result);
          }
        }

        // Streaming notification
        if (message.method === 'stream.chunk') {
          const params = message.params as { streamId: string; chunk: Record<string, unknown> };
          this.streamListeners.get(params.streamId)?.push(params.chunk);
        }
        if (message.method === 'stream.end') {
          const params = message.params as { streamId: string };
          this.streamListeners.get(params.streamId)?.end();
        }
        if (message.method === 'stream.error') {
          const params = message.params as { streamId: string; error: Error };
          this.streamListeners.get(params.streamId)?.error(params.error);
        }
      } catch (error) {
        console.error('Failed to parse IPC message:', error);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
  }
}

// Helper: async iterator adapter for stream chunks
class StreamListener implements AsyncIterable<Record<string, unknown> | { end: true } | { error: Error }> {
  private readonly queue: (Record<string, unknown> | { end: true } | { error: Error })[] = [];
  private waiting: ((value: IteratorResult<Record<string, unknown>>) => void) | null = null;
  private done = false;

  constructor(readonly _streamId: string) {}

  push(chunk: Record<string, unknown>): void {
    if (this.done) {
      return;
    }
    if (this.waiting) {
      this.waiting({ value: chunk, done: false });
      this.waiting = null;
    } else {
      this.queue.push(chunk);
    }
  }

  end(): void {
    this.done = true;
    if (this.waiting) {
      this.waiting({ value: undefined as unknown as Record<string, unknown>, done: true });
      this.waiting = null;
    } else {
      this.queue.push({ end: true });
    }
  }

  error(error: Error): void {
    this.done = true;
    if (this.waiting) {
      this.waiting(Promise.reject(error) as unknown as IteratorResult<Record<string, unknown>>);
      this.waiting = null;
    } else {
      this.queue.push({ error });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Record<string, unknown>> {
    return {
      next: (): Promise<IteratorResult<Record<string, unknown>>> => {
        if (this.queue.length > 0) {
          const item = this.queue.shift()!;
          if ('end' in item) {
            return Promise.resolve({ value: undefined, done: true });
          }
          if ('error' in item) {
            return Promise.reject(item.error);
          }
          return Promise.resolve({ value: item as Record<string, unknown>, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise(resolve => {
          this.waiting = resolve;
        });
      }
    };
  }
}
