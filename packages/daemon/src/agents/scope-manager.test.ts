import { describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { ScopeManager } from './scope-manager.js';

describe('ScopeManager', () => {
  const logger = createMockLogger();

  it('should derive consistent scope keys', () => {
    const mgr = new ScopeManager({ logger });
    const key1 = mgr.deriveScopeKey('/home/user/project');
    const key2 = mgr.deriveScopeKey('/home/user/project');
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^folder:[a-f0-9]{12}$/);
  });

  it('should derive different keys for different paths', () => {
    const mgr = new ScopeManager({ logger });
    const key1 = mgr.deriveScopeKey('/home/user/project-a');
    const key2 = mgr.deriveScopeKey('/home/user/project-b');
    expect(key1).not.toBe(key2);
  });

  it('should register and retrieve scopes', () => {
    const mgr = new ScopeManager({ logger });
    const key = mgr.registerScope('/home/user/project');
    const scope = mgr.getScope(key);
    expect(scope?.path).toBe('/home/user/project');
    expect(scope?.createdAt).toBeGreaterThan(0);
  });

  it('should not duplicate scope registrations', () => {
    const mgr = new ScopeManager({ logger });
    const key1 = mgr.registerScope('/home/user/project');
    const key2 = mgr.registerScope('/home/user/project');
    expect(key1).toBe(key2);
    expect(mgr.listScopes()).toHaveLength(1);
  });

  it('should list all scopes', () => {
    const mgr = new ScopeManager({ logger });
    mgr.registerScope('/a');
    mgr.registerScope('/b');
    expect(mgr.listScopes()).toHaveLength(2);
  });

  it('should remove a scope', () => {
    const mgr = new ScopeManager({ logger });
    const key = mgr.registerScope('/a');
    expect(mgr.removeScope(key)).toBe(true);
    expect(mgr.getScope(key)).toBeUndefined();
  });
});
