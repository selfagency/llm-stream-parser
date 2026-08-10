import { describe, expect, it } from 'vitest';
import {
  createGuardrailsHubAdapter,
  getValidatorDetails,
  listValidatorsByStatus,
  listValidatorsByStrategy
} from './guardrails-hub.js';

// ── Tests ─────────────────────────────────────────────────

describe('GuardrailsHubAdapter', () => {
  const adapter = createGuardrailsHubAdapter();

  describe('list', () => {
    it('should return all guardrail validators', async () => {
      const entries = await adapter.list();
      expect(entries.length).toBeGreaterThan(10);
    });

    it('should include id, name, description, and source for each entry', async () => {
      const entries = await adapter.list();

      for (const entry of entries) {
        expect(entry.id).toBeTruthy();
        expect(entry.name).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.source).toBe('guardrails-hub');
      }
    });

    it('should include strategy and port status in description', async () => {
      const entries = await adapter.list();
      expect(entries.every(e => e.description.includes('['))).toBe(true);
    });

    it('should include builtin:valid-length in catalog', async () => {
      const entries = await adapter.list();
      const validLength = entries.find(e => e.id === 'builtin:valid-length');
      expect(validLength).toBeDefined();
      expect(validLength?.name).toBe('ValidLength');
    });
  });

  describe('search', () => {
    it('should find by name', async () => {
      const results = await adapter.search('ValidLength');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.name).toBe('ValidLength');
    });

    it('should find by id', async () => {
      const results = await adapter.search('builtin:valid-email');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]?.id).toBe('builtin:valid-email');
    });

    it('should find by strategy', async () => {
      const llmResults = await adapter.search('llm');
      expect(llmResults.length).toBeGreaterThanOrEqual(3);

      const mlResults = await adapter.search('ml');
      expect(mlResults.length).toBeGreaterThanOrEqual(3);
    });

    it('should find by description keyword', async () => {
      const results = await adapter.search('toxic');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should search case-insensitive', async () => {
      const results = await adapter.search('regex');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty for no matches', async () => {
      const results = await adapter.search('zzzznothing');
      expect(results).toEqual([]);
    });
  });

  describe('get', () => {
    it('should return a validator by id', async () => {
      const entry = await adapter.get('builtin:valid-url');
      expect(entry).not.toBeNull();
      expect(entry?.name).toBe('ValidURL');
    });

    it('should include port info in description', async () => {
      const entry = await adapter.get('builtin:no-toxic-language');
      expect(entry?.description).toContain('RULE');
    });

    it('should return null for unknown id', async () => {
      const entry = await adapter.get('builtin:unknown-validator');
      expect(entry).toBeNull();
    });
  });

  describe('adapter name', () => {
    it('should expose the adapter name', () => {
      expect(adapter.name).toBe('guardrails-hub');
    });
  });

  describe('getValidatorDetails', () => {
    it('should return full validator details', () => {
      const details = getValidatorDetails('builtin:valid-length');
      expect(details).not.toBeNull();
      expect(details?.strategy).toBe('rule');
      expect(details?.portStatus).toBe('ported');
      expect(details?.pythonValidator).toBe('valid_length');
    });

    it('should return null for unknown id', () => {
      expect(getValidatorDetails('unknown')).toBeNull();
    });
  });

  describe('listValidatorsByStrategy', () => {
    it('should return only rule-based validators', () => {
      const rules = listValidatorsByStrategy('rule');
      expect(rules.length).toBeGreaterThan(10);
      expect(rules.every(v => v.strategy === 'rule')).toBe(true);
    });

    it('should return only LLM-based validators', () => {
      const llm = listValidatorsByStrategy('llm');
      expect(llm.length).toBeGreaterThanOrEqual(3);
      expect(llm.every(v => v.strategy === 'llm')).toBe(true);
    });

    it('should return only ML-based validators', () => {
      const ml = listValidatorsByStrategy('ml');
      expect(ml.length).toBeGreaterThanOrEqual(3);
      expect(ml.every(v => v.strategy === 'ml')).toBe(true);
    });
  });

  describe('listValidatorsByStatus', () => {
    it('should return ported validators', () => {
      const ported = listValidatorsByStatus('ported');
      expect(ported.length).toBeGreaterThan(5);
      expect(ported.every(v => v.portStatus === 'ported')).toBe(true);
    });

    it('should return deferred validators', () => {
      const deferred = listValidatorsByStatus('deferred');
      expect(deferred.length).toBeGreaterThanOrEqual(3);
      expect(deferred.every(v => v.portStatus === 'deferred')).toBe(true);
    });
  });
});
