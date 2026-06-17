/**
 * Hook configuration types for the runtime lifecycle.
 *
 * These configuration types enable Claude-Code style hooks with
 * command, prompt, http, and agent capabilities, plus an optional
 * filter to control execution.
 */

import type { HookResult } from './types.js';

/** Context available to filter functions.
 *
 * This context is passed to the `if` filter of a hook configuration.
 * It provides access to the current session state and payload.
 */
export interface HookContext {
  /** Unique session identifier */
  sessionId: string;
  /** Current execution payload */
  payload: unknown;
  /** Additional context fields as needed */
  [key: string]: unknown;
}

/**
 * Configuration for a runtime hook.
 *
 * This configuration enables Claude-Code style hooks with
 * command, prompt, http, and agent capabilities, plus
 * an optional filter to control execution.
 */
export interface HookConfig {
  /** Discriminated type for the hook */
  type: 'command' | 'prompt' | 'http' | 'agent';
  /** Execute a command */
  command?: string;
  /** Use a prompt */
  prompt?: string;
  /** HTTP request configuration */
  http?: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  /** Agent configuration */
  agent?: {
    name: string;
    /** Additional agent-specific fields */
    [key: string]: unknown;
  };
  /** Filter function to optionally block execution */
  if?: (ctx: HookContext) => boolean;
}
