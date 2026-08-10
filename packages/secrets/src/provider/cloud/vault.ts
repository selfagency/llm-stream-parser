import { cliNotFoundError, isCliInstalled, runCli } from '../local/exec.js';
import type { KeyringProvider, ProviderCapabilities } from '../types.js';

export interface VaultConfig {
  /** Vault server address (default: `VAULT_ADDR` env or `https://127.0.0.1:8200`). */
  addr?: string;
  /** Use CLI mode instead of HTTP API. */
  cli?: boolean;
  /** CLI binary path for CLI mode (default: `vault`). */
  cliPath?: string;
  /** KV engine mount path (default: `secret`). */
  mount?: string;
  /** Vault namespace (for HCP Vault / Vault Enterprise). */
  namespace?: string;
  /** Timeout in ms (default: 15_000). */
  timeout?: number;
  /** Vault token (default: `VAULT_TOKEN` env). */
  token?: string;
}

/**
 * Create a HashiCorp Vault keyring provider.
 *
 * Supports both CLI (`vault kv get`) and HTTP API modes.
 * Falls back to CLI when the HTTP API is not reachable.
 * Supports `VAULT_TOKEN`, `VAULT_ADDR`, `VAULT_NAMESPACE`.
 */
export function createVaultKeyring(config?: VaultConfig): KeyringProvider {
  const addr = config?.addr ?? process.env.VAULT_ADDR ?? 'https://127.0.0.1:8200';
  const namespace = config?.namespace ?? process.env.VAULT_NAMESPACE ?? '';
  const token = config?.token ?? process.env.VAULT_TOKEN ?? '';
  const mount = config?.mount ?? 'secret';
  const cli = config?.cliPath ?? 'vault';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: false,
    canTtl: true
  };

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'X-Vault-Token': token };
    if (namespace) {
      h['X-Vault-Namespace'] = namespace;
    }
    return h;
  }

  return {
    id: 'vault',
    name: 'HashiCorp Vault',
    capabilities,
    resourceTypes: [],

    async check(resourceType: string): Promise<boolean> {
      if (config?.cli ?? false) {
        if (!isCliInstalled(cli)) {
          return false;
        }
        const { stdout } = runCli(`${cli} kv get -field=data -mount="${mount}" "${resourceType}"`, { timeout });
        return !!stdout;
      }
      try {
        const url = `${addr}/v1/${mount}/data/${resourceType}`;
        const res = await fetch(url, { headers: headers() });
        return res.ok;
      } catch {
        return false;
      }
    },

    async resolve(resourceType: string): Promise<string> {
      if (config?.cli ?? false) {
        if (!isCliInstalled(cli)) {
          throw cliNotFoundError(cli);
        }
        return resolveCli(resourceType);
      }
      try {
        return await resolveApi(resourceType);
      } catch {
        // Fallback to CLI if API fails
        if (isCliInstalled(cli)) {
          return resolveCli(resourceType);
        }
        throw new Error(`Vault: failed to resolve "${resourceType}"`);
      }
    },

    async list(): Promise<string[]> {
      if (config?.cli ?? false) {
        if (!isCliInstalled(cli)) {
          return [];
        }
        return listCli();
      }
      try {
        return await listApi();
      } catch {
        if (isCliInstalled(cli)) {
          return listCli();
        }
        return [];
      }
    }
  };

  function resolveCli(resourceType: string): Promise<string> {
    const { stdout, stderr } = runCli(`${cli} kv get -field=data -mount="${mount}" "${resourceType}"`, { timeout });
    if (!stdout && stderr) {
      return Promise.reject(new Error(`Vault: ${stderr}`));
    }
    if (!stdout) {
      return Promise.reject(new Error(`Vault: no value found for "${resourceType}"`));
    }
    return Promise.resolve(stdout);
  }

  async function resolveApi(resourceType: string): Promise<string> {
    const url = `${addr}/v1/${mount}/data/${resourceType}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`Vault API: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as {
      data?: { data?: Record<string, unknown> };
    };
    const val = body?.data?.data?.data;
    if (!val) {
      throw new Error(`Vault: no data at "${resourceType}"`);
    }
    return typeof val === 'string' ? val : JSON.stringify(val);
  }

  function listCli(): Promise<string[]> {
    const { stdout } = runCli(`${cli} kv list -mount="${mount}"`, { timeout });
    if (!stdout) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      stdout
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
    );
  }

  async function listApi(): Promise<string[]> {
    const url = `${addr}/v1/${mount}/metadata`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { data?: { keys?: string[] } };
    return body?.data?.keys ?? [];
  }
}
