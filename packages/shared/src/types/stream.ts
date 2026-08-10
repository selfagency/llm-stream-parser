import type { FinishReason } from './tool-calls.js';
import type { NativeToolCallDelta, UsageInfo } from './usage.js';

/** A single chunk of output from a normalised LLM stream. */
export interface StreamChunk {
  content?: string | undefined;
  done?: boolean | undefined;
  /** Why the stream ended, populated on the final chunk. */
  finishReason?: FinishReason | undefined;
  /** Streaming deltas for native (non-XML) tool calls from providers that use JSON-format tool calls. */
  nativeToolCallDeltas?: NativeToolCallDelta[] | undefined;
  /** Optional step index supplied by higher-level agent loops or callers. */
  stepIndex?: number | undefined;
  /** Step-local usage information when the caller distinguishes per-step and total usage. */
  stepUsage?: UsageInfo | undefined;
  thinking?: string | undefined;
  tool_calls?: { function?: { name?: string | undefined; arguments?: unknown } }[] | undefined;
  /** Token usage information, populated on the final chunk from the normalizer layer. */
  usage?: UsageInfo | undefined;
}
