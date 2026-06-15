import type { KeyringProvider, ProviderCapabilities } from '../types.js';

export interface GcpSmConfig {
  /** GCP project ID. */
  project?: string;
  /** Timeout in ms (default: 15_000). */
  timeout?: number;
}

/**
 * Create a GCP Secret Manager keyring provider.
 *
 * Requires `@google-cloud/secret-manager` as an optional peer dependency.
 * Uses Application Default Credentials (ADC).
 */
export function createGcpSmKeyring(config?: GcpSmConfig): KeyringProvider {
  const project = config?.project ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? '';
  const _timeout = config?.timeout ?? 15_000;

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
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    _client = new SecretManagerServiceClient();
    return _client;
  }

  return {
    id: 'gcp-sm',
    name: 'GCP Secret Manager',
    capabilities,
    resourceTypes: [],

    async check(resourceType: string): Promise<boolean> {
      try {
        const client = await getClient();
        const [version] = await client.accessSecretVersion({
          name: `projects/${project}/secrets/${resourceType}/versions/latest`
        });
        return !!version?.payload?.data;
      } catch {
        return false;
      }
    },

    async resolve(resourceType: string): Promise<string> {
      const client = await getClient();
      const [version] = await client.accessSecretVersion({
        name: `projects/${project}/secrets/${resourceType}/versions/latest`
      });
      const data = version?.payload?.data;
      if (!data) {
        throw new Error(`GCP SM: no data for "${resourceType}"`);
      }
      return data.toString();
    },

    async list(): Promise<string[]> {
      const client = await getClient();
      const [secrets] = await client.listSecrets({
        parent: `projects/${project}`
      });
      return secrets
        .map((s: { name?: string }) => {
          const parts = (s.name ?? '').split('/');
          return parts.at(-1) ?? '';
        })
        .filter(Boolean);
    }
  };
}
