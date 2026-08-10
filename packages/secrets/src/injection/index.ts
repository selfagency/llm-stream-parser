/**
 * @agentsy/secrets/injection — $CRED(...) token parsing and resolution.
 */

export { ExpiredCredentialError, MalformedTokenError, UnresolvedCredentialError } from './error.js';
export type { CredentialResolverHookOptions } from './hook.js';
export { createCredentialResolverHook } from './hook.js';
export { resolveCredentials } from './resolver.js';
export type { ResolutionContext, ResolvedSecret, SecretToken } from './types.js';
export { CRED_TOKEN_PATTERN, parseSecretTokens } from './types.js';
