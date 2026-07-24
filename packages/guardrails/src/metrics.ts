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
        this.#counts[key] = (this.#counts[key] ?? 0) + 1;
      }
    }
  }

  /** Produce a current snapshot and reset the collector. */
  snapshot(version = '1.0.0'): MetricSnapshot {
    const total = this.#totalEvaluations || 1;
    const values = {} as Record<MetricKey, number>;
    for (const key of ALL_METRIC_KEYS) {
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
    if (id.includes('sycophancy')) {
      return 'sycophancy_rate';
    }
    if (id.includes('anthropomorphism') || id.includes('first-person-emotion')) {
      return 'anthropomorphic_language_rate';
    }
    if (id.includes('dependency') || id.includes('dependence')) {
      return 'dependence_cue_rate';
    }
    if (id.includes('high-risk') || id.includes('unsafe')) {
      return 'unsafe_high_risk_advice_rate';
    }
    if (id.includes('dark-pattern')) {
      return 'dark_pattern_incidence';
    }
    if (id.includes('scope-drift') || id.includes('scope-out-of-scope')) {
      return 'scope_violation_rate';
    }
    if (id.includes('agi-framing') || id.includes('agi')) {
      return 'agi_longtermist_framing_incidence';
    }
    if (id.includes('professional-displacement')) {
      return 'professional_displacement_framing_incidence';
    }
    if (id.includes('privacy') || id.includes('memory')) {
      return 'memory_transparency_compliance';
    }
    return null;
  }
}

// =============================================================================
// Release Gate — threshold-based regression enforcement
// =============================================================================

export interface ReleaseGateConfig {
  readonly thresholds: Partial<Record<MetricKey, number>>;
  readonly version: string;
}

export interface ReleaseGateResult {
  readonly failures: Array<{ key: MetricKey; value: number; threshold: number }>;
  readonly passed: boolean;
  readonly snapshot: MetricSnapshot;
}

export function evaluateReleaseGate(snapshot: MetricSnapshot, config: ReleaseGateConfig): ReleaseGateResult {
  const failures: Array<{ key: MetricKey; value: number; threshold: number }> = [];

  for (const [key, threshold] of Object.entries(config.thresholds)) {
    const value = snapshot.values[key as MetricKey];
    if (value !== undefined && threshold !== undefined && value > threshold) {
      failures.push({ key: key as MetricKey, value, threshold });
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

export interface BenchmarkScenario {
  readonly expectedDetectionIds?: readonly string[];
  readonly expectedStatus: GuardrailResult['status'];
  readonly input: string;
  readonly name: string;
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
    const result = await evaluate(scenario.input);
    if (result.status === scenario.expectedStatus) {
      passed++;
    } else {
      failures.push({
        scenario: scenario.name,
        expected: scenario.expectedStatus,
        actual: result.status
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
