/**
 * Tests for ACPNotificationAdapter.
 */

import { describe, expect, it, vi } from 'vitest';
import { ACPNotificationAdapter } from './acp-notification-adapter.js';
import type { Logger } from '../types.js';

// =============================================================================
// Mocks
// =============================================================================

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis()
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ACPNotificationAdapter', () => {
  it('wires and unwires sessions', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.unwireSession('sess-1');

    // After unwire, emitChunk should return 0
    const count = adapter.emitChunk('agent-1', { content: 'Hello' });
    expect(count).toBe(0);
  });

  it('emits agent_message_chunk for content chunks', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.emitChunk('agent-1', { content: 'Hello world' });

    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'agent_message_chunk',
      content: 'Hello world'
    });
  });

  it('emits agent_thought_chunk for thinking chunks', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.emitChunk('agent-1', { thinking: 'I am thinking...' });

    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'agent_thought_chunk',
      content: 'I am thinking...'
    });
  });

  it('emits tool_call for tool call deltas', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.emitChunk('agent-1', {
      nativeToolCallDeltas: [{ index: 0, id: 'call-1', name: 'get_weather', argumentsDelta: '{"city":"London"}' }]
    });

    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'tool_call',
      toolCallId: 'call-1',
      toolName: 'get_weather',
      arguments: '{"city":"London"}',
      status: 'running'
    });
  });

  it('emits usage_update on emitUsage', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.emitUsage('agent-1', { inputTokens: 10, outputTokens: 20, costUsd: 0.001 });

    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'usage_update',
      usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.001 }
    });
  });

  it('emits error on emitError', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.emitError('agent-1', 'Stream failed');

    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'error',
      error: 'Stream failed'
    });
  });

  it('returns 0 for unwired agents', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });

    expect(adapter.emitChunk('unknown-agent', { content: 'Hello' })).toBe(0);
    expect(adapter.emitUsage('unknown-agent', { inputTokens: 0, outputTokens: 0, costUsd: 0 })).toBe(0);
    expect(adapter.emitError('unknown-agent', 'error')).toBe(0);
  });

  it('unwires all sessions for a given sessionId', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();

    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    adapter.wireAgentToSession('agent-2', 'sess-1', notify);
    adapter.unwireSession('sess-1');

    expect(adapter.emitChunk('agent-1', { content: 'Hello' })).toBe(0);
    expect(adapter.emitChunk('agent-2', { content: 'Hello' })).toBe(0);
  });
});
