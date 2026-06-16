import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { TUIBridge } from './tui-bridge.js';

describe('TUIBridge', () => {
  it('should render empty string by default', () => {
    const bridge = new TUIBridge({ logger: createMockLogger() });
    expect(bridge.render({})).toBe('');
  });

  it('should log on start', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const bridge = new TUIBridge({ logger });
    await bridge.start();
    expect(logger.info).toHaveBeenCalledWith('TUIBridge started');
  });

  it('should log on stop', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const bridge = new TUIBridge({ logger });
    await bridge.stop();
    expect(logger.info).toHaveBeenCalledWith('TUIBridge stopped');
  });
});
