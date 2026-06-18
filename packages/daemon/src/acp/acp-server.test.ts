import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { ACPNotificationAdapter } from './acp-notification-adapter.js';
import { ACPServer } from './acp-server.js';
import { ACPSessionBridge } from './acp-session-bridge.js';
import type { StreamManager } from '../services/stream-manager.js';

function createMockStreamManager(): StreamManager {
  return {
    name: 'stream',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined),
    wakeup: vi.fn().mockResolvedValue(undefined),
    state: 'running',
    startStream: vi.fn().mockReturnValue({ streamId: 's-test' }),
    cancelStream: vi.fn().mockReturnValue(true),
    count: vi.fn().mockReturnValue(0)
  } as unknown as StreamManager;
}

function createMockACPAdapter(): ACPNotificationAdapter {
  return {
    wireAgentToSession: vi.fn(),
    unwireSession: vi.fn(),
    emitChunk: vi.fn().mockReturnValue(0),
    emitToolCallEnd: vi.fn().mockReturnValue(0),
    emitUsage: vi.fn().mockReturnValue(0),
    emitError: vi.fn().mockReturnValue(0)
  } as unknown as ACPNotificationAdapter;
}

function createMockDaemon() {
  return {
    streamManager: createMockStreamManager(),
    acpNotificationAdapter: createMockACPAdapter(),
    routing: {} as never
  } as unknown as import('../daemon.js').Daemon;
}

describe('ACPServer', () => {
  it('should log disabled state', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const server = new ACPServer({
      daemon: {} as never,
      logger,
      subprocessManager: {} as never
    });
    await server.start({ enabled: false, transport: 'stdio' });
    expect(logger.info).toHaveBeenCalledWith('ACP server disabled');
  });

  it('should start and stop', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const server = new ACPServer({
      daemon: {} as never,
      logger,
      subprocessManager: {} as never
    });
    await server.start({ enabled: true, transport: 'stdio' });
    expect(logger.info).toHaveBeenCalled();
    await server.stop();
  });
});

describe('ACPSessionBridge', () => {
  it('should create with defaults', () => {
    const bridge = new ACPSessionBridge({ daemon: createMockDaemon(), logger: createMockLogger() });
    expect(bridge.sessionId).toBeTruthy();
    expect(bridge.agentId).toBe(bridge.sessionId);
    expect(bridge.cwd).toBeTruthy();
    expect(bridge.additionalDirectories).toEqual([]);
  });

  it('should accept custom ids and cwd', () => {
    const bridge = new ACPSessionBridge({
      daemon: createMockDaemon(),
      logger: createMockLogger(),
      sessionId: 'sess-1',
      agentId: 'agent-1',
      cwd: '/home/user/project',
      additionalDirectories: ['/shared']
    });
    expect(bridge.sessionId).toBe('sess-1');
    expect(bridge.agentId).toBe('agent-1');
    expect(bridge.cwd).toBe('/home/user/project');
    expect(bridge.additionalDirectories).toEqual(['/shared']);
  });

  it('should handle prompt and wire ACP adapter', async () => {
    const daemon = createMockDaemon();
    const bridge = new ACPSessionBridge({ daemon, logger: createMockLogger() });
    const onChunk = vi.fn();
    const result = await bridge.handlePrompt('hello', {
      onChunk,
      onToolCall: vi.fn(),
      onToolCallUpdate: vi.fn(),
      onUsage: vi.fn()
    });
    expect(result.stopReason).toBe('end_turn');
    // StreamManager.startStream should have been called
    expect(daemon.streamManager.startStream).toHaveBeenCalled();
    // ACP adapter should have been wired
    expect(daemon.acpNotificationAdapter.wireAgentToSession).toHaveBeenCalled();
    // ACP adapter should have been unwired
    expect(daemon.acpNotificationAdapter.unwireSession).toHaveBeenCalled();
  });

  it('should handle prompt with streaming chunks', async () => {
    const daemon = createMockDaemon();
    const bridge = new ACPSessionBridge({ daemon, logger: createMockLogger() });
    const onChunk = vi.fn();
    const onToolCall = vi.fn();
    const onToolCallUpdate = vi.fn();
    const onUsage = vi.fn();

    const result = await bridge.handlePrompt('hello', {
      onChunk,
      onToolCall,
      onToolCallUpdate,
      onUsage
    });
    expect(result.stopReason).toBe('end_turn');
  });

  it('should cancel', () => {
    const bridge = new ACPSessionBridge({ daemon: createMockDaemon(), logger: createMockLogger() });
    expect(() => bridge.cancel()).not.toThrow();
  });

  it('should set mode and config options', () => {
    const logger = createMockLogger({ debug: vi.fn() });
    const bridge = new ACPSessionBridge({
      daemon: createMockDaemon(),
      logger
    });
    bridge.setMode('ask');
    bridge.setConfigOption('temperature', 0.7);
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  it('should close cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const bridge = new ACPSessionBridge({
      daemon: createMockDaemon(),
      logger
    });
    await bridge.close();
    expect(logger.info).toHaveBeenCalledWith('ACP session closed', expect.any(Object));
  });
});

describe('ACPNotificationAdapter', () => {
  it('should wire and unwire sessions', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    expect(() => adapter.wireAgentToSession('agent-1', 'sess-1', () => {})).not.toThrow();
    expect(() => adapter.unwireSession('sess-1')).not.toThrow();
  });

  it('should emit tool call end', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();
    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    const count = adapter.emitToolCallEnd('agent-1', 'call-1', 'output-error', 'Failed');
    expect(count).toBe(1);
    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'tool_call_update',
      toolCallId: 'call-1',
      status: 'output-error',
      output: 'Failed'
    });
  });

  it('should emit tool call end without output', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();
    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    const count = adapter.emitToolCallEnd('agent-1', 'call-1', 'completed', undefined);
    expect(count).toBe(1);
    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'tool_call_update',
      toolCallId: 'call-1',
      status: 'completed'
    });
  });

  it('should emit usage update', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();
    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    const count = adapter.emitUsage('agent-1', { inputTokens: 10, outputTokens: 20, costUsd: 0.001 });
    expect(count).toBe(1);
    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'usage_update',
      usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.001 }
    });
  });

  it('should emit error', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    const notify = vi.fn();
    adapter.wireAgentToSession('agent-1', 'sess-1', notify);
    const count = adapter.emitError('agent-1', 'Stream failed');
    expect(count).toBe(1);
    expect(notify).toHaveBeenCalledWith('session/update', {
      type: 'error',
      error: 'Stream failed'
    });
  });

  it('should return 0 for unwired agents on all emit methods', () => {
    const adapter = new ACPNotificationAdapter({ logger: createMockLogger() });
    expect(adapter.emitToolCallEnd('unknown', 'c1', 'done', undefined)).toBe(0);
    expect(adapter.emitUsage('unknown', { inputTokens: 0, outputTokens: 0, costUsd: 0 })).toBe(0);
    expect(adapter.emitError('unknown', 'err')).toBe(0);
  });
});
