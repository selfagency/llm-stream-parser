import { describe, expect, it } from 'vitest';
import { computeReplicaScore, type ReplicaScoreInput, type ReplicaScoreWeights } from './replica-score.js';

function makeInput(overrides: Partial<ReplicaScoreInput> = {}): ReplicaScoreInput {
  return {
    costInputPer1MTokens: 0.15,
    errorRate: 0,
    isLocal: false,
    latencyMs: 0,
    tier: 'small',
    ...overrides
  };
}

describe('computeReplicaScore — quota headroom', () => {
  it('applies no headroom bonus when headroomPercentage is undefined', () => {
    const score = computeReplicaScore(makeInput({ headroomPercentage: undefined }));
    const baseline = computeReplicaScore(makeInput({ headroomPercentage: 0 }));
    // 0% headroom × 0.15 = 0, same as undefined
    expect(score).toBe(baseline);
  });

  it('applies continuous headroom bonus proportional to percentage', () => {
    const score50 = computeReplicaScore(makeInput({ headroomPercentage: 50 }));
    const score100 = computeReplicaScore(makeInput({ headroomPercentage: 100 }));
    // 50 × 0.15 = 7.5, 100 × 0.15 = 15
    expect(score100 - score50).toBeCloseTo(7.5, 5);
  });

  it('prefers higher headroom when other factors are equal', () => {
    const low = computeReplicaScore(makeInput({ headroomPercentage: 20 }));
    const high = computeReplicaScore(makeInput({ headroomPercentage: 90 }));
    expect(high).toBeGreaterThan(low);
  });

  it('uses custom quotaHeadroom weight when provided', () => {
    const weights: ReplicaScoreWeights = { quotaHeadroom: 1 };
    const score = computeReplicaScore(makeInput({ headroomPercentage: 50 }), weights);
    // 50 × 1 = 50, cost: -0.15 × 1 = -0.15, total = 49.85
    expect(score).toBeCloseTo(49.85, 5);
  });

  it('zero quotaHeadroom weight disables headroom contribution', () => {
    const weights: ReplicaScoreWeights = { quotaHeadroom: 0 };
    const withHeadroom = computeReplicaScore(makeInput({ headroomPercentage: 80 }), weights);
    const withoutHeadroom = computeReplicaScore(makeInput({ headroomPercentage: undefined }), weights);
    expect(withHeadroom).toBe(withoutHeadroom);
  });

  it('headroom bonus stacks with local bonus', () => {
    const localScore = computeReplicaScore(makeInput({ isLocal: true, tier: 'micro', headroomPercentage: 100 }));
    // local: 100 × 1 = 100, headroom: 100 × 0.15 = 15, cost: -0.15, total = 114.85
    expect(localScore).toBeCloseTo(114.85, 5);
  });

  it('headroom bonus can offset latency penalty', () => {
    const highHeadroomHighLatency = computeReplicaScore(makeInput({ headroomPercentage: 100, latencyMs: 500 }));
    const lowHeadroomLowLatency = computeReplicaScore(makeInput({ headroomPercentage: 0, latencyMs: 0 }));
    // high: 100×0.15 - 500×0.01 - 0.15 = 15 - 5 - 0.15 = 9.85
    // low: 0 - 0 - 0.15 = -0.15
    expect(highHeadroomHighLatency).toBeCloseTo(9.85, 5);
    expect(lowHeadroomLowLatency).toBeCloseTo(-0.15, 5);
    expect(highHeadroomHighLatency).toBeGreaterThan(lowHeadroomLowLatency);
  });

  it('default weight produces expected score for 100% headroom', () => {
    const score = computeReplicaScore(makeInput({ headroomPercentage: 100 }));
    // 100 × 0.15 - 0.15 = 14.85
    expect(score).toBeCloseTo(14.85, 5);
  });
});
