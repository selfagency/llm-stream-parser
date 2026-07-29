/**
 * GuardianScanner — LLM-as-judge scanner with circuit breaker and sliding window.
 *
 * Phase:  `tool-input` — evaluates tool calls for safety before execution.
 *
 * ## Circuit breaker
 *
 * Tracks consecutive denials from the LLM judge. When `maxConsecutive` (default 3)
 * consecutive denials occur, the circuit breaker opens and all subsequent tool
 * calls are blocked without consulting the judge (turn is aborted).
 *
 * A single `allow` verdict resets the consecutive counter.
 *
 * ## Sliding window
 *
 * Tracks the total number of denials across recent evaluations. When the count
 * exceeds the sliding window threshold (default 10) within the last 50 evaluations,
 * the policy is *tightened*: the next denial returns `escalate` instead of `block`,
 * requiring human approval.
 *
 * ## LLM judge injection
 *
 * The LLM judge function is injected via the constructor for testability.
 * Production use would wire an actual LLM call; unit tests inject a mock.
 */

import type { GuardrailResult, GuardrailScanner } from '../types.js';

// =============================================================================
// Config
// =============================================================================

export interface GuardianConfig {
  /**
   * LLM judge function that evaluates a tool call input and returns
   * `'allow'` or `'deny'`. Must be injected for production use.
   * Default always allows (safe fallback).
   */
  llmJudge?: (input: string) => Promise<'allow' | 'deny'>;
  /**
   * Number of consecutive denials before the circuit breaker opens.
   * Default 3.
   */
  maxConsecutive?: number;
  /**
   * Number of denials in the sliding window before policy is tightened.
   * Default 10.
   */
  slidingWindowThreshold?: number;
}

/**
 * Default judge — always allows. Safe fallback when no judge is injected.
 * Production deployments MUST provide a real judge via the constructor.
 */
const DEFAULT_JUDGE: (input: string) => Promise<'allow' | 'deny'> = async () => 'allow';

const DEFAULT_MAX_CONSECUTIVE = 3;
const DEFAULT_SLIDING_WINDOW_THRESHOLD = 10;
const SLIDING_WINDOW_SIZE = 50;

// =============================================================================
// Scanner
// =============================================================================

export class GuardianScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/guardian',
    name: 'Guardian LLM-as-Judge Scanner',
    description: 'LLM-as-judge evaluation of tool calls with circuit breaker and sliding-window denial tracking',
    priority: 60,
    version: '1.0.0',
    tags: ['llm-judge', 'circuit-breaker', 'tool-input'] as const,
    owaspCategories: ['asi-03'] as const
  };

  readonly #llmJudge: (input: string) => Promise<'allow' | 'deny'>;
  readonly #maxConsecutive: number;
  readonly #slidingWindowThreshold: number;

  /** Current consecutive denial count. Reset on `allow`. */
  #consecutiveDenials = 0;
  /**
   * Sliding window buffer: stores the evaluation number of each denial.
   * Trimmed to keep only the most recent `SLIDING_WINDOW_SIZE` entries.
   */
  #recentDenials: number[] = [];
  /** Monotonic evaluation counter — used to age out denial records. */
  #totalEvaluations = 0;

  constructor(options?: GuardianConfig) {
    this.#llmJudge = options?.llmJudge ?? DEFAULT_JUDGE;
    this.#maxConsecutive = options?.maxConsecutive ?? DEFAULT_MAX_CONSECUTIVE;
    this.#slidingWindowThreshold = options?.slidingWindowThreshold ?? DEFAULT_SLIDING_WINDOW_THRESHOLD;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Evaluate a tool call input.
   *
   * 1. Circuit breaker check — block if consecutive denials exceed threshold.
   * 2. Clean sliding window — age out entries beyond the window.
   * 3. Sliding window check — tighten policy if threshold is exceeded.
   * 4. LLM judge — ask the injected judge for a verdict.
   * 5. Apply verdict — increment counters on deny, reset on allow.
   */
  async evaluate(input: string, _context?: Record<string, unknown>): Promise<GuardrailResult> {
    this.#totalEvaluations++;

    // 1. Circuit breaker: consecutive denials >= threshold → block
    if (this.#consecutiveDenials >= this.#maxConsecutive) {
      return {
        status: 'block',
        phase: 'tool-input',
        reason: `Circuit breaker: ${this.#consecutiveDenials} consecutive denials blocked the turn`
      };
    }

    // 2. Clean sliding window — remove entries outside the window
    this.#cleanSlidingWindow();

    // 3. Check sliding window threshold — escalate policy if exceeded
    const tightened = this.#recentDenials.length >= this.#slidingWindowThreshold;

    // 4. LLM judge evaluation
    const verdict = await this.#llmJudge(input);

    if (verdict === 'deny') {
      this.#consecutiveDenials++;
      this.#recentDenials.push(this.#totalEvaluations);

      if (tightened) {
        return {
          status: 'escalate',
          phase: 'tool-input',
          reason: `Sliding window threshold exceeded: ${this.#recentDenials.length} denials in last ${SLIDING_WINDOW_SIZE} evaluations`,
          riskScore: 0.8
        };
      }

      return {
        status: 'block',
        phase: 'tool-input',
        reason: 'LLM judge denied the tool call'
      };
    }

    // 5. Allow: reset consecutive counter
    this.#consecutiveDenials = 0;
    return { status: 'pass', phase: 'tool-input' };
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  /**
   * Remove denial records that are older than the sliding window.
   * We compare each record's evaluation number against `totalEvaluations - windowSize`.
   */
  #cleanSlidingWindow(): void {
    const cutoff = this.#totalEvaluations - SLIDING_WINDOW_SIZE;
    if (cutoff > 0) {
      this.#recentDenials = this.#recentDenials.filter(evalNum => evalNum > cutoff);
    }
  }

  /**
   * Expose internal state for testability.
   * These are read-only accessors for assertions only.
   */
  get consecutiveDenials(): number {
    return this.#consecutiveDenials;
  }

  get recentDenials(): readonly number[] {
    return [...this.#recentDenials];
  }

  get totalEvaluations(): number {
    return this.#totalEvaluations;
  }
}
