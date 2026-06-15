/**
 * Retry detector — detects `rapid_retry` frustration signals.
 *
 * Compares consecutive user message embeddings using cosine similarity.
 * When two consecutive messages have similarity >= 0.85 within 2 turns,
 * a `rapid_retry` event is emitted — the user is rephrasing the same
 * request because the previous attempt was unsatisfactory.
 */

import type { FrustrationEvent } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Cosine similarity threshold for considering two messages a retry.
 */
export const RETRY_SIMILARITY_THRESHOLD = 0.85;

/**
 * Maximum turn gap for two messages to be considered consecutive retries.
 */
export const RETRY_TURN_WINDOW = 2;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute cosine similarity between two vectors.
 *
 * Returns 0 if vectors have different lengths or zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

// =============================================================================
// Internal state types
// =============================================================================

interface PreviousMessage {
  embedding: number[];
  sessionId: string;
  turnIndex: number;
}

// =============================================================================
// RetryDetector
// =============================================================================

/**
 * Detects `rapid_retry` frustration signals by comparing consecutive
 * user message embeddings.
 */
export class RetryDetector {
  readonly #previousMessages = new Map<string, PreviousMessage>();
  readonly #onEvent: (event: FrustrationEvent) => void;

  /**
   * @param onEvent  Callback invoked when a frustration event is detected.
   */
  constructor(onEvent: (event: FrustrationEvent) => void) {
    this.#onEvent = onEvent;
  }

  /**
   * Process a user message. If the previous message in the same session
   * has a similar embedding within the turn window, emits a `rapid_retry`
   * event.
   *
   * @param message    The user message text.
   * @param sessionId  Session identifier.
   * @param turnIndex  Turn index within the session.
   * @param embed      Function that produces an embedding vector for the message.
   */
  async onUserMessage(
    message: string,
    sessionId: string,
    turnIndex: number,
    embed: (input: string) => Promise<number[]>
  ): Promise<void> {
    const embedding = await embed(message);
    const prev = this.#previousMessages.get(sessionId);

    if (prev !== undefined) {
      const turnGap = turnIndex - prev.turnIndex;

      if (turnGap <= RETRY_TURN_WINDOW && turnGap > 0) {
        const similarity = cosineSimilarity(embedding, prev.embedding);

        if (similarity >= RETRY_SIMILARITY_THRESHOLD) {
          this.#onEvent({
            kind: 'rapid_retry',
            sessionId,
            turnIndex,
            timestampMs: Date.now(),
            metadata: {
              similarity,
              previousTurnIndex: prev.turnIndex,
              turnGap
            }
          });
        }
      }
    }

    // Store current message as the previous for next comparison
    this.#previousMessages.set(sessionId, {
      sessionId,
      turnIndex,
      embedding
    });
  }

  /**
   * Clear stored state for a session (e.g. on session end).
   */
  clearSession(sessionId: string): void {
    this.#previousMessages.delete(sessionId);
  }
}
