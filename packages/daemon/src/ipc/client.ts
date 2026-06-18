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

  connect(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = connect(socketPath, () => {
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.buffer += data.toString('utf-8');
        this.processBuffer();
      });

      this.socket.once('error', reject);

      // Attach a permanent error handler once connect resolves
      this.socket.on('connect_error', () => {
        /* connect_error not emitted by regular sockets; here for safety */
      });
    });
  }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket) {
      return Promise.reject(new Error('IPCClient not connected'));
    }
    const id = randomUUID();
    const request: IPCRequest = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket?.write(`${JSON.stringify(request)}\n`);

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

    const listener = new StreamListener(streamId);
    this.streamListeners.set(streamId, listener);

    await this.request(method, { ...params, streamId });

    try {
      for await (const chunk of listener) {
        if ('error' in chunk) {
          const err = chunk as unknown as { error: Error };
          throw new Error(err.error.message);
        }
        if ('end' in chunk) {
          return;
        }
        yield chunk;
      }
    } finally {
      this.streamListeners.delete(streamId);
    }
  }

  private processBuffer(): void {
    let newlineIdx = this.buffer.indexOf('\n');
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (line.trim()) {
        this.processLine(line);
      }

      newlineIdx = this.buffer.indexOf('\n');
    }
  }

  private processLine(line: string): void {
    try {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (!this.resolvePendingRequest(message)) {
        this.routeStreamNotification(message);
      }
    } catch (error) {
      console.error('Failed to parse IPC message:', error);
    }
  }

  private resolvePendingRequest(message: Record<string, unknown>): boolean {
    const msgId = message.id as string | undefined;
    if (!(msgId && this.pendingRequests.has(msgId))) {
      return false;
    }
    const entry = this.pendingRequests.get(msgId);
    if (!entry) {
      return false;
    }
    const { resolve, reject } = entry;
    this.pendingRequests.delete(msgId);
    if (message.error) {
      reject(new Error((message.error as { message: string }).message));
    } else {
      resolve(message.result);
    }
    return true;
  }

  private routeStreamNotification(message: Record<string, unknown>): void {
    const method = message.method as string | undefined;
    if (method === 'stream.chunk') {
      const params = message.params as { streamId: string; chunk: Record<string, unknown> };
      this.streamListeners.get(params.streamId)?.push(params.chunk);
    } else if (method === 'stream.end') {
      const params = message.params as { streamId: string };
      this.streamListeners.get(params.streamId)?.end();
    } else if (method === 'stream.error') {
      const params = message.params as { streamId: string; error: Error };
      this.streamListeners.get(params.streamId)?.error(params.error);
    }
  }

  disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
    return Promise.resolve();
  }
}

class StreamListener
  implements
    AsyncIterable<Record<string, unknown> | { end: true } | { error: Error }>,
    AsyncIterator<Record<string, unknown>>
{
  private readonly queue: (Record<string, unknown> | { end: true } | { error: Error })[] = [];
  private waiting: ((value: IteratorResult<Record<string, unknown>>) => void) | null = null;
  private done = false;

  // biome-ignore lint/complexity/noUselessConstructor: streamId reserved for future diagnostics
  // biome-ignore lint/suspicious/noEmptyBlockStatements: constructor intentionally empty
  constructor(_streamId: string) {}

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
    return this;
  }

  next(): Promise<IteratorResult<Record<string, unknown>>> {
    if (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item === undefined) {
        return Promise.resolve({ value: undefined, done: true });
      }
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
}
