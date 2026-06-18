/**
 * Streaming secrets filter — masks secrets across chunk boundaries.
 *
 * Unlike the Phase 0 `SecretDetectionScanner` which operates on complete
 * strings, this filter is stateful: it maintains a buffer that spans chunk
 * boundaries so a secret split across two chunks is caught and masked.
 *
 * Uses the same pattern categories as `@agentsy/guardrails/src/secret-detection.ts`
 * but self-contained to avoid a direct dependency on the guardrails package.
 *
 * @module
 */

// ── Secret pattern definitions ─────────────────────────

export interface SecretPattern {
  confidence: number;
  id: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * AI/LLM provider API key patterns.
 */
const AI_PATTERNS: SecretPattern[] = [
  {
    pattern: /\b(?:sk|sk-proj|sk-svcacct|sk-user|sk-ant|sk-live|sk-test|org)-[A-Za-z0-9]{20,}\b/g,
    id: 'openai-api-key',
    severity: 'critical',
    confidence: 0.95
  },
  { pattern: /\bsk-ant-[A-Za-z0-9]{40,}\b/g, id: 'anthropic-api-key', severity: 'critical', confidence: 0.95 },
  { pattern: /\bAIza[0-9A-Za-z_-]{35,}\b/g, id: 'google-api-key', severity: 'high', confidence: 0.85 },
  { pattern: /\bhf_[A-Za-z0-9]{20,}\b/g, id: 'huggingface-token', severity: 'high', confidence: 0.9 },
  { pattern: /\br8_[A-Za-z0-9]{20,}\b/g, id: 'replicate-api-token', severity: 'high', confidence: 0.9 },
  { pattern: /\bcohere-[A-Za-z0-9]{30,}\b/g, id: 'cohere-api-key', severity: 'high', confidence: 0.85 },
  { pattern: /\bgsk_[A-Za-z0-9]{20,}\b/g, id: 'groq-api-key', severity: 'high', confidence: 0.85 }
];

/**
 * Cloud provider credential patterns.
 */
const CLOUD_PATTERNS: SecretPattern[] = [
  { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g, id: 'aws-access-key', severity: 'critical', confidence: 0.95 },
  { pattern: /gh[ps]_[A-Za-z0-9]{36,}/g, id: 'github-token', severity: 'critical', confidence: 0.95 },
  { pattern: /glpat-[A-Za-z0-9_-]{20,}/g, id: 'gitlab-token', severity: 'critical', confidence: 0.95 },
  { pattern: /xox[baprs]-[A-Za-z0-9]{10,}/g, id: 'slack-token', severity: 'critical', confidence: 0.95 },
  { pattern: /sk_live_[A-Za-z0-9]{20,}/g, id: 'stripe-live-key', severity: 'critical', confidence: 0.95 }
];

/**
 * Authorization token patterns.
 */
const AUTH_PATTERNS: SecretPattern[] = [
  {
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    id: 'jwt-token',
    severity: 'high',
    confidence: 0.8
  },
  {
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/g,
    id: 'private-key',
    severity: 'critical',
    confidence: 0.95
  }
];

/**
 * Database connection string patterns.
 */
const DB_PATTERNS: SecretPattern[] = [
  {
    pattern: /postgres(?:ql)?:\/\/[\w%]+:[^@\s]+@[\w.-]+:\d+\/\w+/g,
    id: 'postgres-connection-string',
    severity: 'critical',
    confidence: 0.9
  },
  {
    pattern: /mysql:\/\/[\w%]+:[^@\s]+@[\w.-]+:\d+\/\w+/g,
    id: 'mysql-connection-string',
    severity: 'critical',
    confidence: 0.9
  },
  {
    pattern: /mongodb(?:\+srv)?:\/\/[A-Za-z0-9_%]+:[^@\s]+@[A-Za-z0-9.-]+\/[A-Za-z0-9_?=&]+/g,
    id: 'mongodb-connection-string',
    severity: 'critical',
    confidence: 0.9
  }
];

/** Combined pattern list — all categories concatenated. */
const ALL_PATTERNS: SecretPattern[] = [...AI_PATTERNS, ...CLOUD_PATTERNS, ...AUTH_PATTERNS, ...DB_PATTERNS];

// ── Masking helpers ────────────────────────────────────

const MASK_PLACEHOLDER = '[REDACTED]';

function maskMatches(input: string, matches: { 0: string; index?: number }[]): string {
  // Sort by position descending so replacements don't shift offsets
  const sorted = [...matches].sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  let result = input;
  for (const m of sorted) {
    if (m.index !== undefined) {
      result = result.slice(0, m.index) + MASK_PLACEHOLDER + result.slice(m.index + m[0].length);
    }
  }
  return result;
}

// ── StreamingSecretsFilter ──────────────────────────────

export interface StreamingSecretsFilterOptions {
  /**
   * Optional extra patterns beyond the built-in set.
   */
  extraPatterns?: SecretPattern[];
  /**
   * How many trailing characters to keep in the buffer between chunks
   * to catch secrets split across boundaries. Defaults to 100.
   */
  maxSecretLength?: number;
}

/**
 * Stateful filter that masks secrets across streaming chunk boundaries.
 *
 * Usage:
 * ```ts
 * const filter = new StreamingSecretsFilter();
 * for await (const chunk of source) {
 *   const masked = filter.feed(chunk);
 *   if (masked) output(masked);
 * }
 * const remainder = filter.flush();
 * if (remainder) output(remainder);
 * ```
 */
export class StreamingSecretsFilter {
  private buffer = '';
  private readonly maxSecretLength: number;
  private readonly patterns: SecretPattern[];

  constructor(options: StreamingSecretsFilterOptions = {}) {
    this.maxSecretLength = options.maxSecretLength ?? 100;
    this.patterns = options.extraPatterns ? [...ALL_PATTERNS, ...options.extraPatterns] : ALL_PATTERNS;
  }

  /**
   * Process a chunk of text. Returns a chunk with any secrets masked,
   * keeping enough trailing text in the buffer to catch split secrets.
   *
   * Returns `null` when the chunk emitted nothing (all text stayed in
   * the boundary buffer).
   */
  feed(chunk: string): string | null {
    this.buffer += chunk;
    const result = this.maskInternal(this.buffer);
    const keepLen = this.maxSecretLength;
    const emitLen = Math.max(0, result.length - keepLen);
    if (emitLen === 0) {
      return null;
    }
    // Don't split a [REDACTED] placeholder — extend the keep region
    // backwards to include any partial placeholder at the boundary.
    const placeholder = MASK_PLACEHOLDER;
    const boundaryStart = Math.max(0, emitLen - placeholder.length * 2);
    const nearBoundary = result.slice(boundaryStart, emitLen + placeholder.length);
    const splitIdx = nearBoundary.lastIndexOf(placeholder);
    const adjustedEmitLen = splitIdx >= 0 ? boundaryStart + splitIdx + placeholder.length : emitLen;

    const emit = result.slice(0, adjustedEmitLen);
    this.buffer = result.slice(adjustedEmitLen);
    return emit;
  }

  /**
   * Flush any remaining buffered text. Returns `null` if nothing remains.
   */
  flush(): string | null {
    if (!this.buffer) {
      return null;
    }
    const result = this.maskInternal(this.buffer);
    this.buffer = '';
    return result || null;
  }

  /**
   * Reset the internal buffer (e.g., when a new stream starts).
   */
  reset(): void {
    this.buffer = '';
  }

  /**
   * Internal: apply all patterns to the accumulated text and return
   * the masked result.
   */
  private maskInternal(input: string): string {
    let result = input;
    for (const entry of this.patterns) {
      const regex = entry.pattern;
      // Reset global regex state before each run
      regex.lastIndex = 0;
      const matches: { 0: string; index?: number }[] = [];
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard exec loop with global regex
      while ((m = regex.exec(input)) !== null) {
        matches.push(m);
      }
      if (matches.length > 0) {
        result = maskMatches(result, matches);
      }
    }
    return result;
  }
}
