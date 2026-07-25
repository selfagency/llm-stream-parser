/**
 * Context transformation pipeline.
 *
 * Runs first in the two-stage context preparation.  Applies memory injection,
 * compaction (overflow), and scope filtering to the message list before it
 * is converted to a provider-specific format.
 */

import type { CompletionMessage } from '@agentsy/shared';

export interface TransformContextInput {
  /** Maximum token budget for the transformed context. */
  maxTokens: number;
  /** The current message list to transform. */
  messages: CompletionMessage[];
  /** Scope identifiers to filter or inject context segments for. */
  scope: string[];
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
 */
export function transformContext(input: TransformContextInput): CompletionMessage[] {
  const { messages, scope, maxTokens } = input;
  let result = messages;

  // 1. Scope filtering — prune messages whose role does not match any
  //    active scope when scope identifiers are provided.
  if (scope.length > 0) {
    result = filterByScope(result, scope);
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
