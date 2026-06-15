/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createInfisicalKeyring } from './infisical.js';

vi.mock('../local/exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "infisical" not found'))
}));

const { runCli, isCliInstalled } = await import('../local/exec.js');

describe('InfisicalKeyring', () => {
  it('check returns false when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createInfisicalKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
  });

  it('check returns true when secret found', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'val', stderr: '' });
    const keyring = createInfisicalKeyring();
    await expect(keyring.check('SECRET_1')).resolves.toBe(true);
  });

  it('resolve throws when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createInfisicalKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('CLI "infisical" not found');
  });

  it('resolve returns secret value', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'infisical-val', stderr: '' });
    const keyring = createInfisicalKeyring();
    await expect(keyring.resolve('MY_KEY')).resolves.toBe('infisical-val');
  });

  it('list returns names', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'KEY_A\nKEY_B\nKEY_C', stderr: '' });
    const keyring = createInfisicalKeyring();
    await expect(keyring.list()).resolves.toEqual(['KEY_A', 'KEY_B', 'KEY_C']);
  });

  it('sync runs infisical sync', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: '' });
    const keyring = createInfisicalKeyring();
    await keyring.sync?.();
    expect(runCli).toHaveBeenCalledWith('infisical sync', { timeout: 15_000 });
  });
});
