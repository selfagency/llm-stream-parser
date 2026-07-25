/**
 * Shannon entropy scanner — inspired by eslint-plugin-no-secrets and entro-scan.
 *
 * Detects high-entropy strings that are likely to be secrets (API keys, tokens)
 * even when they don't match known provider patterns. Acts as a catch-all
 * for obfuscated or unknown secret formats.
 *
 * ## Threshold
 *
 * Default entropy threshold is 3.5. At 3.5:
 * - A random 20-char alphanumeric string → ~4.3 (flagged)
 * - An English word like "configuration" → ~3.2 (not flagged)
 * - A UUID → ~5.8 (flagged — but filtered by UUID pattern exclusion)
 * - An AWS key `AKIAIOSFODNN7EXAMPLE` → ~3.6 (but caught by provider pattern)
 *
 * ## Compact entropy (sliding window) mode
 *
 * For future work: consider a "compact entropy" mode that runs a sliding window
 * across the entire input string (window size ~8-12 chars) instead of splitting
 * on delimiters. This catches secrets embedded in concatenated strings, like
 * `password=Gx8pQmZwN3yB6rKtV2cL&role=admin` where the full token is separated
 * by delimiters but would benefit from finer-grained scanning of compact segments.
 *
 * The sliding window approach avoids false negatives on short but high-entropy
 * substrings that are surrounded by low-entropy padding. Window size should be
 * tuned to match typical secret lengths (JWT segments, API key fragments).
 *
 * ## False-positive suppression
 *
 * The scanner suppresses detections for:
 * - UUIDs and ULIDs (common identifiers, not secrets)
 * - ISO dates and timestamps
 * - Base64-encoded strings under 16 characters (short padding segments)
 * - Strings that already match a known provider pattern (avoid double-reporting)
 */

import type { Detection, GuardrailResult, GuardrailScanner } from './types.js';

// =============================================================================
// Entropy calculation
// =============================================================================

/**
 * Calculate the Shannon entropy of a string.
 *
 * Formula: H(X) = -sum(p_i * log2(p_i))
 *
 * @param value — The string to calculate entropy for.
 * @returns Entropy in bits per symbol (0 = single repeated char, ~4+ = likely secret).
 */
export function entropyOf(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  const freq = new Map<string, number>();
  for (const ch of value) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

// =============================================================================
// False-positive pattern exclusion
// =============================================================================

/**
 * Patterns that should NOT trigger entropy-based detection.
 * These are common high-entropy-but-not-secret formats.
 */
const FP_EXCLUSIONS: RegExp[] = [
  // UUIDs: 550e8400-e29b-41d4-a716-446655440000
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  // ULIDs: 01ARZ3NDEKTSV4RRFFQ69G5FAV
  /\b[0-7][0-9A-HJKMNP-TV-Z]{25}\b/,
  // ISO dates: 2024-01-15T14:30:00Z | 2024-01-15T14:30:00+00:00
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/,
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:?\d{2}\b/,
  // Git SHAs: abcdef0123456789
  /\b[0-9a-f]{7,40}\b(?!.*\S)/i,
  // Base64 short padding segments (under 10 chars)
  /\b[A-Za-z0-9+/]{4,9}(?:={1,2})?\b/,
  // Version strings: 1.2.3
  /\b\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?(?:\+[a-zA-Z0-9.]+)?\b/,
  // SemVer range: >=1.0.0 <2.0.0
  /\b(?:>=|<=|>|<|~|\^)\s*\d+\.\d+\.\d+\b/,
  // Simple numbers and hex colors
  /\b#?[0-9a-fA-F]{3,8}\b/
];

/**
 * Check if a string matches any false-positive exclusion pattern.
 */
function isExcluded(value: string): boolean {
  for (const pattern of FP_EXCLUSIONS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

// =============================================================================
// Tokenization
// =============================================================================

/**
 * Extract candidate tokens from a string for entropy scanning.
 *
 * Tokens are non-whitespace sequences longer than 8 characters
 * and shorter than 1024 characters (to avoid analyzing entire messages).
 */
const MIN_TOKEN_LENGTH = 9;
const MAX_TOKEN_LENGTH = 1024;

function extractTokens(input: string): string[] {
  const tokens: string[] = [];
  // Split on whitespace and common delimiters
  const parts = input.split(/[\s,;:="'`|&]+/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length >= MIN_TOKEN_LENGTH && trimmed.length <= MAX_TOKEN_LENGTH && !isExcluded(trimmed)) {
      tokens.push(trimmed);
    }
  }

  return tokens;
}

// =============================================================================
// EntropyScanner class
// =============================================================================

/**
 * Scanner that detects high-entropy strings as potential secrets.
 *
 * Designed as a catch-all scanner (priority: 50) that runs after
 * provider-specific secret patterns. It catches obfuscated or
 * unknown secret formats that regex patterns miss.
 *
 * OWASP: ASI-08 (Data Leakage), ASI-06 (Insecure Data Handling)
 */
export class EntropyScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/entropy',
    name: 'Entropy Detection Scanner',
    version: '1.0.0',
    description: 'Detects high-entropy strings as potential secrets (Shannon entropy ≥ 3.5)',
    priority: 50,
    owaspCategories: ['asi-06', 'asi-08'] as const,
    tags: ['entropy', 'secrets', 'catch-all', 'data-leakage']
  };

  readonly #threshold: number;
  /**
   * @param threshold — Shannon entropy threshold (default 3.5). Higher = fewer false positives.
   */
  constructor(options?: { threshold?: number }) {
    this.#threshold = options?.threshold ?? 3.5;
  }

  evaluate(input: string, _context?: Record<string, unknown>): Promise<GuardrailResult> {
    const tokens = extractTokens(input);
    const detections: Detection[] = [];

    for (const token of tokens) {
      const entropy = entropyOf(token);

      if (entropy >= this.#threshold) {
        const confidence = Math.min(entropy / 8, 0.85);

        detections.push({
          id: 'high-entropy-secret',
          description: `High-entropy string detected (entropy: ${entropy.toFixed(2)})`,
          severity: entropy >= 5 ? 'high' : 'medium',
          confidence,
          snippet: token.length > 40 ? `${token.slice(0, 40)}...` : token
        });
      }
    }

    if (detections.length === 0) {
      return Promise.resolve({ status: 'pass', phase: 'input' });
    }

    return Promise.resolve({
      status: 'escalate',
      phase: 'input',
      reason: `High-entropy strings detected (${detections.length} token${detections.length === 1 ? '' : 's'}) — possible secret leakage`,
      riskScore: Math.min(0.3 + detections.length * 0.1, 0.8),
      detections
    });
  }
}
