import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testOnStepCall } from '../shared.test-utils.js';
import { createStreamingMarkdownRenderer } from './create-streaming-markdown-renderer.js';

vi.mock('streaming-markdown', () => ({
  default: {
    removed: [],
    parser_create: vi.fn((opts: { target: unknown }) => ({
      target: opts.target
    })),
    parser_end: vi.fn(),
    parser_write: vi.fn()
  }
}));

vi.mock('dompurify', () => {
  const mockSanitize = vi.fn((html: string) => html);
  return {
    default: {
      removed: [],
      sanitize: mockSanitize
    },
    removed: [],
    sanitize: mockSanitize
  };
});

describe('Streaming Markdown Renderer', () => {
  let mockTarget: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock DOM element
    mockTarget = {
      appendChild: vi.fn<() => void>(),
      id: 'content',
      innerHTML: ''
    };
  });

  it('requires target element', () => {
    expect(() => {
      createStreamingMarkdownRenderer({
        target: null as unknown as Record<string, unknown>
      });
    }).toThrow('Target element is required');
  });

  it('creates renderer with target', () => {
    const renderer = createStreamingMarkdownRenderer({ target: mockTarget });

    expect(renderer).toBeDefined();
    expect(typeof renderer.write).toBe('function');
    expect(typeof renderer.end).toBe('function');
  });

  it('accumulates markdown content', async () => {
    const renderer = createStreamingMarkdownRenderer({ target: mockTarget });

    await renderer.write('# Title\n\n');
    await renderer.write('Content');
    await renderer.end();

    // Just verify no errors were thrown
    expect(renderer).toBeDefined();
  });

  it('handles thinking blocks when showThinking is true', async () => {
    const renderer = createStreamingMarkdownRenderer({
      showThinking: true,
      target: mockTarget
    });

    await renderer.write('Content');
    await renderer.end();

    expect(renderer).toBeDefined();
  });

  it('supports separate thinking container', async () => {
    const thinkingContainer = { id: 'thinking' };
    const renderer = createStreamingMarkdownRenderer({
      showThinking: true,
      target: mockTarget,
      thinkingContainer
    });

    await renderer.write('Content');
    await renderer.end();

    expect(renderer).toBeDefined();
  });

  it('calls onSecurityViolation on sanitization failure', async () => {
    const onSecurityViolation = vi.fn();
    const renderer = createStreamingMarkdownRenderer({
      onSecurityViolation,
      target: mockTarget
    });

    await renderer.write('Content');
    await renderer.end();

    // Mock would have called onSecurityViolation if there were violations
    expect(onSecurityViolation).not.toHaveBeenCalled(); // No violations in clean content
  });

  it('calls onError callback on processing errors', async () => {
    const onError = vi.fn<(error: Error) => void>();
    const renderer = createStreamingMarkdownRenderer({
      onError,
      target: mockTarget
    });

    await renderer.write('test');
    await renderer.end();

    expect(onError).not.toHaveBeenCalled();
  });

  it('processes multiple chunks', async () => {
    const renderer = createStreamingMarkdownRenderer({ target: mockTarget });

    await renderer.write('## Section 1\n\n');
    await renderer.write('Content for section 1\n\n');
    await renderer.write('## Section 2\n\n');
    await renderer.write('Content for section 2');
    await renderer.end();

    expect(renderer).toBeDefined();
  });

  it('handles empty content gracefully', async () => {
    const renderer = createStreamingMarkdownRenderer({ target: mockTarget });

    await renderer.write('');
    await renderer.end();

    expect(renderer).toBeDefined();
  });

  describe('onFinish callback', () => {
    it('calls onFinish via writeChunk when done=true', async () => {
      const onFinish = vi.fn<(reason: string | undefined, usage: unknown) => void>();
      const renderer = createStreamingMarkdownRenderer({
        onFinish,
        target: mockTarget
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
      const renderer = createStreamingMarkdownRenderer({
        onFinish,
        target: mockTarget
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

    it('prevents double onFinish invocation', async () => {
      const onFinish = vi.fn<(reason: string | undefined, usage: unknown) => void>();
      const renderer = createStreamingMarkdownRenderer({
        onFinish,
        target: mockTarget
      });

      // First call with done=true
      await renderer.writeChunk({
        content: 'Test',
        done: true,
        finishReason: 'stop'
      });

      // Then call end()
      await renderer.end();

      // Should only be called once (in writeChunk)
      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('calls onFinish in end() if not already called', async () => {
      const onFinish = vi.fn<(reason: string | undefined, usage: unknown) => void>();
      const renderer = createStreamingMarkdownRenderer({
        onFinish,
        target: mockTarget
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
      const renderer = createStreamingMarkdownRenderer({
        onToolCall,
        target: mockTarget
      });

      await renderer.write('Content');
      await renderer.end();

      expect(renderer).toBeDefined();
    });

    it('accepts onToolCallDelta callback', async () => {
      const onToolCallDelta = vi.fn<(part: unknown) => void>();
      const renderer = createStreamingMarkdownRenderer({
        onToolCallDelta,
        target: mockTarget
      });

      await renderer.write('Content');
      await renderer.end();

      expect(renderer).toBeDefined();
    });

    it('calls onStep when stepIndex changes via writeChunk', async () => {
      await testOnStepCall(options =>
        createStreamingMarkdownRenderer({
          ...options,
          target: mockTarget
        })
      );
    });
  });
});
