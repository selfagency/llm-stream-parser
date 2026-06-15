// Type stubs for optional cloud SDK peer dependencies.
// These are dynamically imported at runtime; actual types come from the SDK packages
// when installed. These stubs let tests and consumers compile without the SDKs.

declare module '@aws-sdk/client-secrets-manager' {
  export class SecretsManagerClient {
    constructor(config?: { region?: string });
    send(command: unknown, options?: { requestTimeout?: number }): Promise<unknown>;
  }
  export class GetSecretValueCommand {
    constructor(args: { SecretId: string });
  }
  export class ListSecretsCommand {
    constructor(args: Record<string, unknown>);
  }
}

declare module '@azure/identity' {
  export class DefaultAzureCredential {
    constructor();
  }
}

declare module '@azure/keyvault-secrets' {
  import type { DefaultAzureCredential } from '@azure/identity';

  export class SecretClient {
    constructor(vaultUrl: string, credential: DefaultAzureCredential);
    getSecret(name: string, opts?: { requestOptions?: { timeout?: number } }): Promise<{ value?: string }>;
    listPropertiesOfSecrets(): AsyncIterableIterator<{ name?: string }>;
  }
}

declare module '@google-cloud/secret-manager' {
  export class SecretManagerServiceClient {
    constructor();
    accessSecretVersion(args: { name: string }): Promise<[{ payload?: { data?: Buffer } }]>;
    listSecrets(args: { parent: string }): Promise<[Array<{ name?: string }>]>;
  }
}
