/**
 * UntrustedContentEnvelope — Phase 10 §15.8
 *
 * Wraps untrusted content with source metadata, trust scoring, and
 * sink information. Enables source-aware sanitization decisions.
 *
 * Content enters the agent from multiple surfaces:
 * - `web`: scraped/retrieved web pages
 * - `mcp`: MCP server responses
 * - `http_fetch`: fetch tool responses
 * - `model_output`: model-generated content being re-processed
 * - `tool_result`: non-HTTP tool execution results
 * - `user_input`: direct user messages
 * - `internal`: agent's own state/synthesis
 */

/** Source that produced the content. */
export type ContentSource = 'web' | 'mcp' | 'http_fetch' | 'model_output' | 'tool_result' | 'user_input' | 'internal';

/**
 * Describes the trustworthiness of untrusted content.
 *
 * - `trusted`: internal/verified — minimal sanitization needed
 * - `low`: low-trust external (e.g., arbitrary web pages, unverified MCP)
 * - `medium`: moderate trust (e.g., configured MCP servers, known APIs)
 * - `untrusted`: fully untrusted — aggressive sanitization
 */
export type TrustLevel = 'trusted' | 'low' | 'medium' | 'untrusted';

/** Source-to-trust-level mapping. */
const TRUST_BY_SOURCE: Record<ContentSource, TrustLevel> = {
  web: 'untrusted',
  mcp: 'medium',
  http_fetch: 'low',
  model_output: 'medium',
  tool_result: 'medium',
  user_input: 'low',
  internal: 'trusted'
};

/**
 * Returns the default trust level for a given content source.
 */
export function defaultTrustLevel(source: ContentSource): TrustLevel {
  return TRUST_BY_SOURCE[source];
}

/**
 * Envelope wrapping untrusted content with provenance metadata.
 */
export interface UntrustedContentEnvelope {
  /** The raw content payload. */
  readonly content: string;
  /** Optional additional context (URL, tool name, etc.). */
  readonly metadata?: Record<string, unknown>;
  /** ISO 8601 timestamp when the content was received. */
  readonly receivedAt: string;
  /** Where the content is being forwarded (if known). */
  readonly sink?: string;
  /** Raw byte size of the content. */
  readonly sizeBytes: number;
  /** Where the content originated. */
  readonly source: ContentSource;
  /** Human-readable trust level label. */
  readonly trustLevel: TrustLevel;
  /** Numeric trust score (0 = fully untrusted, 1 = fully trusted). */
  readonly trustScore: number;
}

/**
 * Create an UntrustedContentEnvelope from raw content and source info.
 *
 * @param content — Raw content to wrap.
 * @param source — Content source.
 * @param overrides — Optional overrides for trustScore, metadata, sink.
 */
export function createUntrustedContentEnvelope(
  content: string,
  source: ContentSource,
  overrides?: { trustScore?: number; metadata?: Record<string, unknown>; sink?: string }
): UntrustedContentEnvelope {
  const trustLevel = defaultTrustLevel(source);
  const TRUST_SCORE_MAP: Record<TrustLevel, number> = {
    trusted: 1,
    medium: 0.7,
    low: 0.3,
    untrusted: 0.1
  };
  const defaultTrustScore = TRUST_SCORE_MAP[trustLevel];

  return {
    content,
    source,
    trustScore: overrides?.trustScore ?? defaultTrustScore,
    trustLevel,
    metadata: overrides?.metadata,
    sink: overrides?.sink,
    receivedAt: new Date().toISOString(),
    sizeBytes: new TextEncoder().encode(content).length
  };
}

/**
 * Sanitization level determined by trust level.
 */
export type SanitizationLevel = 'none' | 'light' | 'moderate' | 'aggressive';

/**
 * Determine sanitization aggressiveness based on trust level.
 */
export function sanitizationLevel(trustLevel: TrustLevel): SanitizationLevel {
  switch (trustLevel) {
    case 'trusted':
      return 'none';
    case 'medium':
      return 'light';
    case 'low':
      return 'moderate';
    case 'untrusted':
      return 'aggressive';
    default:
      return 'aggressive';
  }
}
/**
 * Whether the content should be quarantined based on trust level.
 *
 * Untrusted content always requires quarantine. Low trust content
 * only requires quarantine if flagged by a scanner.
 */
export function requiresQuarantine(trustLevel: TrustLevel): boolean {
  return trustLevel === 'untrusted';
}
