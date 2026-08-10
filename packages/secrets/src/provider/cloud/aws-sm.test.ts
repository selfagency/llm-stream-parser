/* oxlint-disable xss/no-mixed-html -- Test inputs intentionally include mixed HTML/XML */
import { describe, expect, it, vi } from 'vitest';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  // biome-ignore lint/complexity/useArrowFunction: function keyword required for constructibility
  // biome-ignore lint/style/useConsistentObjectDefinitions: function keyword required for constructibility
  SecretsManagerClient: function () {
    return { send: mockSend };
  },
  // biome-ignore lint/complexity/useArrowFunction: function keyword required for constructibility
  // biome-ignore lint/style/useConsistentObjectDefinitions: function keyword required for constructibility
  GetSecretValueCommand: function (args: unknown) {
    return args;
  },
  // biome-ignore lint/complexity/useArrowFunction: function keyword required for constructibility
  // biome-ignore lint/style/useConsistentObjectDefinitions: function keyword required for constructibility
  ListSecretsCommand: function (args: unknown) {
    return args;
  }
}));

import { createAwsSmKeyring } from './aws-sm.js';

describe('AwsSmKeyring', () => {
  it('check returns true when secret exists', async () => {
    mockSend.mockResolvedValue({ SecretString: 'val' });
    const keyring = createAwsSmKeyring({ region: 'us-east-1' });
    await expect(keyring.check('my-key')).resolves.toBe(true);
  });

  it('check returns false when secret missing', async () => {
    mockSend.mockRejectedValue(new Error('not found'));
    const keyring = createAwsSmKeyring({ region: 'us-east-1' });
    await expect(keyring.check('missing')).resolves.toBe(false);
  });

  it('resolve returns secret string', async () => {
    mockSend.mockResolvedValue({ SecretString: 'super-secret' });
    const keyring = createAwsSmKeyring();
    await expect(keyring.resolve('my-key')).resolves.toBe('super-secret');
  });

  it('resolve throws when no SecretString', async () => {
    mockSend.mockResolvedValue({});
    const keyring = createAwsSmKeyring();
    await expect(keyring.resolve('my-key')).rejects.toThrow('no secret string');
  });

  it('list returns secret names', async () => {
    mockSend.mockResolvedValue({
      SecretList: [{ Name: 'key1' }, { Name: 'key2' }]
    });
    const keyring = createAwsSmKeyring();
    await expect(keyring.list()).resolves.toEqual(['key1', 'key2']);
  });
});
