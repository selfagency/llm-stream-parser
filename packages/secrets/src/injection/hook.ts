/**
 * Pre-tool-call hook that resolves $CRED(...) tokens in tool arguments.
 *
 * This hook intercepts every PreToolCall event, scans `args` for $CRED(...)
 * tokens, resolves them through the CredentialBroker, and replaces the
 * original args (which contain the token) with resolved values before the
 * tool executes. The LLM's context never sees the raw secret.
 */

import type { PreToolCallEvent } from '@agentsy/runtime';
import type { CredentialBroker } from '../broker/index.js';
import { resolveCredentials } from './resolver.js';

/**
 * Options for creating the credential resolver hook.
 */
export interface CredentialResolverHookOptions {
  /** CredentialBroker instance used to issue and resolve tokens. */
  broker: CredentialBroker;
}

/**
 * Create a pre-tool-call hook that resolves $CRED(...) tokens.
 *
 * @param options - Hook options containing the CredentialBroker.
 * @returns A hook handler compatible with the runtime's pre-tool-call lifecycle.
 */
export function createCredentialResolverHook(
  options: CredentialResolverHookOptions
): (event: PreToolCallEvent) => Promise<{ continue: true; transform: unknown } | { continue: false; reason: string }> {
  const { broker } = options;

  return async (event: PreToolCallEvent) => {
    const argsStr = JSON.stringify(event.args);
    const context = {
      sessionId: event.sessionId,
      toolCallId: event.toolName,
      justification: `Resolve $CRED(...) tokens for tool "${event.toolName}"`
    };

    try {
      const [resolvedArgs] = await resolveCredentials(argsStr, broker, context);
      const parsed = JSON.parse(resolvedArgs) as unknown;
      return { continue: true, transform: parsed };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown credential resolution error';
      return {
        continue: false,
        reason: `Credential resolution failed for tool "${event.toolName}": ${reason}`
      };
    }
  };
}
