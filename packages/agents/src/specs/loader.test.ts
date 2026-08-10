import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENT_IDS, loadAgentSpec, loadAllDefaultSpecs } from './loader.js';

describe('AgentSpec Loader', () => {
  describe('loadAgentSpec', () => {
    it('loads coder spec from YAML', () => {
      const spec = loadAgentSpec('coder');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('coder');
      expect(spec?.role).toBeTruthy();
    });

    it('loads researcher spec from YAML', () => {
      const spec = loadAgentSpec('researcher');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('researcher');
    });

    it('loads planner spec from YAML', () => {
      const spec = loadAgentSpec('planner');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('planner');
    });

    it('loads general spec from YAML', () => {
      const spec = loadAgentSpec('general');
      expect(spec).not.toBeNull();
      expect(spec?.name).toBe('general');
    });

    it('returns null for unknown spec', () => {
      const spec = loadAgentSpec('unknown' as never);
      expect(spec).toBeNull();
    });

    it('all specs parse as valid AgentSpec', () => {
      for (const id of DEFAULT_AGENT_IDS) {
        const spec = loadAgentSpec(id);
        expect(spec, `Spec ${id} should be loadable`).not.toBeNull();
      }
    });
  });

  describe('loadAllDefaultSpecs', () => {
    it('returns all default specs', () => {
      const specs = loadAllDefaultSpecs();
      expect(specs.length).toBe(DEFAULT_AGENT_IDS.length);
      const names = specs.map(s => s.name);
      expect(names).toContain('coder');
      expect(names).toContain('researcher');
      expect(names).toContain('planner');
      expect(names).toContain('general');
    });
  });
});
