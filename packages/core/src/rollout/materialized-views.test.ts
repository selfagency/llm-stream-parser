import { describe, expect, it } from 'vitest';
import type { RolloutItem } from './materialized-views.js';
import {
  createMaterializedViews,
  createRolloutItem,
  deriveCompactionView,
  deriveConversationView,
  deriveInferenceView,
  deriveToolCallsView,
  rolloutItemsFromJsonl,
  rolloutItemsToJsonl
} from './materialized-views.js';

function makeItem(
  seq: number,
  type: RolloutItem['type'],
  data: Record<string, unknown>,
  sessionId = 'test-session'
): RolloutItem {
  return createRolloutItem({
    sessionId,
    sequence: seq,
    type,
    data,
    timestamp: `2026-01-01T00:00:0${seq}Z`
  });
}

describe('materialized-views', () => {
  describe('deriveConversationView', () => {
    it('keeps system+user+assistant, drops reasoning/tool', () => {
      const items = [
        makeItem(1, 'system', { content: 'you are helpful' }),
        makeItem(2, 'user', { content: 'hello' }),
        makeItem(3, 'reasoning', { content: 'think...' }),
        makeItem(4, 'tool_call', { name: 'read', arguments: {} }),
        makeItem(5, 'assistant', { content: 'hi there' }),
        makeItem(6, 'tool_result', { result: 'ok' })
      ];
      const view = deriveConversationView(items);
      expect(view).toHaveLength(3);
      expect(view[0]?.role).toBe('system');
      expect(view[1]?.role).toBe('user');
      expect(view[2]?.role).toBe('assistant');
      expect(view[2]?.content).toBe('hi there');
    });

    it('preserves sequence order', () => {
      const items = [
        makeItem(3, 'assistant', { content: 'third' }),
        makeItem(1, 'system', { content: 'first' }),
        makeItem(2, 'user', { content: 'second' })
      ];
      const view = deriveConversationView(items);
      expect(view[0]?.content).toBe('first');
      expect(view[1]?.content).toBe('second');
      expect(view[2]?.content).toBe('third');
    });
  });

  describe('deriveToolCallsView', () => {
    it('aggregates tool_call + tool_result by id', () => {
      const items = [
        makeItem(1, 'tool_call', { toolCallId: 'tc-1', name: 'read', arguments: { path: '/a' } }),
        makeItem(2, 'tool_call', { toolCallId: 'tc-2', name: 'write', arguments: { path: '/b' } }),
        makeItem(3, 'tool_result', { toolCallId: 'tc-1', result: 'content A' }),
        makeItem(4, 'tool_result', { toolCallId: 'tc-2', result: 'ok' })
      ];
      const view = deriveToolCallsView(items);
      expect(view).toHaveLength(2);
      expect(view[0]?.toolCallId).toBe('tc-1');
      expect(view[0]?.result).toBe('content A');
      expect(view[0]?.status).toBe('completed');
      expect(view[1]?.name).toBe('write');
    });

    it('handles orphan tool_result', () => {
      const items = [makeItem(1, 'tool_result', { toolCallId: 'orphan', result: 'x' })];
      const view = deriveToolCallsView(items);
      expect(view).toHaveLength(1);
      expect(view[0]?.toolCallId).toBe('orphan');
    });
  });

  describe('deriveInferenceView', () => {
    it('extracts inference and usage from assistant', () => {
      const items = [
        makeItem(1, 'inference', { model: 'claude', inputTokens: 10, outputTokens: 20 }),
        makeItem(2, 'assistant', { content: 'hi', usage: { model: 'gpt', inputTokens: 5, outputTokens: 5 } })
      ];
      const view = deriveInferenceView(items);
      expect(view).toHaveLength(2);
      expect(view[0]?.model).toBe('claude');
      expect(view[1]?.inputTokens).toBe(5);
    });
  });

  describe('deriveCompactionView', () => {
    it('extracts compaction entries', () => {
      const items = [
        makeItem(1, 'compaction', { summary: 'summary of work', originalTokenCount: 1000, compactedTokenCount: 200 }),
        makeItem(2, 'user', { content: 'continue' })
      ];
      const view = deriveCompactionView(items);
      expect(view).toHaveLength(1);
      expect(view[0]?.summary).toBe('summary of work');
      expect(view[0]?.originalTokenCount).toBe(1000);
      expect(view[0]?.compactedTokenCount).toBe(200);
    });
  });

  describe('createMaterializedViews', () => {
    it('creates all views from single list', () => {
      const items = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'hi' }),
        makeItem(3, 'tool_call', { toolCallId: '1', name: 'read' }),
        makeItem(4, 'tool_result', { toolCallId: '1', result: 'ok' }),
        makeItem(5, 'assistant', { content: 'done' }),
        makeItem(6, 'inference', { model: 'm' }),
        makeItem(7, 'compaction', { summary: 's' })
      ];
      const views = createMaterializedViews(items);
      expect(views.conversation).toHaveLength(3);
      expect(views.toolCalls).toHaveLength(1);
      expect(views.inference).toHaveLength(1);
      expect(views.compaction).toHaveLength(1);
    });
  });

  describe('JSONL serialization', () => {
    it('roundtrips through JSONL preserving order', () => {
      const items = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'hi' }),
        makeItem(3, 'assistant', { content: 'hello' })
      ];
      const jsonl = rolloutItemsToJsonl(items);
      expect(jsonl.split('\n')).toHaveLength(3);
      const parsed = rolloutItemsFromJsonl(jsonl);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]?.type).toBe('system');
      expect(parsed[1]?.type).toBe('user');
      expect(parsed[2]?.type).toBe('assistant');
      expect(parsed.map(i => i.sequence)).toEqual([1, 2, 3]);
    });

    it('replay from JSONL reconstructs identical state', () => {
      const original = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { prompt: 'do thing' }),
        makeItem(3, 'reasoning', { content: 'thinking' }),
        makeItem(4, 'tool_call', { toolCallId: 't1', name: 'bash' }),
        makeItem(5, 'tool_result', { toolCallId: 't1', result: 'output' }),
        makeItem(6, 'assistant', { content: 'final', isFinal: true }),
        makeItem(7, 'inference', { model: 'claude-4', inputTokens: 100, outputTokens: 200 })
      ];
      const jsonl = rolloutItemsToJsonl(original);
      const replayed = rolloutItemsFromJsonl(jsonl);
      expect(replayed).toHaveLength(original.length);
      // Verify deterministic reconstruction: same types, sequences, data
      for (let i = 0; i < original.length; i++) {
        expect(replayed[i]?.type).toBe(original[i]?.type);
        expect(replayed[i]?.sequence).toBe(original[i]?.sequence);
        expect(replayed[i]?.sessionId).toBe(original[i]?.sessionId);
        expect(replayed[i]?.data).toEqual(original[i]?.data);
      }
    });

    it('skips malformed JSONL lines gracefully', () => {
      const jsonl = [
        JSON.stringify(makeItem(1, 'system', { content: 'ok' })),
        'not-json',
        '',
        JSON.stringify(makeItem(2, 'user', { content: 'hi' }))
      ].join('\n');
      const parsed = rolloutItemsFromJsonl(jsonl);
      expect(parsed).toHaveLength(2);
    });

    it('returns empty for empty JSONL', () => {
      expect(rolloutItemsFromJsonl('')).toEqual([]);
      expect(rolloutItemsFromJsonl('   \n  ')).toEqual([]);
    });
  });

  describe('createRolloutItem validation', () => {
    it('throws on missing sessionId', () => {
      expect(() => createRolloutItem({ sessionId: '', sequence: 1, type: 'user' } as never)).toThrow();
    });

    it('throws on invalid sequence', () => {
      expect(() => makeItem(0, 'user', {})).toThrow();
      expect(() => makeItem(-1, 'user', {})).toThrow();
    });
  });
});
