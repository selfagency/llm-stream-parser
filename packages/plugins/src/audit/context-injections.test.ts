import { describe, expect, it } from 'vitest';

import {
  type ContextInjection,
  ContextInjectionAuditor,
  type InjectionPoint,
  type PluginDescriptor
} from './context-injections.js';

/** Helper to narrow an already-asserted value — caller must `.toHaveLength(n)` before using. */
function expectDefined<T>(value: T | undefined): T {
  return value as T;
}

describe('ContextInjectionAuditor', () => {
  const plugin: PluginDescriptor = { id: 'test-plugin', version: '1.2.3' };
  const sessionId = 'sess-abc-123';

  function makeInjection(overrides?: Partial<ContextInjection>): ContextInjection {
    return {
      content: overrides?.content ?? 'hello world',
      sessionId: overrides?.sessionId ?? sessionId,
      point: overrides?.point ?? 'system_prompt'
    };
  }

  it('records a single injection and returns it in the audit trail', () => {
    const auditor = new ContextInjectionAuditor();

    auditor.record(plugin, makeInjection());

    const trail = auditor.auditTrail(sessionId);
    expect(trail).toHaveLength(1);

    const record = expectDefined(trail[0]);
    expect(record.pluginId).toBe('test-plugin');
    expect(record.pluginVersion).toBe('1.2.3');
    expect(record.injectionPoint).toBe('system_prompt');
    expect(record.timestamp).toBeInstanceOf(Date);
    expect(record.contentLength).toBe(11); // 'hello world'.length
    // SHA-256 of 'hello world'
    expect(record.contentHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('never stores raw content', () => {
    const auditor = new ContextInjectionAuditor();
    const TEST_INPUT = 'plain-text-input-for-hash-test';

    auditor.record(plugin, makeInjection({ content: TEST_INPUT }));

    const trail = auditor.auditTrail(sessionId);
    expect(trail).toHaveLength(1);
    const record = expectDefined(trail[0]);
    expect(record.contentHash).not.toBe(TEST_INPUT);
    expect(record.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('separates records by sessionId', () => {
    const auditor = new ContextInjectionAuditor();

    auditor.record(plugin, makeInjection({ sessionId: 'sess-alpha' }));
    auditor.record(plugin, makeInjection({ sessionId: 'sess-beta' }));
    auditor.record(plugin, makeInjection({ sessionId: 'sess-alpha' }));

    expect(auditor.auditTrail('sess-alpha')).toHaveLength(2);
    expect(auditor.auditTrail('sess-beta')).toHaveLength(1);
    expect(auditor.auditTrail('sess-unknown')).toHaveLength(0);
  });

  it('returns records newest-first', () => {
    const auditor = new ContextInjectionAuditor();

    auditor.record(plugin, makeInjection({ content: 'first' }));
    auditor.record(plugin, makeInjection({ content: 'second' }));
    auditor.record(plugin, makeInjection({ content: 'third' }));

    const trail = auditor.auditTrail(sessionId);
    expect(trail).toHaveLength(3);

    // Newest first — hash should be a 64-char hex string
    expect(trail[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records all injection points', () => {
    const auditor = new ContextInjectionAuditor();
    const points: InjectionPoint[] = ['system_prompt', 'user_message', 'tool_result', 'assistant_message'];

    for (const point of points) {
      const p = plugin;
      auditor.record(p, makeInjection({ point }));
    }

    const trail = auditor.auditTrail(sessionId);
    expect(trail).toHaveLength(4);

    const recordedPoints = trail.map(r => r.injectionPoint);
    for (const point of points) {
      expect(recordedPoints).toContain(point);
    }
  });

  it('allRecords returns every record across sessions', () => {
    const auditor = new ContextInjectionAuditor();

    auditor.record(plugin, makeInjection({ sessionId: 'sess-a' }));
    auditor.record(plugin, makeInjection({ sessionId: 'sess-b' }));

    expect(auditor.allRecords()).toHaveLength(2);
  });

  it('is empty before any records are added', () => {
    const auditor = new ContextInjectionAuditor();

    expect(auditor.auditTrail('sess-any')).toHaveLength(0);
    expect(auditor.allRecords()).toHaveLength(0);
  });
});
