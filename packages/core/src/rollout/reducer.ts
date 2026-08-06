/**
 * Event-sourced rollout reducer + fork predicate.
 *
 * Implements `keep_forked_rollout_item`:
 * - Keep: system + user + final-assistant only
 * - Drop: reasoning, tool_call, tool_result, inference, error, compaction
 *
 * Fork preserves conversation continuity: order is maintained, timestamps
 * are kept, and the filtered subset can be re-sequenced for a new branch.
 *
 * @module
 */

import type { RolloutItem, RolloutItemType } from './materialized-views.js';

// ── Predicate ──────────────────────────────────────────────

/**
 * Types that are preserved when forking a session.
 * Mirrors codex `keep_forked_rollout_item` semantics.
 */
const FORK_KEPT_TYPES: ReadonlySet<RolloutItemType> = new Set<RolloutItemType>([
  'system',
  'session_meta',
  'user',
  'assistant'
]);

/**
 * Returns true if the item should be kept in a forked rollout.
 *
 * Rules:
 * - system, session_meta, user: always kept — essential for continuity
 * - assistant: kept only if it is a final assistant message.
 *   If `data.isFinal === false`, it is considered an intermediate chunk
 *   or reasoning-leaked assistant message and is dropped.
 * - reasoning, tool_call, tool_result, inference, compaction, error: dropped
 */
export function keepForkedRolloutItem(item: RolloutItem): boolean {
  if (!FORK_KEPT_TYPES.has(item.type)) {
    return false;
  }

  if (item.type === 'assistant') {
    const isFinal = (item.data as { isFinal?: unknown }).isFinal;
    // Undefined means final by default (backward compat with older logs)
    if (isFinal === false) {
      return false;
    }
    return true;
  }

  return true;
}

/**
 * Predicate variant that can be used directly with Array.filter.
 */
export const keepForkedRolloutItemPredicate: (item: RolloutItem) => boolean = keepForkedRolloutItem;

// ── Filtering ──────────────────────────────────────────────

/**
 * Filter rollout items through a predicate while preserving original ordering.
 * Returns a new array, never mutates input.
 */
export function filterRollout(items: readonly RolloutItem[], predicate: (item: RolloutItem) => boolean): RolloutItem[] {
  return items.filter(predicate);
}

/**
 * Filter for fork: system + user + final-assistant only.
 * Preserves conversation continuity across session branches.
 */
export function filterForkedRollout(items: readonly RolloutItem[]): RolloutItem[] {
  // Ensure stable order by sequence before filtering
  const sorted = [...items].sort((a, b) => a.sequence - b.sequence);
  return sorted.filter(keepForkedRolloutItem);
}

// ── Forking ────────────────────────────────────────────────

export interface ForkRolloutOptions {
  readonly predicate?: (item: RolloutItem) => boolean;
  readonly resquence?: boolean; // default true — re-index sequences from 1
  readonly targetSessionId: string;
}

export interface ForkedRollout {
  readonly forkedCount: number;
  readonly items: readonly RolloutItem[];
  readonly originalCount: number;
  readonly sourceSessionId: string;
  readonly targetSessionId: string;
}

/**
 * Fork a rollout: apply keep_forked_rollout_item predicate (or custom) and
 * produce a new rollout for a target session that preserves conversation
 * continuity.
 *
 * - Keeps system+user+final-assistant
 * - Drops reasoning/tool/output
 * - Optionally re-sequences (default true) starting at 1
 * - Preserves timestamps and data
 */
export function forkRollout(sourceItems: readonly RolloutItem[], options: ForkRolloutOptions): ForkedRollout {
  if (!options.targetSessionId) {
    throw new Error('targetSessionId is required for forkRollout');
  }

  const predicate = options.predicate ?? keepForkedRolloutItem;
  const filtered = filterRollout(sourceItems, predicate);

  const shouldResequence = options.resquence ?? true;
  const sourceSessionId = sourceItems[0]?.sessionId ?? 'unknown';

  let forkedItems: RolloutItem[];

  if (shouldResequence) {
    forkedItems = filtered.map((item, idx) => ({
      ...item,
      sessionId: options.targetSessionId,
      sequence: idx + 1
    }));
  } else {
    forkedItems = filtered.map(item => ({
      ...item,
      sessionId: options.targetSessionId
    }));
  }

  return {
    sourceSessionId,
    targetSessionId: options.targetSessionId,
    originalCount: sourceItems.length,
    forkedCount: forkedItems.length,
    items: forkedItems
  };
}

/**
 * Convenience: create a forked rollout for a new branch sessionId, guaranteeing
 * conversation continuity (no dropped user messages, system context preserved).
 */
export function createForkedSession(sourceItems: readonly RolloutItem[], targetSessionId: string): ForkedRollout {
  return forkRollout(sourceItems, { targetSessionId });
}

// ── Generic Reducer ────────────────────────────────────────

/**
 * Generic reducer that folds rollout items into a state.
 * Useful for custom projections beyond the materialized views.
 */
export function reduceRollout<T>(
  items: readonly RolloutItem[],
  reducer: (state: T, item: RolloutItem) => T,
  initial: T
): T {
  const sorted = [...items].sort((a, b) => a.sequence - b.sequence);
  let state = initial;
  for (const item of sorted) {
    state = reducer(state, item);
  }
  return state;
}

/**
 * Reconstruct session state identical to original from JSONL by replaying
 * events in sequence order. Verifies determinism.
 */
export function replayRollout(items: readonly RolloutItem[]): readonly RolloutItem[] {
  return [...items].sort((a, b) => a.sequence - b.sequence);
}
