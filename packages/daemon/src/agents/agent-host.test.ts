import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { AgentHost } from './agent-host.js';

describe('AgentHost', () => {
  it('should spawn and list agents', async () => {
    const host = new AgentHost({
      memory: {} as never,
      scopeManager: {} as never,
      logger: createMockLogger()
    });
    await host.initialize();

    await host.spawn({ id: 'agent-1', name: 'coder', role: 'developer' });
    await host.spawn({ id: 'agent-2', name: 'researcher', role: 'analyst' });

    const list = host.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('coder');
    expect(host.count()).toBe(2);
  });

  it('should kill an agent', async () => {
    const host = new AgentHost({
      memory: {} as never,
      scopeManager: {} as never,
      logger: createMockLogger()
    });
    await host.initialize();
    await host.spawn({ id: 'agent-1' });
    expect(host.kill('agent-1')).toBe(true);
    expect(host.count()).toBe(0);
    expect(host.kill('nonexistent')).toBe(false);
  });

  it('should send a message', async () => {
    const host = new AgentHost({
      memory: {} as never,
      scopeManager: {} as never,
      logger: createMockLogger()
    });
    const result = await host.send('agent-1', 'hello');
    expect(result).toEqual({ sent: true });
  });

  it('should start and cancel streams', async () => {
    const host = new AgentHost({
      memory: {} as never,
      scopeManager: {} as never,
      logger: createMockLogger()
    });
    const result = await host.startStream({});
    expect(result).toHaveProperty('streamId');
    expect(host.cancelStream('stream-1')).toBe(true);
  });

  it('should shutdown cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const host = new AgentHost({
      memory: {} as never,
      scopeManager: {} as never,
      logger
    });
    await host.initialize();
    await host.spawn({ id: 'agent-1' });
    await host.shutdown();
    expect(host.count()).toBe(0);
    expect(logger.info).toHaveBeenCalledWith('AgentHost shut down');
  });
});
