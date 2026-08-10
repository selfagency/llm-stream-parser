/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';

const { mockAccess, mockList } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockList: vi.fn()
}));

vi.mock('@google-cloud/secret-manager', () => ({
  // biome-ignore lint/complexity/useArrowFunction: function keyword required for constructibility
  // biome-ignore lint/style/useConsistentObjectDefinitions: function keyword required for constructibility
  SecretManagerServiceClient: function () {
    return { accessSecretVersion: mockAccess, listSecrets: mockList };
  }
}));

import { createGcpSmKeyring } from './gcp-sm.js';

describe('GcpSmKeyring', () => {
  it('check returns true when secret exists', async () => {
    mockAccess.mockResolvedValue([{ payload: { data: Buffer.from('val') } }]);
    const keyring = createGcpSmKeyring({ project: 'my-proj' });
    await expect(keyring.check('my-key')).resolves.toBe(true);
  });

  it('check returns false when secret missing', async () => {
    mockAccess.mockRejectedValue(new Error('not found'));
    const keyring = createGcpSmKeyring({ project: 'my-proj' });
    await expect(keyring.check('missing')).resolves.toBe(false);
  });

  it('resolve returns secret data', async () => {
    mockAccess.mockResolvedValue([{ payload: { data: Buffer.from('gcp-val') } }]);
    const keyring = createGcpSmKeyring({ project: 'my-proj' });
    await expect(keyring.resolve('my-key')).resolves.toBe('gcp-val');
  });

  it('resolve throws when no data', async () => {
    mockAccess.mockResolvedValue([{}]);
    const keyring = createGcpSmKeyring({ project: 'my-proj' });
    await expect(keyring.resolve('my-key')).rejects.toThrow('no data');
  });

  it('list returns secret names', async () => {
    mockList.mockResolvedValue([
      [{ name: 'projects/my-proj/secrets/key1' }, { name: 'projects/my-proj/secrets/key2' }]
    ]);
    const keyring = createGcpSmKeyring({ project: 'my-proj' });
    const result = await keyring.list();
    expect(result).toContain('key1');
    expect(result).toContain('key2');
  });
});
