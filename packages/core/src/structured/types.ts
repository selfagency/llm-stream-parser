/**
 * Streaming type utilities for typed partial JSON.
 * Inspired by gjp-4-gpt's symbolic completion markers and jsonchunk's DeepPartial pattern.
 */
import type { PartialDeep } from '@agentsy/shared';

/**
 * Symbolic marker for streaming completion status.
 * When present and true, indicates streaming has stopped and partial data is complete.
 * This is more type-safe than a boolean flag.
 */
export const ItemDoneStreaming = Symbol.for('ItemDoneStreaming');

/**
 * Recursive partial type that represents any value as deeply partial.
 * Objects become { key?: DeepPartial<value> }, arrays become DeepPartial<T>[],
 * and primitives remain unchanged.
 */
export type DeepPartial<T> = T extends object ? PartialDeep<T, { recurseIntoArrays: true }> : T;

/**
 * Streaming partial type combining DeepPartial with symbolic completion marker.
 * Allows discriminated union pattern: if [ItemDoneStreaming] is true, the partial is final.
 */
export type StreamingPartial<T> = DeepPartial<T> & {
  [ItemDoneStreaming]?: boolean;
};

/**
 * Check if a streaming partial is complete (done streaming).
 */
export function isStreamingDone<T>(partial: StreamingPartial<T>): boolean {
  // safe: Symbol key cannot be injected
  return Object.hasOwn(partial, ItemDoneStreaming) && !!partial[ItemDoneStreaming];
}

/**
 * Mark a streaming partial as complete.
 */
export function markStreamingDone<T>(partial: StreamingPartial<T>): StreamingPartial<T> {
  return {
    ...partial,
    [ItemDoneStreaming]: true
  };
}
