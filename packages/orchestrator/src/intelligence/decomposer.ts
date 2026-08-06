/**
 * Task decomposition engine for the orchestration system.
 *
 * Splits high-level goals into atomic decomposed tasks using heuristic
 * tier scoring, tool detection, and success gate inference.
 *
 * @module @agentsy/orchestrator/intelligence
 */

import type { SuccessGate } from '../types/plan.js';

// =============================================================================
// Types
// =============================================================================

/** Task complexity tier for routing and cost estimation. */
export type DecomposedTaskTier = 'micro' | 'small' | 'mid' | 'frontier';

/**
 * A single atomic task produced by the {@link TaskDecomposer}.
 * Each task has an assigned tier, estimated cost, dependency list,
 * required tools, and an optional success gate for completion verification.
 */
export interface DecomposedTask {
  /** Task IDs that must complete before this one. */
  readonly dependencies: readonly string[];
  /** Human-readable description of the work to perform. */
  readonly description: string;
  /** Estimated cost in USD (0 until CostEstimator computes it). */
  readonly estimatedCost: number;
  /** Estimated token consumption for this task. */
  readonly estimatedTokens: number;
  /** High-level goal this task belongs to. */
  readonly goal: string;
  /** Unique task identifier within the decomposition. */
  readonly id: string;
  /** Arbitrary metadata for consumers (profile, tags, etc.). */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Optional success gate for verifying completion. */
  readonly successGate: SuccessGate | undefined;
  /** Complexity tier assigned via heuristic scoring. */
  readonly tier: DecomposedTaskTier;
  /** Tool names required by this task (e.g. 'test', 'build'). */
  readonly tools: readonly string[];
}

/**
 * Heuristics governing how the decomposer scores and structures tasks.
 */
export interface DecomposerHeuristics {
  /** Expected branching factor for sub-task generation. */
  readonly branchingFactor: number;
  /** Map from keyword (lowercase) to assigned tier. */
  readonly keywords: Record<string, DecomposedTaskTier>;
  /** Expected number of distinct tools across decomposed tasks. */
  readonly toolDiversity: number;
}

// =============================================================================
// Defaults
// =============================================================================

/**
 * Default keyword-to-tier mapping.
 *
 * Common action verbs linked to their expected complexity tier based
 * on typical LLM task requirements.
 */
export const DEFAULT_KEYWORD_TIER_MAP: Record<string, DecomposedTaskTier> = {
  research: 'micro',
  implement: 'mid',
  reason: 'frontier',
  iterate: 'small',
  debug: 'small',
  analyze: 'mid',
  test: 'small',
  review: 'mid',
  plan: 'frontier',
  refactor: 'mid',
  deploy: 'small',
  document: 'micro'
} as const;

/**
 * Default heuristics used by {@link TaskDecomposer} when no custom
 * heuristics are provided.
 */
export const DEFAULT_DECOMPOSER_HEURISTICS: DecomposerHeuristics = {
  keywords: DEFAULT_KEYWORD_TIER_MAP,
  toolDiversity: 3,
  branchingFactor: 2
};

/** Per-tier token budget multipliers (applied to base of 1000 tokens). */
const TIER_TOKEN_BUDGET: Record<DecomposedTaskTier, number> = {
  micro: 500,
  small: 800,
  mid: 1500,
  frontier: 3000
};

/** Tool names recognised by {@link TaskDecomposer.extractTools}. */
const TOOL_PATTERNS: readonly string[] = [
  'read',
  'write',
  'search',
  'test',
  'lint',
  'build',
  'deploy',
  'analyze',
  'transform',
  'validate'
];

// =============================================================================
// TaskDecomposer
// =============================================================================

/**
 * Decomposes a high-level goal string into an ordered list of
 * {@link DecomposedTask} instances using heuristic tier scoring,
 * tool extraction, and success-gate inference.
 *
 * @example
 * ```ts
 * const decomposer = new TaskDecomposer();
 * const tasks = decomposer.decompose(
 *   "Research the API. Implement the endpoint. Test the response."
 * );
 * // tasks[0].tier === 'micro'
 * // tasks[1].tier === 'mid'
 * // tasks[2].tier === 'small'
 * ```
 */
export class TaskDecomposer {
  readonly #heuristics: DecomposerHeuristics;

  /**
   * @param heuristics - Custom decomposition heuristics.
   *                     Defaults to {@link DEFAULT_DECOMPOSER_HEURISTICS}.
   */
  constructor(heuristics: DecomposerHeuristics = DEFAULT_DECOMPOSER_HEURISTICS) {
    this.#heuristics = heuristics;
  }

  /**
   * Split a high-level goal into atomic decomposed tasks.
   *
   * 1. Splits `goal` into sentences (by `.`, `!`, `?`).
   * 2. Scores each sentence to a tier via {@link scoreTier}.
   * 3. Assigns sequential dependencies by default.
   *    If `profile.preferParallel` is true, tasks are created with
   *    empty dependencies (independent).
   * 4. Computes `estimatedTokens` from the tier budget, capped by
   *    `profile.maxTokensPerTask` if provided.
   * 5. Extracts tool names and infers success gates per task.
   *
   * @param goal - The high-level goal string to decompose.
   * @param profile - Optional profile controlling token caps and
   *                  parallelisation preferences.
   * @returns An ordered array of decomposed tasks.
   */
  decompose(goal: string, profile?: { maxTokensPerTask?: number; preferParallel?: boolean }): DecomposedTask[] {
    const raw = goal.split(/[.!?]+\s*/u).filter(Boolean);
    const tasks: DecomposedTask[] = [];

    for (const [i, sentence] of raw.entries()) {
      const description = sentence.trim();
      if (description.length === 0) {
        continue;
      }

      const tier = this.scoreTier(description);
      const baseTokens = TIER_TOKEN_BUDGET[tier];
      const maxTokensPerTask = profile?.maxTokensPerTask;
      const estimatedTokens = maxTokensPerTask === undefined ? baseTokens : Math.min(maxTokensPerTask, baseTokens);

      // Sequential: each task depends on the previous.
      // Parallel: no dependencies (each task is independent).
      let dependencies: string[];
      if (profile?.preferParallel) {
        dependencies = [];
      } else if (i > 0) {
        dependencies = [`task-${i - 1}`];
      } else {
        dependencies = [];
      }
      const tools = this.extractTools(description);
      const successGate = this.inferSuccessGates(description);

      tasks.push({
        id: `task-${i}`,
        goal,
        description,
        tier,
        estimatedTokens,
        estimatedCost: 0,
        dependencies,
        tools,
        successGate,
        metadata: {}
      });
    }

    return tasks;
  }

  /**
   * Score a description string to a {@link DecomposedTaskTier}.
   *
   * Matches keywords from the configured heuristics against the
   * lower-cased description. Returns the tier of the **first** matching
   * keyword. Falls back to `'mid'` when no keyword matches.
   *
   * @param description - Task description to score.
   * @returns The assigned tier.
   */
  scoreTier(description: string): DecomposedTaskTier {
    const lc = description.toLowerCase();

    for (const [keyword, tier] of Object.entries(this.#heuristics.keywords)) {
      if (lc.includes(keyword)) {
        return tier;
      }
    }

    // Token-estimate fallback: approximate complexity from word count
    const estimatedTokens = description.split(/\s+/u).length * 1.3;
    if (estimatedTokens < 50) {
      return 'micro';
    }
    if (estimatedTokens < 150) {
      return 'small';
    }
    if (estimatedTokens < 400) {
      return 'mid';
    }
    return 'frontier';
  }

  /**
   * Extract recognised tool names from a description string.
   *
   * Scans against a known set of tool patterns and returns only those
   * present in the text.
   *
   * @param description - Task description to scan.
   * @returns Array of recognised tool names (deduplicated, ordered by
   *          pattern definition).
   */
  extractTools(description: string): string[] {
    const lc = description.toLowerCase();
    return TOOL_PATTERNS.filter(tool => lc.includes(tool));
  }

  /**
   * Infer a success gate from a description string.
   *
   * - `test` / `lint` keywords → `VerificationGate`
   * - `deploy` keyword → `ApprovalGate`
   * - No match → `undefined`
   *
   * @param description - Task description to scan.
   * @returns A success gate if applicable, otherwise `undefined`.
   */
  inferSuccessGates(description: string): SuccessGate | undefined {
    const lc = description.toLowerCase();

    if (lc.includes('test') || lc.includes('lint')) {
      return {
        type: 'verification',
        checkId: lc.includes('test') ? 'test-pass' : 'lint-pass',
        strategy: lc.includes('test') ? 'test-run' : 'assertion'
      };
    }

    if (lc.includes('deploy')) {
      return {
        type: 'approval',
        role: 'lead',
        timeoutMs: 3_600_000 // 1 hour
      };
    }
  }

  // ── Recursive decomposition (Tip 3: break down until solvable) ────────

  /**
   * Recursively decompose a goal until all tasks are "solvable" or max depth.
   *
   * A task is solvable if `isSolvable` returns true. The default check:
   * `estimatedTokens <= solvableThreshold && tier !== 'frontier'`.
   *
   * Tasks that remain unsolvable at max depth get `metadata.requiresHuman: true`
   * (maps to Atlas constraint `const_human_loop`).
   */
  decomposeRecursive(goal: string, options?: DecomposeOptions): DecomposedTask[] {
    const opts: Required<DecomposeOptions> = {
      maxDepth: options?.maxDepth ?? 3,
      solvableThreshold: options?.solvableThreshold ?? 500,
      isSolvable:
        options?.isSolvable ??
        (task => task.estimatedTokens <= (options?.solvableThreshold ?? 500) && task.tier !== 'frontier')
    };

    const result: DecomposedTask[] = [];
    this.#decomposeInto(goal, 0, opts, result, 'task');
    return result;
  }

  #decomposeInto(
    goal: string,
    depth: number,
    opts: Required<DecomposeOptions>,
    result: DecomposedTask[],
    idPrefix: string
  ): void {
    const tasks = this.decompose(goal);

    for (const [i, task] of tasks.entries()) {
      const taskId = `${idPrefix}-${i}`;

      if (opts.isSolvable(task) || depth >= opts.maxDepth) {
        // Solvable or max depth — add it
        result.push({
          ...task,
          id: taskId,
          metadata:
            depth >= opts.maxDepth && !opts.isSolvable(task) ? { ...task.metadata, requiresHuman: true } : task.metadata
        });
      } else {
        // Not solvable — decompose further
        this.#decomposeInto(task.description, depth + 1, opts, result, taskId);
      }
    }
  }
}

export interface DecomposeOptions {
  /** Function to check if a task is solvable as-is */
  isSolvable?: (task: DecomposedTask) => boolean;
  /** Max recursion depth (default 3) */
  maxDepth?: number;
  /** Min estimated tokens for a task to be considered "solvable" (default 500) */
  solvableThreshold?: number;
}
