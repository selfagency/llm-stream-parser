/**
 * Token usage and budget tracking types.
 */

/**
 * Token usage breakdown.
 */
export interface TokenUsage {
  /** Output/completion tokens consumed. */
  completion: number;
  /** Input/prompt tokens consumed. */
  prompt: number;

  /** Total tokens used. */
  total: number;
}

/**
 * Token budget with limits and tracking.
 */
export interface TokenBudget {
  /** Maximum budget in tokens. */
  limit: number;

  /** Percentage of budget used. */
  percentUsed: number;

  /** Remaining budget. */
  remaining: number;

  /** Current usage against budget. */
  used: number;
}

/**
 * Ledger entry for token consumption.
 */
export interface TokenLedger {
  /** Current budget status. */
  budget: TokenBudget;

  /** Completion tokens consumed. */
  completionTokens: number;

  /** Ledger entries by timestamp. */
  entries: {
    timestamp: number;
    prompt: number;
    completion: number;
    context?: string;
  }[];
  /** Identifier for the tracked resource/agent. */
  id: string;

  /** Prompt tokens consumed. */
  promptTokens: number;

  /** Total tokens consumed. */
  totalTokens: number;
}
