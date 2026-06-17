/**
 * Hook event types for the runtime lifecycle.
 *
 * These discriminated-union events are fired by the `HookRegistry` at
 * specific points in the task execution lifecycle. Each handler receives
 * the full event context and can return a `HookResult` to influence
 * whether execution continues, blocks, or transforms the payload.
 */

/** Result returned by a single hook handler. */
export type HookResult = { continue: true } | { continue: false; reason: string } | { transform: unknown };

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
