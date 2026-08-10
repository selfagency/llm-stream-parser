/**
 * LLM response types.
 */

import type { StreamChunk } from './stream.js';
import type { FinishReason } from './tool-calls.js';
import type { NativeToolCallDelta, UsageInfo } from './usage.js';

/**
 * Standardized non-streaming result from any LLM.
 * Re-exports: FinishReason from tool-calls.ts, UsageInfo from usage.ts, StreamChunk from stream.ts
 */
export interface CompletionResponse {
  /** Generated content. */
  content: string;

  /** Finish reason for generation stopping. */
  finishReason?: FinishReason;

  /** ID of the completion (for provider tracking). */
  id?: string;

  /** Model configuration used for the request. */
  model?: string;

  /** Rejected flag for safety filtering. */
  rejected?: boolean;

  /** Filter reason for rejected completions. */
  rejectReason?: string;

  /** Tool calls made during generation (for function calling). */
  toolCalls?: NativeToolCallDelta[];

  /** Token usage information. */
  usage?: UsageInfo;
}

/**
 * Standardized streaming chunk from any LLM.
 * Built on top of StreamChunk but simplifies the interface to the essential fields.
 */
export type NormalizedChunk = Omit<StreamChunk, 'finishReason'> & {
  /** Finish reason for generation stopping, populated on the final chunk. */
  finishReason?: FinishReason;
};
