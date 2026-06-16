/**
 * Why a stream ended. Normalised across providers:
 *
 * - `'stop'`           — model reached a natural stopping point (end_turn, stop, STOP)
 * - `'length'`         — output was truncated by the context/token limit
 * - `'tool-calls'`     — model requested one or more tool calls
 * - `'content-filter'` — output blocked by content moderation (SAFETY, RECITATION)
 * - `'other'`          — provider-specific reason with no canonical mapping
 * - `'error'`          — stream ended due to an error
 */
export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'other' | 'error';

/**
 * Lifecycle state of a single tool call as it passes through the streaming
 * pipeline. Transitions in order:
 *
 * `awaiting-input` → `input-streaming` → `input-complete`
 *                                      → `output-available` (once result is set)
 *                                      → `output-error`     (if result failed)
 */
export type ToolCallState =
  | 'awaiting-input'
  | 'input-streaming'
  | 'input-complete'
  | 'output-available'
  | 'output-error';
