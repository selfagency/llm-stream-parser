import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { ACPNotificationAdapter } from './acp-notification-adapter.js';
import { ACPServer } from './acp-server.js';
import { ACPSessionBridge } from './acp-session-bridge.js';

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
    const bridge = new ACPSessionBridge({ daemon: {} as never, logger: createMockLogger() });
    expect(bridge.sessionId).toBeTruthy();
    expect(bridge.agentId).toBe(bridge.sessionId);
    expect(bridge.cwd).toBeTruthy();
    expect(bridge.additionalDirectories).toEqual([]);
  });

  it('should accept custom ids and cwd', () => {
    const bridge = new ACPSessionBridge({
      daemon: {} as never,
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

  it('should handle prompt', async () => {
    const bridge = new ACPSessionBridge({ daemon: {} as never, logger: createMockLogger() });
    const result = await bridge.handlePrompt('hello', {
      onChunk: vi.fn(),
      onToolCall: vi.fn(),
      onToolCallUpdate: vi.fn(),
      onUsage: vi.fn()
    });
    expect(result.stopReason).toBe('end_turn');
  });

  it('should cancel', () => {
    const bridge = new ACPSessionBridge({ daemon: {} as never, logger: createMockLogger() });
    expect(() => bridge.cancel()).not.toThrow();
  });

  it('should set mode and config options', () => {
    const logger = createMockLogger({ debug: vi.fn() });
    const bridge = new ACPSessionBridge({
      daemon: {} as never,
      logger
    });
    bridge.setMode('ask');
    bridge.setConfigOption('temperature', 0.7);
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  it('should close cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const bridge = new ACPSessionBridge({
      daemon: {} as never,
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
});
