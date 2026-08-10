# @agentsy/secrets

Secret-management abstractions for provider credentials and secure config.

## Status

Internal package; API surface is intentionally conservative.

## Architecture

```text
@agentsy/secrets
├── broker/          Credential lifecycle (issue/resolve/revoke/expire)
│   ├── CredentialBroker   Short-lived encrypted credentials
│   ├── InMemoryKeyring    Volatile key-value backing store
│   └── AuditEntry         Immutable audit log for all credential access
├── detection/       Secret pattern detection and redaction
│   ├── detectSecrets      Regex-based detection of known secret patterns
│   ├── redactSecrets      Replace detected secrets with [REDACTED] labels
│   └── createSecretDetectionHook  Post-tool-call hook for tool output
├── injection/       $CRED(...) token parsing and resolution
│   ├── parseSecretTokens  Parse $CRED(resource) tokens from strings
│   ├── resolveCredentials Substitute tokens via CredentialBroker
│   └── createCredentialResolverHook  Pre-tool-call hook for token resolution
├── provider/        KeyringProvider interface + backends
│   ├── types.ts           KeyringProvider, ProviderCapabilities, ProviderHealth
│   ├── registry.ts        ProviderRegistry — register, findForResource, resolve
│   ├── local/             5 local CLI providers
│   │   ├── 1password      1Password CLI (op)
│   │   ├── bitwarden      Bitwarden CLI (bw)
│   │   ├── dashlane       Dashlane CLI (dcli)
│   │   ├── lastpass       LastPass CLI (lpass)
│   │   └── apple-pm       Apple Passwords (system-saved credentials)
│   └── cloud/             6 cloud SDK providers
│       ├── doppler        Doppler API
│       ├── infisical      Infisical SDK
│       ├── vault          HashiCorp Vault (CLI + HTTP API)
│       ├── aws-sm         AWS Secrets Manager
│       ├── gcp-sm         GCP Secret Manager
│       └── azure-kv       Azure Key Vault
└── config/          Configuration schema + loader
    ├── schema.ts          Zod schema for .agentsy/secrets.yaml
    └── loader.ts          3-level config discovery
```

## Usage

### Basic secret resolution (in-memory)

```typescript
import { CredentialBroker, InMemoryKeyring } from '@agentsy/secrets';

const keyring = new InMemoryKeyring();
keyring.set('github', 'ghp_secret_42');
const broker = new CredentialBroker({ keyring, defaultTtlSeconds: 300 });

const cred = await broker.issue({
  sessionId: 'sess_001',
  resourceType: 'github',
  requestedScopes: ['repo'],
  justification: 'push to main'
});
const token = await broker.resolve(cred.id);
```

### $CRED(...) token resolution

```typescript
import { CredentialBroker, InMemoryKeyring } from '@agentsy/secrets';
import { resolveCredentials } from '@agentsy/secrets/injection';

const keyring = new InMemoryKeyring();
keyring.set('vercel_prod', 'vct_abc123');
const broker = new CredentialBroker({ keyring });

const [resolved, secrets] = await resolveCredentials(
  'deploy --token $CRED(vercel_prod)',
  broker,
  { sessionId: 'sess_001', justification: 'deploy' }
);
// resolved:  'deploy --token vct_abc123'
// secrets:   Map { '$CRED(vercel_prod)' => { value: 'vct_abc123', ... } }
```

### Using a local provider

```typescript
import { ProviderRegistry } from '@agentsy/secrets';
import { createOnePasswordKeyring } from '@agentsy/secrets/provider';

const registry = new ProviderRegistry();
registry.register(createOnePasswordKeyring());

const value = await registry.resolve('github');
// Resolves via `op read op://Personal/github/credential`
```

### Using multiple providers with fallback

```typescript
const registry = new ProviderRegistry();
registry.register(createOnePasswordKeyring());
registry.register(createDopplerKeyring({ token: process.env.DOPPLER_TOKEN }));

const items = await registry.listAll();
// => [{ resourceType: 'github', providerId: '1password' },
//     { resourceType: 'vercel', providerId: 'doppler' }]
```

## Provider integration guide

### Adding a new local CLI provider

1. Create `src/provider/local/<name>.ts`
2. Implement the `KeyringProvider` interface:

```typescript
import type { KeyringProvider, ProviderCapabilities } from '../types.js';
import { exec } from './exec.js';

export interface MyProviderConfig {
  cliPath?: string;
}

export function createMyProviderKeyring(config?: MyProviderConfig): KeyringProvider {
  const cliPath = config?.cliPath ?? 'my-cli';

  return {
    id: 'my-provider',
    name: 'My Provider',
    capabilities: { canList: true, canSync: false, canTtl: false },
    resourceTypes: [], // Empty = use slow path (check() probe)

    async check(resourceType: string): Promise<boolean> {
      try {
        await exec([cliPath, 'get', resourceType]);
        return true;
      } catch { return false; }
    },

    async resolve(resourceType: string): Promise<string> {
      const { stdout } = await exec([cliPath, 'get', resourceType]);
      return stdout.trim();
    },

    async list(): Promise<string[]> {
      const { stdout } = await exec([cliPath, 'list']);
      return stdout.trim().split('\n');
    }
  };
}
```

3. Add the provider to `src/provider/local/index.ts`
4. Add tests in `src/provider/local/<name>.test.ts`
5. Add optional dependency to `package.json` if needed

### Adding a new cloud provider

1. Create `src/provider/cloud/<name>.ts`
2. Implement the `KeyringProvider` interface with SDK integration:

```typescript
export interface MyCloudConfig {
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export function createMyCloudKeyring(config?: MyCloudConfig): KeyringProvider {
  return {
    id: 'my-cloud',
    name: 'My Cloud SM',
    capabilities: { canList: true, canSync: false, canTtl: false },
    resourceTypes: [],

    async check(resourceType: string): Promise<boolean> { /* ... */ },
    async resolve(resourceType: string): Promise<string> { /* ... */ },
    async list(): Promise<string[]> { /* ... */ }
  };
}
```

3. Add the provider to `src/provider/cloud/index.ts`
4. Add tests in `src/provider/cloud/<name>.test.ts`
5. Add the SDK as an optional dependency to `package.json`

## CLI usage

```bash
# Initialize .agentsy/secrets.yaml config
agentsy secrets init

# List all available secrets across configured providers
agentsy secrets list

# Look up a specific secret
agentsy secrets lookup vercel_prod

# Sync provider caches
agentsy secrets sync
```

## Token format reference

The `$CRED(...)` token format keeps secrets out of LLM context:

| Token | Resolution |
|-------|-----------|
| `$CRED(vercel_prod)` | Default field for `vercel_prod` |
| `$CRED(database:password)` | Specific field `password` on `database` |

Tokens are case-sensitive, alphanumeric + underscore + hyphen. They are safe to commit — they are inert without the runtime resolver.
