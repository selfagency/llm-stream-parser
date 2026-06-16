import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { Sleeper } from './sleeper.js';

describe('Sleeper', () => {
  it('should watch services when enabled', () => {
    const logger = createMockLogger({ info: vi.fn() });
    const slp = new Sleeper({
      policy: { enabled: true, idleTimeoutMs: 300_000, pollIntervalMs: 10_000 },
      logger
    });
    slp.watch({} as never);
    expect(logger.info).toHaveBeenCalledWith('Sleeper watching services');
  });

  it('should log disabled state', () => {
    const logger = createMockLogger({ info: vi.fn() });
    const slp = new Sleeper({
      policy: { enabled: false, idleTimeoutMs: 300_000, pollIntervalMs: 10_000 },
      logger
    });
    slp.watch({} as never);
    expect(logger.info).toHaveBeenCalledWith('Sleeper disabled');
  });

  it('should stop cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const slp = new Sleeper({
      policy: { enabled: true, idleTimeoutMs: 300_000, pollIntervalMs: 10_000 },
      logger
    });
    await slp.stop();
    expect(logger.info).toHaveBeenCalledWith('Sleeper stopped');
  });
});
