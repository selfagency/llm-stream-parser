import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RedactionRule } from './redaction-rules.js';
import {
  exportRedactionRules,
  getGlobalRulesPath,
  getWorkspaceRulesPath,
  importRedactionRules,
  RedactionRulesEngine
} from './redaction-rules.js';

describe('RedactionRulesEngine', () => {
  it('applies a single redaction rule', () => {
    const rules: RedactionRule[] = [
      {
        id: 'redact-ips',
        name: 'Redact IPs',
        pattern: String.raw`\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`,
        replacement: '[IP]',
        enabled: true,
        scope: ['logs']
      }
    ];
    const engine = new RedactionRulesEngine(rules);
    const { sanitized, matches } = engine.apply('Error from 192.168.1.1', 'logs');
    expect(sanitized).toBe('Error from [IP]');
    expect(matches).toHaveLength(1);
  });

  it('applies multiple rules across scopes', () => {
    const rules: RedactionRule[] = [
      {
        id: 'r1',
        name: 'IP',
        pattern: String.raw`\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`,
        replacement: '[IP]',
        enabled: true,
        scope: ['logs', 'config']
      },
      {
        id: 'r2',
        name: 'Email',
        pattern: String.raw`[\w.-]+@[\w.-]+\.\w+`,
        replacement: '[EMAIL]',
        enabled: true,
        scope: ['logs']
      }
    ];
    const engine = new RedactionRulesEngine(rules);
    const { sanitized } = engine.apply('admin@example.com from 10.0.0.1', 'logs');
    expect(sanitized).toBe('[EMAIL] from [IP]');
  });

  it('respects scope filtering', () => {
    const rules: RedactionRule[] = [
      {
        id: 'logs-only',
        name: 'Logs Only',
        pattern: 'secret',
        replacement: '[REDACTED]',
        enabled: true,
        scope: ['logs']
      }
    ];
    const engine = new RedactionRulesEngine(rules);
    const { sanitized, matches } = engine.apply('this is a secret', 'prompt');
    expect(sanitized).toBe('this is a secret');
    expect(matches).toHaveLength(0);
  });

  it('skips disabled rules', () => {
    const rules: RedactionRule[] = [
      {
        id: 'disabled',
        name: 'Disabled',
        pattern: 'secret',
        replacement: '[REDACTED]',
        enabled: false,
        scope: ['logs']
      }
    ];
    const engine = new RedactionRulesEngine(rules);
    expect(engine.activeRuleCount).toBe(0);
    const { sanitized } = engine.apply('secret', 'logs');
    expect(sanitized).toBe('secret');
  });

  it('handles invalid regex gracefully', () => {
    const rules: RedactionRule[] = [
      { id: 'bad', name: 'Bad', pattern: '[invalid', replacement: '[X]', enabled: true, scope: ['logs'] }
    ];
    const engine = new RedactionRulesEngine(rules);
    // Invalid regex is skipped silently
    expect(engine.activeRuleCount).toBe(1); // rule exists but pattern failed to compile
    const { sanitized } = engine.apply('test [invalid', 'logs');
    expect(sanitized).toBe('test [invalid'); // no redaction applied
  });

  it('reports match details', () => {
    const rules: RedactionRule[] = [
      { id: 'r1', name: 'Test Rule', pattern: 'secret', replacement: '[X]', enabled: true, scope: ['logs'] }
    ];
    const engine = new RedactionRulesEngine(rules);
    const { matches } = engine.apply('top secret info', 'logs');
    expect(matches[0]?.id).toBe('r1');
    expect(matches[0]?.replacement).toBe('[X]');
    expect(matches[0]?.start).toBe(4);
    expect(matches[0]?.end).toBe(10);
  });
});

describe('redaction rules file I/O', () => {
  const tmpFile = join(tmpdir(), 'test-redaction-rules.json');

  afterEach(async () => {
    try {
      await unlink(tmpFile);
    } catch {
      /* fine */
    }
  });

  it('exports and imports rules', async () => {
    const rules: RedactionRule[] = [
      { id: 'test1', name: 'Test 1', pattern: 'foo', replacement: 'bar', enabled: true, scope: ['logs'] }
    ];
    await exportRedactionRules(rules, tmpFile);
    const imported = await importRedactionRules(tmpFile);
    expect(imported).toHaveLength(1);
    expect(imported[0]?.id).toBe('test1');
    expect(imported[0]?.replacement).toBe('bar');
  });

  it('returns default paths', () => {
    expect(getGlobalRulesPath()).toContain('.agentsy/redaction-rules.json');
    expect(getWorkspaceRulesPath()).toContain('.agentsy/redaction-rules.json');
  });
});
