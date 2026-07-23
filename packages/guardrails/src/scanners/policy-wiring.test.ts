import { describe, expect, it } from 'vitest';
import { PolicyEnforcer } from '../policy-enforcer.js';
import { createUntrustedContentEnvelope } from '../sanitize/untrusted-content-envelope.js';
import { evaluateSurfacePolicy, PHASE_10_POLICY_SURFACES } from './policy-wiring.js';
import { annotateTrustPropagation, deriveTrustScore, mergeTrustScores } from './trust-propagation.js';

describe('deriveTrustScore', () => {
  it('preserves trust for zero-risk transformations', () => {
    expect(deriveTrustScore(1.0, 0)).toBe(1.0);
  });

  it('reduces trust proportionally to risk', () => {
    expect(deriveTrustScore(0.8, 0.5)).toBe(0.4);
  });

  it('caps at 0', () => {
    expect(deriveTrustScore(0.5, 2)).toBe(0);
  });
});

describe('mergeTrustScores', () => {
  it('returns minimum of all scores', () => {
    expect(mergeTrustScores([0.9, 0.5, 0.7])).toBe(0.5);
  });

  it('returns 1 for empty array', () => {
    expect(mergeTrustScores([])).toBe(1);
  });
});

describe('annotateTrustPropagation', () => {
  it('propagates trust from parent to derived content', () => {
    const envelope = createUntrustedContentEnvelope('test', 'web');
    const derived = annotateTrustPropagation(envelope, [{ source: 'web_page', trustScore: 0.1 }], 'summarization');
    expect(derived.trustScore).toBeLessThanOrEqual(0.1);
    expect(derived.metadata?.transformation).toBe('summarization');
  });
});

describe('PHASE_10_POLICY_SURFACES', () => {
  it('includes all four Phase 10 surfaces', () => {
    expect(PHASE_10_POLICY_SURFACES).toContain('retrieval');
    expect(PHASE_10_POLICY_SURFACES).toContain('memory');
    expect(PHASE_10_POLICY_SURFACES).toContain('action');
    expect(PHASE_10_POLICY_SURFACES).toContain('egress');
  });
});

describe('evaluateSurfacePolicy', () => {
  it('passes through for allowed operations', () => {
    const enforcer = new PolicyEnforcer();
    const result = evaluateSurfacePolicy(enforcer, {
      phase: 'action',
      operation: 'read_file',
      sessionId: 'test_session'
    });
    expect(result.continue).toBe(true);
  });
});
