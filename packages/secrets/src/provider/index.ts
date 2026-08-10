/**
 * @agentsy/secrets/provider — Provider interface and registry.
 */

export type {
  AwsSmConfig,
  AzureKvConfig,
  DopplerConfig,
  GcpSmConfig,
  InfisicalConfig,
  VaultConfig
} from './cloud/index.js';
// Cloud SDK providers (B4)
export {
  createAwsSmKeyring,
  createAzureKvKeyring,
  createDopplerKeyring,
  createGcpSmKeyring,
  createInfisicalKeyring,
  createVaultKeyring
} from './cloud/index.js';
// Local CLI providers
export { createOnePasswordKeyring, type OnePasswordConfig } from './local/1password.js';
export { type ApplePMConfig, createApplePMKeyring } from './local/apple-pm.js';
export { type BitwardenConfig, createBitwardenKeyring } from './local/bitwarden.js';
export { createDashlaneKeyring, type DashlaneConfig } from './local/dashlane.js';
export { cliNotFoundError, type ExecResult, isCliInstalled, runCli } from './local/exec.js';
export { createLastPassKeyring, type LastPassConfig } from './local/lastpass.js';
export { ProviderRegistry } from './registry.js';
export type { KeyringProvider, ProviderCapabilities, ProviderHealth } from './types.js';
