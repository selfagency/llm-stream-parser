import { vi } from 'vitest';
import type { Logger } from './types.js';

/**
 * Create a mock Logger for testing.
 * Provides all Logger interface methods as vi.fn() mocks.
 * `child` returns itself by default for chaining.
 */
export function createMockLogger(overrides?: Partial<Logger>): Logger {
  const mock: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis() as unknown as (name: string) => Logger,
    ...overrides
  };
  return mock;
}
