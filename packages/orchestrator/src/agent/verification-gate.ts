/**
 * Verification gate — "double check your work before stopping" primitive.
 *
 * Inspired by Claude Code Tip 26 ("double check everything, make a table of
 * what you verified"). Runs before any StopCondition triggers. If it returns
 * passed: false, the loop continues with feedback injected.
 *
 * This is a SOFT gate with max retries: a failed verification feeds feedback
 * back into the loop and allows it to continue, up to maxRetries. After
 * maxRetries, the gate passes (with a warning) to avoid infinite loops.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface VerificationResult {
  /** If failed, what to do next (fed back into the loop) */
  feedback?: string;
  passed: boolean;
  /** Table of claims and their verification status (for audit log) */
  verificationTable?: Array<{ claim: string; verified: boolean; evidence: string }>;
}

export interface VerificationGateConfig {
  /** Max verification retries before soft-passing (default 2) */
  maxRetries?: number;
  /** The verification function to run */
  verify: (state: unknown) => Promise<VerificationResult>;
}

// ── Gate ─────────────────────────────────────────────────────────────────

export class VerificationGate {
  readonly #config: VerificationGateConfig;
  #retryCount = 0;
  #lastResult: VerificationResult | null = null;

  constructor(config: VerificationGateConfig) {
    this.#config = {
      maxRetries: 2,
      ...config
    };
  }

  /**
   * Run verification against the current loop state.
   *
   * Returns:
   * - `{ allowStop: true }` if verification passed OR max retries exhausted
   * - `{ allowStop: false, feedback }` if verification failed and retries remain
   */
  async verify(state: unknown): Promise<{ allowStop: boolean; feedback?: string; result: VerificationResult }> {
    const result = await this.#config.verify(state);
    this.#lastResult = result;

    if (result.passed) {
      this.#retryCount = 0;
      return { allowStop: true, result };
    }

    // Failed — check if we have retries left
    const maxRetries = this.#config.maxRetries ?? 2;
    if (this.#retryCount < maxRetries) {
      this.#retryCount++;
      return {
        allowStop: false,
        feedback:
          result.feedback ?? `Verification failed (attempt ${this.#retryCount}/${maxRetries}). Please review and fix.`,
        result
      };
    }

    // Max retries exhausted — soft-pass with warning
    return {
      allowStop: true,
      feedback: `Verification failed after ${this.#retryCount} retries. Proceeding with caution.`,
      result
    };
  }

  /** Get the last verification result (for audit logging). */
  get lastResult(): VerificationResult | null {
    return this.#lastResult;
  }

  /** Current retry count. */
  get retryCount(): number {
    return this.#retryCount;
  }

  /** Reset the gate (for new agent or fresh task). */
  reset(): void {
    this.#retryCount = 0;
    this.#lastResult = null;
  }
}
