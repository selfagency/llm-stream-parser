/**
 * ProviderRegistry — discover, register, and resolve by resource type.
 *
 * The registry acts as the single entry point for credential resolution.
 * Providers are registered during initialization (from config) and the
 * broker delegates resolution to the registry.
 */

import type { KeyringProvider } from './types.js';

/**
 * A provider entry in the registry, optionally linked to its config section.
 */
interface ProviderEntry {
  provider: KeyringProvider;
}

/**
 * Registry of KeyringProviders with first-match-wins resolution.
 *
 * Resolution order is the order providers were registered (config-file
 * ordering or explicit register() calls).
 */
export class ProviderRegistry {
  entries: ProviderEntry[] = [];

  /**
   * Register a provider. Providers registered first take priority for
   * resource-type resolution.
   */
  register(provider: KeyringProvider): void {
    this.entries.push({ provider });
  }

  /**
   * Find a provider that can resolve the given resource type.
   * First-match-wins — checks registration order.
   */
  async findForResource(resourceType: string): Promise<KeyringProvider | undefined> {
    for (const entry of this.entries) {
      const p = entry.provider;
      // Fast path: check declared resourceTypes first.
      if (p.resourceTypes.includes(resourceType)) {
        return p;
      }
      // Slow path: ask the provider.
      if (await p.check(resourceType)) {
        return p;
      }
    }
  }

  /**
   * Resolve a secret for the given resource type.
   * Throws if no provider can handle it or the provider fails.
   */
  async resolve(resourceType: string): Promise<string> {
    const provider = await this.findForResource(resourceType);
    if (!provider) {
      throw new Error(`No provider can resolve resource type "${resourceType}"`);
    }
    return provider.resolve(resourceType);
  }

  /**
   * List all available resource types across registered providers.
   */
  async listAll(): Promise<Array<{ resourceType: string; providerId: string }>> {
    const results: Array<{ resourceType: string; providerId: string }> = [];

    for (const entry of this.entries) {
      try {
        const types = await entry.provider.list();
        for (const resourceType of types) {
          results.push({ resourceType, providerId: entry.provider.id });
        }
      } catch {
        // Skip providers that error on list.
      }
    }

    return results;
  }

  /**
   * Get a specific provider by ID.
   */
  getProvider(id: string): KeyringProvider | undefined {
    for (const entry of this.entries) {
      if (entry.provider.id === id) {
        return entry.provider;
      }
    }
  }

  /**
   * Return all registered providers.
   */
  getAll(): KeyringProvider[] {
    return this.entries.map(e => e.provider);
  }

  /**
   * Remove all registered providers.
   */
  clear(): void {
    this.entries = [];
  }
}
