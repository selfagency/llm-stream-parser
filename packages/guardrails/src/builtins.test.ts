import { describe, expect, it } from 'vitest';
import { BUILTIN_SCANNER_IDS, createBuiltinScanners } from './builtins.js';

describe('createBuiltinScanners', () => {
  it('returns all built-in scanners', () => {
    const scanners = createBuiltinScanners();
    expect(scanners).toHaveLength(25);
  });

  it('each scanner has valid metadata', () => {
    const scanners = createBuiltinScanners();
    for (const s of scanners) {
      expect(s.metadata.id).toBeTruthy();
      expect(s.metadata.name).toBeTruthy();
      // Some scanners (e.g. FrustrationScanner) have no OWASP categories
      expect(Array.isArray(s.metadata.owaspCategories)).toBe(true);
      expect(typeof s.metadata.priority).toBe('number');
    }
  });

  it('includes all expected scanner IDs', () => {
    const scanners = createBuiltinScanners();
    const ids = scanners.map(s => s.metadata.id);
    for (const expected of BUILTIN_SCANNER_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('priority values are unique', () => {
    const scanners = createBuiltinScanners();
    const priorities = scanners.map(s => s.metadata.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('all scanners implement evaluate()', () => {
    const scanners = createBuiltinScanners();
    for (const s of scanners) {
      expect(typeof s.evaluate).toBe('function');
    }
  });
});
