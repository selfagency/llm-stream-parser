import { cliNotFoundError, isCliInstalled, runCli } from '../local/exec.js';
import type { KeyringProvider, ProviderCapabilities } from '../types.js';

export interface DopplerConfig {
  /** CLI binary path (default: `doppler`). */
  cliPath?: string;
  /** Timeout per CLI call in ms (default: 15_000). */
  timeout?: number;
}

/**
 * Create a Doppler CLI keyring provider.
 *
 * Resolves secrets via `doppler secrets get <name>`.
 * Supports headless mode via `DOPPLER_TOKEN`.
 */
export function createDopplerKeyring(config?: DopplerConfig): KeyringProvider {
  const cli = config?.cliPath ?? 'doppler';
  const timeout = config?.timeout ?? 15_000;

  const capabilities: ProviderCapabilities = {
    canList: true,
    canSync: false,
    canTtl: false
  };

  return {
    id: 'doppler',
    name: 'Doppler CLI',
    capabilities,
    resourceTypes: [],

    check(resourceType: string): Promise<boolean> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve(false);
      }
      const { stdout } = runCli(`${cli} secrets get "${resourceType}" --plain`, {
        timeout
      });
      return Promise.resolve(!!stdout);
    },

    resolve(resourceType: string): Promise<string> {
      if (!isCliInstalled(cli)) {
        return Promise.reject(cliNotFoundError(cli));
      }
      const { stdout, stderr } = runCli(`${cli} secrets get "${resourceType}" --plain`, { timeout });
      if (!stdout && stderr) {
        return Promise.reject(new Error(`Doppler: ${stderr}`));
      }
      if (!stdout) {
        return Promise.reject(new Error(`Doppler: no secret found for "${resourceType}"`));
      }
      return Promise.resolve(stdout);
    },

    list(): Promise<string[]> {
      if (!isCliInstalled(cli)) {
        return Promise.resolve([]);
      }
      const { stdout } = runCli(`${cli} secrets list --format=json`, {
        timeout
      });
      if (!stdout) {
        return Promise.resolve([]);
      }
      try {
        const parsed = JSON.parse(stdout) as Record<string, { name?: string }>;
        return Promise.resolve(
          Object.values(parsed)
            .map(v => v.name)
            .filter((n): n is string => !!n)
        );
      } catch {
        return Promise.resolve([]);
      }
    }
  };
}
