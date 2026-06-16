/**
 * IPC subsystem — JSON-RPC 2.0 over Unix domain sockets.
 *
 * Provides the internal communication protocol between the daemon and
 * CLI/TUI clients. Uses newline-delimited JSON over Unix sockets.
 *
 * @module
 */

export { IPCClient } from './client.js';
export {
  ErrorCode,
  type IPCMethod,
  type IPCNotification,
  type IPCRequest,
  IPCRequestSchema,
  type IPCResponse,
  IPCResponseSchema,
  type IPCStreamChunk,
  IPCStreamChunkSchema,
  type IPCStreamEnd,
  IPCStreamEndSchema,
  type IPCStreamError,
  IPCStreamErrorSchema
} from './protocol.js';
export { IPCServer, type IPCServerConfig, type RequestHandler } from './server.js';
