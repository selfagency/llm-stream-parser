/**
 * Rewrite detector — detects `immediate_rewrite` frustration signals.
 *
 * Opens a time window when a write tool call is observed. If the
 * file is subsequently changed within that window with more than
 * `MIN_REWRITE_LINES` delta lines, an `immediate_rewrite` event is
 * emitted. This pattern indicates the agent's first attempt was
 * rejected or unsatisfactory.
 */

import type { FrustrationEvent } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Time window (ms) after a write tool call during which a file change
 * is considered an "immediate rewrite".
 */
export const REWRITE_WINDOW_MS = 90_000;

/**
 * Minimum delta lines for a file change to count as a rewrite
 * (not a minor correction).
 */
export const MIN_REWRITE_LINES = 5;

// =============================================================================
// Internal state types
// =============================================================================

interface PendingWrite {
  filePath: string;
  sessionId: string;
  timestampMs: number;
  turnIndex: number;
}

// =============================================================================
// RewriteDetector
// =============================================================================

/**
 * Detects `immediate_rewrite` frustration signals by tracking
 * write-tool calls and subsequent file changes within a time window.
 */
export class RewriteDetector {
  readonly #pendingWrites: PendingWrite[] = [];
  readonly #onEvent: (event: FrustrationEvent) => void;

  /**
   * @param onEvent  Callback invoked when a frustration event is detected.
   */
  constructor(onEvent: (event: FrustrationEvent) => void) {
    this.#onEvent = onEvent;
  }

  /**
   * Record a write-tool call. Opens a rewrite-detection window for
   * the given file path.
   */
  onWriteToolCall(filePath: string, sessionId: string, turnIndex: number, timestampMs: number): void {
    this.#gc(timestampMs);

    this.#pendingWrites.push({
      filePath,
      sessionId,
      turnIndex,
      timestampMs
    });
  }

  /**
   * Record a file change. If a pending write for the same file exists
   * within the rewrite window and the delta exceeds the minimum threshold,
   * emits an `immediate_rewrite` event.
   *
   * @param filePath   Path of the changed file.
   * @param deltaLines Absolute number of lines changed (added + removed).
   */
  onFileChanged(filePath: string, deltaLines: number): void {
    const now = Date.now();
    this.#gc(now);

    const pending = this.#pendingWrites.find(p => p.filePath === filePath && now - p.timestampMs <= REWRITE_WINDOW_MS);

    if (pending !== undefined && deltaLines > MIN_REWRITE_LINES) {
      this.#onEvent({
        kind: 'immediate_rewrite',
        sessionId: pending.sessionId,
        turnIndex: pending.turnIndex,
        timestampMs: now,
        metadata: {
          filePath,
          deltaLines,
          originalWriteTimestampMs: pending.timestampMs
        }
      });
    }
  }

  /**
   * Garbage-collect expired pending writes.
   */
  #gc(now: number): void {
    let i = 0;
    while (i < this.#pendingWrites.length) {
      if (now - this.#pendingWrites[i]!.timestampMs > REWRITE_WINDOW_MS) {
        this.#pendingWrites.splice(i, 1);
      } else {
        i++;
      }
    }
  }
}
