import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import {
  ACPEventLedger,
  createACPEventLedger,
  keepForkedEventPredicate,
  parseJsonlLine,
  replayFromJsonl
} from './acp-event-ledger.js';

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

  it('should work via factory function', () => {
    ledger.close();
    cleanDb();
    const factoryLedger = createACPEventLedger({ dbPath: TEST_DB, logger: createMockLogger() });
    factoryLedger.record('sess-factory', 'session.create', { cwd: '/tmp' });
    expect(factoryLedger.countSessionEvents('sess-factory')).toBe(1);
    factoryLedger.close();
    // Recreate ledger for afterEach cleanup
    ledger = new ACPEventLedger(TEST_DB, createMockLogger());
  });
});

describe('ACPEventLedger JSONL', () => {
  const jsonlDb = join(tmpdir(), `acp-ledger-jsonl-${randomUUID().slice(0, 8)}.db`);
  let ledger: ACPEventLedger;

  function cleanJsonlDb(): void {
    if (existsSync(jsonlDb)) {
      unlinkSync(jsonlDb);
    }
  }

  beforeEach(() => {
    cleanJsonlDb();
    ledger = new ACPEventLedger(jsonlDb, createMockLogger());
  });

  afterEach(() => {
    ledger.close();
    cleanJsonlDb();
  });

  it('should preserve event append ordering via sequence', () => {
    ledger.record('sess-a', 'session.create', { cwd: '/tmp' });
    ledger.record('sess-a', 'session.prompt', { prompt: 'first' });
    ledger.record('sess-a', 'session.prompt', { prompt: 'second' });
    ledger.record('sess-a', 'tool.call', { toolCallId: '1', name: 'read' });
    ledger.record('sess-a', 'stream.end', { content: 'done' });

    const events = ledger.getSessionEvents('sess-a');
    expect(events).toHaveLength(5);
    expect(events.map(e => e.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(events.map(e => e.eventType)).toEqual([
      'session.create',
      'session.prompt',
      'session.prompt',
      'tool.call',
      'stream.end'
    ]);
  });

  it('should export JSONL with one object per line', () => {
    ledger.record('sess-b', 'session.create', { cwd: '/tmp' });
    ledger.record('sess-b', 'session.prompt', { prompt: 'hello' });
    ledger.record('sess-b', 'stream.end', { content: 'world' });

    const jsonl = ledger.exportJsonl('sess-b');
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      const parsed = JSON.parse(line) as { sessionId: string; sequence: number; eventType: string };
      expect(parsed.sessionId).toBe('sess-b');
      expect(typeof parsed.sequence).toBe('number');
    }
  });

  it('should replay from JSONL reconstructing identical session state', () => {
    // Create original session
    ledger.record('sess-orig', 'session.create', { cwd: '/project', systemPrompt: 'you are helpful' });
    ledger.record('sess-orig', 'session.prompt', { prompt: 'write hello world' });
    ledger.record('sess-orig', 'reasoning', { content: 'need to think about this' });
    ledger.record('sess-orig', 'tool.call', {
      toolCallId: 'tc-1',
      name: 'write_file',
      arguments: { path: 'hello.py' }
    });
    ledger.record('sess-orig', 'tool.result', { toolCallId: 'tc-1', result: 'written', status: 'completed' });
    ledger.record('sess-orig', 'stream.chunk', { content: 'partial...' });
    ledger.record('sess-orig', 'stream.end', {
      content: 'print("hello world")',
      usage: { inputTokens: 100, outputTokens: 50 }
    });
    ledger.record('sess-orig', 'compaction', { summary: 'wrote file', originalTokens: 1000, compactedTokens: 200 });

    const originalEvents = ledger.getSessionEvents('sess-orig');
    const jsonl = ledger.exportJsonl('sess-orig');

    // Import into new session in second ledger (simulate fresh DB)
    const importDb = join(tmpdir(), `acp-ledger-import-${randomUUID().slice(0, 8)}.db`);
    const importLedger = new ACPEventLedger(importDb, createMockLogger());

    importLedger.importJsonl('sess-replayed', jsonl);
    const replayedEvents = importLedger.getSessionEvents('sess-replayed');

    // Verify identical state: same count, same types, same data, ordered by sequence
    expect(replayedEvents).toHaveLength(originalEvents.length);
    for (let i = 0; i < originalEvents.length; i++) {
      const orig = originalEvents[i];
      const rep = replayedEvents[i];
      expect(rep?.eventType).toBe(orig?.eventType);
      expect(rep?.sequence).toBe(orig?.sequence);
      expect(JSON.parse(rep?.eventData ?? '{}')).toEqual(JSON.parse(orig?.eventData ?? '{}'));
    }

    // Verify materialized views also identical
    const origViews = ledger.getMaterializedViews('sess-orig');
    const replayedViews = importLedger.getMaterializedViews('sess-replayed');
    expect(replayedViews.conversation).toHaveLength(origViews.conversation.length);
    expect(replayedViews.toolCalls).toHaveLength(origViews.toolCalls.length);

    importLedger.close();
    if (existsSync(importDb)) {
      unlinkSync(importDb);
    }
  });

  it('should handle static replayFromJsonl helper', () => {
    const jsonl = [
      JSON.stringify({
        sessionId: 's1',
        sequence: 1,
        timestamp: new Date().toISOString(),
        eventType: 'session.create',
        eventData: { cwd: '/tmp' },
        provenance: 'cli'
      }),
      JSON.stringify({
        sessionId: 's1',
        sequence: 2,
        timestamp: new Date().toISOString(),
        eventType: 'session.prompt',
        eventData: { prompt: 'hi' },
        provenance: 'cli'
      }),
      'invalid json line',
      ''
    ].join('\n');

    const records = replayFromJsonl(jsonl);
    expect(records).toHaveLength(2);
    expect(records[0]?.eventType).toBe('session.create');
    expect(records[1]?.eventType).toBe('session.prompt');
  });

  it('should parse single JSONL line with bounded validation', () => {
    const validLine = JSON.stringify({
      sessionId: 's1',
      sequence: 1,
      timestamp: new Date().toISOString(),
      eventType: 'session.create',
      eventData: { cwd: '/tmp' },
      provenance: 'cli'
    });
    expect(parseJsonlLine(validLine)?.sessionId).toBe('s1');
    expect(parseJsonlLine('')).toBeNull();
    expect(parseJsonlLine('not json')).toBeNull();
    expect(parseJsonlLine(JSON.stringify({ invalid: true }))).toBeNull();
  });
});

describe('ACPEventLedger materialized views', () => {
  const mvDb = join(tmpdir(), `acp-ledger-mv-${randomUUID().slice(0, 8)}.db`);
  let ledger: ACPEventLedger;

  function cleanMvDb(): void {
    if (existsSync(mvDb)) {
      unlinkSync(mvDb);
    }
  }

  beforeEach(() => {
    cleanMvDb();
    ledger = new ACPEventLedger(mvDb, createMockLogger());
  });

  afterEach(() => {
    ledger.close();
    cleanMvDb();
  });

  it('should derive conversation view (system+user+final-assistant)', () => {
    ledger.record('sess-cv', 'session.create', { cwd: '/tmp' });
    ledger.record('sess-cv', 'session.prompt', { prompt: 'hello' });
    ledger.record('sess-cv', 'tool.call', { toolCallId: '1', name: 'read' });
    ledger.record('sess-cv', 'stream.chunk', { content: 'partial' });
    ledger.record('sess-cv', 'stream.end', { content: 'final answer' });

    const conv = ledger.getConversationView('sess-cv');
    expect(conv).toHaveLength(3);
    expect(conv[0]?.eventType).toBe('session.create');
    expect(conv[1]?.eventType).toBe('session.prompt');
    expect(conv[2]?.eventType).toBe('stream.end');
  });

  it('should derive tool_calls view aggregating call+result', () => {
    ledger.record('sess-tc', 'tool.call', { toolCallId: 'tc-1', name: 'read_file', arguments: { path: '/a' } });
    ledger.record('sess-tc', 'tool.call', { toolCallId: 'tc-2', name: 'write_file', arguments: { path: '/b' } });
    ledger.record('sess-tc', 'tool.result', { toolCallId: 'tc-1', result: 'data', status: 'completed' });

    const toolCalls = ledger.getToolCallsView('sess-tc');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]?.toolCallId).toBe('tc-1');
    expect(toolCalls[0]?.result).toBe('data');
    expect(toolCalls[0]?.status).toBe('completed');
    expect(toolCalls[1]?.status).toBe('running');
  });

  it('should derive inference view from inference and stream events with usage', () => {
    ledger.record('sess-inf', 'inference', { model: 'claude', inputTokens: 10, outputTokens: 20 });
    ledger.record('sess-inf', 'stream.end', {
      content: 'hi',
      usage: { model: 'gpt', inputTokens: 5, outputTokens: 5 }
    });
    ledger.record('sess-inf', 'session.prompt', { prompt: 'no usage' });

    const inference = ledger.getInferenceView('sess-inf');
    expect(inference).toHaveLength(2);
    expect(inference[0]?.model).toBe('claude');
    expect(inference[1]?.inputTokens).toBe(5);
  });

  it('should derive compaction view', () => {
    ledger.record('sess-comp', 'compaction', { summary: 'did work', originalTokens: 1000, compactedTokens: 200 });
    ledger.record('sess-comp', 'session.prompt', { prompt: 'continue' });

    const compaction = ledger.getCompactionView('sess-comp');
    expect(compaction).toHaveLength(1);
    expect(compaction[0]?.summary).toBe('did work');
    expect(compaction[0]?.originalTokens).toBe(1000);
  });

  it('should return all materialized views together', () => {
    ledger.record('sess-all', 'session.create', { cwd: '/tmp' });
    ledger.record('sess-all', 'session.prompt', { prompt: 'hi' });
    ledger.record('sess-all', 'tool.call', { toolCallId: '1', name: 'read' });
    ledger.record('sess-all', 'tool.result', { toolCallId: '1', result: 'ok' });
    ledger.record('sess-all', 'stream.end', { content: 'done', usage: { inputTokens: 1 } });
    ledger.record('sess-all', 'compaction', { summary: 's' });

    const views = ledger.getMaterializedViews('sess-all');
    expect(views.conversation.length).toBeGreaterThan(0);
    expect(views.toolCalls.length).toBe(1);
    expect(views.inference.length).toBe(1);
    expect(views.compaction.length).toBe(1);
  });
});

describe('ACPEventLedger fork predicate', () => {
  const forkDb = join(tmpdir(), `acp-ledger-fork-${randomUUID().slice(0, 8)}.db`);
  let ledger: ACPEventLedger;

  function cleanForkDb(): void {
    if (existsSync(forkDb)) {
      unlinkSync(forkDb);
    }
  }

  beforeEach(() => {
    cleanForkDb();
    ledger = new ACPEventLedger(forkDb, createMockLogger());
  });

  afterEach(() => {
    ledger.close();
    cleanForkDb();
  });

  it('should filter with keep_forked_rollout_item predicate (system+user+final-assistant)', () => {
    ledger.record('src', 'session.create', { cwd: '/project' });
    ledger.record('src', 'session.prompt', { prompt: 'first' });
    ledger.record('src', 'reasoning', { content: 'thinking...' });
    ledger.record('src', 'tool.call', { toolCallId: '1', name: 'read' });
    ledger.record('src', 'tool.result', { toolCallId: '1', result: 'ok' });
    ledger.record('src', 'stream.chunk', { content: 'partial' });
    ledger.record('src', 'stream.end', { content: 'answer one' });
    ledger.record('src', 'session.prompt', { prompt: 'second' });
    ledger.record('src', 'stream.end', { content: 'answer two' });

    const sourceEvents = ledger.getSessionEvents('src');
    expect(sourceEvents).toHaveLength(9);

    const filtered = sourceEvents.filter(keepForkedEventPredicate);
    expect(filtered.map(e => e.eventType)).toEqual([
      'session.create',
      'session.prompt',
      'stream.end',
      'session.prompt',
      'stream.end'
    ]);
  });

  it('should fork session preserving conversation continuity', () => {
    ledger.record('src-fork', 'session.create', { cwd: '/tmp', systemPrompt: 'helpful' });
    ledger.record('src-fork', 'session.prompt', { prompt: 'question 1' });
    ledger.record('src-fork', 'tool.call', { toolCallId: '1', name: 'bash' });
    ledger.record('src-fork', 'tool.result', { toolCallId: '1', result: 'output' });
    ledger.record('src-fork', 'stream.end', { content: 'answer 1' });
    ledger.record('src-fork', 'session.prompt', { prompt: 'question 2' });
    ledger.record('src-fork', 'stream.end', { content: 'answer 2' });

    const forkedEvents = ledger.forkSession('src-fork', 'forked');
    expect(forkedEvents).toHaveLength(5); // create + prompt + end + prompt + end
    expect(forkedEvents.map(e => e.eventType)).toEqual([
      'session.create',
      'session.prompt',
      'stream.end',
      'session.prompt',
      'stream.end'
    ]);
    expect(forkedEvents.map(e => e.sequence)).toEqual([1, 2, 3, 4, 5]); // re-sequenced
    expect(forkedEvents.every(e => e.sessionId === 'forked')).toBe(true);

    // Conversation continuity: both user prompts preserved in order
    const conv = ledger.getConversationView('forked');
    expect(conv).toHaveLength(5);
    const userEntries = conv.filter(c => c.eventType === 'session.prompt');
    expect(userEntries).toHaveLength(2);
  });

  it('should support custom predicate for fork', () => {
    ledger.record('src-custom', 'session.create', {});
    ledger.record('src-custom', 'tool.call', { toolCallId: '1' });
    ledger.record('src-custom', 'session.prompt', { prompt: 'hi' });

    const onlyToolCalls = ledger.forkSession('src-custom', 'tool-only', e => e.eventType === 'tool.call');
    expect(onlyToolCalls).toHaveLength(1);
    expect(onlyToolCalls[0]?.eventType).toBe('tool.call');
  });

  it('should handle forking empty session', () => {
    const result = ledger.forkSession('nonexistent', 'new-session');
    expect(result).toHaveLength(0);
  });
});
