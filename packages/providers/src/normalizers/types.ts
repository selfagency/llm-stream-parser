import type { StreamChunk } from '@agentsy/shared';

export type { NativeToolCallDelta, UsageInfo } from '@agentsy/shared';

/** The result of normalizing a provider-specific streaming chunk into a canonical StreamChunk. */
export interface NormalizerResult {
  chunk: StreamChunk;
  rawEvent?: unknown;
}
