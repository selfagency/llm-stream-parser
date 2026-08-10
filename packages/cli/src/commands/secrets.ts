/**
 * Secrets CLI — manage credentials and provider configuration.
 *
 * ## Usage
 *
 * ```bash
 * agentsy secrets init            # Bootstrap .agentsy/secrets.yaml
 * agentsy secrets list            # List available secrets across providers
 * agentsy secrets lookup <name>   # Resolve + display masked value
 * agentsy secrets sync            # Refresh provider caches
 * ```
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CliIO } from '../index.js';

type KeyringProvider = import('@agentsy/secrets').KeyringProvider;

// =============================================================================
// Provider factory — maps config entries to KeyringProvider instances
// =============================================================================

type ProviderFactory = (options: Record<string, unknown> | undefined) => Promise<KeyringProvider>;

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  '1password': async opts => {
    const mod = await import('@agentsy/secrets');
    const { cliPath, timeout, vault } = opts ?? {};
    return mod.createOnePasswordKeyring({
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number }),
      ...(vault === undefined ? {} : { vault: vault as string })
    });
  },
  bitwarden: async opts => {
    const mod = await import('@agentsy/secrets');
    const { cliPath, sessionToken, timeout } = opts ?? {};
    return mod.createBitwardenKeyring({
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(sessionToken === undefined ? {} : { sessionToken: sessionToken as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  dashlane: async opts => {
    const mod = await import('@agentsy/secrets');
    const { cliPath, timeout } = opts ?? {};
    return mod.createDashlaneKeyring({
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  lastpass: async opts => {
    const mod = await import('@agentsy/secrets');
    const { cliPath, timeout } = opts ?? {};
    return mod.createLastPassKeyring({
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  'apple-pm': async opts => {
    const mod = await import('@agentsy/secrets');
    const { service, timeout } = opts ?? {};
    return mod.createApplePMKeyring({
      ...(service === undefined ? {} : { service: service as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  doppler: async opts => {
    const mod = await import('@agentsy/secrets');
    const { cliPath, timeout } = opts ?? {};
    return mod.createDopplerKeyring({
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  infisical: async opts => {
    const mod = await import('@agentsy/secrets');
    const { cliPath, timeout } = opts ?? {};
    return mod.createInfisicalKeyring({
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  vault: async opts => {
    const mod = await import('@agentsy/secrets');
    const { addr, cli, cliPath, mount, namespace, timeout, token } = opts ?? {};
    return mod.createVaultKeyring({
      ...(addr === undefined ? {} : { addr: addr as string }),
      ...(cli === undefined ? {} : { cli: cli as boolean }),
      ...(cliPath === undefined ? {} : { cliPath: cliPath as string }),
      ...(mount === undefined ? {} : { mount: mount as string }),
      ...(namespace === undefined ? {} : { namespace: namespace as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number }),
      ...(token === undefined ? {} : { token: token as string })
    });
  },
  'aws-sm': async opts => {
    const mod = await import('@agentsy/secrets');
    const { region, timeout } = opts ?? {};
    return mod.createAwsSmKeyring({
      ...(region === undefined ? {} : { region: region as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  'gcp-sm': async opts => {
    const mod = await import('@agentsy/secrets');
    const { project, timeout } = opts ?? {};
    return mod.createGcpSmKeyring({
      ...(project === undefined ? {} : { project: project as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  },
  'azure-kv': async opts => {
    const mod = await import('@agentsy/secrets');
    const { vaultUrl, timeout } = opts ?? {};
    return mod.createAzureKvKeyring({
      ...(vaultUrl === undefined ? {} : { vaultUrl: vaultUrl as string }),
      ...(timeout === undefined ? {} : { timeout: timeout as number })
    });
  }
};

// =============================================================================
// Helpers
// =============================================================================

/** Safe factory lookup that won't trigger Semgrep bracket-object-injection. */
export function getFactory(name: string): ProviderFactory | undefined {
  if (!Object.hasOwn(PROVIDER_FACTORIES, name)) {
    return;
  }
  return PROVIDER_FACTORIES[name];
}

const DEFAULT_IO: Required<CliIO> = {
  stderr: (msg: string): void => {
    console.error(msg);
  },
  stdout: (msg: string): void => {
    console.log(msg);
  }
};

export function maskedValue(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  const visible = value.slice(-4);
  return `...${visible}`;
}

// =============================================================================
// Config template for `init`
// =============================================================================

const CONFIG_TEMPLATE = `# .agentsy/secrets.yaml — Secret injection provider configuration
# Generated by \`agentsy secrets init\`
version: 1

# Provider definitions
# Uncomment and configure the providers you use:
providers:
  # 1password:
  #   options:
  #     vault: "Agentsy"
  #   resourceTypes: ["vercel_prod", "github_token"]

  # doppler:
  #   options:
  #     cliPath: doppler
  #   resourceTypes: ["prod_deploy"]

  # vault:
  #   options:
  #     addr: "https://vault.example.com"
  #   resourceTypes: ["database"]

# Default provider when no resource-type match is found
# defaultProvider: "1password"

# Per-resource-type TTL overrides (default: 300s)
# ttl:
#   database: 60
`;

// =============================================================================
// Subcommand handlers (exported for testing)
// =============================================================================

interface SecretsCliOptions {
  json: boolean;
  stderr: (msg: string) => void;
  stdout: (msg: string) => void;
}

/** Shared: initialise a ProviderRegistry from config. */
async function initRegistryFromConfig(
  providerEntries: [string, { options?: Record<string, unknown> | undefined; resourceTypes?: string[] }][]
): Promise<import('@agentsy/secrets').ProviderRegistry> {
  const { ProviderRegistry: PR } = await import('@agentsy/secrets');
  const registry = new PR();
  for (const [name, providerCfg] of providerEntries) {
    const factory = getFactory(name);
    if (!factory) {
      continue;
    }
    try {
      const provider = await factory(providerCfg.options);
      provider.resourceTypes = providerCfg.resourceTypes ?? [];
      registry.register(provider);
    } catch {
      // skip failing providers
    }
  }
  return registry;
}

// ---------------------------------------------------------------------------
// agentsy secrets init
// ---------------------------------------------------------------------------

function detectProjectRoot(): string {
  const cwd = process.cwd();

  if (existsSync(join(cwd, '.agentsy'))) {
    return cwd;
  }

  let dir = cwd;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) || existsSync(join(dir, '.git'))) {
      return dir;
    }
    dir = dirname(dir);
  }

  return cwd;
}

async function handleInit(_argv: readonly string[], opts: SecretsCliOptions): Promise<number> {
  const { loadConfig } = await import('@agentsy/secrets');

  const rootDir = detectProjectRoot();
  const existing = await loadConfig(rootDir);
  const providerCount = Object.keys(existing.providers).length;

  if (providerCount > 0) {
    opts.stdout(`Config already exists (${providerCount} provider(s) configured).`);
    return 0;
  }

  const configDir = join(rootDir, '.agentsy');
  const configPath = join(configDir, 'secrets.yaml');

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  await writeFile(configPath, CONFIG_TEMPLATE, 'utf-8');

  if (opts.json) {
    opts.stdout(JSON.stringify({ path: configPath, created: true }, null, 2));
    return 0;
  }

  opts.stdout(`Created ${configPath}`);
  opts.stdout('Edit the file to configure your secret providers, then run:');
  opts.stdout('  agentsy secrets list');
  return 0;
}

// ---------------------------------------------------------------------------
// agentsy secrets list
// ---------------------------------------------------------------------------

async function handleList(_argv: readonly string[], opts: SecretsCliOptions): Promise<number> {
  const { loadConfig } = await import('@agentsy/secrets');

  const config = await loadConfig();
  const providerEntries = Object.entries(config.providers);

  if (providerEntries.length === 0) {
    if (opts.json) {
      opts.stdout(JSON.stringify({ providers: [], secrets: [] }, null, 2));
      return 0;
    }
    opts.stdout('No providers configured.');
    opts.stdout('Run `agentsy secrets init` to create a configuration file.');
    return 0;
  }

  const registry = await initRegistryFromConfig(providerEntries);
  const providerList = registry.getAll();
  const allTypes = await registry.listAll();

  if (opts.json) {
    opts.stdout(formatListJson(providerList, allTypes));
    return 0;
  }

  opts.stdout(formatListText(providerList, allTypes));
  return 0;
}

/** Format the provider/secret list as JSON. */
function formatListJson(
  providerList: readonly KeyringProvider[],
  allTypes: readonly { providerId: string; resourceType: string }[]
): string {
  return JSON.stringify(
    {
      providers: providerList.map((p: KeyringProvider) => ({
        id: p.id,
        name: p.name,
        capabilities: p.capabilities
      })),
      secrets: allTypes
    },
    null,
    2
  );
}

/** Format the provider/secret list as human-readable text. */
function formatListText(
  providerList: readonly KeyringProvider[],
  allTypes: readonly { providerId: string; resourceType: string }[]
): string {
  const lines: string[] = [];
  lines.push(`Configured providers (${providerList.length}):`);
  lines.push('');
  for (const p of providerList) {
    const capFlags = [
      p.capabilities.canList ? 'list' : '',
      p.capabilities.canSync ? 'sync' : '',
      p.capabilities.canTtl ? 'ttl' : ''
    ]
      .filter(Boolean)
      .join(',');
    lines.push(`  ${p.id} (${p.name}) [${capFlags}]`);
  }

  if (allTypes.length > 0) {
    lines.push('');
    lines.push(`Available secrets (${allTypes.length}):`);
    lines.push('');
    for (const s of allTypes) {
      lines.push(`  ${s.providerId}/${s.resourceType}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// agentsy secrets lookup <name>
// ---------------------------------------------------------------------------

async function handleLookup(argv: readonly string[], opts: SecretsCliOptions): Promise<number> {
  const resourceType = argv[0];
  if (resourceType === undefined || resourceType.length === 0) {
    opts.stderr('Usage: agentsy secrets lookup <resource-type>');
    opts.stderr('Example: agentsy secrets lookup vercel_prod');
    return 1;
  }

  const reveal = argv.includes('--reveal');
  const { loadConfig } = await import('@agentsy/secrets');

  const config = await loadConfig();
  const providerEntries = Object.entries(config.providers);

  if (providerEntries.length === 0) {
    opts.stderr('No providers configured. Run `agentsy secrets init` first.');
    return 1;
  }

  const registry = await initRegistryFromConfig(providerEntries);

  try {
    const value = await registry.resolve(resourceType);

    if (opts.json) {
      opts.stdout(
        formatLookupJson({
          error: undefined,
          resourceType,
          revealed: reveal,
          value: reveal ? value : maskedValue(value)
        })
      );
      return 0;
    }

    const displayValue = reveal ? value : maskedValue(value);
    opts.stdout(`Resolved ${resourceType}: ${displayValue}${reveal ? '' : ' (use --reveal to show full value)'}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (opts.json) {
      opts.stdout(formatLookupJson({ error: message, resourceType, revealed: reveal, value: undefined }));
      return 1;
    }

    opts.stderr(`Failed to resolve ${resourceType}: ${message}`);
    return 1;
  }
}

/** Format a lookup result as JSON. */
function formatLookupJson(input: {
  error: string | undefined;
  resourceType: string;
  revealed: boolean;
  value: string | undefined;
}): string {
  return JSON.stringify(
    {
      error: input.error,
      resourceType: input.resourceType,
      resolved: input.error === undefined,
      revealed: input.revealed,
      value: input.value
    },
    null,
    2
  );
}

interface SyncProviderConfig {
  options?: Record<string, unknown> | undefined;
}

interface SyncResult {
  error?: string;
  provider: string;
  synced: boolean;
}

async function syncProvider(name: string, providerCfg: SyncProviderConfig): Promise<SyncResult> {
  const factory = getFactory(name);
  if (!factory) {
    return { provider: name, synced: false, error: 'unknown provider type' };
  }

  try {
    const provider = await factory(providerCfg.options);

    if (provider.sync === undefined) {
      return { provider: name, synced: false, error: 'sync not supported' };
    }
    await provider.sync();
    return { provider: name, synced: true };
  } catch (error) {
    return {
      provider: name,
      synced: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function printSyncResultLine(
  r: SyncResult,
  opts: { stderr: (msg: string) => void; stdout: (msg: string) => void }
): void {
  if (r.synced) {
    opts.stdout(`  \u2705 ${r.provider}`);
  } else {
    const errorSuffix = r.error ? ` — ${r.error}` : '';
    opts.stderr(`  \u274c ${r.provider}${errorSuffix}`);
  }
}

function displaySyncResults(results: SyncResult[], opts: SecretsCliOptions): number {
  if (opts.json) {
    opts.stdout(JSON.stringify({ results }, null, 2));
    return 0;
  }

  const failed = results.filter(r => !r.synced).length;
  opts.stdout(`Sync complete: ${results.length - failed} synced, ${failed} failed`);
  for (const r of results) {
    printSyncResultLine(r, opts);
  }

  return failed > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// agentsy secrets sync
// ---------------------------------------------------------------------------

async function handleSync(_argv: readonly string[], opts: SecretsCliOptions): Promise<number> {
  const { loadConfig } = await import('@agentsy/secrets');

  const config = await loadConfig();
  const providerEntries = Object.entries(config.providers);

  if (providerEntries.length === 0) {
    opts.stderr('No providers configured. Run `agentsy secrets init` first.');
    return 1;
  }

  const results = await Promise.all(
    providerEntries.map(([name, providerCfg]) => syncProvider(name, providerCfg as SyncProviderConfig))
  );

  return displaySyncResults(results, opts);
}

// =============================================================================
// Entry point
// =============================================================================

export async function runSecretsCommand(argv: readonly string[], io: CliIO = DEFAULT_IO): Promise<number> {
  const subcommand = argv[0];
  const rest = argv.slice(1);
  const json = argv.includes('--json');
  const stdout = io.stdout ?? DEFAULT_IO.stdout;
  const stderr = io.stderr ?? DEFAULT_IO.stderr;
  const opts: SecretsCliOptions = { json, stdout, stderr };

  if (subcommand === 'init') {
    return await handleInit(rest, opts);
  }

  if (subcommand === 'list') {
    return await handleList(rest, opts);
  }

  if (subcommand === 'lookup') {
    return await handleLookup(rest, opts);
  }

  if (subcommand === 'sync') {
    return await handleSync(rest, opts);
  }

  stderr(`Unknown secrets subcommand: ${subcommand ?? '(none)'}`);
  stderr('Supported: init, list, lookup, sync');
  return 1;
}
