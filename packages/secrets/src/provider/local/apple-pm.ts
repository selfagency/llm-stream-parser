import type { KeyringProvider, ProviderCapabilities } from '../types.js';
import { cliNotFoundError, isCliInstalled, runCli } from './exec.js';

export interface ApplePMConfig {
  /** Service name for `security find-generic-password -s` (default: `agentsy`). */
  service?: string;
  /** Timeout per CLI call in ms (default: 10_000). */
  timeout?: number;
}

function isSupported(): boolean {
  return process.platform === 'darwin';
}

/**
 * Create an Apple Password Manager (macOS Keychain) keyring provider.
 *
 * Resolves secrets via `security find-generic-password -w`.
 * macOS only — gracefully returns empty lists on Linux.
 */
export function createApplePMKeyring(config?: ApplePMConfig): KeyringProvider {
  const service = config?.service ?? 'agentsy';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: false,
    canTtl: false
  };

  return {
    id: 'apple-pm',
    name: 'Apple Password Manager',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isSupported()) {
        return Promise.resolve(false);
      }
      if (!isCliInstalled('security')) {
        return Promise.resolve(false);
      }
      const { stdout } = runCli(`security find-generic-password -a "${resourceType}" -s "${service}" -w`, { timeout });
      return Promise.resolve(!!stdout);
    },

    resolve(resourceType: string): Promise<string> {
      if (!isSupported()) {
        return Promise.reject(new Error('Apple Password Manager is only available on macOS'));
      }
      if (!isCliInstalled('security')) {
        return Promise.reject(cliNotFoundError('security'));
      }
      const { stdout, stderr } = runCli(`security find-generic-password -a "${resourceType}" -s "${service}" -w`, {
        timeout
      });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`Apple Keychain: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`Apple Keychain: no password found for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!(isSupported() && isCliInstalled('security'))) {
        return Promise.resolve([]);
      }
      // Dump-keychain shows all entries; we filter by the configured service
      const { stdout } = runCli(
        `security dump-keychain | grep -o '"acct"<blob>="[^"]*"' | sed 's/"acct"<blob>="//;s/"$//'`,
        { timeout }
      );
      if (!stdout) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        stdout
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
      );
    }
  };
}
