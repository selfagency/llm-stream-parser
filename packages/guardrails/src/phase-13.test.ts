import { describe, expect, it } from 'vitest';
import {
  ALL_METRIC_KEYS,
  evaluateReleaseGate,
  type MetricSnapshot,
  MetricsCollector,
  runBenchmark
} from './metrics.js';

describe('ALL_METRIC_KEYS', () => {
  it('includes exactly 12 metrics', () => {
    expect(ALL_METRIC_KEYS.length).toBe(12);
  });
});

describe('MetricsCollector', () => {
  it('produces a snapshot with all 12 metrics', () => {
    const collector = new MetricsCollector();
    const snapshot = collector.snapshot();
    expect(snapshot.totalEvaluations).toBe(0);
    for (const key of ALL_METRIC_KEYS) {
      expect(typeof snapshot.values[key]).toBe('number');
    }
  });

  it('records detections and reflects them in rates', () => {
    const collector = new MetricsCollector();
    collector.record({ status: 'pass', phase: 'input' });
    collector.record({
      status: 'block',
      phase: 'input',
      reason: 'sycophancy detected',
      detections: [{ id: 'sycophancy-high-confidence', severity: 'high', description: 'test', confidence: 0.9 }]
    });
    const snapshot = collector.snapshot();
    expect(snapshot.totalEvaluations).toBe(2);
    expect(snapshot.values.sycophancy_rate).toBe(0.5);
  });

  it('resets counts after snapshot', () => {
    const collector = new MetricsCollector();
    collector.record({
      status: 'block',
      phase: 'input',
      reason: 'x',
      detections: [{ id: 'sycophancy-test', severity: 'high', description: 'x', confidence: 0.9 }]
    });
    collector.snapshot();
    const second = collector.snapshot();
    expect(second.totalEvaluations).toBe(0);
  });

  it('maps detection IDs to metric keys correctly', () => {
    const collector = new MetricsCollector();
    const detections = [
      { id: 'sycophancy', severity: 'medium', description: 'x', confidence: 0.5 },
      { id: 'anthropomorphism-first-person-emotion', severity: 'medium', description: 'x', confidence: 0.5 },
      { id: 'dependency-excessive', severity: 'medium', description: 'x', confidence: 0.5 },
      { id: 'high-risk-domain-medical', severity: 'high', description: 'x', confidence: 0.8 },
      { id: 'dark-pattern-urgency', severity: 'medium', description: 'x', confidence: 0.5 },
      { id: 'scope-drift-detected', severity: 'medium', description: 'x', confidence: 0.6 },
      { id: 'agi-framing-sentience', severity: 'medium', description: 'x', confidence: 0.5 },
      { id: 'professional-displacement-claim', severity: 'medium', description: 'x', confidence: 0.5 },
      { id: 'privacy-data-collection', severity: 'medium', description: 'x', confidence: 0.5 }
    ];
    for (const d of detections) {
      collector.record({ status: 'block', phase: 'input', reason: 'x', detections: [d] });
    }
    const snapshot = collector.snapshot();
    expect(snapshot.totalEvaluations).toBe(9);
    // Each of 9 evaluations has 1 detection, so each rate = 1/9
    expect(snapshot.values.sycophancy_rate).toBeCloseTo(0.111, 2);
    expect(snapshot.values.anthropomorphic_language_rate).toBeCloseTo(0.111, 2);
    expect(snapshot.values.dependence_cue_rate).toBeCloseTo(0.111, 2);
    expect(snapshot.values.unsafe_high_risk_advice_rate).toBeCloseTo(0.111, 2);
    expect(snapshot.values.dark_pattern_incidence).toBeCloseTo(0.111, 2);
    expect(snapshot.values.scope_violation_rate).toBeCloseTo(0.111, 2);
    expect(snapshot.values.agi_longtermist_framing_incidence).toBeCloseTo(0.111, 2);
    expect(snapshot.values.professional_displacement_framing_incidence).toBeCloseTo(0.111, 2);
    expect(snapshot.values.memory_transparency_compliance).toBeCloseTo(0.111, 2);
  });
});

describe('evaluateReleaseGate', () => {
  const snapshot: MetricSnapshot = {
    timestamp: '2026-07-24T00:00:00Z',
    values: {
      sycophancy_rate: 0.05,
      correct_disagreement_rate: 0,
      anthropomorphic_language_rate: 0.02,
      dependence_cue_rate: 0.01,
      unsafe_high_risk_advice_rate: 0.01,
      dark_pattern_incidence: 0,
      memory_transparency_compliance: 0,
      policy_traceability_completeness: 0,
      scope_violation_rate: 0.02,
      agi_longtermist_framing_incidence: 0.01,
      professional_displacement_framing_incidence: 0,
      intersectional_safety_disparity: 0
    },
    totalEvaluations: 1000,
    version: '1.0.0'
  };

  it('passes when all metrics are below thresholds', () => {
    const result = evaluateReleaseGate(snapshot, {
      thresholds: { sycophancy_rate: 0.1, unsafe_high_risk_advice_rate: 0.05 },
      version: '1.0.0'
    });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('fails when a metric exceeds its threshold', () => {
    const result = evaluateReleaseGate(snapshot, {
      thresholds: { sycophancy_rate: 0.01 },
      version: '1.0.0'
    });
    expect(result.passed).toBe(false);
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].key).toBe('sycophancy_rate');
  });
});

describe('runBenchmark', () => {
  it('returns pass/fail counts for a set of scenarios', async () => {
    let callCount = 0;
    const result = await runBenchmark(
      [
        { name: 'safe input', input: 'hello', expectedStatus: 'pass' },
        { name: 'blocked input', input: 'danger', expectedStatus: 'block' }
      ],
      (input: string) => {
        callCount++;
        return input === 'danger'
          ? { status: 'block' as const, phase: 'input' as const, reason: 'blocked' }
          : { status: 'pass' as const, phase: 'input' as const };
      }
    );
    expect(result.total).toBe(2);
    expect(result.passed).toBe(2);
    expect(callCount).toBe(2);
  });
});
