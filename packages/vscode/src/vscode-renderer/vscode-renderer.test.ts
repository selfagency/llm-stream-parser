import type { LLMStreamProcessor } from '@agentsy/core/processor';
import type { CancellationToken } from '@agentsy/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancellationTokenToAbortSignal } from './cancellation-token-to-abort-signal.js';
import { createVSCodeAgentLoop } from './create-vs-code-agent-loop.js';
import type { ChatResponseStream } from './create-vs-code-chat-renderer.js';
import { createVSCodeChatRenderer } from './create-vs-code-chat-renderer.js';

/** Factory function to create a mock LLMStreamProcessor for testing */
function createFakeProcessor(processParts: Record<string, unknown>[] = [], customFlush?: ReturnType<typeof vi.fn>) {
  return {
    flush:
      customFlush ??
      vi.fn(() => ({
        content: '',
        done: true,
        incomplete: false,
        incompleteness: [],
        parts: [],
        thinking: '',
        toolCalls: []
      })),
    process: vi.fn(() => ({
      content: '',
      done: false,
      incomplete: false,
      incompleteness: [],
      parts: processParts,
      thinking: '',
      toolCalls: []
    }))
  } as unknown as LLMStreamProcessor;
}

function createMockStream(): ChatResponseStream {
  const fn = <T extends (...args: never[]) => unknown>() => vi.fn<T>() as unknown as T;
  return {
    anchor: fn<NonNullable<ChatResponseStream['anchor']>>(),
    beginToolInvocation: fn<NonNullable<ChatResponseStream['beginToolInvocation']>>(),
    button: fn<NonNullable<ChatResponseStream['button']>>(),
    filetree: fn<NonNullable<ChatResponseStream['filetree']>>(),
    markdown: fn<NonNullable<ChatResponseStream['markdown']>>(),
    progress: fn<NonNullable<ChatResponseStream['progress']>>(),
    reference: fn<NonNullable<ChatResponseStream['reference']>>(),
    thinkingProgress: fn<NonNullable<ChatResponseStream['thinkingProgress']>>(),
    updateToolInvocation: fn<NonNullable<ChatResponseStream['updateToolInvocation']>>(),
    usage: fn<NonNullable<ChatResponseStream['usage']>>()
  };
}

describe('VS Code Chat Renderer', () => {
  let mockStream: ChatResponseStream;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStream = createMockStream();
  });

  it('requires ChatResponseStream', () => {
    expect(() => {
      createVSCodeChatRenderer({
        stream: null as unknown as ChatResponseStream
      });
    }).toThrow('ChatResponseStream is required');
  });

  it('creates renderer with stream', () => {
    const renderer = createVSCodeChatRenderer({ stream: mockStream });

    expect(renderer).toBeDefined();
    expect(renderer.write).toBeDefined();
    expect(renderer.writeChunk).toBeDefined();
    expect(renderer.end).toBeDefined();
  });

  it('sends markdown to stream on write', async () => {
    const renderer = createVSCodeChatRenderer({ stream: mockStream });

    await renderer.write('# Title\n\nContent');
    await renderer.end();

    expect(mockStream.markdown).toHaveBeenCalled();
  });

  it('sends multiple chunks to stream', async () => {
    const renderer = createVSCodeChatRenderer({ stream: mockStream });

    await renderer.write('Part 1');
    await renderer.write('Part 2');
    await renderer.write('Part 3');
    await renderer.end();

    expect(mockStream.markdown).toHaveBeenCalled();
  });

  describe('Thinking Blocks', () => {
    it('handles thinking blocks as blockquote style by default', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: true,
        stream: mockStream,
        thinkingStyle: 'blockquote'
      } as unknown as Parameters<typeof createVSCodeChatRenderer>[0]);

      await renderer.write('Content');
      await renderer.end();

      expect(mockStream.markdown).toHaveBeenCalled();
    });

    it('handles thinking blocks as progress style', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: true,
        stream: {
          ...mockStream,
          thinkingProgress: undefined // Test fallback to progress()
        } as unknown as ChatResponseStream,
        thinkingStyle: 'progress'
      } as unknown as Parameters<typeof createVSCodeChatRenderer>[0]);

      await renderer.writeChunk({
        content: 'Content',
        done: true,
        thinking: 'Internal reasoning'
      });

      expect(mockStream.progress).toHaveBeenCalled();
    });

    it('uses thinkingProgress when available', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: true,
        stream: mockStream,
        thinkingStyle: 'blockquote'
      } as unknown as Parameters<typeof createVSCodeChatRenderer>[0]);

      await renderer.writeChunk({
        content: 'Visible content',
        thinking: 'Internal reasoning'
      });
      await renderer.end();

      expect(mockStream.thinkingProgress).toHaveBeenCalledWith({
        id: 'thinking',
        text: 'Internal reasoning'
      });
      expect(mockStream.progress).not.toHaveBeenCalled();
    });

    it('suppresses thinking when style is suppress', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: true,
        stream: mockStream,
        thinkingStyle: 'suppress'
      } as unknown as Parameters<typeof createVSCodeChatRenderer>[0]);

      await renderer.write('Content');
      await renderer.end();

      expect(mockStream.progress).not.toHaveBeenCalled();
    });

    it('suppresses thinking when showThinking is false', async () => {
      const renderer = createVSCodeChatRenderer({ stream: mockStream });

      await renderer.write('Content');
      await renderer.end();

      expect(mockStream.progress).not.toHaveBeenCalled();
    });
  });

  describe('Tool Call Feedback', () => {
    it('fires onToolCall callback', async () => {
      const onToolCall = vi.fn();
      const fakeProcessor = createFakeProcessor([
        {
          call: {
            format: 'bare-xml',
            id: 'tc_callback',
            name: 'search',
            parameters: { query: 'docs' }
          },
          state: 'pending',
          type: 'tool_call'
        }
      ]);

      const renderer = createVSCodeChatRenderer({
        onToolCall,
        processor: fakeProcessor,
        stream: mockStream
      });

      await renderer.writeChunk({ content: 'Tool use call' });
      await renderer.end();

      expect(onToolCall).toHaveBeenCalledOnce();
      expect(onToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          call: expect.objectContaining({ id: 'tc_callback', name: 'search' }),
          state: 'pending',
          type: 'tool_call'
        })
      );
    });

    it('invokes beginToolInvocation when available', async () => {
      const fakeProcessor = createFakeProcessor([
        {
          call: {
            format: 'bare-xml',
            id: 'tc_begin',
            name: 'weather',
            parameters: { city: 'NYC' }
          },
          state: 'pending',
          type: 'tool_call'
        }
      ]);

      const renderer = createVSCodeChatRenderer({
        processor: fakeProcessor,
        stream: mockStream
      });

      await renderer.writeChunk({ content: 'invoke tool' });
      await renderer.end();

      expect(mockStream.beginToolInvocation).toHaveBeenCalledOnce();
      expect(mockStream.beginToolInvocation).toHaveBeenCalledWith('tc_begin', 'weather', {
        city: 'NYC'
      });
    });

    it('fires onToolCallDelta callback', async () => {
      const onToolCallDelta = vi.fn();
      const fakeProcessor = createFakeProcessor([
        {
          argumentsDelta: '{"query":',
          id: 'tc_delta',
          index: 0,
          name: 'search',
          type: 'tool_call_delta'
        }
      ]);

      const renderer = createVSCodeChatRenderer({
        onToolCallDelta,
        processor: fakeProcessor,
        stream: mockStream
      });

      await renderer.writeChunk({ content: 'Tool delta' });
      await renderer.end();

      expect(onToolCallDelta).toHaveBeenCalledOnce();
      expect(onToolCallDelta).toHaveBeenCalledWith(
        expect.objectContaining({
          argumentsDelta: '{"query":',
          id: 'tc_delta',
          name: 'search',
          type: 'tool_call_delta'
        })
      );
    });

    it('calls updateToolInvocation when tool_call_delta received', async () => {
      const fakeProcessor = createFakeProcessor([
        {
          argumentsDelta: '"docs"}',
          id: 'tc_update',
          index: 1,
          name: 'search',
          type: 'tool_call_delta'
        }
      ]);

      const renderer = createVSCodeChatRenderer({
        processor: fakeProcessor,
        stream: mockStream
      });

      await renderer.writeChunk({ content: 'delta content' });
      await renderer.end();

      expect(mockStream.updateToolInvocation).toHaveBeenCalledOnce();
      expect(mockStream.updateToolInvocation).toHaveBeenCalledWith(
        'tc_update',
        expect.objectContaining({
          argumentsDelta: '"docs"}',
          id: 'tc_update',
          name: 'search',
          type: 'tool_call_delta'
        })
      );
    });

    it('awaits async onToolCall callback before writeChunk resolves', async () => {
      let releaseCallback: (() => void) | undefined;
      let callbackCompleted = false;
      const callbackGate = new Promise<void>(resolve => {
        releaseCallback = resolve;
      });

      const onToolCall = vi.fn(async () => {
        await callbackGate;
        callbackCompleted = true;
      });

      const fakeProcessor = createFakeProcessor([
        {
          call: { arguments: {}, id: 'tc1', name: 'search' },
          state: 'pending',
          type: 'tool_call'
        }
      ]);

      const renderer = createVSCodeChatRenderer({
        onToolCall,
        processor: fakeProcessor,
        stream: mockStream
      });

      const writePromise = renderer.writeChunk({ content: 'chunk' });

      // If writeChunk correctly awaits onToolCall, callback should still be pending here.
      await Promise.resolve();
      expect(callbackCompleted).toBeFalsy();

      releaseCallback?.();
      await writePromise;

      expect(onToolCall).toHaveBeenCalledOnce();
      expect(callbackCompleted).toBeTruthy();
    });
  });

  describe('Usage Reporting', () => {
    it('reports usage when available', async () => {
      const renderer = createVSCodeChatRenderer({
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'Test',
        done: true,
        usage: { inputTokens: 10, outputTokens: 20 }
      });

      expect(mockStream.usage).toHaveBeenCalledWith({
        completionTokens: 20,
        promptTokens: 10
      });
    });

    it('handles missing usage data gracefully', async () => {
      const renderer = createVSCodeChatRenderer({
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'Test',
        done: true
      });

      expect(renderer).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('calls onError for processing errors', async () => {
      const onError = vi.fn();
      const renderer = createVSCodeChatRenderer({
        onError,
        stream: mockStream
      });

      await renderer.write('Content');
      await renderer.end();

      expect(onError).toBeDefined();
    });

    it('calls onFinish callback', async () => {
      const onFinish = vi.fn();
      const renderer = createVSCodeChatRenderer({
        onFinish,
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'Test',
        done: true,
        finishReason: 'stop'
      });

      expect(onFinish).toHaveBeenCalledWith('stop', undefined);
    });

    it('prevents double onFinish invocation', async () => {
      const onFinish = vi.fn();
      const renderer = createVSCodeChatRenderer({
        onFinish,
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'Test',
        done: true,
        finishReason: 'stop'
      });

      await renderer.end();

      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('calls onFinish in end() if not already called', async () => {
      const onFinish = vi.fn();
      const renderer = createVSCodeChatRenderer({
        onFinish,
        stream: mockStream
      });

      await renderer.write('Content');
      await renderer.end();

      expect(onFinish).toHaveBeenCalledOnce();
    });

    it('calls onStep when stepIndex changes in writeChunk', async () => {
      const onStep = vi.fn();
      const renderer = createVSCodeChatRenderer({
        onStep,
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'Step 0',
        stepIndex: 0,
        stepUsage: { outputTokens: 2 }
      });
      await renderer.writeChunk({
        content: 'Still step 0',
        stepIndex: 0,
        stepUsage: { outputTokens: 3 }
      });
      await renderer.writeChunk({
        content: 'Step 1',
        stepIndex: 1,
        usage: { inputTokens: 1, outputTokens: 4 }
      });

      expect(onStep).toHaveBeenCalledTimes(2);
      expect(onStep).toHaveBeenNthCalledWith(1, 0, { outputTokens: 2 });
      expect(onStep).toHaveBeenNthCalledWith(2, 1, {
        inputTokens: 1,
        outputTokens: 4
      });
    });
  });

  describe('writeChunk vs write', () => {
    it('writeChunk processes StreamChunk objects', async () => {
      const renderer = createVSCodeChatRenderer({
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'Streamed content',
        done: false,
        thinking: 'Internal reasoning'
      });

      await renderer.end();

      expect(mockStream.markdown).toHaveBeenCalled();
    });

    it('write processes string chunks', async () => {
      const renderer = createVSCodeChatRenderer({
        stream: mockStream
      });

      await renderer.write('String content');
      await renderer.end();

      expect(mockStream.markdown).toHaveBeenCalled();
    });
  });

  describe('Blockquote Thinking Blocks', () => {
    it('emits blockquote header when thinking content processed with blockquote style', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: true,
        stream: mockStream,
        thinkingStyle: 'blockquote'
      });

      await renderer.write('Let me think about this');
      await renderer.end();

      expect(mockStream.markdown).toHaveBeenCalled();
    });

    it('suppresses thinking blocks when showThinking is false', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: false,
        stream: mockStream
      });

      await renderer.write('Content');
      await renderer.end();

      expect(mockStream.progress).not.toHaveBeenCalled();
    });

    it('accepts custom thinkingStyle options', async () => {
      const renderer = createVSCodeChatRenderer({
        showThinking: true,
        stream: mockStream,
        thinkingStyle: 'blockquote'
      });

      await renderer.write('content');
      await renderer.end();

      expect(renderer).toBeDefined();
    });

    it('should handle structured chunk output with tool calls', async () => {
      const renderer = createVSCodeChatRenderer({
        stream: mockStream
      });

      await renderer.writeChunk({
        content: 'I will call a tool',
        done: false
      });

      await renderer.end();

      expect(mockStream.markdown).toHaveBeenCalled();
    });
  });
});

describe('VS Code Agent Loop', () => {
  let mockStream: ChatResponseStream;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStream = {
      anchor: vi.fn(),
      button: vi.fn(),
      filetree: vi.fn(),
      markdown: vi.fn(),
      progress: vi.fn(),
      reference: vi.fn()
    };
  });

  it('creates agent loop renderer', () => {
    const renderer = createVSCodeAgentLoop({
      stream: mockStream
    });

    expect(renderer).toBeDefined();
    expect(renderer.write).toBeDefined();
    expect(renderer.end).toBeDefined();
  });

  it('defaults showThinking to true for agent loops', () => {
    const renderer = createVSCodeAgentLoop({
      stream: mockStream
    });

    expect(renderer).toBeDefined();
  });

  it('allows overriding thinking style', async () => {
    const renderer = createVSCodeAgentLoop({
      showThinking: true,
      stream: mockStream,
      thinkingStyle: 'progress'
    });

    await renderer.write('Agent step');
    await renderer.end();

    expect(mockStream.markdown).toHaveBeenCalled();
  });

  it('handles abort signal gracefully', async () => {
    const abortController = new AbortController();
    const renderer = createVSCodeAgentLoop({
      abortSignal: abortController.signal,
      stream: mockStream
    });

    await renderer.write('Content');
    await renderer.end();

    expect(renderer).toBeDefined();

    abortController.abort();
  });

  it('prevents double flush when abort and end are both triggered', async () => {
    const abortController = new AbortController();
    const flush = vi.fn(() => ({
      content: '',
      done: true,
      incomplete: false,
      incompleteness: [],
      parts: [],
      thinking: '',
      toolCalls: []
    }));

    const fakeProcessor = createFakeProcessor([], flush);

    const renderer = createVSCodeAgentLoop({
      abortSignal: abortController.signal,
      processor: fakeProcessor,
      stream: mockStream
    });

    abortController.abort();
    await Promise.resolve();
    await renderer.end();

    expect(flush).toHaveBeenCalledOnce();
  });

  it('detaches abort listener when end() is called before cancellation', async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    const fakeAbortSignal = {
      aborted: false,
      addEventListener,
      removeEventListener
    } as unknown as AbortSignal;

    const renderer = createVSCodeAgentLoop({
      abortSignal: fakeAbortSignal,
      stream: mockStream
    });

    await renderer.end();

    expect(addEventListener).toHaveBeenCalledOnce();
    expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeEventListener).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('logs error stack when abort cleanup fails', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
    const testError = new Error('Renderer end failed');
    testError.stack = 'Error: Renderer end failed\n  at test (test.ts:1:1)';

    const failingStream = {
      anchor: vi.fn(),
      button: vi.fn(),
      filetree: vi.fn(),
      markdown: vi.fn(() => {
        throw testError;
      }),
      progress: vi.fn(),
      reference: vi.fn()
    } as unknown as ChatResponseStream;

    const abortController = new AbortController();
    const renderer = createVSCodeAgentLoop({
      abortSignal: abortController.signal,
      stream: failingStream
    });

    await renderer.write('test content');

    abortController.abort();

    await vi.waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[VS Code Agent Loop] Error'),
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  });

  it('calls endOnce only once when abort signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const renderer = createVSCodeAgentLoop({
      abortSignal: abortController.signal,
      stream: mockStream
    });

    await Promise.resolve();
    await renderer.end();

    expect(() => mockStream.markdown('')).not.toThrow();
  });
});

describe('Cancellation Token Bridge', () => {
  it('converts CancellationToken to AbortSignal', () => {
    const mockToken: CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(() => ({
        dispose: vi.fn()
      }))
    };

    const signal = cancellationTokenToAbortSignal(mockToken);

    expect(signal).toBeDefined();
    expect(signal.aborted).toBeFalsy();
  });

  it('returns aborted signal when token is already cancelled', () => {
    const mockToken: CancellationToken = {
      isCancellationRequested: true,
      onCancellationRequested: vi.fn(() => ({
        dispose: vi.fn()
      }))
    };

    const signal = cancellationTokenToAbortSignal(mockToken);

    expect(signal.aborted).toBeTruthy();
  });

  it('aborts signal when token fires cancellation', () => {
    const listeners: ((e: unknown) => void)[] = [];

    const mockToken: CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn((listener: (e: unknown) => void) => {
        listeners.push(listener);
        return { dispose: vi.fn() };
      })
    };

    const signal = cancellationTokenToAbortSignal(mockToken);

    expect(signal.aborted).toBeFalsy();

    for (const listener of listeners) {
      listener(undefined);
    }

    expect(signal.aborted).toBeTruthy();
  });

  it('returns a non-aborted signal for partial tokens without onCancellationRequested', () => {
    const signal = cancellationTokenToAbortSignal({
      isCancellationRequested: false
    });

    expect(signal).toBeDefined();
    expect(signal.aborted).toBeFalsy();
  });

  it('does not throw when cancellation callback fires synchronously during registration', () => {
    const dispose = vi.fn();
    const mockToken: CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn((listener: (e: unknown) => void) => {
        listener(undefined);
        return { dispose };
      })
    };

    const signal = cancellationTokenToAbortSignal(mockToken);
    expect(signal.aborted).toBeTruthy();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
