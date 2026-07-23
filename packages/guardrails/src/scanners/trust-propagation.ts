import type { UntrustedContentEnvelope } from '../sanitize/untrusted-content-envelope.js';

/**
 * TrustPropagator — Phase 10 §15.13
 *
 * Tracks how trust scores propagate through content transformations.
 * When untrusted content is transformed (e.g., web scraping → summarization),
 * the output inherits a trust score no higher than the input.
 *
 * This prevents trust-elevation attacks where untrusted data is masked
 * through re-processing.
 */

/**
 * Compute the trust score of derived (transformed) content.
 * The derived trust score is capped at the parent's score — transformation
 * can reduce trust but never increase it.
 *
 * @param parentTrustScore — Trust score of the original content (0–1).
 * @param transformationRisk — How much the transformation reduces trust (0–1).
 *   0 = safe transformation (e.g., lossless copy), 1 = full trust loss.
 * @returns Derived trust score (0–1).
 */
export function deriveTrustScore(parentTrustScore: number, transformationRisk: number): number {
  const risk = Math.max(0, Math.min(1, transformationRisk));
  return Math.max(0, Math.min(1, parentTrustScore * (1 - risk)));
}

/**
 * Merge multiple content sources into a single trust score.
 * The merged score is the minimum of all sources — a chain is as
 * strong as its weakest link.
 */
export function mergeTrustScores(scores: number[]): number {
  if (scores.length === 0) {
    return 1;
  }
  return Math.min(...scores);
}

/**
 * Attach trust propagation metadata to a content envelope's metadata.
 */
export function annotateTrustPropagation(
  envelope: UntrustedContentEnvelope,
  derivedFrom: { source: string; trustScore: number }[],
  transformation: string
): UntrustedContentEnvelope {
  const derivedTrustScore = deriveTrustScore(
    mergeTrustScores(derivedFrom.map(d => d.trustScore)),
    transformation === 'copy' ? 0 : 0.2
  );

  return {
    ...envelope,
    trustScore: derivedTrustScore,
    metadata: {
      ...envelope.metadata,
      derivedFrom,
      transformation,
      originalTrust: envelope.trustScore
    }
  };
}
