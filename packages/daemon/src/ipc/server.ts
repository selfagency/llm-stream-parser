import { randomUUID } from 'node:crypto';
import { chmod, unlink } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import type { Logger } from '../types.js';
import type { IPCResponse } from './protocol.js';
import { ErrorCode, IPCRequestSchema } from './protocol.js';

const MAX_MESSAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface IPCServerConfig {
  logger: Logger;
  maxConnections?: number;
  requestTimeoutMs?: number;
  socketPath: string;
}

export type RequestHandler = (
  params: Record<string, unknown>,
  context: {
    clientId: string;
    socket: Socket;
    sendNotification: (method: string, params: unknown) => void;
  }
) => Promise<unknown>;

export class IPCServer {
  private server: ReturnType<typeof createServer> | null = null;
  private readonly clients = new Map<string, Socket>();
  private readonly handlers = new Map<string, RequestHandler>();
  private readonly config: Required<IPCServerConfig>;

  constructor(config: IPCServerConfig) {
    this.config = {
      maxConnections: 10,
      requestTimeoutMs: 30_000,
      ...config
    };
  }

  async start(): Promise<void> {
    try {
      await unlink(this.config.socketPath);
    } catch {
      // doesn't exist, fine
    }

    this.server = createServer(socket => {
      const clientId = randomUUID();

      if (this.clients.size >= this.config.maxConnections) {
        this.config.logger.warn('Max connections reached, rejecting client', { clientId });
        socket.destroy();
        return;
      }

      this.clients.set(clientId, socket);
      this.setupClient(clientId, socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.listen(this.config.socketPath, () => {
        // Set socket permissions to 0o600 (owner read/write only)
        chmod(this.config.socketPath, 0o600).catch(err => {
          this.config.logger.warn('Failed to set socket permissions', { error: err });
        });
        resolve();
      });
      this.server?.on('error', reject);
    });
  }

  private setupClient(clientId: string, socket: Socket): void {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let buffer = '';

    socket.on('error', err => {
      this.config.logger.warn('Client socket error', { clientId, err });
      this.clients.delete(clientId);
      socket.destroy();
    });

    socket.on('data', (data: Buffer) => {
      // Use TextDecoder with stream:true to handle UTF-8 split across chunks
      const decoded = decoder.decode(data, { stream: true });

      // Enforce max message size to prevent OOM
      if (buffer.length + decoded.length > MAX_MESSAGE_BYTES) {
        this.config.logger.warn('Message too large, dropping connection', { clientId });
        socket.destroy();
        return;
      }
      buffer += decoded;

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (line.trim()) {
          this.handleMessage(clientId, line, socket).catch((error: Error) => {
            this.config.logger.error('Error handling IPC message', { clientId, error });
          });
        }

        newlineIdx = buffer.indexOf('\n');
      }
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  private async handleMessage(clientId: string, raw: string, socket: Socket): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        error: { code: ErrorCode.ParseError, message: 'Parse error' }
      });
      return;
    }

    // Validate against JSON-RPC 2.0 schema
    const result = IPCRequestSchema.safeParse(parsed);
    if (!result.success) {
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        error: { code: ErrorCode.InvalidRequest, message: 'Invalid JSON-RPC 2.0 request' }
      });
      return;
    }

    const request = result.data;

    // Notifications (no id) must not receive a response
    const isNotification = request.id === undefined || request.id === null;

    const handler = this.handlers.get(request.method);
    if (!handler) {
      if (!isNotification) {
        this.sendResponse(socket, {
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: { code: ErrorCode.MethodNotFound, message: `Method not found: ${request.method}` }
        });
      }
      return;
    }

    try {
      // Wrap handler with request timeout
      const handlerPromise = handler(request.params ?? {}, {
        clientId,
        socket,
        sendNotification: (method: string, params: unknown) => {
          this.sendNotification(socket, { jsonrpc: '2.0', method, params });
        }
      });

      const resultValue = await Promise.race([
        handlerPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeoutMs).unref()
        )
      ]);

      if (!isNotification) {
        this.sendResponse(socket, {
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: resultValue
        });
      }
    } catch (error: unknown) {
      if (isNotification) {
        return; // Don't respond to notifications
      }
      const err = error as Error & { code?: number };
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: err.code ?? ErrorCode.InternalError,
          message: err.message ?? 'Internal error'
        }
      });
    }
  }

  handle(method: string, handler: RequestHandler): void {
    this.handlers.set(method, handler);
  }

  private sendResponse(socket: Socket, response: IPCResponse): void {
    if (socket.writable) {
      try {
        socket.write(`${JSON.stringify(response)}\n`);
      } catch {
        // Socket may have closed; ignore
      }
    }
  }

  private sendNotification(socket: Socket, notification: object): void {
    if (socket.writable) {
      try {
        socket.write(`${JSON.stringify(notification)}\n`);
      } catch {
        // Socket may have closed; ignore
      }
    }
  }

  broadcast(method: string, params: unknown): void {
    const notification = `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`;
    for (const [, socket] of this.clients) {
      if (socket.writable) {
        try {
          socket.write(notification);
        } catch {
          // Client may have disconnected; ignore write errors
        }
      }
    }
  }

  async stop(): Promise<void> {
    for (const socket of this.clients.values()) {
      socket.destroy();
    }
    this.clients.clear();

    if (this.server) {
      const srv = this.server;
      await new Promise<void>(resolve => srv.close(() => resolve()));
      this.server = null;
    }

    try {
      await unlink(this.config.socketPath);
    } catch {
      // fine
    }
  }
}
