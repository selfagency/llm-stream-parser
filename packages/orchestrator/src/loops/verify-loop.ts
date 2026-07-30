/**
 * Verify loop — write → run → check → fix → repeat primitive.
 *
 * Inspired by Claude Code Tip 9 ("complete the write-test cycle for autonomous
 * tasks") and Tip 34 (TDD). Gives agents a bounded loop that runs a task,
 * verifies the result, and if verification fails, feeds the error back and
 * retries up to maxIterations.
 *
 * This is the primitive for autonomous git bisect, test runs, build checks,
 * and any "run until it passes" workflow.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface VerifyLoopConfig {
  /** Function to extract error from failed output */
  extractError: (output: string) => string | null;
  /** Function to check if output indicates success */
  isSuccess: (output: string) => boolean;
  /** Max fix iterations (default 3) */
  maxIterations: number;
  /** Command to run the verification */
  verifyCommand: string;
}

export interface VerifyLoopResult {
  /** Output from the final verification run */
  finalOutput: string;
  /** All iteration outputs for audit */
  history: VerifyIteration[];
  iterations: number;
  /** Error from the last failed iteration (null if passed on first try) */
  lastError: string | null;
  passed: boolean;
}

export interface VerifyIteration {
  error: string | null;
  iteration: number;
  output: string;
  passed: boolean;
}

// ── Loop ─────────────────────────────────────────────────────────────────

/**
 * Run a verify loop: execute task, run verification, check, retry if failed.
 *
 * The `task` function receives the error from the previous iteration (null
 * on first run) so it can attempt a fix. The loop terminates when:
 * - `isSuccess` returns true (passed)
 * - `maxIterations` is reached (failed)
 * - `task` throws (failed with exception)
 *
 * @param task - Function that does the work. Receives previous error or null.
 * @param runCommand - Function that runs a shell command and returns stdout.
 * @param config - Verification configuration.
 */
export async function runVerifyLoop(
  task: (previousError: string | null) => Promise<void>,
  runCommand: (command: string) => Promise<string>,
  config: VerifyLoopConfig
): Promise<VerifyLoopResult> {
  const history: VerifyIteration[] = [];
  let lastError: string | null = null;

  for (let i = 0; i < config.maxIterations; i++) {
    // Run the task (with previous error for fix attempts)
    await task(lastError);

    // Run verification
    const output = await runCommand(config.verifyCommand);
    const passed = config.isSuccess(output);

    if (!passed) {
      lastError = config.extractError(output);
    }

    const iteration: VerifyIteration = {
      iteration: i,
      output,
      passed,
      error: lastError
    };
    history.push(iteration);

    if (passed) {
      return {
        passed: true,
        iterations: i + 1,
        finalOutput: output,
        lastError: null,
        history
      };
    }
  }

  return {
    passed: false,
    iterations: config.maxIterations,
    finalOutput: history.at(-1)?.output ?? '',
    lastError,
    history
  };
}
