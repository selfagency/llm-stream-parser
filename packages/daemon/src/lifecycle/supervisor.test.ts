import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { Supervisor } from './supervisor.js';

describe('Supervisor', () => {
  it('should watch daemon when enabled', () => {
    const logger = createMockLogger({ info: vi.fn() });
    const sup = new Supervisor({
      policy: {
        restartPolicy: 'always',
        maxRestarts: 5,
        restartWindowMs: 60_000,
        backoffBaseMs: 1000,
        backoffMaxMs: 30_000,
        backoffJitter: true
      },
      logger
    });
    const mockDaemon = { onStateChange: vi.fn() };
    sup.watch(mockDaemon as never);
    expect(logger.info).toHaveBeenCalledWith('Supervisor watching daemon');
  });

  it('should log disabled state', () => {
    const logger = createMockLogger({ info: vi.fn() });
    const sup = new Supervisor({
      policy: {
        restartPolicy: 'never',
        maxRestarts: 5,
        restartWindowMs: 60_000,
        backoffBaseMs: 1000,
        backoffMaxMs: 30_000,
        backoffJitter: true
      },
      logger
    });
    sup.watch({} as never);
    expect(logger.info).toHaveBeenCalledWith('Supervisor disabled');
  });

  it('should stop cleanly', async () => {
    const logger = createMockLogger({ info: vi.fn() });
    const sup = new Supervisor({
      policy: {
        restartPolicy: 'always',
        maxRestarts: 5,
        restartWindowMs: 60_000,
        backoffBaseMs: 1000,
        backoffMaxMs: 30_000,
        backoffJitter: true
      },
      logger
    });
    await sup.stop();
    expect(logger.info).toHaveBeenCalledWith('Supervisor stopped');
  });
});
