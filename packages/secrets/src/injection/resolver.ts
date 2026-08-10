/**
 * Credential token resolver.
 *
 * Scans a string for `$CRED(...)` tokens, resolves each one through the
 * CredentialBroker, and replaces them with their raw secret values.
 * The original tokens (what the LLM sees) are never the raw values.
 */

import type { CredentialBroker } from '../broker/index.js';
import type { IssuedCredential } from '../broker/types.js';
import { UnresolvedCredentialError } from './error.js';
import type { ResolutionContext, ResolvedSecret, SecretToken } from './types.js';
import { parseSecretTokens } from './types.js';

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve all `$CRED(...)` tokens in `input` through the given broker.
 *
 * For each unique token (by `raw` text), the broker is called once to
 * `issue()` a credential, which is then `resolve()`d to get the raw value.
 * The resolved value replaces the token in the output string.
 *
 * @param input    - String potentially containing `$CRED(...)` tokens.
 * @param broker   - CredentialBroker instance.
 * @param context  - Resolution context (sessionId, toolCallId, justification).
 * @returns A tuple of [resolvedString, resolvedSecrets].
 */
export async function resolveCredentials(
  input: string,
  broker: CredentialBroker,
  context: ResolutionContext
): Promise<[string, Map<string, ResolvedSecret>]> {
  const tokens = parseSecretTokens(input);

  if (tokens.length === 0) {
    return [input, new Map()];
  }

  const resolvedSecrets = new Map<string, ResolvedSecret>();
  const replacements = new Map<number, string>();

  for (const token of tokens) {
    // Skip if this exact raw token was already resolved (same text, same secret)
    // Use raw as cache key since same $CRED(foo) always resolves to same broker value
    const cached = resolvedSecrets.get(token.raw);
    if (cached) {
      replacements.set(token.start, cached.value);
      continue;
    }

    const credential = await issueCredential(token, broker, context);

    try {
      const rawValue = await broker.resolve(credential.id);

      const resolved: ResolvedSecret = {
        value: rawValue,
        resourceType: token.resourceType,
        credentialId: credential.id,
        expiresAt: credential.expiresAt
      };

      resolvedSecrets.set(token.raw, resolved);
      replacements.set(token.start, rawValue);
    } catch (error) {
      throw new UnresolvedCredentialError(
        token.raw,
        error instanceof Error ? error.message : 'Unknown resolution error'
      );
    }
  }

  // Build the output string by replacing tokens left-to-right.
  // Iterate backwards so earlier indices remain valid.
  const sortedStarts = [...replacements.keys()].sort((a, b) => b - a);
  let result = input;

  // Build a lookup map: start position → token.
  const tokenByStart = new Map(tokens.map(t => [t.start, t]));

  for (const start of sortedStarts) {
    const value = replacements.get(start) as string;
    const token = tokenByStart.get(start) as SecretToken;
    result = result.slice(0, start) + value + result.slice(token.end);
  }

  return [result, resolvedSecrets];
}

/**
 * Issue a credential from the broker for a single token.
 */
async function issueCredential(
  token: SecretToken,
  broker: CredentialBroker,
  context: ResolutionContext
): Promise<IssuedCredential> {
  const resourceType = token.field ? `${token.resourceType}:${token.field}` : token.resourceType;

  // Check availability first (soft check — issue does its own check too)
  const available = await broker.check(resourceType);
  if (!available) {
    throw new UnresolvedCredentialError(token.raw, `No provider can resolve resource type "${resourceType}"`);
  }

  return broker.issue({
    resourceType,
    sessionId: context.sessionId,
    ...(context.toolCallId ? { toolCallId: context.toolCallId } : {}),
    justification: context.justification ?? `Resolve $CRED(${resourceType})`,
    requestedScopes: [resourceType]
  });
}
