import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from './registry.js';
import type { KeyringProvider, ProviderCapabilities } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopCapabilities: ProviderCapabilities = {
  canList: true,
  canSync: false,
  canTtl: false
};

function createMockProvider(overrides: Partial<KeyringProvider> & { id: string }): KeyringProvider {
  const { id, resourceTypes: rt, check, resolve, list, ...rest } = overrides;
  return {
    id,
    name: rest.name ?? `Provider ${id}`,
    capabilities: rest.capabilities ?? noopCapabilities,
    resourceTypes: rt ?? [],
    check: check ?? vi.fn().mockResolvedValue(false),
    resolve: resolve ?? vi.fn().mockResolvedValue('mock-secret'),
    list: list ?? vi.fn().mockResolvedValue([]),
    ...rest
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProviderRegistry', () => {
  it('starts empty', () => {
    const registry = new ProviderRegistry();
    expect(registry.getAll()).toEqual([]);
  });

  it('registers a provider', () => {
    const registry = new ProviderRegistry();
    const provider = createMockProvider({ id: 'test' });
    registry.register(provider);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getProvider('test')).toBe(provider);
  });

  describe('findForResource', () => {
    it('returns the provider for a matching resource type (declared)', async () => {
      const registry = new ProviderRegistry();
      const provider = createMockProvider({ id: 'vault', resourceTypes: ['db', 'ci'] });
      registry.register(provider);

      const found = await registry.findForResource('db');
      expect(found).toBe(provider);
    });

    it('returns undefined when no provider matches', async () => {
      const registry = new ProviderRegistry();
      const provider = createMockProvider({ id: 'vault', resourceTypes: ['db'] });
      registry.register(provider);

      const found = await registry.findForResource('unknown');
      expect(found).toBeUndefined();
    });

    it('checks via slow path when resourceTypes not declared', async () => {
      const registry = new ProviderRegistry();
      const check = vi.fn().mockResolvedValue(true);
      const provider = createMockProvider({ id: 'vault', check, resourceTypes: [] });
      registry.register(provider);

      const found = await registry.findForResource('db');
      expect(found).toBe(provider);
      expect(check).toHaveBeenCalledWith('db');
    });

    it('first-match-wins: returns the first registered provider', async () => {
      const registry = new ProviderRegistry();
      const first = createMockProvider({ id: 'first', resourceTypes: ['db'] });
      const second = createMockProvider({ id: 'second', resourceTypes: ['db'] });
      registry.register(first);
      registry.register(second);

      const found = await registry.findForResource('db');
      expect(found).toBe(first);
    });

    it('falls through to check() when declared resourceTypes do not match', async () => {
      const registry = new ProviderRegistry();
      const check = vi.fn().mockResolvedValue(true);
      const provider = createMockProvider({ id: 'vault', resourceTypes: ['ci'], check });
      registry.register(provider);

      const found = await registry.findForResource('db');
      expect(found).toBe(provider);
      expect(check).toHaveBeenCalledWith('db');
    });
  });

  describe('resolve', () => {
    it('resolves through the matching provider', async () => {
      const registry = new ProviderRegistry();
      const resolve = vi.fn().mockResolvedValue('super-secret');
      const provider = createMockProvider({ id: 'vault', resourceTypes: ['db'], resolve });
      registry.register(provider);

      const value = await registry.resolve('db');
      expect(value).toBe('super-secret');
    });

    it('throws when no provider can resolve', async () => {
      const registry = new ProviderRegistry();
      await expect(registry.resolve('unknown')).rejects.toThrow('No provider can resolve resource type "unknown"');
    });

    it('re-throws provider errors', async () => {
      const registry = new ProviderRegistry();
      const resolve = vi.fn().mockRejectedValue(new Error('CLI not found'));
      const provider = createMockProvider({ id: 'test', resourceTypes: ['db'], resolve });
      registry.register(provider);

      await expect(registry.resolve('db')).rejects.toThrow('CLI not found');
    });
  });

  describe('listAll', () => {
    it('returns all resource types across providers', async () => {
      const registry = new ProviderRegistry();
      const vault = createMockProvider({
        id: 'vault',
        list: vi.fn().mockResolvedValue(['db', 'ci'])
      });
      const aws = createMockProvider({
        id: 'aws-sm',
        list: vi.fn().mockResolvedValue(['deploy'])
      });
      registry.register(vault);
      registry.register(aws);

      const items = await registry.listAll();
      expect(items).toEqual([
        { resourceType: 'db', providerId: 'vault' },
        { resourceType: 'ci', providerId: 'vault' },
        { resourceType: 'deploy', providerId: 'aws-sm' }
      ]);
    });

    it('skips providers that error on list', async () => {
      const registry = new ProviderRegistry();
      const broken = createMockProvider({
        id: 'broken',
        list: vi.fn().mockRejectedValue(new Error('fail'))
      });
      const good = createMockProvider({
        id: 'good',
        list: vi.fn().mockResolvedValue(['secret'])
      });
      registry.register(broken);
      registry.register(good);

      const items = await registry.listAll();
      expect(items).toEqual([{ resourceType: 'secret', providerId: 'good' }]);
    });
  });

  describe('getProvider', () => {
    it('returns a provider by id', () => {
      const registry = new ProviderRegistry();
      const provider = createMockProvider({ id: 'vault' });
      registry.register(provider);
      expect(registry.getProvider('vault')).toBe(provider);
    });

    it('returns undefined for unknown id', () => {
      const registry = new ProviderRegistry();
      expect(registry.getProvider('nope')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('removes all providers', () => {
      const registry = new ProviderRegistry();
      registry.register(createMockProvider({ id: 'a' }));
      registry.register(createMockProvider({ id: 'b' }));
      registry.clear();
      expect(registry.getAll()).toEqual([]);
    });
  });
});
