import { describe, expect, it } from 'vitest';
import { createRolloutItem, type RolloutItem } from './materialized-views.js';
import {
  createForkedSession,
  filterForkedRollout,
  filterRollout,
  forkRollout,
  keepForkedRolloutItem,
  reduceRollout,
  replayRollout
} from './reducer.js';

function makeItem(
  seq: number,
  type: RolloutItem['type'],
  data: Record<string, unknown> = {},
  sessionId = 'src-session'
): RolloutItem {
  return createRolloutItem({
    sessionId,
    sequence: seq,
    type,
    data,
    timestamp: `2026-01-01T00:00:0${seq}Z`
  });
}

describe('rollout reducer', () => {
  describe('keepForkedRolloutItem', () => {
    it('keeps system, session_meta, user, final-assistant', () => {
      expect(keepForkedRolloutItem(makeItem(1, 'system', { content: 'sys' }))).toBe(true);
      expect(keepForkedRolloutItem(makeItem(2, 'session_meta', { cwd: '/tmp' }))).toBe(true);
      expect(keepForkedRolloutItem(makeItem(3, 'user', { content: 'hi' }))).toBe(true);
      expect(keepForkedRolloutItem(makeItem(4, 'assistant', { content: 'final' }))).toBe(true);
      expect(keepForkedRolloutItem(makeItem(5, 'assistant', { content: 'final', isFinal: true }))).toBe(true);
    });

    it('drops intermediate assistant when isFinal=false', () => {
      expect(keepForkedRolloutItem(makeItem(1, 'assistant', { content: 'chunk', isFinal: false }))).toBe(false);
    });

    it('drops reasoning, tool_call, tool_result, inference, compaction, error', () => {
      expect(keepForkedRolloutItem(makeItem(1, 'reasoning', {}))).toBe(false);
      expect(keepForkedRolloutItem(makeItem(2, 'tool_call', {}))).toBe(false);
      expect(keepForkedRolloutItem(makeItem(3, 'tool_result', {}))).toBe(false);
      expect(keepForkedRolloutItem(makeItem(4, 'inference', {}))).toBe(false);
      expect(keepForkedRolloutItem(makeItem(5, 'compaction', {}))).toBe(false);
      expect(keepForkedRolloutItem(makeItem(6, 'error', {}))).toBe(false);
    });
  });

  describe('filterForkedRollout', () => {
    it('preserves conversation continuity', () => {
      const items = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'first' }),
        makeItem(3, 'reasoning', { content: 'thinking' }),
        makeItem(4, 'tool_call', { name: 'read' }),
        makeItem(5, 'tool_result', { result: 'ok' }),
        makeItem(6, 'assistant', { content: 'answer 1' }),
        makeItem(7, 'user', { content: 'second' }),
        makeItem(8, 'assistant', { content: 'answer 2', isFinal: false }), // intermediate -> drop
        makeItem(9, 'assistant', { content: 'final answer' })
      ];

      const filtered = filterForkedRollout(items);

      // Should keep system, both users, both final assistants (not intermediate)
      expect(filtered.map(i => i.sequence)).toEqual([1, 2, 6, 7, 9]);
      expect(filtered.map(i => i.type)).toEqual(['system', 'user', 'assistant', 'user', 'assistant']);

      // Continuity: user messages preserved in order
      const userMessages = filtered.filter(i => i.type === 'user');
      expect(userMessages).toHaveLength(2);
      expect((userMessages[0]?.data as { content: string }).content).toBe('first');
      expect((userMessages[1]?.data as { content: string }).content).toBe('second');
    });

    it('maintains stable order by sequence', () => {
      const items = [
        makeItem(3, 'assistant', { content: 'c' }),
        makeItem(1, 'system', { content: 'a' }),
        makeItem(2, 'user', { content: 'b' })
      ];
      const filtered = filterForkedRollout(items);
      expect(filtered[0]?.sequence).toBe(1);
      expect(filtered[1]?.sequence).toBe(2);
      expect(filtered[2]?.sequence).toBe(3);
    });
  });

  describe('filterRollout generic', () => {
    it('filters with custom predicate', () => {
      const items = [makeItem(1, 'user', {}), makeItem(2, 'assistant', {}), makeItem(3, 'tool_call', {})];
      const onlyUser = filterRollout(items, i => i.type === 'user');
      expect(onlyUser).toHaveLength(1);
      expect(onlyUser[0]?.type).toBe('user');
    });
  });

  describe('forkRollout', () => {
    it('creates forked session with re-sequenced items', () => {
      const src = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'hi' }),
        makeItem(3, 'tool_call', { name: 'bash' }),
        makeItem(4, 'assistant', { content: 'done' })
      ];

      const forked = forkRollout(src, { targetSessionId: 'forked-1' });

      expect(forked.sourceSessionId).toBe('src-session');
      expect(forked.targetSessionId).toBe('forked-1');
      expect(forked.originalCount).toBe(4);
      expect(forked.forkedCount).toBe(3); // system+user+assistant (tool_call dropped)
      expect(forked.items.map(i => i.sequence)).toEqual([1, 2, 3]);
      expect(forked.items.every(i => i.sessionId === 'forked-1')).toBe(true);
    });

    it('preserves continuity when custom predicate used', () => {
      const src = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'q1' }),
        makeItem(3, 'assistant', { content: 'a1' }),
        makeItem(4, 'user', { content: 'q2' }),
        makeItem(5, 'assistant', { content: 'a2' })
      ];
      const forked = forkRollout(src, { targetSessionId: 'branch', predicate: () => true });
      expect(forked.forkedCount).toBe(5);
      expect(forked.items.map(i => (i.data as { content: string }).content)).toEqual(['sys', 'q1', 'a1', 'q2', 'a2']);
    });

    it('throws on missing targetSessionId', () => {
      expect(() => forkRollout([], { targetSessionId: '' } as never)).toThrow();
    });

    it('keeps original timestamps in fork', () => {
      const src = [makeItem(1, 'user', { content: 'hi' })];
      const forked = forkRollout(src, { targetSessionId: 'new' });
      expect(forked.items[0]?.timestamp).toBe(src[0]?.timestamp);
    });
  });

  describe('createForkedSession convenience', () => {
    it('forks with default predicate', () => {
      const src = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'hello' }),
        makeItem(3, 'reasoning', {}),
        makeItem(4, 'assistant', { content: 'world' })
      ];
      const result = createForkedSession(src, 'target');
      expect(result.forkedCount).toBe(3);
      expect(result.items.map(i => i.type)).toEqual(['system', 'user', 'assistant']);
    });
  });

  describe('reduceRollout', () => {
    it('folds items into state', () => {
      const items = [makeItem(1, 'user', {}), makeItem(2, 'user', {}), makeItem(3, 'assistant', {})];
      const count = reduceRollout(items, (acc, item) => acc + (item.type === 'user' ? 1 : 0), 0);
      expect(count).toBe(2);
    });

    it('sorts by sequence before reducing', () => {
      const items = [makeItem(2, 'user', {}), makeItem(1, 'system', {})];
      const order: number[] = [];
      reduceRollout(
        items,
        (acc, item) => {
          order.push(item.sequence);
          return acc;
        },
        null
      );
      expect(order).toEqual([1, 2]);
    });
  });

  describe('replayRollout', () => {
    it('returns items sorted by sequence for deterministic replay', () => {
      const items = [makeItem(5, 'user', {}), makeItem(1, 'system', {}), makeItem(3, 'assistant', {})];
      const replayed = replayRollout(items);
      expect(replayed.map(i => i.sequence)).toEqual([1, 3, 5]);
    });

    it('replay from identical list reconstructs same state', () => {
      const original = [
        makeItem(1, 'system', { content: 'sys' }),
        makeItem(2, 'user', { content: 'hi' }),
        makeItem(3, 'assistant', { content: 'hello' })
      ];
      const replayed = replayRollout(original);
      expect(replayed).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(replayed[i]?.type).toBe(original[i]?.type);
        expect(replayed[i]?.sequence).toBe(original[i]?.sequence);
        expect(replayed[i]?.data).toEqual(original[i]?.data);
      }
    });
  });
});
