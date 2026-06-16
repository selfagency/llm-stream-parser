import type { OutputPart } from '@agentsy/core/processor';
import { LLMStreamProcessor } from '@agentsy/core/processor';
import type { FinishReason, UsageInfo } from '@agentsy/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSharedRendererHandle } from './shared.js';

describe('createSharedRendererHandle' as const, () => {
  let mockHandlers: {
    onText: (text: string) => Promise<void>;
    onThinking: (text: string) => Promise<void>;
    onToolCall?: (part: OutputPart) => Promise<void>;
    onToolCallDelta?: (part: OutputPart) => Promise<void>;
    onEnd?: () => Promise<void>;
  };

  let mockOnFinish: (finishReason: FinishReason | undefined, usage: UsageInfo | undefined) => void | Promise<void>;
  let mockOnError: (error: Error) => void;

  beforeEach(() => {
    mockHandlers = {
      onEnd: vi.fn<() => Promise<void>>().mockResolvedValue(),
      onText: vi.fn<() => Promise<void>>().mockResolvedValue(),
      onThinking: vi.fn<() => Promise<void>>().mockResolvedValue(),
      onToolCall: vi.fn<() => Promise<void>>().mockResolvedValue(),
      onToolCallDelta: vi.fn<() => Promise<void>>().mockResolvedValue()
    };

    mockOnFinish = vi
      .fn<(finishReason: FinishReason | undefined, usage: UsageInfo | undefined) => void | Promise<void>>()
      .mockResolvedValue();
    mockOnError = vi.fn<(error: Error) => void | Promise<void>>().mockResolvedValue();
  });

  it('creates shared renderer handle with handlers', () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    expect(renderer).toBeDefined();
    expect(typeof renderer.write).toBe('function');
    expect(typeof renderer.writeChunk).toBe('function');
    expect(typeof renderer.end).toBe('function');
  });

  it('accepts handlers and processes via write', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.write('Hello world');

    // Verify write completes without error
    expect(renderer).toBeDefined();
  });

  it('processes multiple chunks via write', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.write('Hello ');
    await renderer.write('world');

    // Verify multiple writes complete without error
    expect(renderer).toBeDefined();
  });

  it('invokes onFinish callback via writeChunk when done=true', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.writeChunk({
      content: 'Test',
      done: true,
      finishReason: 'stop'
    });

    expect(mockOnFinish).toHaveBeenCalledWith('stop', undefined);
  });

  it('passes usage data to onFinish', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.writeChunk({
      content: 'Test',
      done: true,
      usage: { inputTokens: 10, outputTokens: 20 }
    });

    expect(mockOnFinish).toHaveBeenCalledWith(undefined, {
      inputTokens: 10,
      outputTokens: 20
    });
  });

  it('prevents double onFinish invocation', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.writeChunk({
      content: 'Test',
      done: true,
      finishReason: 'stop'
    });

    await renderer.end();

    // Should only be called once (in writeChunk), not again in end()
    expect(mockOnFinish).toHaveBeenCalledOnce();
  });

  it('invokes onFinish via end when not already called', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.write('Content');
    await renderer.end();

    // Should be called once in end()
    expect(mockOnFinish).toHaveBeenCalledOnce();
  });

  it('calls onEnd handler when provided', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.end();

    expect(mockHandlers.onEnd).toHaveBeenCalled();
  });

  it('does not call onEnd when not provided', async () => {
    const { onEnd: _, ...handlersWithoutEnd } = mockHandlers;
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, handlersWithoutEnd);

    await renderer.end();

    // No error should occur
    expect(renderer).toBeDefined();
  });

  it('accepts onError callback on write() method', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers, mockOnError);

    await renderer.write('Content');

    // Should not throw
    expect(renderer).toBeDefined();
  });

  it('accepts onError callback on writeChunk() method', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers, mockOnError);

    await renderer.writeChunk({ content: 'Content', done: false });

    // Should not throw
    expect(renderer).toBeDefined();
  });

  it('accepts onError callback on end() method', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers, mockOnError);

    await renderer.end();

    // Should not throw
    expect(renderer).toBeDefined();
  });

  it('invokes onStep when stepIndex changes via writeChunk', async () => {
    const onStep = vi.fn<(stepIndex: number, usage: unknown) => void>().mockResolvedValue();
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish, onStep }, mockHandlers);

    await renderer.writeChunk({
      content: 'Step 0',
      stepIndex: 0,
      stepUsage: { outputTokens: 3 }
    });
    await renderer.writeChunk({
      content: 'Still step 0',
      stepIndex: 0,
      stepUsage: { outputTokens: 4 }
    });
    await renderer.writeChunk({
      content: 'Step 1',
      stepIndex: 1,
      stepUsage: { outputTokens: 5 }
    });

    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenNthCalledWith(1, 0, { outputTokens: 3 });
    expect(onStep).toHaveBeenNthCalledWith(2, 1, { outputTokens: 5 });
  });

  it('falls back to usage when stepUsage is absent', async () => {
    const onStep = vi.fn<(stepIndex: number, usage: unknown) => void>().mockResolvedValue();
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish, onStep }, mockHandlers);

    await renderer.writeChunk({
      content: 'Step 2',
      stepIndex: 2,
      usage: { inputTokens: 9, outputTokens: 6 }
    });

    expect(onStep).toHaveBeenCalledWith(2, { inputTokens: 9, outputTokens: 6 });
  });

  it('skips onToolCall handler when not provided', async () => {
    const handlersWithoutToolCall = {
      onText: mockHandlers.onText,
      onThinking: mockHandlers.onThinking
    };
    const processor = new LLMStreamProcessor();
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish, processor }, handlersWithoutToolCall);

    // Process XML tool call
    await renderer.write(
      '<function_calls><invoke name="test"><parameter name="x">1</parameter></invoke></function_calls>'
    );

    // onToolCall is undefined, so should not be called
    expect(renderer).toBeDefined();
  });

  it('skips onToolCallDelta handler when not provided', async () => {
    const handlersWithoutDelta = {
      onText: mockHandlers.onText,
      onThinking: mockHandlers.onThinking
    };

    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, handlersWithoutDelta);

    // Process via writeChunk
    await renderer.writeChunk({ content: 'Content', done: false });
    await renderer.end();

    expect(renderer).toBeDefined();
  });

  it('uses provided processor instead of creating internal one', () => {
    const processor = new LLMStreamProcessor();
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish, processor }, mockHandlers);

    // Renderer should be created successfully with provided processor
    expect(renderer).toBeDefined();
    expect(typeof renderer.write).toBe('function');
  });

  it('creates internal processor when not provided', () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    // Renderer should be created successfully with internal processor
    expect(renderer).toBeDefined();
    expect(typeof renderer.write).toBe('function');
  });

  it('processes parts through handlers via write', async () => {
    const renderer = createSharedRendererHandle({ onFinish: mockOnFinish }, mockHandlers);

    await renderer.write('Test content');
    await renderer.end();

    // Verify handlers were called (processor connects parts to handlers)
    expect(mockHandlers.onText).toHaveBeenCalled();
  });
});
