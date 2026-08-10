/**
 * Shared types for registry adapters.
 *
 * @module
 */

export interface RegistryEntry {
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly version?: string;
}

export interface RegistryAdapter {
  get(id: string): Promise<RegistryEntry | null>;
  list(): Promise<RegistryEntry[]>;
  readonly name: string;
  search(query: string): Promise<RegistryEntry[]>;
}
