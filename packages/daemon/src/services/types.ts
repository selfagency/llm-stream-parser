/**
 * Shared types for daemon services.
 */

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export function createNoopLogger(): Logger {
  return {
    debug() {
      // noop
    },
    error() {
      // noop
    },
    info() {
      // noop
    },
    warn() {
      // noop
    }
  };
}
