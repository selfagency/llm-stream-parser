import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { ACPEventLedger } from './acp-event-ledger.js';

const TEST_DB = join(tmpdir(), `acp-ledger-test-${randomUUID().slice(0, 8)}.db`);

function cleanDb(): void {
  if (existsSync(TEST_DB)) {
    unlinkSync(TEST_DB);
  }
}

describe('ACPEventLedger', () => {
  let ledger: ACPEventLedger;

  beforeEach(() => {
    cleanDb();
    ledger = new ACPEventLedger(TEST_DB, createMockLogger());
  });

  afterEach(() => {
    ledger.close();
    cleanDb();
  });

  it('should record and retrieve events', () => {
    ledger.record('sess-1', 'session.create', { cwd: '/test' });
    const events = ledger.getSessionEvents('sess-1');
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('session.create');
    expect(events[0]?.sessionId).toBe('sess-1');
  });

  it('should preserve event ordering', () => {
    ledger.record('sess-1', 'session.create');
    ledger.record('sess-1', 'session.prompt', { prompt: 'hello' });
    ledger.record('sess-1', 'session.close');

    const events = ledger.getSessionEvents('sess-1');
    expect(events).toHaveLength(3);
    expect(events[0]?.eventType).toBe('session.create');
    expect(events[1]?.eventType).toBe('session.prompt');
    expect(events[2]?.eventType).toBe('session.close');
  });

  it('should support replay', () => {
    ledger.record('sess-1', 'session.create');
    ledger.record('sess-1', 'session.prompt', { prompt: 'test' });

    const replay = ledger.replaySession('sess-1');
    expect(replay).toHaveLength(2);
    expect(replay[0]?.eventType).toBe('session.create');
    expect(replay[1]?.eventData).toBe(JSON.stringify({ prompt: 'test' }));
  });

  it('should track session provenance', () => {
    ledger.record('sess-1', 'session.create', {}, 'acp-client');
    expect(ledger.getSessionProvenance('sess-1')).toBe('acp-client');

    ledger.record('sess-2', 'session.create', {}, 'cli');
    expect(ledger.getSessionProvenance('sess-2')).toBe('cli');
  });

  it('should count session events', () => {
    expect(ledger.countSessionEvents('sess-1')).toBe(0);
    ledger.record('sess-1', 'session.create');
    expect(ledger.countSessionEvents('sess-1')).toBe(1);
  });

  it('should handle multiple sessions independently', () => {
    ledger.record('sess-1', 'session.create');
    ledger.record('sess-2', 'session.create');
    ledger.record('sess-1', 'session.prompt', { text: 'hello' });

    expect(ledger.countSessionEvents('sess-1')).toBe(2);
    expect(ledger.countSessionEvents('sess-2')).toBe(1);
  });

  it('should return null for unknown session provenance', () => {
    expect(ledger.getSessionProvenance('unknown')).toBeNull();
  });
});
