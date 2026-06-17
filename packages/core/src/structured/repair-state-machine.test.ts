import { describe, expect, it } from 'vitest';

import {
  closeRepairState,
  createRepairState,
  feedCharToStateMachine,
  repairJsonWithStateMachine
} from './repair-state-machine.js';

describe('createRepairState', () => {
  it('creates initial empty state', () => {
    const state = createRepairState();
    expect(state.bracketStack).toEqual([]);
    expect(state.buffer).toBe('');
    expect(state.escaped).toBe(false);
    expect(state.inString).toBe(false);
    expect(state.lastSafeEnd).toBe(-1);
  });
});

describe('feedCharToStateMachine', () => {
  it('accumulates plain text', () => {
    const state = createRepairState();
    expect(feedCharToStateMachine('a', state)).toBe('a');
    expect(feedCharToStateMachine('b', state)).toBe('b');
    expect(state.buffer).toBe('ab');
  });

  it('tracks string state with quotes', () => {
    const state = createRepairState();
    expect(feedCharToStateMachine('"', state)).toBe('"');
    expect(state.inString).toBe(true);
    expect(feedCharToStateMachine('"', state)).toBe('"');
    expect(state.inString).toBe(false);
  });

  it('handles escape sequences inside strings', () => {
    const state = createRepairState();
    feedCharToStateMachine('"', state); // enter string
    feedCharToStateMachine('\\', state); // escape
    expect(feedCharToStateMachine('n', state)).toBe('n');
    expect(state.escaped).toBe(false);
    expect(state.buffer).toBe('"\\n');
  });

  it('handles escaped quotes inside strings', () => {
    const state = createRepairState();
    feedCharToStateMachine('"', state); // enter string
    feedCharToStateMachine('\\', state); // escape
    feedCharToStateMachine('"', state); // escaped quote
    expect(state.inString).toBe(true); // still in string
    feedCharToStateMachine('"', state); // closing string
    expect(state.inString).toBe(false);
  });

  it('returns char for structural characters', () => {
    const state = createRepairState();
    expect(feedCharToStateMachine('{', state)).toBe('{');
    expect(state.bracketStack).toEqual(['}']);
  });

  it('tracks bracket pairs', () => {
    const state = createRepairState();
    feedCharToStateMachine('{', state);
    feedCharToStateMachine('[', state);
    expect(state.bracketStack).toEqual(['}', ']']);
    feedCharToStateMachine(']', state);
    expect(state.bracketStack).toEqual(['}']);
    feedCharToStateMachine('}', state);
    expect(state.bracketStack).toEqual([]);
  });

  it('skips mismatched closing brackets', () => {
    const state = createRepairState();
    feedCharToStateMachine('{', state);
    expect(feedCharToStateMachine(']', state)).toBe('');
    expect(state.buffer).toBe('{'); // ] was skipped
  });
});

describe('closeRepairState', () => {
  it('returns buffer as-is for complete JSON', () => {
    const state = createRepairState();
    for (const c of '{"a":1}') {
      feedCharToStateMachine(c, state);
    }
    expect(closeRepairState(state)).toBe('{"a":1}');
  });

  it('closes unclosed string', () => {
    const state = createRepairState();
    for (const c of '{"a":"unclosed') {
      feedCharToStateMachine(c, state);
    }
    const result = closeRepairState(state);
    expect(result).toContain('"');
    expect(result).toBe('{"a":"unclosed"}');
  });

  it('closes unclosed brackets', () => {
    const state = createRepairState();
    for (const c of '{"a":{"b":1') {
      feedCharToStateMachine(c, state);
    }
    expect(closeRepairState(state)).toBe('{"a":{"b":1}}');
  });
});

describe('repairJsonWithStateMachine', () => {
  it('passes through valid JSON', () => {
    expect(repairJsonWithStateMachine('{"a":1,"b":"hello"}')).toBe('{"a":1,"b":"hello"}');
  });

  it('closes truncated object', () => {
    expect(repairJsonWithStateMachine('{"a":1')).toBe('{"a":1}');
  });

  it('closes nested truncated structure', () => {
    expect(repairJsonWithStateMachine('{"a":{"b":1')).toBe('{"a":{"b":1}}');
  });

  it('closes unclosed string', () => {
    expect(repairJsonWithStateMachine('{"a":"hello')).toBe('{"a":"hello"}');
  });

  it('handles array brackets', () => {
    expect(repairJsonWithStateMachine('[1,2,3')).toBe('[1,2,3]');
  });

  it('handles nested arrays and objects', () => {
    expect(repairJsonWithStateMachine('{"items":[1,2,3}')).toBe('{"items":[1,2,3]}');
  });

  it('handles empty input', () => {
    expect(repairJsonWithStateMachine('')).toBe('');
  });
});
