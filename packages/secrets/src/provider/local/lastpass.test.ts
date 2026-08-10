/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createLastPassKeyring } from './lastpass.js';

vi.mock('./exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "lpass" not found'))
}));

const { runCli, isCliInstalled } = await import('./exec.js');

describe('LastPassKeyring', () => {
  it('check returns false when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createLastPassKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
  });

  it('check finds matching entry', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'my-entry\nother', stderr: '' });
    const keyring = createLastPassKeyring();
    await expect(keyring.check('my-entry')).resolves.toBe(true);
  });

  it('resolve throws when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createLastPassKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('CLI "lpass" not found');
  });

  it('resolve returns password value', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'lpass-secret', stderr: '' });
    const keyring = createLastPassKeyring();
    await expect(keyring.resolve('my-entry')).resolves.toBe('lpass-secret');
  });

  it('resolve uses --sync=no flag', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'val', stderr: '' });
    const keyring = createLastPassKeyring();
    await keyring.resolve('test-entry');
    expect(runCli).toHaveBeenCalledWith('lpass show "test-entry" --password --sync=no', { timeout: 15_000 });
  });

  it('list returns entries', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'entry1\nentry2', stderr: '' });
    const keyring = createLastPassKeyring();
    await expect(keyring.list()).resolves.toEqual(['entry1', 'entry2']);
  });

  it('sync runs lpass sync', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: '' });
    const keyring = createLastPassKeyring();
    await keyring.sync?.();
    expect(runCli).toHaveBeenCalledWith('lpass sync', { timeout: 15_000 });
  });
});
