import type { KeyringProvider, ProviderCapabilities } from '../types.js';
import { cliNotFoundError, isCliInstalled, runCli } from './exec.js';

export interface DashlaneConfig {
  /** CLI binary path (default: `dcli`). */
  cliPath?: string;
  /** Timeout per CLI call in ms (default: 20_000). */
  timeout?: number;
}

/**
 * Create a Dashlane CLI keyring provider.
 *
 * Resolves secrets via `dcli password <name>`.
 * Requires `dcli auth` to have been run first.
 */
export function createDashlaneKeyring(config?: DashlaneConfig): KeyringProvider {
  const cli = config?.cliPath ?? 'dcli';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: true,
    canTtl: false
  };

  return {
    id: 'dashlane',
    name: 'Dashlane CLI',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve(false);
      }
      const { stdout } = runCli(`${cli} password --list`, { timeout });
      if (!stdout) {
        return Promise.resolve(false);
      }
      return Promise.resolve(stdout.split('\n').some(line => line.trim() === resourceType));
    },

    resolve(resourceType: string): Promise<string> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stdout, stderr } = runCli(`${cli} password "${resourceType}"`, {
        timeout
      });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`Dashlane: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`Dashlane: no password found for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve([]);
      }
      const { stdout } = runCli(`${cli} password --list`, { timeout });
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
        return Promise.reject(new Error(`Dashlane sync failed: ${stderr}`));
      }
      return Promise.resolve();
    }
  };
}
