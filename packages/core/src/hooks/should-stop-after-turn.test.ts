import { describe, expect, it } from 'vitest';

import type { ShouldStopAfterTurnHook, ShouldStopAfterTurnInput } from './should-stop-after-turn.js';

const makeInput = (overrides: Partial<ShouldStopAfterTurnInput> = {}): ShouldStopAfterTurnInput => ({
  turnCount: 0,
  lastToolCalls: [],
  tokenUsage: { input: 0, output: 0 },
  errors: [],
  ...overrides
});

describe('shouldStopAfterTurn', () => {
  it('stops when there are too many errors', async () => {
    const MAX_ERRORS = 3;
    const hook: ShouldStopAfterTurnHook = async input => input.errors.length >= MAX_ERRORS;

    const normal = await hook(makeInput({ errors: ['e1', 'e2'] }));
    expect(normal).toBe(false);

    const stop = await hook(makeInput({ errors: ['e1', 'e2', 'e3', 'e4'] }));
    expect(stop).toBe(true);
  });

  it('continues normally when nothing is wrong', async () => {
    const hook: ShouldStopAfterTurnHook = async () => false;

    const result = await hook(makeInput({ turnCount: 5 }));
    expect(result).toBe(false);
  });

  it('stops after a maximum number of turns', async () => {
    const MAX_TURNS = 10;
    const hook: ShouldStopAfterTurnHook = async input => input.turnCount >= MAX_TURNS;

    const withinLimit = await hook(makeInput({ turnCount: 9 }));
    expect(withinLimit).toBe(false);

    const atLimit = await hook(makeInput({ turnCount: 10 }));
    expect(atLimit).toBe(true);

    const overLimit = await hook(makeInput({ turnCount: 15 }));
    expect(overLimit).toBe(true);
  });

  it('stops when no tools were called and no errors (task complete heuristic)', async () => {
    const hook: ShouldStopAfterTurnHook = async input =>
      input.lastToolCalls.length === 0 && input.errors.length === 0 && input.turnCount >= 1;

    const firstTurn = await hook(makeInput({ turnCount: 0, lastToolCalls: ['get_weather'] }));
    expect(firstTurn).toBe(false);

    const doneTurn = await hook(makeInput({ turnCount: 3, lastToolCalls: [] }));
    expect(doneTurn).toBe(true);
  });

  it('respects token budget limits', async () => {
    const MAX_TOTAL_TOKENS = 100_000;
    const hook: ShouldStopAfterTurnHook = async input =>
      input.tokenUsage.input + input.tokenUsage.output >= MAX_TOTAL_TOKENS;

    const under = await hook(makeInput({ tokenUsage: { input: 40_000, output: 30_000 } }));
    expect(under).toBe(false);

    const atLimit = await hook(makeInput({ tokenUsage: { input: 60_000, output: 40_000 } }));
    expect(atLimit).toBe(true);
  });
});
