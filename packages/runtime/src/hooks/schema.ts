/**
 * Hook configuration types for the runtime lifecycle.
 *
 * These configuration types enable Claude-Code style hooks with
 * command, prompt, http, and agent capabilities, plus an optional
 * filter to control execution.
 */

/** Context available to filter functions.
 *
 * This context is passed to the `if` filter of a hook configuration.
 * It provides access to the current session state and payload.
 */
export interface HookContext {
  /** Current execution payload */
  payload: unknown;
  /** Unique session identifier */
  sessionId: string;
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
  /** Agent configuration */
  agent?: {
    name: string;
    /** Additional agent-specific fields */
    [key: string]: unknown;
  };
  /** Execute a command */
  command?: string;
  /** HTTP request configuration */
  http?: {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  /** Filter function to optionally block execution */
  if?: (ctx: HookContext) => boolean;
  /** Use a prompt */
  prompt?: string;
  /** Discriminated type for the hook */
  type: 'command' | 'prompt' | 'http' | 'agent';
}
