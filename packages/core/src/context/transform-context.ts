/**
 * Context transformation pipeline.
 *
 * Runs first in the two-stage context preparation.  Applies memory injection,
 * compaction (overflow), and scope filtering to the message list before it
 * is converted to a provider-specific format.
 */

import type { CompletionMessage } from '@agentsy/shared';

import type { ContextEpoch, ContextEpochTracker, EpochDiagnostics, EpochStreamMetadata } from './context-epoch.js';
import { isStaleContextReference } from './context-epoch.js';

export interface TransformContextInput {
  /** Optional epoch snapshot — when provided, staleness is validated. */
  epoch?: ContextEpoch;
  /** Optional tracker — when provided, the input epoch is validated against it. */
  epochTracker?: ContextEpochTracker;
  /** Maximum token budget for the transformed context. */
  maxTokens: number;
  /** The current message list to transform. */
  messages: CompletionMessage[];
  /** Scope identifiers to filter or inject context segments for. */
  scope: string[];
}

/** Rich result that includes epoch diagnostics for observability. */
export interface TransformContextResult {
  /** Diagnostics for logging / OTel when epoch tracking is active. */
  diagnostics?: EpochDiagnostics;
  /** Epoch that was used (if any) — always the latest when tracker is present. */
  epoch?: ContextEpoch;
  /** Whether a stale context reference was detected (and rejected). */
  hadStaleReference: boolean;
  /** Transformed messages after scope filtering and compaction. */
  messages: CompletionMessage[];
  /** Stream metadata to propagate in SSE / chunk envelopes. */
  streamMetadata?: EpochStreamMetadata;
}

/**
 * Context transformation function.
 *
 * Applies zero or more of the following in order:
 * 1. **Scope filtering** — removes messages whose role or content falls
 *    outside the requested scope identifiers.
 * 2. **Memory injection** — inserts relevant context segments at
 *    appropriate positions.
 * 3. **Compaction (overflow)** — when the estimated token count exceeds
 *    `maxTokens`, older messages are compacted or dropped to fit.
 *
 * Returns the transformed message list.
 */
export type TransformContextFn = (input: TransformContextInput) => CompletionMessage[];

/**
 * Default context transformation implementation.
 *
 * - Filters messages by scope when scope includes non-empty identifiers.
 * - Applies basic compaction when the estimated token count exceeds
 *   the budget by dropping the oldest user/assistant turns.
 * - Preserves system messages during compaction.
 * - When epoch tracking is active, validates staleness and ensures no
 *   stale context references survive the epoch bump.
 */
export function transformContext(input: TransformContextInput): CompletionMessage[] {
  const { messages, scope, maxTokens, epoch, epochTracker } = input;

  // Epoch staleness guard — no stale context references after bump.
  if (epoch !== undefined && epochTracker !== undefined) {
    const current = epochTracker.getCurrent();
    if (isStaleContextReference(epoch, current)) {
      throw new Error(
        `transformContext: stale context epoch ${epoch.epoch} (rev ${epoch.revisionId}) — current is ${current.epoch} (rev ${current.revisionId}). Context must be rebuilt after epoch bump.`
      );
    }
  }

  let result = messages;

  // 1. Scope filtering — prune messages whose role does not match any
  //    active scope when scope identifiers are provided.
  const effectiveScope = epochTracker === undefined ? scope : [...epochTracker.getCurrent().scope];
  const scopeToUse = effectiveScope.length > 0 ? effectiveScope : scope;
  const hasScope = scopeToUse.length > 0;
  if (hasScope) {
    result = filterByScope(result, scopeToUse);
  }

  // 2. Memory injection — a real implementation would query a memory
  //    store and inject relevant segments.  Here we provide the hook
  //    shape; concrete injection logic is left to the consumer.
  //    (Placeholder for integration with @agentsy/memory.)

  // 3. Compaction — when the budget is exceeded, drop the oldest
  //    conversation turns (preserving system messages).
  result = compactIfOverflow(result, maxTokens);

  return result;
}

/**
 * Rich context transformation that returns epoch diagnostics and stream metadata.
 *
 * Use this variant when you need:
 * - Epoch visible in diagnostics and stream metadata
 * - Stale-reference detection without throwing
 * - Integration with ContextEpochTracker for mid-turn model-switch handling
 */
export function transformContextWithEpoch(input: TransformContextInput): TransformContextResult {
  const { epochTracker, epoch } = input;

  // Fast path — no epoch tracking
  if (epochTracker === undefined) {
    const messages = transformContext(input);
    return {
      ...(epoch === undefined ? {} : { epoch }),
      hadStaleReference: false,
      messages
    };
  }

  const current = epochTracker.getCurrent();
  let hadStaleReference = false;

  if (epoch !== undefined && isStaleContextReference(epoch, current)) {
    hadStaleReference = true;
    // We allow the transform to proceed with the fresh epoch — the caller
    // should rebuild, but we still produce output using current epoch.
  }

  // Always transform using the tracker's current epoch as the source of truth
  const messages = transformContext({
    ...input,
    scope: [...current.scope],
    epoch: current,
    epochTracker
  });

  return {
    messages,
    epoch: current,
    diagnostics: epochTracker.toDiagnostics(),
    streamMetadata: epochTracker.toStreamMetadata(),
    hadStaleReference
  };
}

/**
 * Assert that a supplied epoch is not stale relative to the tracker.
 * Throws if stale — useful as a guard before starting a turn.
 */
export function assertNotStaleEpoch(epoch: ContextEpoch, tracker: ContextEpochTracker): void {
  const current = tracker.getCurrent();
  if (isStaleContextReference(epoch, current)) {
    throw new Error(
      `Stale context epoch ${epoch.epoch} (${epoch.revisionId}) — current is ${current.epoch} (${current.revisionId}). Rebuild required.`
    );
  }
}

/**
 * Helper for mid-turn model switch: checks if abort is needed, and if so
 * performs abort-and-rebuild, returning fresh context to use for the retry.
 */
export function handleMidTurnModelSwitch(params: {
  tracker: ContextEpochTracker;
  newModel: string;
  newScope?: string[];
  messages: CompletionMessage[];
  maxTokens: number;
}): { aborted: boolean; result: TransformContextResult; previousEpoch?: ContextEpoch } {
  const { tracker, newModel, newScope, messages, maxTokens } = params;

  const decision = tracker.shouldAbortOnModelChange(newModel);
  if (!decision.shouldAbort) {
    // No mid-turn, or same model — normal transform with current epoch
    const result = transformContextWithEpoch({
      messages,
      scope: tracker.getCurrent().scope as string[],
      maxTokens,
      epoch: tracker.getCurrent(),
      epochTracker: tracker
    });
    return { aborted: false, result };
  }

  // Mid-turn switch detected — abort and rebuild
  const { aborted, rebuilt } = tracker.abortAndRebuild(newModel, {
    ...(newScope === undefined ? {} : { scope: newScope }),
    reason: `mid-turn-model-switch:${decision.previousEpoch.model}->${newModel}`
  });

  const result = transformContextWithEpoch({
    messages,
    scope: [...rebuilt.scope],
    maxTokens,
    epoch: rebuilt,
    epochTracker: tracker
  });

  return {
    aborted: true,
    result,
    previousEpoch: aborted
  };
}

/**
 * Rough token estimation: 1 token ≈ 4 characters for English text.
 */
function estimateTokens(messages: CompletionMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

/** Estimate token count for a single message. */
function estimateMessageTokens(msg: CompletionMessage): number {
  const content = msg.content;
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4) + 4;
  }
  if (Array.isArray(content)) {
    let total = 4; // overhead
    for (const part of content) {
      total += estimatePartTokens(part);
    }
    return total;
  }
  return 4; // null content still has overhead
}

/** Estimate token count for a single content part. */
function estimatePartTokens(part: import('@agentsy/shared').ContentPart): number {
  switch (part.type) {
    case 'text': {
      return Math.ceil(part.text.length / 4);
    }
    case 'image': {
      return 100;
    }
    case 'tool_call': {
      return 20;
    }
    case 'tool_result': {
      return Math.ceil(part.content.length / 4);
    }
    default: {
      return 10;
    }
  }
}

/**
 * Remove messages whose role is not in the allowed scope set.
 */
function filterByScope(messages: CompletionMessage[], scope: string[]): CompletionMessage[] {
  const scopeSet = new Set(scope.map(s => s.toLowerCase()));
  // Always allow system messages.
  return messages.filter(msg => msg.role === 'system' || scopeSet.has(msg.role));
}

/**
 * When the estimated token count exceeds the budget, drop the oldest
 * user/assistant messages (preserving system messages).
 */
function compactIfOverflow(messages: CompletionMessage[], maxTokens: number): CompletionMessage[] {
  if (estimateTokens(messages) <= maxTokens) {
    return messages;
  }

  // Collect indices of droppable messages (non-system).
  const droppableIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role !== 'system') {
      droppableIndices.push(i);
    }
  }

  // Drop oldest droppable messages until under budget.
  const kept = [...messages];
  for (const index of droppableIndices) {
    if (estimateTokens(kept) <= maxTokens) {
      break;
    }
    // Replace droppable messages with a concise summary marker.
    kept[index] = {
      role: 'system',
      content: '[Earlier context compacted]'
    };
  }

  return kept;
}
