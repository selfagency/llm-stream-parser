import type { KeyringProvider, ProviderCapabilities } from '../types.js';
import { cliNotFoundError, isCliInstalled, runCli } from './exec.js';

export interface OnePasswordConfig {
  /** CLI binary path (default: `op`). */
  cliPath?: string;
  /** Timeout per CLI call in ms (default: 15_000). */
  timeout?: number;
  /** 1Password vault name to scope lookups. */
  vault?: string;
}

/**
 * Create a 1Password CLI keyring provider.
 *
 * Resolves secrets via `op read op://vault/item/field`.
 * Supports headless mode via `OP_SERVICE_ACCOUNT_TOKEN`.
 */
export function createOnePasswordKeyring(config?: OnePasswordConfig): KeyringProvider {
  const cli = config?.cliPath ?? 'op';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: true,
    canTtl: false
  };

  function vaultFlag(): string {
    return config?.vault ? `--vault=${config.vault}` : '';
  }

  return {
    id: '1password',
    name: '1Password CLI',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve(false);
      }
      // op item list exits 0 if vault/item exists
      const { stdout } = runCli(`${cli} item list ${vaultFlag()} --format=json`, { timeout });
      if (!stdout) {
        return Promise.resolve(false);
      }
      try {
        const items = JSON.parse(stdout) as Array<{ title?: string }>;
        return Promise.resolve(items.some(item => item.title === resourceType));
      } catch {
        return Promise.resolve(false);
      }
    },

    resolve(resourceType: string): Promise<string> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      // resourceType can be a field-qualified path: "item/field"
      const path = resourceType.includes('/')
        ? `op://${config?.vault ?? ''}/${resourceType}`
        : `op://${config?.vault ?? ''}/${resourceType}/password`;
      const { stdout, stderr } = runCli(`${cli} read ${path}`, { timeout });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`1Password: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`1Password: no value returned for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve([]);
      }
      const { stdout } = runCli(`${cli} item list ${vaultFlag()} --format=json`, { timeout });
      if (!stdout) {
        return Promise.resolve([]);
      }
      try {
        const items = JSON.parse(stdout) as Array<{ title: string }>;
        return Promise.resolve(items.map(item => item.title));
      } catch {
        return Promise.resolve([]);
      }
    },

    sync(): Promise<void> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stderr } = runCli(`${cli} sync`, { timeout });
      if (stderr) {
        return Promise.reject(new Error(`1Password sync failed: ${stderr}`));
      }
      return Promise.resolve();
    }
  };
}
