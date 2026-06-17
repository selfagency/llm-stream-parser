import { describe, expect, it } from 'vitest';

import { DEFAULT_ETHICS_REGISTRY, EthicsRegistry } from './registry.js';

describe('EthicsRegistry', () => {
  it('loads all clauses from the default registry', () => {
    expect(DEFAULT_ETHICS_REGISTRY.all.length).toBeGreaterThan(50);
  });

  it('every clause has a non-empty id', () => {
    for (const clause of DEFAULT_ETHICS_REGISTRY.all) {
      expect(clause.id).toBeTruthy();
    }
  });

  it('every clause has a valid source', () => {
    const validSources = ['ETHICS.md', 'SAFETY.md', 'GOVERNANCE.md', 'constitution.md'];
    for (const clause of DEFAULT_ETHICS_REGISTRY.all) {
      expect(validSources).toContain(clause.source);
    }
  });

  it('every clause has a valid enforceableAs value', () => {
    const validTypes = ['scanner', 'policy-rule', 'prompt-module', 'release-gate'];
    for (const clause of DEFAULT_ETHICS_REGISTRY.all) {
      expect(validTypes).toContain(clause.enforceableAs);
    }
  });

  it('every clause has implementedBy or is a known gap', () => {
    for (const clause of DEFAULT_ETHICS_REGISTRY.all) {
      // At this phase, all clauses are known gaps (implementedBy === null)
      // Phases 9-11 will populate implementedBy for scanner-enforceable clauses
      expect(clause.implementedBy).toBeNull();
    }
  });

  it('getEthicsGaps returns all clauses when none are implemented', () => {
    const gaps = DEFAULT_ETHICS_REGISTRY.getEthicsGaps();
    expect(gaps.length).toBe(DEFAULT_ETHICS_REGISTRY.all.length);
  });

  it('getClausesBySource returns clauses from the specified document', () => {
    const ethicsClauses = DEFAULT_ETHICS_REGISTRY.getClausesBySource('ETHICS.md');
    expect(ethicsClauses.length).toBeGreaterThan(20);
    for (const clause of ethicsClauses) {
      expect(clause.source).toBe('ETHICS.md');
    }
  });

  it('getClausesForScanner returns empty when no scanners are implemented', () => {
    const clauses = DEFAULT_ETHICS_REGISTRY.getClausesForScanner('prompt-injection');
    expect(clauses.length).toBe(0);
  });

  it('get returns undefined for unknown id', () => {
    expect(DEFAULT_ETHICS_REGISTRY.get('nonexistent')).toBeUndefined();
  });

  it('get returns a clause by id', () => {
    const clause = DEFAULT_ETHICS_REGISTRY.get('ethics:no-manipulative-sycophancy');
    expect(clause).toBeDefined();
    expect(clause?.source).toBe('ETHICS.md');
    expect(clause?.section).toBe('§3');
  });

  it('implementedCount is 0 when no scanners are implemented', () => {
    expect(DEFAULT_ETHICS_REGISTRY.implementedCount).toBe(0);
  });

  it('gapCount equals total clauses when none are implemented', () => {
    expect(DEFAULT_ETHICS_REGISTRY.gapCount).toBe(DEFAULT_ETHICS_REGISTRY.all.length);
  });

  it('custom registry with implemented clauses works', () => {
    const registry = new EthicsRegistry([
      {
        id: 'test:scanner',
        source: 'ETHICS.md',
        section: '§1',
        text: 'Test clause',
        enforceableAs: 'scanner',
        implementedBy: 'test-scanner'
      },
      {
        id: 'test:gap',
        source: 'SAFETY.md',
        section: '§2',
        text: 'Gap clause',
        enforceableAs: 'scanner',
        implementedBy: null
      }
    ]);

    expect(registry.implementedCount).toBe(1);
    expect(registry.gapCount).toBe(1);
    expect(registry.getClausesForScanner('test-scanner').length).toBe(1);
    expect(registry.getEthicsGaps().length).toBe(1);
  });
});
