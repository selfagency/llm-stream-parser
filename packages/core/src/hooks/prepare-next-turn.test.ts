import { describe, expect, it } from 'vitest';

import type { PrepareNextTurnHook, PrepareNextTurnInput } from './prepare-next-turn.js';

const makeInput = (overrides: Partial<PrepareNextTurnInput> = {}): PrepareNextTurnInput => ({
  turnCount: 0,
  currentModel: 'gpt-4',
  currentContext: [],
  tokenUsage: { input: 0, output: 0 },
  ...overrides
});

describe('prepareNextTurn', () => {
  it('can swap the model for a turn', async () => {
    const hook: PrepareNextTurnHook = input => {
      if (input.turnCount === 0) {
        return { model: 'gpt-4-turbo' };
      }
      return null;
    };

    const result0 = await hook(makeInput({ turnCount: 0 }));
    expect(result0).not.toBeNull();
    expect(result0?.model).toBe('gpt-4-turbo');

    const result1 = await hook(makeInput({ turnCount: 1 }));
    expect(result1).toBeNull();
  });

  it('can swap thinking configuration', async () => {
    const hook: PrepareNextTurnHook = () => ({
      thinkingConfig: { budget: 8192 }
    });

    const result = await hook(makeInput());
    expect(result).not.toBeNull();
    expect(result?.thinkingConfig).toEqual({ budget: 8192 });
  });

  it('can swap context scope', async () => {
    const hook: PrepareNextTurnHook = input => {
      if (input.turnCount === 2) {
        return { context: ['memory:recent'] };
      }
      return null;
    };

    const result = await hook(makeInput({ turnCount: 2 }));
    expect(result).not.toBeNull();
    expect(result?.context).toEqual(['memory:recent']);
  });

  it('returns null when no changes are needed', async () => {
    const hook: PrepareNextTurnHook = () => null;

    const result = await hook(makeInput());
    expect(result).toBeNull();
  });

  it('receives accurate token usage data', async () => {
    const captured: PrepareNextTurnInput[] = [];
    const hook: PrepareNextTurnHook = input => {
      captured.push(input);
      return null;
    };

    await hook(makeInput({ tokenUsage: { input: 150, output: 320 } }));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.tokenUsage.input).toBe(150);
    expect(captured[0]?.tokenUsage.output).toBe(320);
  });

  it('can combine multiple overrides in one response', async () => {
    const hook: PrepareNextTurnHook = async () => ({
      context: ['memory:core'],
      model: 'claude-3-opus',
      thinkingConfig: { budget: 4096 }
    });

    const result = await hook(makeInput());
    expect(result).not.toBeNull();
    expect(result?.model).toBe('claude-3-opus');
    expect(result?.thinkingConfig).toEqual({ budget: 4096 });
    expect(result?.context).toEqual(['memory:core']);
  });
});
