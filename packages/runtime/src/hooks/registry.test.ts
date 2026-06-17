import { describe, expect, it, vi } from 'vitest';

import { createRuntimeHookRegistry } from './registry.js';

describe('createRuntimeHookRegistry', () => {
  it('returns continue: true when no handlers registered', async () => {
    const registry = createRuntimeHookRegistry();
    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'hello',
      sessionId: 'sess_1'
    });
    expect(result).toEqual({ continue: true });
  });

  it('fires a registered handler and returns continue: true', async () => {
    const registry = createRuntimeHookRegistry();
    const handler = vi.fn().mockResolvedValue({ continue: true });

    registry.register('UserPromptSubmit', handler);
    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'hello',
      sessionId: 'sess_1'
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ continue: true });
  });

  it('blocks when handler returns continue: false', async () => {
    const registry = createRuntimeHookRegistry();

    registry.register('PreToolCall', async () => ({
      continue: false as const,
      reason: 'Tool not allowed'
    }));

    const result = await registry.fire({
      type: 'PreToolCall',
      toolName: 'delete_all',
      args: {},
      sessionId: 'sess_1'
    });

    expect(result).toEqual({ continue: false, reason: 'Tool not allowed' });
  });

  it('stops chain on first block', async () => {
    const registry = createRuntimeHookRegistry();
    const handler1 = vi.fn().mockResolvedValue({ continue: true });
    const handler2 = vi.fn().mockResolvedValue({ continue: false, reason: 'blocked' });
    const handler3 = vi.fn().mockResolvedValue({ continue: true });

    registry.register('UserPromptSubmit', handler1, { priority: 10 });
    registry.register('UserPromptSubmit', handler2, { priority: 5 });
    registry.register('UserPromptSubmit', handler3, { priority: 0 });

    await registry.fire({
      type: 'UserPromptSubmit',
      input: 'test',
      sessionId: 'sess_1'
    });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler3).not.toHaveBeenCalled();
  });

  it('fires handlers in priority order (highest first)', async () => {
    const registry = createRuntimeHookRegistry();
    const order: number[] = [];

    registry.register(
      'Stop',
      // biome-ignore lint/suspicious/useAwait: matches HandlerFn interface returning Promise<HookResult>
      async () => {
        order.push(1);
        return { continue: true };
      },
      { priority: 1 }
    );

    registry.register(
      'Stop',
      // biome-ignore lint/suspicious/useAwait: matches HandlerFn interface returning Promise<HookResult>
      async () => {
        order.push(10);
        return { continue: true };
      },
      { priority: 10 }
    );

    registry.register(
      'Stop',
      // biome-ignore lint/suspicious/useAwait: matches HandlerFn interface returning Promise<HookResult>
      async () => {
        order.push(5);
        return { continue: true };
      },
      { priority: 5 }
    );

    await registry.fire({
      type: 'Stop',
      reason: 'shutdown',
      sessionId: 'sess_1'
    });

    expect(order).toEqual([10, 5, 1]);
  });

  it('unregister removes a handler by id', async () => {
    const registry = createRuntimeHookRegistry();
    const handler = vi.fn().mockResolvedValue({ continue: true });

    const { unregister } = registry.register('Stop', handler, { id: 'my-handler' });
    unregister();

    const result = await registry.fire({
      type: 'Stop',
      reason: 'done',
      sessionId: 'sess_1'
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({ continue: true });
  });

  it('unregister by id string', async () => {
    const registry = createRuntimeHookRegistry();
    const handler = vi.fn().mockResolvedValue({ continue: true });

    registry.register('Stop', handler, { id: 'my-handler' });
    registry.unregister('my-handler');

    const result = await registry.fire({
      type: 'Stop',
      reason: 'done',
      sessionId: 'sess_1'
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({ continue: true });
  });

  it('unregister on non-existent id is a no-op', () => {
    const registry = createRuntimeHookRegistry();
    expect(() => registry.unregister('nope')).not.toThrow();
  });

  it('list returns all registered handlers', () => {
    const registry = createRuntimeHookRegistry();

    registry.register('UserPromptSubmit', async () => ({ continue: true }), {
      id: 'a',
      priority: 1
    });
    registry.register('Stop', async () => ({ continue: true }), { id: 'b', priority: 2 });

    const entries = registry.list();
    expect(entries).toHaveLength(2);
    expect(entries.find(e => e.handlerId === 'a')).toBeDefined();
    expect(entries.find(e => e.handlerId === 'b')).toBeDefined();
  });

  it('passes the full event to the handler', async () => {
    const registry = createRuntimeHookRegistry();
    const handler = vi.fn().mockResolvedValue({ continue: true });

    registry.register('PostToolCall', handler);

    const event = {
      type: 'PostToolCall' as const,
      toolName: 'search',
      args: { q: 'test' },
      result: { items: [] },
      sessionId: 'sess_1'
    };
    await registry.fire(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('handles transform result', async () => {
    const registry = createRuntimeHookRegistry();

    registry.register('UserPromptSubmit', async () => ({
      continue: true as const,
      transform: { modified: true }
    }));

    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'hello',
      sessionId: 'sess_1'
    });

    expect(result).toHaveProperty('transform');
  });

  it('composes multiple transforms from different handlers', async () => {
    const registry = createRuntimeHookRegistry();

    registry.register('UserPromptSubmit', async () => ({
      continue: true as const,
      transform: { a: 1 }
    }));

    registry.register('UserPromptSubmit', async () => ({
      continue: true as const,
      transform: { b: 2 }
    }));

    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'hello',
      sessionId: 'sess_1'
    });

    expect(result).toHaveProperty('transform');
    expect((result as { transform: Record<string, unknown> }).transform).toMatchObject({
      a: 1,
      b: 2
    });
  });

  it('composes transforms with block stopping the chain', async () => {
    const registry = createRuntimeHookRegistry();

    registry.register('UserPromptSubmit', async () => ({
      continue: true as const,
      transform: { a: 1 }
    }));

    registry.register('UserPromptSubmit', async () => ({
      continue: false as const,
      reason: 'blocked after transform'
    }));

    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'hello',
      sessionId: 'sess_1'
    });

    // Block should take precedence over transform
    expect(result).toEqual({ continue: false, reason: 'blocked after transform' });
  });

  it('composes transforms in priority order (left-to-right)', async () => {
    const registry = createRuntimeHookRegistry();
    const executionOrder: string[] = [];

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('first');
        return { continue: true, transform: { step1: 'done' } };
      },
      { priority: 10 }
    );

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('second');
        return { continue: true, transform: { step2: 'done' } };
      },
      { priority: 5 }
    );

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('third');
        return { continue: true, transform: { step3: 'done' } };
      },
      { priority: 0 }
    );

    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'test',
      sessionId: 'sess_1'
    });

    expect(executionOrder).toEqual(['first', 'second', 'third']);
    expect(result).toHaveProperty('transform');
    expect((result as { transform: Record<string, unknown> }).transform).toMatchObject({
      step1: 'done',
      step2: 'done',
      step3: 'done'
    });
  });

  it('short-circuits pipeline with stop and returns stoppedBy', async () => {
    const registry = createRuntimeHookRegistry();
    const executionOrder: string[] = [];

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('first');
        return { continue: true };
      },
      { priority: 10 }
    );

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('second');
        return { continue: false, reason: 'blocked-by-middleware' };
      },
      { priority: 5 }
    );

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('third');
        return { continue: true };
      },
      { priority: 0 }
    );

    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'test',
      sessionId: 'sess_1'
    });

    expect(executionOrder).toEqual(['first', 'second']);
    expect(result).toEqual({ continue: false, reason: 'blocked-by-middleware' });
  });

  it('continues pipeline after thrown handler (logs but does not break chain)', async () => {
    const registry = createRuntimeHookRegistry();
    const executionOrder: string[] = [];

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('first');
        return { continue: true, transform: { step1: 'done' } };
      },
      { priority: 10 }
    );

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('second');
        throw new Error('Handler failed');
      },
      { priority: 5 }
    );

    registry.register(
      'UserPromptSubmit',
      () => {
        executionOrder.push('third');
        return { continue: true, transform: { step3: 'done' } };
      },
      { priority: 0 }
    );

    // Current implementation catches thrown handlers and continues pipeline
    const result = await registry.fire({
      type: 'UserPromptSubmit',
      input: 'test',
      sessionId: 'sess_1'
    });

    // The pipeline should continue despite the thrown handler
    expect(executionOrder).toEqual(['first', 'second', 'third']);
    expect(result).toHaveProperty('transform');
    expect((result as { transform: Record<string, unknown> }).transform).toMatchObject({
      step1: 'done',
      step3: 'done'
    });
  });
});
