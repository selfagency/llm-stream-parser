import { type AtlasConstraintId, CONSTRAINTS } from '@agentsy/atlas';
import { describe, expect, it } from 'vitest';
import { CONSTRAINT_TO_CONFIG, getConfigField, getConfigGaps, getMappedConstraints } from '../src/atlas-mapping.js';

describe('CONSTRAINT_TO_CONFIG exhaustiveness', () => {
  it('every AtlasConstraintId in the snapshot has an entry', () => {
    const snapshotIds = new Set(CONSTRAINTS.map(c => c.id));
    const mappedIds = new Set(CONSTRAINT_TO_CONFIG.keys());
    const missing = [...snapshotIds].filter(id => !mappedIds.has(id as AtlasConstraintId));
    const extra = [...mappedIds].filter(id => !snapshotIds.has(id));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('getConfigGaps returns only null-mapped constraints', () => {
    const gaps = getConfigGaps();
    for (const id of gaps) {
      expect(CONSTRAINT_TO_CONFIG.get(id)).toBeNull();
    }
  });

  it('getMappedConstraints returns only non-null-mapped constraints', () => {
    const mapped = getMappedConstraints();
    for (const id of mapped) {
      expect(CONSTRAINT_TO_CONFIG.get(id)).not.toBeNull();
    }
  });

  it('getConfigField returns the right field', () => {
    expect(getConfigField('const_privacy')).toBe('piiRedaction');
    expect(getConfigField('const_data_residency')).toBe('localOnly');
    expect(getConfigField('const_audit_log')).toBeNull();
  });

  it('privacy constraint maps to piiRedaction', () => {
    expect(CONSTRAINT_TO_CONFIG.get('const_privacy')).toBe('piiRedaction');
  });

  it('human_loop constraint maps to approvalRequiredFor', () => {
    expect(CONSTRAINT_TO_CONFIG.get('const_human_loop')).toBe('approvalRequiredFor');
  });

  it('data_retention maps to memoryPolicy', () => {
    expect(CONSTRAINT_TO_CONFIG.get('const_data_retention')).toBe('memoryPolicy');
  });

  it('rate_limit maps to tokenQuota', () => {
    expect(CONSTRAINT_TO_CONFIG.get('const_rate_limit')).toBe('tokenQuota');
  });
});
