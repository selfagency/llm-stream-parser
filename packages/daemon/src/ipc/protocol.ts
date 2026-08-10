import { z } from 'zod';

// ── Base Protocol ──────────────────────────────────

export const IPCRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional()
});

export interface IPCRequest {
  id?: string | number | null;
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export const IPCResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional()
    })
    .optional()
});

export interface IPCResponse {
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id?: string | number | null;
  jsonrpc: '2.0';
  result?: unknown;
}

// ── Streaming ──────────────────────────────────────

import type { StreamChunk } from '@agentsy/shared';

/**
 * JSON-safe payload for a stream.chunk notification.
 * Maps StreamChunk fields to serializable primitives.
 */
export interface StreamChunkPayload {
  content?: string | undefined;
  done?: boolean | undefined;
  finishReason?: string | undefined;
  nativeToolCallDeltas?:
    | Array<{
        argumentsDelta?: string | undefined;
        id?: string | undefined;
        index: number;
        name?: string | undefined;
      }>
    | undefined;
  stepIndex?: number | undefined;
  stepUsage?: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined;
  thinking?: string | undefined;
  tool_calls?: Array<{ function?: { name?: string | undefined; arguments?: unknown } | undefined }> | undefined;
  usage?: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined;
}

/** Convert a StreamChunk to a JSON-safe payload for IPC transmission. */
export function toStreamChunkPayload(chunk: StreamChunk): StreamChunkPayload {
  return {
    content: chunk.content,
    done: chunk.done,
    finishReason: chunk.finishReason,
    nativeToolCallDeltas: chunk.nativeToolCallDeltas?.map(d => ({
      argumentsDelta: d.argumentsDelta,
      id: d.id,
      index: d.index,
      name: d.name
    })),
    stepIndex: chunk.stepIndex,
    stepUsage: chunk.stepUsage
      ? { inputTokens: chunk.stepUsage.inputTokens, outputTokens: chunk.stepUsage.outputTokens }
      : undefined,
    thinking: chunk.thinking,
    tool_calls: chunk.tool_calls,
    usage: chunk.usage ? { inputTokens: chunk.usage.inputTokens, outputTokens: chunk.usage.outputTokens } : undefined
  } satisfies StreamChunkPayload;
}

export const IPCStreamChunkSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('stream.chunk'),
  params: z.object({
    streamId: z.string(),
    chunk: z.record(z.string(), z.unknown()),
    index: z.number().int().nonnegative()
  })
});

export interface IPCStreamChunk {
  jsonrpc: '2.0';
  method: 'stream.chunk';
  params: {
    streamId: string;
    chunk: Record<string, unknown>;
    index: number;
  };
}

export const IPCStreamEndSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('stream.end'),
  params: z.object({
    streamId: z.string(),
    usage: z.record(z.string(), z.unknown()).optional(),
    totalChunks: z.number().int().nonnegative()
  })
});

export interface IPCStreamEnd {
  jsonrpc: '2.0';
  method: 'stream.end';
  params: {
    streamId: string;
    usage?: Record<string, unknown>;
    totalChunks: number;
  };
}

export const IPCStreamErrorSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('stream.error'),
  params: z.object({
    streamId: z.string(),
    error: z.object({
      code: z.number(),
      message: z.string(),
      recoverable: z.boolean()
    })
  })
});

export interface IPCStreamError {
  jsonrpc: '2.0';
  method: 'stream.error';
  params: {
    streamId: string;
    error: {
      code: number;
      message: string;
      recoverable: boolean;
    };
  };
}

// ── Method Registry ────────────────────────────────

/** Schema for stream.start IPC request params. */
export const StreamStartRequestSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })).nonempty(),
  model: z.string().optional(),
  routing: z.record(z.string(), z.unknown()).optional(),
  system: z.string().optional()
});

export type StreamStartRequest = z.infer<typeof StreamStartRequestSchema>;

export type IPCMethod =
  // Agent lifecycle
  | 'agent.spawn'
  | 'agent.list'
  | 'agent.kill'
  | 'agent.send'
  // Streaming
  | 'stream.start'
  | 'stream.cancel'
  // Memory
  | 'memory.recall'
  | 'memory.capture'
  | 'memory.search'
  // Jobs (Honker-backed)
  | 'jobs.enqueue'
  | 'jobs.list'
  | 'jobs.cancel'
  | 'jobs.claim'
  | 'jobs.ack'
  // Scheduler
  | 'scheduler.schedule'
  | 'scheduler.list'
  | 'scheduler.cancel'
  // Health
  | 'daemon.status'
  | 'daemon.shutdown'
  // Pool (Piscina)
  | 'pool.stats'
  // Display
  | 'display.render'
  // Subprocess management
  | 'process.spawn'
  | 'process.list'
  | 'process.kill'
  | 'process.output';

// ── Standard JSON-RPC Error Codes ──────────────────

export const ErrorCode = {
  ParseError: -32_700,
  InvalidRequest: -32_600,
  MethodNotFound: -32_601,
  InvalidParams: -32_602,
  InternalError: -32_603,
  ServerError: -32_000
} as const;

// ── Notification ──────────────────────────────────

export interface IPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}
