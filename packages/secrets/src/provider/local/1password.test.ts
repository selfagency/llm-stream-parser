/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createOnePasswordKeyring } from './1password.js';

vi.mock('./exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "op" not found'))
}));

const { runCli, isCliInstalled } = await import('./exec.js');

describe('OnePasswordKeyring', () => {
  it('check returns false when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createOnePasswordKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
    expect(runCli).not.toHaveBeenCalled();
  });

  it('check returns false when items list is empty', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '[]', stderr: '' });
    const keyring = createOnePasswordKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
  });

  it('check finds matching item by title', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({
      stdout: JSON.stringify([{ title: 'my-api-key' }, { title: 'test' }]),
      stderr: ''
    });
    const keyring = createOnePasswordKeyring();
    await expect(keyring.check('my-api-key')).resolves.toBe(true);
  });

  it('resolve throws when CLI not installed', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createOnePasswordKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('CLI "op" not found');
  });

  it('resolve returns secret value', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'supersecret', stderr: '' });
    const keyring = createOnePasswordKeyring();
    await expect(keyring.resolve('my-api-key')).resolves.toBe('supersecret');
  });

  it('resolve uses field-qualified path', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'thetoken', stderr: '' });
    const keyring = createOnePasswordKeyring({ vault: 'MyVault' });
    await expect(keyring.resolve('myapp/token')).resolves.toBe('thetoken');
    expect(runCli).toHaveBeenCalledWith('op read op://MyVault/myapp/token', { timeout: 15_000 });
  });

  it('list returns item titles', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({
      stdout: JSON.stringify([{ title: 'alpha' }, { title: 'beta' }]),
      stderr: ''
    });
    const keyring = createOnePasswordKeyring();
    await expect(keyring.list()).resolves.toEqual(['alpha', 'beta']);
  });

  it('list returns empty when no items', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '[]', stderr: '' });
    const keyring = createOnePasswordKeyring();
    await expect(keyring.list()).resolves.toEqual([]);
  });

  it('sync runs op sync', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: '' });
    const keyring = createOnePasswordKeyring();
    await keyring.sync?.();
    expect(runCli).toHaveBeenCalledWith('op sync', { timeout: 15_000 });
  });

  it('sync throws on failure', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: 'sync failed' });
    const keyring = createOnePasswordKeyring();
    await expect(keyring.sync?.()).rejects.toThrow('sync failed');
  });
});
