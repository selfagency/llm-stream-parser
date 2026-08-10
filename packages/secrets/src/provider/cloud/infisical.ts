import { cliNotFoundError, isCliInstalled, runCli } from '../local/exec.js';
import type { KeyringProvider, ProviderCapabilities } from '../types.js';

export interface InfisicalConfig {
  /** CLI binary path (default: `infisical`). */
  cliPath?: string;
  /** Timeout per CLI call in ms (default: 15_000). */
  timeout?: number;
}

/**
 * Create an Infisical CLI keyring provider.
 *
 * Resolves secrets via `infisical secrets get <name>`.
 * Supports headless mode via `INFISICAL_TOKEN`.
 */
export function createInfisicalKeyring(config?: InfisicalConfig): KeyringProvider {
  const cli = config?.cliPath ?? 'infisical';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: true,
    canTtl: false
  };

  return {
    id: 'infisical',
    name: 'Infisical CLI',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve(false);
      }
      const { stdout } = runCli(`${cli} secrets get "${resourceType}"`, {
        timeout
      });
      return Promise.resolve(!!stdout);
    },

    resolve(resourceType: string): Promise<string> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stdout, stderr } = runCli(`${cli} secrets get "${resourceType}"`, { timeout });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`Infisical: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`Infisical: no secret found for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve([]);
      }
      const { stdout } = runCli(`${cli} secrets list`, { timeout });
      if (!stdout) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        stdout
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
      );
    },

    sync(): Promise<void> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stderr } = runCli(`${cli} sync`, { timeout });
      if (stderr) {
        return Promise.reject(new Error(`Infisical sync failed: ${stderr}`));
      }
      return Promise.resolve();
    }
  };
}
