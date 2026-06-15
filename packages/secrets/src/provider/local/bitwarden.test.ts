/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createBitwardenKeyring } from './bitwarden.js';

vi.mock('./exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "bw" not found'))
}));

const { runCli, isCliInstalled } = await import('./exec.js');

describe('BitwardenKeyring', () => {
  it('check returns false when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createBitwardenKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
  });

  it('check finds matching item by name', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({
      stdout: JSON.stringify([{ name: 'my-key', id: 'abc123' }]),
      stderr: ''
    });
    const keyring = createBitwardenKeyring();
    await expect(keyring.check('my-key')).resolves.toBe(true);
  });

  it('resolve throws when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createBitwardenKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('CLI "bw" not found');
  });

  it('resolve returns password for named item', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli)
      .mockReturnValueOnce({
        stdout: JSON.stringify([{ name: 'my-api', id: 'item001' }]),
        stderr: ''
      })
      .mockReturnValueOnce({ stdout: 'secretvalue', stderr: '' });
    const keyring = createBitwardenKeyring();
    await expect(keyring.resolve('my-api')).resolves.toBe('secretvalue');
  });

  it('resolve throws when item not found', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '[]', stderr: '' });
    const keyring = createBitwardenKeyring();
    await expect(keyring.resolve('missing')).rejects.toThrow('not found');
  });

  it('list returns item names', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({
      stdout: JSON.stringify([{ name: 'key-a' }, { name: 'key-b' }]),
      stderr: ''
    });
    const keyring = createBitwardenKeyring();
    await expect(keyring.list()).resolves.toEqual(['key-a', 'key-b']);
  });

  it('sync runs bw sync', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: '' });
    const keyring = createBitwardenKeyring();
    await keyring.sync?.();
    expect(runCli).toHaveBeenCalledWith('bw sync', { timeout: 15_000, env: {} });
  });
});
