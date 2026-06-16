import { createHash } from 'node:crypto';
import type { Logger } from '../types.js';

export interface ScopeManagerDeps {
  logger: Logger;
}

export class ScopeManager {
  private readonly scopes = new Map<string, { path: string; createdAt: number }>();
  private readonly deps: ScopeManagerDeps;

  constructor(deps: ScopeManagerDeps) {
    this.deps = deps;
  }

  initialize(): Promise<void> {
    this.deps.logger.info('ScopeManager initialized');
    return Promise.resolve();
  }

  /**
   * Derive a folder-based scope key from an absolute path.
   * Format: folder:[sha256-hash-first-12-chars]
   */
  deriveScopeKey(absolutePath: string): string {
    const hash = createHash('sha256').update(absolutePath).digest('hex');
    return `folder:${hash.slice(0, 12)}`;
  }

  registerScope(absolutePath: string): string {
    const key = this.deriveScopeKey(absolutePath);
    if (!this.scopes.has(key)) {
      this.scopes.set(key, { path: absolutePath, createdAt: Date.now() });
    }
    return key;
  }

  getScope(key: string): { path: string; createdAt: number } | undefined {
    return this.scopes.get(key);
  }

  listScopes(): { key: string; path: string; createdAt: number }[] {
    return Array.from(this.scopes.entries()).map(([key, scope]) => ({
      key,
      ...scope
    }));
  }

  removeScope(key: string): boolean {
    return this.scopes.delete(key);
  }
}
