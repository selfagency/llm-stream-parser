/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createVaultKeyring } from './vault.js';

vi.mock('../local/exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "vault" not found'))
}));

const { runCli, isCliInstalled } = await import('../local/exec.js');

describe('VaultKeyring', () => {
  describe('CLI mode', () => {
    it('check returns false when CLI not installed', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(false);
      const keyring = createVaultKeyring({ cli: true });
      await expect(keyring.check('test')).resolves.toBe(false);
    });

    it('check returns true when secret found', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(true);
      vi.mocked(runCli).mockReturnValue({ stdout: 'secretval', stderr: '' });
      const keyring = createVaultKeyring({ cli: true });
      await expect(keyring.check('api-key')).resolves.toBe(true);
    });

    it('resolve throws when CLI not installed', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(false);
      const keyring = createVaultKeyring({ cli: true });
      await expect(keyring.resolve('test')).rejects.toThrow('CLI "vault" not found');
    });

    it('resolve returns value', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(true);
      vi.mocked(runCli).mockReturnValue({ stdout: 'my-token', stderr: '' });
      const keyring = createVaultKeyring({ cli: true });
      await expect(keyring.resolve('my-key')).resolves.toBe('my-token');
    });

    it('list returns keys', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(true);
      vi.mocked(runCli).mockReturnValue({ stdout: 'key1\nkey2', stderr: '' });
      const keyring = createVaultKeyring({ cli: true });
      await expect(keyring.list()).resolves.toEqual(['key1', 'key2']);
    });
  });

  describe('API mode', () => {
    it('check returns false on fetch failure', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(false);
      const keyring = createVaultKeyring({ addr: 'https://vault.example.com', token: 's.test' });
      await expect(keyring.check('test')).resolves.toBe(false);
    });

    it('resolve falls back to CLI when API fails', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(true);
      vi.mocked(runCli).mockReturnValue({ stdout: 'cli-value', stderr: '' });
      const keyring = createVaultKeyring({ addr: 'https://vault.example.com', token: 's.test' });
      await expect(keyring.resolve('my-key')).resolves.toBe('cli-value');
    });

    it('resolve throws when both API and CLI fail', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(false);
      const keyring = createVaultKeyring({ addr: 'https://vault.invalid', token: 's.test' });
      await expect(keyring.resolve('my-key')).rejects.toThrow('Vault');
    });

    it('list returns empty on API failure', async () => {
      vi.mocked(isCliInstalled).mockReturnValue(false);
      const keyring = createVaultKeyring({ addr: 'https://vault.invalid', token: 's.test' });
      await expect(keyring.list()).resolves.toEqual([]);
    });
  });
});
