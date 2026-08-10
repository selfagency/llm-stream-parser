/**
 * Types and parser for the $CRED(...) secret injection token format.
 *
 * # Token Format
 *
 * ```
 * $CRED(<resourceType>[:<field>])
 * ```
 *
 * | Form | Example | Meaning |
 * |------|---------|---------|
 * | Simple | `$CRED(vercel_prod)` | Resolve the default field for `vercel_prod` |
 * | Field-qualified | `$CRED(database:password)` | Resolve specific field `password` on `database` |
 * | Versioned | `$CRED(aws_credentials:v1)` | Pin to a specific version/iteration |
 *
 * Tokens are case-sensitive, alphanumeric + underscore + hyphen.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed $CRED(...) token. */
export interface SecretToken {
  /** 0-based end position (exclusive) in the source string. */
  end: number;
  /** Optional field within the resource (e.g. 'password'). */
  field?: string;
  /** The full matched token text including delimiters (e.g. '$CRED(database:password)'). */
  raw: string;
  /** The resource type (e.g. 'vercel_prod', 'database'). */
  resourceType: string;
  /** 0-based start position in the source string. */
  start: number;
}

/** Context passed to the resolution pipeline. */
export interface ResolutionContext {
  /** Human-readable justification for the credential request. */
  justification?: string;
  /** Current session identifier. */
  sessionId: string;
  /** ID of the tool call being resolved (if applicable). */
  toolCallId?: string;
}

/** The result of resolving one $CRED(...) token. */
export interface ResolvedSecret {
  /** Broker-issued credential ID (for audit trail). */
  credentialId: string;
  /** When the credential expires. */
  expiresAt: Date;
  /** Which resource type was resolved. */
  resourceType: string;
  /** The resolved raw secret value. */
  value: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Regex that matches `$CRED(resourceType:field?)` tokens.
 *
 * Breakdown:
 *   \$CRED\(    — literal "$CRED("
 *   ([a-zA-Z0-9_-]+)    — resource type (one or more alphanum / underscore / hyphen)
 *   (?::([a-zA-Z0-9_-]+))?  — optional ":field" suffix
 *   \)           — literal ")"
 *
 * @internal Exported for testing only.
 */
export const CRED_TOKEN_PATTERN = /\$CRED\(([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?\)/g;

/**
 * Extract all `$CRED(...)` tokens from a string.
 *
 * Returns an ordered list of parsed tokens. Duplicates are preserved as
 * separate entries so each occurrence can be resolved independently.
 *
 * @param text - The string to scan.
 * @returns An array of parsed `SecretToken` objects.
 */
export function parseSecretTokens(text: string): SecretToken[] {
  const tokens: SecretToken[] = [];

  // Reset lastIndex for safety — the regex is global but may have been
  // used previously.
  CRED_TOKEN_PATTERN.lastIndex = 0;

  const results = text.matchAll(CRED_TOKEN_PATTERN);

  for (const match of results) {
    const resourceType = match[1] as string;
    const field = match[2] ?? undefined;

    tokens.push({
      resourceType,
      ...(field === undefined ? {} : { field }),
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return tokens;
}
