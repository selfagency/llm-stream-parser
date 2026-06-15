/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';

const { mockGetSecret, mockListProps } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockListProps: vi.fn()
}));

vi.mock('@azure/identity', () => ({ DefaultAzureCredential: vi.fn() }));
vi.mock('@azure/keyvault-secrets', () => ({
  // biome-ignore lint/complexity/useArrowFunction: function keyword required for constructibility
  // biome-ignore lint/style/useConsistentObjectDefinitions: function keyword required for constructibility
  SecretClient: function () {
    return { getSecret: mockGetSecret, listPropertiesOfSecrets: mockListProps };
  }
}));

import { createAzureKvKeyring } from './azure-kv.js';

describe('AzureKvKeyring', () => {
  it('check returns true when secret exists', async () => {
    mockGetSecret.mockResolvedValue({ value: 'val' });
    const keyring = createAzureKvKeyring({ vaultUrl: 'https://test.vault.azure.net' });
    await expect(keyring.check('my-key')).resolves.toBe(true);
  });

  it('check returns false when secret missing', async () => {
    mockGetSecret.mockRejectedValue(new Error('not found'));
    const keyring = createAzureKvKeyring({ vaultUrl: 'https://test.vault.azure.net' });
    await expect(keyring.check('missing')).resolves.toBe(false);
  });

  it('resolve returns secret value', async () => {
    mockGetSecret.mockResolvedValue({ value: 'azure-val' });
    const keyring = createAzureKvKeyring({ vaultUrl: 'https://test.vault.azure.net' });
    await expect(keyring.resolve('my-key')).resolves.toBe('azure-val');
  });

  it('resolve throws when no value', async () => {
    mockGetSecret.mockResolvedValue({});
    const keyring = createAzureKvKeyring({ vaultUrl: 'https://test.vault.azure.net' });
    await expect(keyring.resolve('my-key')).rejects.toThrow('no value');
  });

  it('list returns secret names', async () => {
    const asyncIterator = (function* () {
      yield { name: 'secret1' };
      yield { name: 'secret2' };
    })();
    mockListProps.mockReturnValue(asyncIterator);
    const keyring = createAzureKvKeyring({ vaultUrl: 'https://test.vault.azure.net' });
    await expect(keyring.list()).resolves.toEqual(['secret1', 'secret2']);
  });
});
