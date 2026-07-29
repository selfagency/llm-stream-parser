/**
 * Hook that runs after each turn to signal whether the loop should stop
 * gracefully before proceeding to the next turn.
 */

export interface ShouldStopAfterTurnInput {
  /** Error messages collected during the turn (empty if none). */
  errors: string[];
  /** Names of the tools that were called during this turn (if any). */
  lastToolCalls: string[];
  /** Token usage accrued so far in the session. */
  tokenUsage: { input: number; output: number };
  /** Zero-based turn count of the just-completed turn. */
  turnCount: number;
}

/**
 * A hook function that is invoked after each turn.
 *
 * Return `true` to signal that the loop should stop gracefully.
 * Return `false` to continue to the next turn.
 */
export type ShouldStopAfterTurnHook = (input: ShouldStopAfterTurnInput) => Promise<boolean>;
