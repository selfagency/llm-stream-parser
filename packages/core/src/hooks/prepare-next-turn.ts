/**
 * Hook that runs before each turn to optionally swap the model, thinking
 * configuration, or context for the upcoming turn.
 */

export interface PrepareNextTurnInput {
  /** Current context scope identifiers (e.g. memory injection tags). */
  currentContext: string[];
  /** The model that would be used for this turn by default. */
  currentModel: string;
  /** Token usage accrued so far in the session. */
  tokenUsage: { input: number; output: number };
  /** Zero-based turn count (0 = first turn). */
  turnCount: number;
}

export interface PrepareNextTurnOutput {
  /** Override the context scope for this turn. */
  context?: string[];
  /** Override the default model for this turn. */
  model?: string;
  /** Override thinking budget for this turn. */
  thinkingConfig?: { budget: number };
}

/**
 * A hook function that is invoked before each turn.
 *
 * Return `null` to make no changes. Return a partial `PrepareNextTurnOutput`
 * to override specific aspects of the upcoming turn.
 */
export type PrepareNextTurnHook = (input: PrepareNextTurnInput) => Promise<PrepareNextTurnOutput | null>;
