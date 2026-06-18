/** Token usage information from an LLM provider response. */
export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** A streaming delta for a native (JSON-format) tool call from a provider. */
export interface NativeToolCallDelta {
  argumentsDelta?: string;
  id?: string;
  index: number;
  name?: string;
}
