import { describe, expect, it } from 'vitest';
import {
  ErrorCode,
  IPCRequestSchema,
  IPCResponseSchema,
  IPCStreamChunkSchema,
  IPCStreamEndSchema,
  IPCStreamErrorSchema
} from './protocol.js';

describe('IPCRequestSchema', () => {
  it('should validate a valid request', () => {
    const result = IPCRequestSchema.parse({
      jsonrpc: '2.0',
      id: 'abc-123',
      method: 'agent.spawn',
      params: { name: 'test' }
    });
    expect(result.jsonrpc).toBe('2.0');
    expect(result.id).toBe('abc-123');
    expect(result.method).toBe('agent.spawn');
  });

  it('should accept request without params', () => {
    const result = IPCRequestSchema.parse({
      jsonrpc: '2.0',
      id: 'abc-123',
      method: 'agent.list'
    });
    expect(result.params).toBeUndefined();
  });

  it('should reject non-2.0 jsonrpc', () => {
    expect(() => IPCRequestSchema.parse({ jsonrpc: '1.0', id: 'x', method: 'test' })).toThrow();
  });

  it('should accept missing id (notification)', () => {
    const result = IPCRequestSchema.parse({ jsonrpc: '2.0', method: 'test' });
    expect(result.id).toBeUndefined();
  });
});

describe('IPCResponseSchema', () => {
  it('should validate a successful response', () => {
    const result = IPCResponseSchema.parse({
      jsonrpc: '2.0',
      id: 'abc-123',
      result: { status: 'ok' }
    });
    expect(result.result).toEqual({ status: 'ok' });
  });

  it('should validate an error response', () => {
    const result = IPCResponseSchema.parse({
      jsonrpc: '2.0',
      id: 'abc-123',
      error: { code: -32_601, message: 'Method not found' }
    });
    expect(result.error?.code).toBe(-32_601);
  });
});

describe('IPCStreamChunkSchema', () => {
  it('should validate a stream chunk', () => {
    const result = IPCStreamChunkSchema.parse({
      jsonrpc: '2.0',
      method: 'stream.chunk',
      params: { streamId: 's1', chunk: { text: 'hello' }, index: 0 }
    });
    expect(result.params.streamId).toBe('s1');
    expect(result.params.index).toBe(0);
  });
});

describe('IPCStreamEndSchema', () => {
  it('should validate stream end', () => {
    const result = IPCStreamEndSchema.parse({
      jsonrpc: '2.0',
      method: 'stream.end',
      params: { streamId: 's1', totalChunks: 5 }
    });
    expect(result.params.totalChunks).toBe(5);
  });
});

describe('IPCStreamErrorSchema', () => {
  it('should validate stream error', () => {
    const result = IPCStreamErrorSchema.parse({
      jsonrpc: '2.0',
      method: 'stream.error',
      params: { streamId: 's1', error: { code: 500, message: 'fail', recoverable: true } }
    });
    expect(result.params.error.recoverable).toBe(true);
  });
});

describe('ErrorCode', () => {
  it('should have standard JSON-RPC error codes', () => {
    expect(ErrorCode.ParseError).toBe(-32_700);
    expect(ErrorCode.InvalidRequest).toBe(-32_600);
    expect(ErrorCode.MethodNotFound).toBe(-32_601);
    expect(ErrorCode.InvalidParams).toBe(-32_602);
    expect(ErrorCode.InternalError).toBe(-32_603);
  });
});
