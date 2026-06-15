/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createDopplerKeyring } from './doppler.js';

vi.mock('../local/exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "doppler" not found'))
}));

const { runCli, isCliInstalled } = await import('../local/exec.js');

describe('DopplerKeyring', () => {
  it('check returns false when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createDopplerKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
    expect(runCli).not.toHaveBeenCalled();
  });

  it('check returns true when secret found', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'myvalue', stderr: '' });
    const keyring = createDopplerKeyring();
    await expect(keyring.check('MY_KEY')).resolves.toBe(true);
  });

  it('resolve throws when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createDopplerKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('CLI "doppler" not found');
  });

  it('resolve returns secret value', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'doppler-value', stderr: '' });
    const keyring = createDopplerKeyring();
    await expect(keyring.resolve('MY_SECRET')).resolves.toBe('doppler-value');
  });

  it('resolve throws on stderr', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: 'unauthorized' });
    const keyring = createDopplerKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('unauthorized');
  });

  it('list returns secret names from JSON', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({
      stdout: JSON.stringify({ KEY_A: { name: 'KEY_A' }, KEY_B: { name: 'KEY_B' } }),
      stderr: ''
    });
    const keyring = createDopplerKeyring();
    await expect(keyring.list()).resolves.toEqual(['KEY_A', 'KEY_B']);
  });

  it('list returns empty when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createDopplerKeyring();
    await expect(keyring.list()).resolves.toEqual([]);
  });
});
