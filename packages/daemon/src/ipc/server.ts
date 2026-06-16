import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { createServer, type Socket } from 'node:net';
import type { Logger } from '../types.js';
import type { IPCRequest, IPCResponse } from './protocol.js';
import { ErrorCode } from './protocol.js';

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
    // Remove stale socket file
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
      this.server?.listen(this.config.socketPath, () => resolve());
      this.server?.on('error', reject);
    });
  }

  private setupClient(clientId: string, socket: Socket): void {
    let buffer = '';

    socket.on('data', (data: Buffer) => {
      buffer += data.toString('utf-8');

      // Parse newline-delimited JSON
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (line.trim()) {
          this.handleMessage(clientId, line, socket).catch((error: Error) => {
            this.config.logger.error('Error handling IPC message', { clientId, error });
          });
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  private async handleMessage(clientId: string, raw: string, socket: Socket): Promise<void> {
    let request: IPCRequest;
    try {
      request = JSON.parse(raw) as IPCRequest;
    } catch {
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: '',
        error: { code: ErrorCode.ParseError, message: 'Parse error' }
      });
      return;
    }

    const handler = this.handlers.get(request.method);
    if (!handler) {
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: ErrorCode.MethodNotFound, message: `Method not found: ${request.method}` }
      });
      return;
    }

    try {
      const result = await handler(request.params ?? {}, {
        clientId,
        socket,
        sendNotification: (method: string, params: unknown) => {
          this.sendNotification(socket, { jsonrpc: '2.0', method, params });
        }
      });

      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id,
        result
      });
    } catch (error: unknown) {
      const err = error as Error & { code?: number };
      this.sendResponse(socket, {
        jsonrpc: '2.0',
        id: request.id,
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
    socket.write(`${JSON.stringify(response)}\n`);
  }

  private sendNotification(socket: Socket, notification: object): void {
    socket.write(`${JSON.stringify(notification)}\n`);
  }

  broadcast(method: string, params: unknown): void {
    const notification = `${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`;
    for (const [, socket] of this.clients) {
      try {
        socket.write(notification);
      } catch {
        // Client may have disconnected; ignore write errors
      }
    }
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const [id, socket] of this.clients) {
      socket.destroy();
      this.clients.delete(id);
    }

    // Close server
    if (this.server) {
      await new Promise<void>(resolve => this.server?.close(() => resolve()));
      this.server = null;
    }

    // Clean up socket file
    try {
      await unlink(this.config.socketPath);
    } catch {
      // fine
    }
  }
}
