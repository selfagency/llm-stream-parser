import type { NativeToolCallDelta } from '@agentsy/shared';

/** Context passed to a tool-call parser for each processed text chunk. */
export interface ToolCallParserContext {
  /** Whether the current stream chunk marks terminal completion. */
  done: boolean;
}

/** Result returned by a tool-call parser. */
export interface ToolCallParserResult {
  /** User-visible content after parser-specific control token stripping. */
  content: string;
  /** Optional native tool-call deltas extracted from parser-specific token formats. */
  nativeToolCallDeltas?: NativeToolCallDelta[];
}

/**
 * Pluggable parser for provider-specific inline tool-call token formats.
 *
 * Implementations receive text content before thinking/XML processing and can:
 * - strip control tokens from user-visible output
 * - emit normalized `nativeToolCallDeltas` compatible with `ToolCallAccumulator`
 */
export interface ToolCallParser {
  /**
   * Parse a single content delta.
   * Must be side-effect safe for malformed input and never throw.
   */
  parse(content: string, context: ToolCallParserContext): ToolCallParserResult;

  /** Reset parser state for a new stream/conversation. */
  reset?(): void;
}
