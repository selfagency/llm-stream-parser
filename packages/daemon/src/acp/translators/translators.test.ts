import { describe, expect, it } from 'vitest';
import { CancelScopingTranslator } from './cancel-scoping.js';
import { ErrorKindTranslator } from './error-kind.js';
import { PermissionRelayTranslator } from './permission-relay.js';
import { ReplayTranslator } from './replay.js';
import { SessionLineageTranslator } from './session-lineage.js';
import type { ToolStreamEvent } from './tool-streaming.js';
import { ToolStreamingTranslator } from './tool-streaming.js';
import type { TranslatorContext } from './types.js';

function mockContext(sessionId: string): TranslatorContext {
  return { sessionId };
}

describe('ReplayTranslator', () => {
  it('should return error when ledger not available', () => {
    const t = new ReplayTranslator();
    const result = t.translate(mockContext('sess-1'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Event ledger not available');
  });

  it('should return error for empty session', () => {
    const t = new ReplayTranslator();
    const context: TranslatorContext = {
      sessionId: 'sess-1',
      eventLedger: { getSessionEvents: () => [] }
    };
    const result = t.translate(context);
    expect(result.success).toBe(false);
  });
});

describe('SessionLineageTranslator', () => {
  it('should return lineage info with no parent for root session', () => {
    const t = new SessionLineageTranslator();
    const result = t.translate(mockContext('sess-1'));
    expect(result.success).toBe(true);
    expect(result.data?.parentSessionId).toBeNull();
    expect(result.data?.forkCount).toBe(0);
  });

  it('should track fork relationships', () => {
    const t = new SessionLineageTranslator();
    t.recordFork('sess-1', 'sess-2');
    t.recordFork('sess-1', 'sess-3');

    const parentResult = t.translate(mockContext('sess-1'));
    expect(parentResult.data?.forkCount).toBe(2);
    expect(parentResult.data?.forkedSessions).toEqual(['sess-2', 'sess-3']);

    const childResult = t.translate(mockContext('sess-2'));
    expect(childResult.data?.parentSessionId).toBe('sess-1');
  });
});

describe('CancelScopingTranslator', () => {
  it('should allow cancellation for active sessions', () => {
    const t = new CancelScopingTranslator();
    const result = t.translate(mockContext('sess-1'));
    expect(result.data?.cancelAllowed).toBe(true);
    expect(result.data?.alreadyCancelled).toBe(false);
  });

  it('should mark session as already cancelled', () => {
    const t = new CancelScopingTranslator();
    t.markSessionCancelled('sess-1');
    const result = t.translate(mockContext('sess-1'));
    expect(result.data?.alreadyCancelled).toBe(true);
    expect(result.data?.cancelAllowed).toBe(false);
  });
});

describe('PermissionRelayTranslator', () => {
  it('should create pending permission request', () => {
    const t = new PermissionRelayTranslator();
    const req = t.requestPermission('file_write', 'Need to write config');
    expect(req.permission).toBe('file_write');
    expect(req.approved).toBeNull();
  });

  it('should resolve pending request', () => {
    const t = new PermissionRelayTranslator();
    const req = t.requestPermission('file_write', 'write');
    const resolved = t.resolvePermission(req.id, true);
    expect(resolved).toBe(true);
    expect(req.approved).toBe(true);
  });

  it('should probe supported kinds', () => {
    const t = new PermissionRelayTranslator();
    const kinds = t.probeSupportedKinds();
    expect(kinds).toContain('file_write');
    expect(kinds).toContain('file_read');
  });
});

describe('ToolStreamingTranslator', () => {
  it('should record tool call lifecycle', () => {
    const t = new ToolStreamingTranslator();
    t.recordStart('call-1', 'read_file');
    t.recordProgress('call-1', 50, '{"path":');
    t.recordComplete('call-1', 'file content');

    const result = t.translate(mockContext('sess-1'));
    expect(result.success).toBe(true);
    expect(result.data as ToolStreamEvent[]).toHaveLength(1);
    expect((result.data as ToolStreamEvent[])[0]?.status).toBe('completed');
  });

  it('should record tool failure', () => {
    const t = new ToolStreamingTranslator();
    t.recordStart('call-2', 'write_file');
    t.recordFailure('call-2', 'Permission denied');

    const res = t.translate(mockContext('sess-1'));
    expect(res.data?.[0]?.status).toBe('failed');
  });
});

describe('ErrorKindTranslator', () => {
  it('should classify rate limit errors', () => {
    const t = new ErrorKindTranslator();
    const result = t.classify('Rate limit exceeded: 100 requests per minute');
    expect(result.kind).toBe('rate_limit');
    expect(result.retryable).toBe(true);
  });

  it('should classify guardrail blocks', () => {
    const t = new ErrorKindTranslator();
    const result = t.classify('Guardrail pipeline blocked: content policy violation');
    expect(result.kind).toBe('guardrail_block');
    expect(result.retryable).toBe(false);
  });

  it('should classify timeout errors', () => {
    const t = new ErrorKindTranslator();
    const result = t.classify('Request timed out after 30000ms');
    expect(result.kind).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should classify unknown errors', () => {
    const t = new ErrorKindTranslator();
    const result = t.classify('Something unexpected happened');
    expect(result.kind).toBe('unknown');
    expect(result.retryable).toBe(false);
  });

  it('should classify budget exceeded', () => {
    const t = new ErrorKindTranslator();
    const result = t.classify('Budget exceeded: monthly token quota reached');
    expect(result.kind).toBe('budget_exceeded');
  });
});
