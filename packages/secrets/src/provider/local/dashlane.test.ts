/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createDashlaneKeyring } from './dashlane.js';

vi.mock('./exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "dcli" not found'))
}));

const { runCli, isCliInstalled } = await import('./exec.js');

describe('DashlaneKeyring', () => {
  it('check returns false when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createDashlaneKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
  });

  it('check finds matching password by name', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'my-key\nother', stderr: '' });
    const keyring = createDashlaneKeyring();
    await expect(keyring.check('my-key')).resolves.toBe(true);
  });

  it('resolve throws when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createDashlaneKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('CLI "dcli" not found');
  });

  it('resolve returns password value', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'dashlane-secret', stderr: '' });
    const keyring = createDashlaneKeyring();
    await expect(keyring.resolve('my-key')).resolves.toBe('dashlane-secret');
  });

  it('list returns password names', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'key1\nkey2\nkey3', stderr: '' });
    const keyring = createDashlaneKeyring();
    await expect(keyring.list()).resolves.toEqual(['key1', 'key2', 'key3']);
  });

  it('list returns empty when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createDashlaneKeyring();
    await expect(keyring.list()).resolves.toEqual([]);
  });

  it('sync runs dcli sync', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: '' });
    const keyring = createDashlaneKeyring();
    await keyring.sync?.();
    expect(runCli).toHaveBeenCalledWith('dcli sync', { timeout: 15_000 });
  });
});
