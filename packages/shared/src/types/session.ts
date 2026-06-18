/**
 * Session state management types.
 */

import type { SessionId } from './brands.js';

export type { SessionId };

export interface SessionState {
  /** Session identifier. */
  id: SessionId;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;

  /** Key-value state store. */
  values: Record<string, unknown>;
}

/**
 * Session store interface for persistence.
 */
export interface SessionStore {
  /** Clear entire session. */
  clear(): void;
  /** Get full session state. */
  getState(): SessionState;

  /** Get a specific value. */
  getValue<T>(key: string): T | undefined;

  /** Remove a value. */
  removeValue(key: string): void;

  /** Set a value. */
  setValue(key: string, value: unknown): void;
}
