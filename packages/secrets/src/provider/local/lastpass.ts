import type { KeyringProvider, ProviderCapabilities } from '../types.js';
import { cliNotFoundError, isCliInstalled, runCli } from './exec.js';

export interface LastPassConfig {
  /** CLI binary path (default: `lpass`). */
  cliPath?: string;
  /** Timeout per CLI call in ms (default: 15_000). */
  timeout?: number;
}

/**
 * Create a LastPass CLI keyring provider.
 *
 * Resolves secrets via `lpass show <name> --password --sync=no`.
 * Requires `lpass login` to have been run first.
 * Uses `--sync=no` to avoid blocking on sync during resolution.
 */
export function createLastPassKeyring(config?: LastPassConfig): KeyringProvider {
  const cli = config?.cliPath ?? 'lpass';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: true,
    canTtl: false
  };

  return {
    id: 'lastpass',
    name: 'LastPass CLI',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve(false);
      }
      const { stdout } = runCli(`${cli} ls`, { timeout });
      if (!stdout) {
        return Promise.resolve(false);
      }
      return Promise.resolve(stdout.split('\n').some(line => line.includes(resourceType)));
    },

    resolve(resourceType: string): Promise<string> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stdout, stderr } = runCli(`${cli} show "${resourceType}" --password --sync=no`, { timeout });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`LastPass: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`LastPass: no password found for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve([]);
      }
      const { stdout } = runCli(`${cli} ls`, { timeout });
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
        return Promise.reject(new Error(`LastPass sync failed: ${stderr}`));
      }
      return Promise.resolve();
    }
  };
}
