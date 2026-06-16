import { genericHeaderParser } from '@agentsy/providers/profiles';

/**
 * Parses rate-limit headers from major LLM providers into a flat record.
 * Supports OpenAI (`x-ratelimit-limit-requests` / `-tokens`), Anthropic
 * (uses the same prefix), and a generic `-rpm` / `-tpm` fallback.
 */
export interface RateLimitHeaderSnapshot {
  rpmLimit: number;
  rpmRemaining: number;
  rpmResetSeconds: number;
  tpmLimit: number;
  tpmRemaining: number;
  tpmResetSeconds: number;
}

const EMPTY: RateLimitHeaderSnapshot = {
  rpmLimit: 0,
  rpmRemaining: 0,
  rpmResetSeconds: 0,
  tpmLimit: 0,
  tpmRemaining: 0,
  tpmResetSeconds: 0
};

/**
 * Parse rate-limit headers from a fetch Response or plain record.
 * Returns the EMPTY snapshot if no relevant headers are present.
 */
export function parseRateLimitHeaders(headers: Headers | Record<string, string>): RateLimitHeaderSnapshot {
  const normalized = genericHeaderParser(headers);

  const result: RateLimitHeaderSnapshot = {
    rpmLimit: parseMetric(normalized, ['x-ratelimit-limit-requests', 'x-ratelimit-limit-rpm']),
    rpmRemaining: parseMetric(normalized, ['x-ratelimit-remaining-requests', 'x-ratelimit-remaining-rpm']),
    rpmResetSeconds: parseMetric(normalized, ['x-ratelimit-reset-requests', 'x-ratelimit-reset-rpm']),
    tpmLimit: parseMetric(normalized, ['x-ratelimit-limit-tokens', 'x-ratelimit-limit-tpm']),
    tpmRemaining: parseMetric(normalized, ['x-ratelimit-remaining-tokens', 'x-ratelimit-remaining-tpm']),
    tpmResetSeconds: parseMetric(normalized, ['x-ratelimit-reset-tokens', 'x-ratelimit-reset-tpm'])
  };

  if (isEmptySnapshot(result)) {
    return EMPTY;
  }
  return result;
}

/**
 * Parse a single metric from normalized headers, checking alternate header names.
 */
function parseMetric(normalized: Record<string, string>, keys: string[]): number {
  for (const key of keys) {
    const value = normalized[key];
    if (value !== undefined && value !== '') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

/**
 * Check if a snapshot is empty (all limits and remaining values are zero).
 */
function isEmptySnapshot(snapshot: RateLimitHeaderSnapshot): boolean {
  return (
    snapshot.rpmLimit === 0 && snapshot.rpmRemaining === 0 && snapshot.tpmLimit === 0 && snapshot.tpmRemaining === 0
  );
}
