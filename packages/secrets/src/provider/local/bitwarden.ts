import type { KeyringProvider, ProviderCapabilities } from '../types.js';
import { cliNotFoundError, isCliInstalled, runCli } from './exec.js';

export interface BitwardenConfig {
  /** CLI binary path (default: `bw`). */
  cliPath?: string;
  /** `BW_SESSION` token for authenticated sessions. */
  sessionToken?: string;
  /** Timeout per CLI call in ms (default: 15_000). */
  timeout?: number;
}

/**
 * Create a Bitwarden CLI keyring provider.
 *
 * Resolves secrets via `bw get password <id>`.
 * Supports headless mode via `BW_SESSION`.
 */
export function createBitwardenKeyring(config?: BitwardenConfig): KeyringProvider {
  const cli = config?.cliPath ?? 'bw';
  const timeout = config?.timeout ?? 15_000;

  const env: Record<string, string> = {};
  if (config?.sessionToken) {
    env.BW_SESSION = config.sessionToken;
  }

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: true,
    canTtl: false
  };

  return {
    id: 'bitwarden',
    name: 'Bitwarden CLI',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve(false);
      }
      const { stdout } = runCli(`${cli} list items --search "${resourceType}"`, {
        timeout,
        env
      });
      if (!stdout) {
        return Promise.resolve(false);
      }
      try {
        const items = JSON.parse(stdout) as Array<{ name?: string; id: string }>;
        return Promise.resolve(items.some(item => item.name === resourceType));
      } catch {
        return Promise.resolve(false);
      }
    },

    resolve(resourceType: string): Promise<string> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      // Try to find the item by resourceType (name) first
      const { stdout: searchOut } = runCli(`${cli} list items --search "${resourceType}"`, { timeout, env });
      if (!searchOut) {
        return Promise.reject(new Error(`Bitwarden: item "${resourceType}" not found`));
      }
      let items: Array<{ name?: string; id: string }>;
      try {
        items = JSON.parse(searchOut) as Array<{ name?: string; id: string }>;
      } catch {
        return Promise.reject(new Error(`Bitwarden: failed to parse item list for "${resourceType}"`));
      }
      const item = items.find(i => i.name === resourceType) ?? items[0];
      if (!item?.id) {
        return Promise.reject(new Error(`Bitwarden: item "${resourceType}" not found`));
      }

      const { stdout, stderr } = runCli(`${cli} get password ${item.id}`, {
        timeout,
        env
      });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`Bitwarden: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`Bitwarden: no password for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve([]);
      }
      const { stdout } = runCli(`${cli} list items`, { timeout, env });
      if (!stdout) {
        return Promise.resolve([]);
      }
      try {
        const items = JSON.parse(stdout) as Array<{ name: string }>;
        return Promise.resolve(items.map(item => item.name).filter(Boolean));
      } catch {
        return Promise.resolve([]);
      }
    },

    sync(): Promise<void> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stderr } = runCli(`${cli} sync`, { timeout, env });
      if (stderr) {
        return Promise.reject(new Error(`Bitwarden sync failed: ${stderr}`));
      }
      return Promise.resolve();
    }
  };
}
