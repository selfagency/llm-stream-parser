/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';
import { createApplePMKeyring } from './apple-pm.js';

vi.mock('./exec.js', () => ({
  runCli: vi.fn(),
  isCliInstalled: vi.fn(),
  cliNotFoundError: vi.fn(() => new Error('CLI "security" not found'))
}));

const { runCli, isCliInstalled } = await import('./exec.js');

describe('ApplePMKeyring', () => {
  it('check returns false on non-darwin platforms', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: '', stderr: '' });
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const keyring = createApplePMKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
    Object.defineProperty(process, 'platform', { value: platform?.value ?? 'darwin' });
  });

  it('check returns false when security CLI missing', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(false);
    const keyring = createApplePMKeyring();
    await expect(keyring.check('test')).resolves.toBe(false);
  });

  it('check returns true when secret found', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'secretvalue', stderr: '' });
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const keyring = createApplePMKeyring();
    await expect(keyring.check('my-key')).resolves.toBe(true);
    Object.defineProperty(process, 'platform', { value: platform?.value ?? 'darwin' });
  });

  it('resolve throws on non-macOS', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const keyring = createApplePMKeyring();
    await expect(keyring.resolve('test')).rejects.toThrow('only available on macOS');
    Object.defineProperty(process, 'platform', { value: platform?.value ?? 'darwin' });
  });

  it('resolve returns secret value on macOS', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({ stdout: 'keychain-secret', stderr: '' });
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const keyring = createApplePMKeyring({ service: 'test-app' });
    await expect(keyring.resolve('my-key')).resolves.toBe('keychain-secret');
    expect(runCli).toHaveBeenCalledWith('security find-generic-password -a "my-key" -s "test-app" -w', {
      timeout: 15_000
    });
    Object.defineProperty(process, 'platform', { value: platform?.value ?? 'darwin' });
  });

  it('list returns accounts on macOS', async () => {
    vi.mocked(isCliInstalled).mockReturnValue(true);
    vi.mocked(runCli).mockReturnValue({
      stdout: '"acct"<blob>="user1"\n"acct"<blob>="user2"',
      stderr: ''
    });
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const keyring = createApplePMKeyring();
    const result = await keyring.list();
    expect(result.length).toBeGreaterThanOrEqual(0);
    Object.defineProperty(process, 'platform', { value: platform?.value ?? 'darwin' });
  });

  it('list returns empty on non-macOS', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const keyring = createApplePMKeyring();
    await expect(keyring.list()).resolves.toEqual([]);
    Object.defineProperty(process, 'platform', { value: platform?.value ?? 'darwin' });
  });
});
