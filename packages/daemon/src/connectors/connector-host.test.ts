import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { ConnectorHost } from './connector-host.js';

describe('ConnectorHost', () => {
  it('should register and list connectors', () => {
    const host = new ConnectorHost({ logger: createMockLogger(), config: { enabled: true } });
    host.register('discord', 'chat');
    host.register('slack', 'chat');
    expect(host.list()).toHaveLength(2);
    expect(host.list()[0]?.name).toBe('discord');
  });

  it('should unregister connectors', () => {
    const host = new ConnectorHost({ logger: createMockLogger(), config: { enabled: true } });
    host.register('discord', 'chat');
    expect(host.unregister('discord')).toBe(true);
    expect(host.list()).toHaveLength(0);
    expect(host.unregister('nonexistent')).toBe(false);
  });

  it('should log disabled state on init', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const host = new ConnectorHost({ logger, config: { enabled: false } });
    await host.initialize();
    expect(logger.info).toHaveBeenCalledWith('ConnectorHost disabled');
  });

  it('should clear connectors on shutdown', async () => {
    const host = new ConnectorHost({ logger: createMockLogger(), config: { enabled: true } });
    host.register('discord', 'chat');
    await host.shutdown();
    expect(host.list()).toHaveLength(0);
  });
});
