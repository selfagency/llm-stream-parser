import type { KeyringProvider, ProviderCapabilities } from '../types.js';

export interface AwsSmConfig {
  /** AWS region. */
  region?: string;
  /** Timeout in ms (default: 15_000). */
  timeout?: number;
}

/**
 * Create an AWS Secrets Manager keyring provider.
 *
 * Requires `@aws-sdk/client-secrets-manager` as an optional peer dependency.
 * Uses the AWS SDK credential chain (env, profile, IMDS, ECS).
 */
export function createAwsSmKeyring(config?: AwsSmConfig): KeyringProvider {
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
    const { SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
    const clientConfig: { region?: string } = {};
    if (config?.region) {
      clientConfig.region = config.region;
    }
    _client = new SecretsManagerClient(clientConfig);
    return _client;
  }

  return {
    id: 'aws-sm',
    name: 'AWS Secrets Manager',
    capabilities,
    resourceTypes: [],

    async check(resourceType: string): Promise<boolean> {
      try {
        const client = await getClient();
        const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
        await client.send(new GetSecretValueCommand({ SecretId: resourceType }), { requestTimeout: timeout });
        return true;
      } catch {
        return false;
      }
    },

    async resolve(resourceType: string): Promise<string> {
      const client = await getClient();
      const { GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const cmd = new GetSecretValueCommand({ SecretId: resourceType });
      const resp: { SecretString?: string } = await client.send(cmd, {
        requestTimeout: timeout
      });
      if (!resp.SecretString) {
        throw new Error(`AWS SM: no secret string for "${resourceType}"`);
      }
      return resp.SecretString;
    },

    async list(): Promise<string[]> {
      const client = await getClient();
      const { ListSecretsCommand } = await import('@aws-sdk/client-secrets-manager');
      const resp: { SecretList?: Array<{ Name?: string }> } = await client.send(new ListSecretsCommand({}), {
        requestTimeout: timeout
      });
      return (resp.SecretList ?? []).map(s => s.Name ?? '').filter(Boolean);
    }
  };
}
