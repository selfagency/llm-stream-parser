/**
 * Error types for the $CRED(...) token injection subsystem.
 *
 * These are distinct from MissingCredentialError (broker-level) because
 * they carry token-parsing context: the raw token text, position in the
 * source string, and the specific resolution failure reason.
 */

/** Thrown when a $CRED(...) token cannot be resolved. */
export class UnresolvedCredentialError extends Error {
  public override readonly name = 'UnresolvedCredentialError';
  /** The raw token text (e.g. '$CRED(missing_resource)'). */
  public readonly token: string;

  constructor(token: string, reason: string) {
    super(`Cannot resolve ${token}: ${reason}`);
    this.token = token;
  }
}

/** Thrown when a resolved credential has expired by the time of use. */
export class ExpiredCredentialError extends Error {
  public override readonly name = 'ExpiredCredentialError';
  /** The resource type that expired. */
  public readonly resourceType: string;
  /** The credential ID that expired. */
  public readonly credentialId: string | undefined;

  constructor(resourceType: string, credentialId?: string) {
    const suffix = credentialId ? ` (credential ${credentialId})` : '';
    super(`Credential for "${resourceType}" has expired${suffix}`);
    this.resourceType = resourceType;
    this.credentialId = credentialId;
  }
}

/** Thrown when a $CRED(...) token is syntactically malformed. */
export class MalformedTokenError extends Error {
  public override readonly name = 'MalformedTokenError';
  /** The offending input fragment. */
  public readonly raw: string;
  /** Position in the source string (0-based index). */
  public readonly position: number;

  constructor(raw: string, position: number) {
    super(`Malformed token at position ${position}: "${raw}"`);
    this.raw = raw;
    this.position = position;
  }
}
