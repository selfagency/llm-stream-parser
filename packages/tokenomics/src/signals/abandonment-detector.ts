/**
 * Abandonment detector — detects `session_abandonment` frustration signals.
 *
 * Fires at post-session analysis when a session produced no commits
 * and no files written, indicating the user abandoned the session
 * without accepting any output.
 */

import type { FrustrationEvent } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum session duration (ms) for abandonment detection.
 * Sessions shorter than this are ignored (e.g. accidental opens).
 */
export const MIN_SESSION_MS = 30_000;

// =============================================================================
// Detection
// =============================================================================

/**
 * Detect session abandonment.
 *
 * A session is considered abandoned when:
 * - Duration is at least `MIN_SESSION_MS`
 * - No commits were made
 * - No files were written
 *
 * @returns A `FrustrationEvent` if abandonment is detected, or `undefined`.
 */
export function detectAbandonment(
  sessionId: string,
  durationMs: number,
  commits: unknown[],
  filesWritten: unknown[]
): FrustrationEvent | undefined {
  if (durationMs < MIN_SESSION_MS) {
    return;
  }

  if (commits.length === 0 && filesWritten.length === 0) {
    return {
      kind: 'session_abandonment',
      sessionId,
      turnIndex: 0,
      timestampMs: Date.now(),
      metadata: {
        durationMs,
        commitsCount: 0,
        filesWrittenCount: 0
      }
    };
  }

  return;
}
