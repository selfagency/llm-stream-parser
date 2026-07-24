/**
 * Phase 13 — Guardrails Metrics, Benchmark Suite & Release Gate
 *
 * Implements the 12 required safety metrics from SAFETY.md, a benchmark
 * suite for evaluating guardrail quality, and a release gate that enforces
 * threshold-based regression checks.
 */

// =============================================================================
// Metric Keys — the 12 required safety metrics from SAFETY.md
// =============================================================================

export type MetricKey =
  | 'sycophancy_rate'
  | 'correct_disagreement_rate'
  | 'anthropomorphic_language_rate'
  | 'dependence_cue_rate'
  | 'unsafe_high_risk_advice_rate'
  | 'dark_pattern_incidence'
  | 'memory_transparency_compliance'
  | 'policy_traceability_completeness'
  | 'scope_violation_rate'
  | 'agi_longtermist_framing_incidence'
  | 'professional_displacement_framing_incidence'
  | 'intersectional_safety_disparity';

export const ALL_METRIC_KEYS: readonly MetricKey[] = [
  'sycophancy_rate',
  'correct_disagreement_rate',
  'anthropomorphic_language_rate',
  'dependence_cue_rate',
  'unsafe_high_risk_advice_rate',
  'dark_pattern_incidence',
  'memory_transparency_compliance',
  'policy_traceability_completeness',
  'scope_violation_rate',
  'agi_longtermist_framing_incidence',
  'professional_displacement_framing_incidence',
  'intersectional_safety_disparity'
];

// =============================================================================
// Metric Snapshot — a point-in-time measurement of all metrics
// =============================================================================

/**
 * Point-in-time measurement of all 12 safety metrics.
 * Produced by MetricsCollector.snapshot().
 */
export interface MetricSnapshot {
  readonly timestamp: string;
  readonly totalEvaluations: number;
  readonly values: Record<MetricKey, number>;
  readonly version: string;
}

// =============================================================================
// Metrics Collector — aggregates scanner results into metrics
// =============================================================================

import type { Detection, GuardrailResult } from './types.js';

interface DetectionRule {
  readonly metric: MetricKey;
  readonly test: (id: string) => boolean;
}

const DETECTION_RULES: DetectionRule[] = [
  { test: id => id.includes('sycophancy'), metric: 'sycophancy_rate' },
  {
    test: id => id.includes('anthropomorphism') || id.includes('first-person-emotion'),
    metric: 'anthropomorphic_language_rate'
  },
  { test: id => id.includes('dependency') || id.includes('dependence'), metric: 'dependence_cue_rate' },
  { test: id => id.includes('high-risk') || id.includes('unsafe'), metric: 'unsafe_high_risk_advice_rate' },
  { test: id => id.includes('dark-pattern'), metric: 'dark_pattern_incidence' },
  { test: id => id.includes('scope-drift') || id.includes('scope-out-of-scope'), metric: 'scope_violation_rate' },
  { test: id => id.includes('agi-framing') || id.includes('agi'), metric: 'agi_longtermist_framing_incidence' },
  { test: id => id.includes('professional-displacement'), metric: 'professional_displacement_framing_incidence' },
  {
    test: id => id.includes('privacy') || (id.includes('memory') && !id.includes('poison')),
    metric: 'memory_transparency_compliance'
  }
];

export class MetricsCollector {
  #counts: Record<string, number> = {};
  #totalEvaluations = 0;

  /** Record a guardrail evaluation result, extracting metric-relevant data. */
  record(result: GuardrailResult): void {
    this.#totalEvaluations++;
    if (!result.detections) {
      return;
    }
    for (const d of result.detections) {
      const key = this.#detectionToMetricKey(d);
      if (key) {
        // nosemgrep: detection IDs are internally-generated, not user-supplied
        this.#counts[key] = (this.#counts[key] ?? 0) + 1;
      }
    }
  }

  /** Produce a current snapshot and reset the collector. */
  snapshot(version = '1.0.0'): MetricSnapshot {
    const total = this.#totalEvaluations || 1;
    const values = {} as Record<MetricKey, number>;
    for (const key of ALL_METRIC_KEYS) {
      // nosemgrep: ALL_METRIC_KEYS is a readonly const array of known keys
      values[key] = (this.#counts[key] ?? 0) / total;
    }
    const snapshot: MetricSnapshot = {
      timestamp: new Date().toISOString(),
      values,
      totalEvaluations: this.#totalEvaluations,
      version
    };
    this.reset();
    return snapshot;
  }

  reset(): void {
    this.#counts = {};
    this.#totalEvaluations = 0;
  }

  #detectionToMetricKey(d: Detection): MetricKey | null {
    const id = d.id;
    for (const { test, metric } of DETECTION_RULES) {
      if (test(id)) {
        return metric;
      }
    }
    return null;
  }
}

// =============================================================================
// Release Gate — threshold-based regression enforcement
// =============================================================================

/**
 * Threshold configuration for the release gate.
 * Maps metric keys to their maximum acceptable values.
 */
export interface ReleaseGateConfig {
  readonly thresholds: Partial<Record<MetricKey, number>>;
  readonly version: string;
}

/**
 * Result of evaluating the release gate against a snapshot.
 * `passed` is true only when all metrics are within their thresholds.
 */
export interface ReleaseGateResult {
  readonly failures: Array<{ key: MetricKey; value: number; threshold: number }>;
  readonly passed: boolean;
  readonly snapshot: MetricSnapshot;
}

export function isMetricKey(key: string): key is MetricKey {
  return ALL_METRIC_KEYS.includes(key as MetricKey);
}

/**
 * Evaluate a metric snapshot against threshold configuration.
 * Returns pass/fail with details on each threshold violation.
 *
 * @param snapshot — Current metric snapshot.
 * @param config — Threshold configuration.
 */
export function evaluateReleaseGate(snapshot: MetricSnapshot, config: ReleaseGateConfig): ReleaseGateResult {
  const failures: Array<{ key: MetricKey; value: number; threshold: number }> = [];

  for (const [key, threshold] of Object.entries(config.thresholds)) {
    if (!isMetricKey(key)) {
      console.warn(`[metrics] Unknown metric key "${key}" in release gate config, skipping`);
      continue;
    }
    // nosemgrep: key is validated as MetricKey by isMetricKey() check above
    const value = snapshot.values[key];
    if (value !== undefined && threshold !== undefined && value > threshold) {
      failures.push({ key, value, threshold });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    snapshot
  };
}

// =============================================================================
// Benchmark Suite
// =============================================================================

/**
 * A single benchmark test case.
 * @param name — Human-readable name for reporting.
 * @param input — Raw input to evaluate.
 * @param expectedStatus — Expected guardrail result status.
 * @param expectedDetectionIds — Optional expected detection IDs (checked when defined).
 */
export interface BenchmarkScenario {
  readonly expectedDetectionIds?: readonly string[];
  readonly expectedStatus: GuardrailResult['status'];
  readonly input: string;
  readonly name: string;
}

/**
 * Run a set of benchmark scenarios through an evaluation function.
 * Reports pass/fail counts with details on each failure.
 *
 * @param scenarios — Array of test scenarios.
 * @param evaluate — Function that evaluates a single input and returns a GuardrailResult.
 */
interface ScenarioResult {
  readonly actualStatus: GuardrailResult['status'];
  readonly detectionMatch: boolean;
  readonly detectionMismatchReason: string;
  readonly statusMatch: boolean;
}

async function evaluateScenario(
  evaluate: (input: string) => GuardrailResult | Promise<GuardrailResult>,
  scenario: BenchmarkScenario
): Promise<ScenarioResult> {
  const result = await evaluate(scenario.input);
  const statusMatch = result.status === scenario.expectedStatus;
  let detectionMatch = true;
  let detectionMismatchReason = '';

  if (statusMatch && scenario.expectedDetectionIds && result.detections) {
    const actualIds = result.detections.map(d => d.id);
    const missing = scenario.expectedDetectionIds.filter(id => !actualIds.includes(id));
    if (missing.length > 0) {
      detectionMatch = false;
      detectionMismatchReason = ` (missing detections: ${missing.join(', ')})`;
    }
  }

  return { actualStatus: result.status, statusMatch, detectionMatch, detectionMismatchReason };
}

export async function runBenchmark(
  scenarios: BenchmarkScenario[],
  evaluate: (input: string) => GuardrailResult | Promise<GuardrailResult>
): Promise<{
  passed: number;
  failed: number;
  total: number;
  failures: Array<{ scenario: string; expected: string; actual: string }>;
}> {
  const failures: Array<{ scenario: string; expected: string; actual: string }> = [];
  let passed = 0;

  for (const scenario of scenarios) {
    const evalResult = await evaluateScenario(evaluate, scenario);

    if (evalResult.statusMatch && evalResult.detectionMatch) {
      passed++;
    } else {
      failures.push({
        scenario: scenario.name,
        expected: evalResult.statusMatch
          ? `detections: ${scenario.expectedDetectionIds?.join(', ')}`
          : scenario.expectedStatus,
        actual: evalResult.statusMatch ? evalResult.detectionMismatchReason : evalResult.actualStatus
      });
    }
  }

  return {
    passed,
    failed: scenarios.length - passed,
    total: scenarios.length,
    failures
  };
}
