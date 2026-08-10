/**
 * Types for the KeyringProvider interface and provider metadata.
 *
 * A KeyringProvider wraps a secret-storage backend (1Password CLI, Vault,
 * AWS Secrets Manager, etc.) behind a uniform resolution interface.
 */

/** Provider capability flags. */
export interface ProviderCapabilities {
  /** Can this provider list available resource types? */
  canList: boolean;
  /** Does this provider support explicit sync/refresh? */
  canSync: boolean;
  /** Does this provider support TTL-aware or dynamic secrets? */
  canTtl: boolean;
}

/** Health check result for a provider. */
export interface ProviderHealth {
  /** Error thrown (present only when !ok). */
  error?: Error;
  /** Human-readable status detail. */
  message: string;
  /** Whether the provider is reachable and authenticated. */
  ok: boolean;
}

/**
 * KeyringProvider interface.
 *
 * Every secret-storage backend implements this interface so the
 * CredentialBroker can resolve secrets through a uniform API.
 */
export interface KeyringProvider {
  /** Provider capability flags. */
  readonly capabilities: ProviderCapabilities;

  /**
   * Check if a specific resource type is available via this provider.
   * Returns `false` (no-throw) for missing or unreachable resources.
   */
  check(resourceType: string): Promise<boolean>;

  /** Optional: check provider health. */
  health?(): Promise<ProviderHealth>;
  /** Unique provider identifier (e.g., '1password', 'aws-sm'). */
  readonly id: string;

  /** List all available resource types this provider can resolve. */
  list(): Promise<string[]>;

  /** Human-readable name. */
  readonly name: string;

  /**
   * Resolve the raw secret value for a resource type.
   * Throws if the resource is unavailable or the provider unreachable.
   */
  resolve(resourceType: string): Promise<string>;

  /** Resource types this provider claims (from config or auto-detection). */
  resourceTypes: string[];

  /** Optional: synchronize/refresh local cache (e.g., `op sync`). */
  sync?(): Promise<void>;
}
