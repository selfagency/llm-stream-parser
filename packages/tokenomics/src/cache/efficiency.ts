/**
 * Prompt cache efficiency tracking.
 *
 * Computes cache efficiency ratios and cost savings from provider
 * cache headers (Anthropic-style `x-cache` and `anthropic-cache-*`
 * headers, OpenAI-style cache read/write tokens).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Snapshot of cache efficiency for a single request or aggregated window.
 */
export interface CacheEfficiencySnapshot {
  /** Ratio of cache-hit tokens to total input tokens (0–1). */
  cacheEfficiency: number;
  /** Tokens served from the prompt cache (read). */
  cacheHitTokens: number;
  /** Tokens written to the prompt cache (create). */
  cacheWriteTokens: number;
  /** Estimated cost saved in USD from cache hits. */
  estimatedSavingsUsd: number;
  /** Input tokens consumed (total). */
  inputTokens: number;
}

/**
 * Parsed provider cache headers.
 */
export interface ProviderCacheHeaders {
  /** Tokens written to cache (Anthropic: `anthropic-cache-create-input-tokens`). */
  cacheCreateInputTokens?: number | undefined;
  /** Tokens read from cache (Anthropic: `anthropic-cache-read-input-tokens`). */
  cacheReadInputTokens?: number | undefined;
  /** Cache result indicator: "hit", "miss", or undefined. */
  cacheResult?: 'hit' | 'miss' | undefined;
  /** Raw header map for forward-compatibility. */
  raw: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default cost per input token (USD) used when no price is provided.
 * Based on Claude 3.5 Sonnet pricing (~$3/M input tokens).
 */
const DEFAULT_INPUT_PRICE_PER_TOKEN = 0.000_003;

// ---------------------------------------------------------------------------
// Efficiency computation
// ---------------------------------------------------------------------------

/**
 * Compute cache efficiency metrics from token counts.
 *
 * @param inputTokens  Total input tokens for the request.
 * @param cacheHitTokens  Tokens served from cache (read).
 * @param cacheWriteTokens  Tokens written to cache (create).
 * @param inputPricePerToken  Cost per input token in USD (optional).
 * @returns A `CacheEfficiencySnapshot` with computed metrics.
 */
export function computeCacheEfficiency(
  inputTokens: number,
  cacheHitTokens: number,
  cacheWriteTokens: number,
  inputPricePerToken?: number
): CacheEfficiencySnapshot {
  const price = inputPricePerToken ?? DEFAULT_INPUT_PRICE_PER_TOKEN;
  const totalInput = inputTokens + cacheWriteTokens;
  const efficiency = totalInput > 0 ? cacheHitTokens / totalInput : 0;

  return {
    inputTokens,
    cacheHitTokens,
    cacheWriteTokens,
    cacheEfficiency: Math.min(1, Math.max(0, efficiency)),
    estimatedSavingsUsd: cacheHitTokens * price
  };
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

/**
 * Parse provider cache headers from a response headers object.
 *
 * Supports:
 * - Anthropic: `x-cache` (hit/miss), `anthropic-cache-read-input-tokens`,
 *   `anthropic-cache-create-input-tokens`
 * - OpenAI: `x-cache` (hit/miss), `x-cache-read-input-tokens`,
 *   `x-cache-write-input-tokens`
 *
 * @param headers  A record of response headers (lowercased keys).
 * @returns A `ProviderCacheHeaders` with parsed values.
 */
export function parseProviderCacheHeaders(headers: Record<string, string>): ProviderCacheHeaders {
  // Null-prototype objects prevent prototype pollution via header keys
  const raw: Record<string, string> = Object.create(null) as Record<string, string>;
  const lower: Record<string, string> = Object.create(null) as Record<string, string>;

  for (const [key, value] of Object.entries(headers)) {
    const lk = key.toLowerCase();
    lower[lk] = value;
    raw[key] = value;
  }

  // Parse cache result from x-cache header
  const xCache = lower['x-cache'];
  let cacheResult: 'hit' | 'miss' | undefined;
  if (xCache) {
    const trimmed = xCache.trim().toLowerCase();
    if (trimmed.startsWith('hit')) {
      cacheResult = 'hit';
    } else if (trimmed.startsWith('miss')) {
      cacheResult = 'miss';
    }
  }

  // Parse Anthropic-style cache token headers
  const cacheReadInputTokens = parseOptionalInt(
    lower['anthropic-cache-read-input-tokens'] ?? lower['x-cache-read-input-tokens']
  );
  const cacheCreateInputTokens = parseOptionalInt(
    lower['anthropic-cache-create-input-tokens'] ?? lower['x-cache-write-input-tokens']
  );

  return {
    cacheResult,
    cacheReadInputTokens,
    cacheCreateInputTokens,
    raw
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an optional integer from a string, returning undefined for
 * missing or invalid values.
 */
function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
