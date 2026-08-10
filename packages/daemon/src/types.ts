/**
 * Shared types for @agentsy/daemon.
 */

export interface Logger {
  child: (name: string) => Logger;
  debug: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
}

/**
 * Recursive partial type for deeply partial config objects.
 * Correctly handles arrays (which extend object in TS).
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;

/**
 * Lifecycle contract for daemon-hosted services.
 * Shared by all services registered with {@link ServiceHost}.
 */
export interface Service {
  readonly name: string;
  sleep(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  wakeup(): Promise<void>;
}
