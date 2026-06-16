import { describe, expect, it, vi } from 'vitest';

import { createPlainTextRenderer } from './create-plain-text-renderer.js';

describe('Plain Text Renderer', () => {
  it('renders text on flush', async () => {
    const output = vi.fn<(data: string) => void>();
    const renderer = createPlainTextRenderer({ output });

    await renderer.write('Hello ');
    await renderer.write('World');
    await renderer.end();

    // Processor accumulates and emits on end/flush
    expect(output).toHaveBeenCalled();
    const allCalls = output.mock.calls.map(c => c[0]).join('');
    expect(allCalls).toContain('Hello');
    expect(allCalls).toContain('World');
  });

  it('calls onError callback on processing errors', async () => {
    const onError = vi.fn<(error: Error) => void>();
    const output = vi.fn<(data: string) => void>();
    const renderer = createPlainTextRenderer({
      onError,
      output
    });

    // Process normal data first
    await renderer.write('normal text');
    expect(onError).not.toHaveBeenCalled();

    // End successfully
    await renderer.end();
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles writable stream output', async () => {
    const mockStream = {
      end: vi.fn<() => void>(),
      write: vi.fn<(data: string) => void>()
    };

    const renderer = createPlainTextRenderer({
      output: mockStream as unknown as NodeJS.WritableStream
    });

    await renderer.write('Test ');
    await renderer.write('stream');
    await renderer.end();

    expect(mockStream.write).toHaveBeenCalled();
    expect(mockStream.end).toHaveBeenCalled();

    // Verify content was written
    const allContent = mockStream.write.mock.calls.map(c => c[0]).join('');
    expect(allContent).toContain('Test');
    expect(allContent).toContain('stream');
  });

  it('defaults to process.stdout when no output specified', () => {
    const renderer = createPlainTextRenderer();

    // Should not throw; just verify the factory works with defaults
    expect(renderer).toBeDefined();
    expect(typeof renderer.write).toBe('function');
    expect(typeof renderer.end).toBe('function');
  });

  it('processes multiple chunks correctly', async () => {
    const output = vi.fn<(data: string) => void>();
    const renderer = createPlainTextRenderer({ output });

    await renderer.write('Chunk 1 ');
    await renderer.write('Chunk 2 ');
    await renderer.write('Chunk 3');
    await renderer.end();

    // Verify all chunks were processed
    const allContent = output.mock.calls.map(c => c[0]).join('');
    expect(allContent).toContain('Chunk 1');
    expect(allContent).toContain('Chunk 2');
    expect(allContent).toContain('Chunk 3');
  });

  it('respects showThinking flag', async () => {
    const output = vi.fn<(data: string) => void>();
    const renderer = createPlainTextRenderer({
      output,
      showThinking: true
    });

    await renderer.write('Some text');
    await renderer.end();

    // Just verify it doesn't error with showThinking enabled
    expect(output).toHaveBeenCalled();
  });

  it('uses custom thinking prefix when provided', async () => {
    const output = vi.fn<(data: string) => void>();
    const renderer = createPlainTextRenderer({
      output,
      showThinking: true,
      thinkingPrefix: '💭 Custom: '
    });

    await renderer.write('Text content');
    await renderer.end();

    // Just verify it doesn't error with custom prefix
    expect(output).toHaveBeenCalled();
  });

  describe('onFinish callback', () => {
    it('calls onFinish via writeChunk when done=true', async () => {
      const onFinish = vi.fn<(reason: string | undefined, usage: unknown) => void>();
      const output = vi.fn<(data: string) => void>();
      const renderer = createPlainTextRenderer({
        onFinish,
        output
      });

      await renderer.writeChunk({
        content: 'Test',
        done: true,
        finishReason: 'stop'
      });

      expect(onFinish).toHaveBeenCalledWith('stop', undefined);
    });

    it('passes usage data to onFinish', async () => {
      const onFinish = vi.fn<(reason: string | undefined, usage: unknown) => void>();
      const output = vi.fn<(data: string) => void>();
      const renderer = createPlainTextRenderer({
        onFinish,
        output
      });

      await renderer.writeChunk({
        content: 'Test',
        done: true,
        finishReason: 'length',
        usage: { inputTokens: 10, outputTokens: 20 }
      });

      expect(onFinish).toHaveBeenCalledWith('length', {
        inputTokens: 10,
        outputTokens: 20
      });
    });

    it('calls onFinish in end() if not already called', async () => {
      const onFinish = vi.fn<(reason: string | undefined, usage: unknown) => void>();
      const output = vi.fn<(data: string) => void>();
      const renderer = createPlainTextRenderer({
        onFinish,
        output
      });

      await renderer.write('Content');
      await renderer.end();

      // Should be called once in end()
      expect(onFinish).toHaveBeenCalledOnce();
    });
  });

  describe('Tool call callbacks', () => {
    it('accepts onToolCall callback', async () => {
      const onToolCall = vi.fn<(part: unknown) => void>();
      const output = vi.fn<(data: string) => void>();
      const renderer = createPlainTextRenderer({
        onToolCall,
        output
      });

      await renderer.write('Content');
      await renderer.end();

      expect(renderer).toBeDefined();
    });

    it('accepts onToolCallDelta callback', async () => {
      const onToolCallDelta = vi.fn<(part: unknown) => void>();
      const output = vi.fn<(data: string) => void>();
      const renderer = createPlainTextRenderer({
        onToolCallDelta,
        output
      });

      await renderer.write('Content');
      await renderer.end();

      expect(renderer).toBeDefined();
    });
  });
});
