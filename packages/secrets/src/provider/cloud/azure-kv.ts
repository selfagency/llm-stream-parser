import type { KeyringProvider, ProviderCapabilities } from '../types.js';

export interface AzureKvConfig {
  /** Timeout in ms (default: 15_000). */
  timeout?: number;
  /** Azure Key Vault URL (e.g., `https://myvault.vault.azure.net`). */
  vaultUrl?: string;
}

/**
 * Create an Azure Key Vault keyring provider.
 *
 * Requires `@azure/identity` and `@azure/keyvault-secrets` as optional
 * peer dependencies. Uses `DefaultAzureCredential` for auth (env, Azure CLI,
 * Managed Identity).
 */
export function createAzureKvKeyring(config?: AzureKvConfig): KeyringProvider {
  const vaultUrl = config?.vaultUrl ?? process.env.AZURE_KEY_VAULT_URL ?? '';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: false,
    canTtl: true
  };

  // biome-ignore lint/suspicious/noExplicitAny: cached SDK client, typed at call sites
  let _client: any;

  async function getClient() {
    if (_client) {
      return _client;
    }
    const { DefaultAzureCredential } = await import('@azure/identity');
    const { SecretClient } = await import('@azure/keyvault-secrets');
    const credential = new DefaultAzureCredential();
    _client = new SecretClient(vaultUrl, credential);
    return _client;
  }

  return {
    id: 'azure-kv',
    name: 'Azure Key Vault',
    capabilities,
    resourceTypes: [],

    async check(resourceType: string): Promise<boolean> {
      const client = await getClient();
      try {
        const secret = await client.getSecret(resourceType, {
          requestOptions: { timeout }
        });
        return !!secret?.value;
      } catch {
        return false;
      }
    },

    async resolve(resourceType: string): Promise<string> {
      const client = await getClient();
      const secret = await client.getSecret(resourceType, {
        requestOptions: { timeout }
      });
      if (!secret.value) {
        throw new Error(`Azure KV: no value for "${resourceType}"`);
      }
      return secret.value;
    },

    async list(): Promise<string[]> {
      const client = await getClient();
      const items: Array<{ name?: string }> = [];
      for await (const secret of client.listPropertiesOfSecrets()) {
        items.push(secret);
      }
      return items.map(s => s.name ?? '').filter(Boolean);
    }
  };
}
