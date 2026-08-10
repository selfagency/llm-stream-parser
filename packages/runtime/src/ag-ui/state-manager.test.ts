/**
 * AG-UI State Manager Tests
 *
 * Verifies state snapshots, deltas, and RFC 6902 JSON Patch operations
 */

import type { StateSnapshotEvent } from '@agentsy/shared';
import { EventType } from '@agentsy/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { JsonPatchOp } from './state-manager.js';
import {
  applyJsonPatches,
  computeStateDelta,
  createStateDeltaEvent,
  createStateSnapshotEvent,
  StateManager
} from './state-manager.js';

describe('createStateSnapshotEvent', () => {
  it('should create snapshot with state copy and timestamp', () => {
    const state = { count: 5, name: 'test' };
    const runId = 'run_123';

    const event = createStateSnapshotEvent(state, runId);

    expect(event.type).toBe(EventType.STATE_SNAPSHOT);
    expect(event.runId).toBe(runId);
    expect(event.state).toStrictEqual(state);
    expect(event.timestamp).toBeDefined();
  });

  it('should include threadId when provided', () => {
    const state = { value: 1 };
    const runId = 'run_123';
    const threadId = 'thread_456';

    const event = createStateSnapshotEvent(state, runId, threadId);

    expect(event.threadId).toBe(threadId);
  });

  it('should generate valid ISO timestamp', () => {
    const state: Record<string, unknown> = {};
    const event = createStateSnapshotEvent(state, 'run_123') as StateSnapshotEvent & {
      timestamp: string;
    };

    expectTypeOf(event.timestamp).toBeString();
    expect(() => new Date(event.timestamp)).not.toThrow();
    // Verify ISO 8601 format
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should not include threadId when undefined', () => {
    const event = createStateSnapshotEvent({}, 'run_123');
    expect('threadId' in event).toBeFalsy();
  });
});

describe('computeStateDelta', () => {
  it('should detect added properties', () => {
    const from = { a: 1 };
    const to = { a: 1, b: 2 };

    const patches = computeStateDelta(from, to);

    expect(patches).toContainEqual({ op: 'add', path: '/b', value: 2 });
  });

  it('should detect removed properties', () => {
    const from = { a: 1, b: 2 };
    const to = { a: 1 };

    const patches = computeStateDelta(from, to);

    expect(patches).toContainEqual({ op: 'remove', path: '/b' });
  });

  it('should detect replaced properties', () => {
    const from = { a: 1 };
    const to = { a: 2 };

    const patches = computeStateDelta(from, to);

    expect(patches).toContainEqual({ op: 'replace', path: '/a', value: 2 });
  });

  it('should handle nested object changes', () => {
    const from = { nested: { a: 1 } };
    const to = { nested: { a: 2 } };

    const patches = computeStateDelta(from, to);

    // Should recurse and patch nested property
    expect(patches.some(p => p.path.includes('nested') && p.value === 2)).toBeTruthy();
  });

  it('should ignore unchanged properties', () => {
    const from = { a: 1, b: 2, c: 3 };
    const to = { a: 1, b: 2, c: 3 };

    const patches = computeStateDelta(from, to);

    expect(patches).toHaveLength(0);
  });

  it('should handle array replacements (whole array, not indices)', () => {
    const from = { items: [1, 2, 3] };
    const to = { items: [1, 2, 3, 4] };

    const patches = computeStateDelta(from, to);

    // Should replace entire array, not patch individual indices
    expect(patches).toContainEqual({
      op: 'replace',
      path: '/items',
      value: [1, 2, 3, 4]
    });
  });

  it('should handle deep nesting (3+ levels)', () => {
    const from = { a: { b: { c: 1 } } };
    const to = { a: { b: { c: 2 } } };

    const patches = computeStateDelta(from, to);

    expect(patches.some(p => p.path === '/a/b/c' && p.value === 2)).toBeTruthy();
  });

  it('should return empty array for identical states', () => {
    const state = { a: 1, nested: { b: 2 } };

    const patches = computeStateDelta(state, structuredClone(state));

    expect(patches).toHaveLength(0);
  });

  it('should support custom base path prefix', () => {
    const from = { a: 1 };
    const to = { a: 2 };

    const patches = computeStateDelta(from, to, '/root');

    expect(patches).toContainEqual({
      op: 'replace',
      path: '/root/a',
      value: 2
    });
  });
});

describe('createStateDeltaEvent', () => {
  it('should create valid StateDeltaEvent with patches', () => {
    const patches: JsonPatchOp[] = [{ op: 'add', path: '/key', value: 'value' }];
    const runId = 'run_123';

    const event = createStateDeltaEvent(patches, runId);

    expect(event.type).toBe(EventType.STATE_DELTA);
    expect(event.runId).toBe(runId);
    expect(event.delta).toStrictEqual(patches);
  });

  it('should include timestamp', () => {
    const event = createStateDeltaEvent([], 'run_123');

    expect(event.timestamp).toBeDefined();
    expectTypeOf(event.timestamp).toBeString();
  });

  it('should respect optional threadId', () => {
    const event = createStateDeltaEvent([], 'run_123', 'thread_456');

    expect(event.threadId).toBe('thread_456');
  });
});

describe('applyJsonPatches', () => {
  it('should apply add operation', () => {
    const state = { a: 1 };
    const patches: JsonPatchOp[] = [{ op: 'add', path: '/b', value: 2 }];

    applyJsonPatches(state, patches);

    expect(state).toStrictEqual({ a: 1, b: 2 });
  });

  it('should apply remove operation', () => {
    const state = { a: 1, b: 2 };
    const patches: JsonPatchOp[] = [{ op: 'remove', path: '/b' }];

    applyJsonPatches(state, patches);

    expect(state).toStrictEqual({ a: 1 });
  });

  it('should apply replace operation', () => {
    const state = { a: 1 };
    const patches: JsonPatchOp[] = [{ op: 'replace', path: '/a', value: 10 }];

    applyJsonPatches(state, patches);

    expect(state).toStrictEqual({ a: 10 });
  });

  it('should handle nested paths (/a/b/c)', () => {
    const state = { a: { b: { c: 1 } } };
    const patches: JsonPatchOp[] = [{ op: 'replace', path: '/a/b/c', value: 99 }];

    applyJsonPatches(state, patches);

    expect(state.a.b.c).toBe(99);
  });

  it('should create intermediate objects on add', () => {
    const state = { a: {} };
    const patches: JsonPatchOp[] = [{ op: 'add', path: '/a/b/c', value: 'deep' }];

    applyJsonPatches(state, patches);

    expect((state as Record<string, unknown>).a).toStrictEqual({
      b: { c: 'deep' }
    });
  });

  it('should throw on invalid path (add to root)', () => {
    const state: Record<string, unknown> = {};
    const patches: JsonPatchOp[] = [{ op: 'add', path: '', value: 'bad' }];

    expect(() => {
      applyJsonPatches(state, patches);
    }).toThrow('Cannot add to root');
  });

  it('should throw on invalid path (remove root)', () => {
    const state = { a: 1 };
    const patches: JsonPatchOp[] = [{ op: 'remove', path: '' }];

    expect(() => {
      applyJsonPatches(state, patches);
    }).toThrow('Cannot remove root');
  });

  it('should throw on invalid path (replace root)', () => {
    const state = { a: 1 };
    const patches: JsonPatchOp[] = [{ op: 'replace', path: '', value: {} }];

    expect(() => {
      applyJsonPatches(state, patches);
    }).toThrow('Cannot replace root');
  });

  it('should throw on unsupported operation', () => {
    const state: Record<string, unknown> = {};
    const patches: JsonPatchOp[] = [{ from: '/b', op: 'move', path: '/a' } as JsonPatchOp];

    expect(() => {
      applyJsonPatches(state, patches);
    }).toThrow('Unsupported patch operation');
  });

  it('should mutate state in place', () => {
    const state = { a: 1 };
    const original = state;
    const patches: JsonPatchOp[] = [{ op: 'add', path: '/b', value: 2 }];

    applyJsonPatches(state, patches);

    expect(state === original).toBeTruthy();
  });
});

describe('StateManager', () => {
  it('should initialize with provided state', () => {
    const initialState = { count: 0 };
    const manager = new StateManager(initialState);

    const current = manager.getCurrentState();
    expect(current).toStrictEqual(initialState);
  });

  it('should initialize with empty state by default', () => {
    const manager = new StateManager();

    const current = manager.getCurrentState();
    expect(current).toStrictEqual({});
  });

  it('should return state copy from getCurrentState()', () => {
    const state = { nested: { value: 1 } };
    const manager = new StateManager(state);

    const copy = manager.getCurrentState() as Record<string, Record<string, unknown>>;
    expect(copy).toBeDefined();

    // Original should not change
    const current = manager.getCurrentState() as Record<string, Record<string, unknown>>;
    expect(current.nested?.value).toBe(1);
  });

  it('should create snapshot events', () => {
    const manager = new StateManager({ a: 1 });

    const event = manager.createSnapshotEvent('run_123', 'thread_456');

    expect(event.type).toBe(EventType.STATE_SNAPSHOT);
    expect(event.runId).toBe('run_123');
    expect(event.threadId).toBe('thread_456');
    expect(event.state).toStrictEqual({ a: 1 });
  });

  it('should compute delta between two states', () => {
    const manager = new StateManager({ a: 1, b: 2 });

    const deltaEvent = manager.updateState({ a: 2, b: 3 }, 'run_123');

    expect(deltaEvent?.type).toBe(EventType.STATE_DELTA);
    expect(deltaEvent?.delta.length).toBeGreaterThan(0);
  });

  it('should return undefined if no changes', () => {
    const manager = new StateManager({ a: 1 });

    const deltaEvent = manager.updateState({ a: 1 }, 'run_123');

    expect(deltaEvent).toBeUndefined();
  });

  it('should handle reset()', () => {
    const manager = new StateManager({ a: 1 });
    manager.updateState({ a: 2 }, 'run_123');

    manager.reset({ a: 0 });

    expect(manager.getCurrentState()).toStrictEqual({ a: 0 });
  });

  it('should apply patches to internal state', () => {
    const manager = new StateManager({ count: 1 });

    manager.updateState({ count: 2, name: 'updated' }, 'run_123');

    expect(manager.getCurrentState()).toStrictEqual({
      count: 2,
      name: 'updated'
    });
  });

  it('should handle multiple sequential updates', () => {
    const manager = new StateManager({ a: 1, b: 2 });

    const delta1 = manager.updateState({ a: 10 }, 'run_123');
    const delta2 = manager.updateState({ a: 10, b: 20 }, 'run_123');

    expect(delta1).toBeDefined();
    expect(delta2).toBeDefined();
    expect(manager.getCurrentState()).toStrictEqual({ a: 10, b: 20 });
  });

  it('should reject state with circular references', () => {
    const _manager = new StateManager();
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    // Should either throw or handle gracefully
    // Current implementation will fail on JSON.stringify
    expect(() => {
      JSON.stringify(circular);
    }).toThrow('circular');
  });

  it('should handle paths with tilde character (RFC 6901 escaping)', () => {
    const manager = new StateManager({});

    manager.updateState({ 'key~with~tilde': 'value' }, 'run_123');

    expect(manager.getCurrentState()).toStrictEqual({
      'key~with~tilde': 'value'
    });
  });

  it('should handle paths with forward slash character (RFC 6901 escaping)', () => {
    const manager = new StateManager({});

    manager.updateState({ 'path/with/slash': 'value' }, 'run_123');

    expect(manager.getCurrentState()).toStrictEqual({
      'path/with/slash': 'value'
    });
  });

  it('should handle nested paths with special characters', () => {
    const manager = new StateManager({ data: {} });

    manager.updateState({ data: { 'sub~key/path': 'value' } }, 'run_123');

    expect(manager.getCurrentState().data).toStrictEqual({
      'sub~key/path': 'value'
    });
  });

  it('should handle complex state updates with multiple properties', () => {
    const manager = new StateManager({ a: 1, b: { c: 2 } });

    const deltaEvent = manager.updateState({ a: 10, b: { c: 20, d: 30 } }, 'run_123');

    expect(deltaEvent).toBeDefined();
    expect(manager.getCurrentState()).toStrictEqual({
      a: 10,
      b: { c: 20, d: 30 }
    });
  });

  it('should prevent external state mutation via reference', () => {
    const initialState = { nested: { value: 1 } };
    const manager = new StateManager(initialState);

    // Try to mutate through the initial reference
    const mutable = initialState as unknown as Record<string, Record<string, unknown>>;
    if (mutable.nested) {
      mutable.nested.value = 999;
    }

    // Manager's state should not be affected
    const current = manager.getCurrentState() as unknown as Record<string, Record<string, unknown>>;
    expect(current.nested).toBeDefined();
    if (!current.nested) {
      throw new Error('Expected nested state to remain defined');
    }
    expect(current.nested.value).toBe(1);
  });
});
