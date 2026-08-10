// @agentsy/secrets — Secure secret store, varlock, and keytar integration
// For broader roadmap context, see plan/MASTER-IMPLEMENTATION-PLAN.md.

export interface SecretStore {
  deleteSecret(key: string): boolean;
  getSecret(key: string): string | undefined;
  setSecret(key: string, value: string): void;
}

export const createSecretStore = (): SecretStore => {
  const secrets = new Map<string, string>();

  return {
    deleteSecret(key) {
      return secrets.delete(key);
    },
    getSecret(key) {
      return secrets.get(key);
    },
    setSecret(key, value) {
      secrets.set(key, value);
    }
  };
};

// Broker
export type { Keyring } from './broker/index.js';
export { CredentialBroker, InMemoryKeyring } from './broker/index.js';
export type { AuditEntry, CredentialRequest, IssuedCredential, ResourceType } from './broker/types.js';
export { MissingCredentialError } from './broker/types.js';
export { discoverConfigPath, loadConfig } from './config/loader.js';
// Config (B2)
export type { SecretsConfig } from './config/schema.js';
export { secretsConfigSchema } from './config/schema.js';
// Detection
export type { SecretMatch } from './detection/index.js';
export { createSecretDetectionHook, detectSecrets, redactSecrets } from './detection/index.js';
// Injection (B1)
export { ExpiredCredentialError, MalformedTokenError, UnresolvedCredentialError } from './injection/error.js';
export {
  type CredentialResolverHookOptions,
  createCredentialResolverHook
} from './injection/hook.js';
export { resolveCredentials } from './injection/resolver.js';
export type { ResolutionContext, ResolvedSecret, SecretToken } from './injection/types.js';
export { parseSecretTokens } from './injection/types.js';
// Cloud providers (B4)
export type {
  AwsSmConfig,
  AzureKvConfig,
  DopplerConfig,
  GcpSmConfig,
  InfisicalConfig,
  VaultConfig
} from './provider/cloud/index.js';
export {
  createAwsSmKeyring,
  createAzureKvKeyring,
  createDopplerKeyring,
  createGcpSmKeyring,
  createInfisicalKeyring,
  createVaultKeyring
} from './provider/cloud/index.js';
export type {
  ApplePMConfig,
  BitwardenConfig,
  DashlaneConfig,
  LastPassConfig,
  OnePasswordConfig
} from './provider/local/index.js';
// Local CLI providers (B3)
export {
  createApplePMKeyring,
  createBitwardenKeyring,
  createDashlaneKeyring,
  createLastPassKeyring,
  createOnePasswordKeyring
} from './provider/local/index.js';
export { ProviderRegistry } from './provider/registry.js';
// Provider (B2)
export type { KeyringProvider, ProviderCapabilities, ProviderHealth } from './provider/types.js';
