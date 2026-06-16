import type { BaseRendererOptions, ThinkingStyle } from '@agentsy/ui';

import type { MinimalChatResponseStream } from './create-vs-code-chat-renderer.js';
import { createVSCodeChatRenderer } from './create-vs-code-chat-renderer.js';

/**
 * Options for VS Code agent loop renderer.
 */
export interface VSCodeAgentLoopOptions extends BaseRendererOptions {
  /** Optional abort signal for stream cancellation. */
  abortSignal?: AbortSignal;
  /** VS Code ChatResponseStream instance. Required. */
  stream: MinimalChatResponseStream;

  /** How to render thinking blocks. Default: 'blockquote'. */
  thinkingStyle?: ThinkingStyle;
}

/**
 * Create a VS Code renderer optimized for multi-step agent loops.
 *
 * This factory simplifies setting up a renderer for agent-based chat where
 * the agent executes multiple steps (tool calls, reflection, etc.) and streams
 * intermediate results back to the user.
 *
 * **Differences from createVSCodeChatRenderer:**
 * - Default `showThinking: true` (agent thinking is typically relevant)
 * - Supports optional `abortSignal` for external cancellation control
 * - Better integration with agent workflow callbacks
 *
 * @param options - Configuration options (stream required)
 * @returns A renderer handle suitable for agent loops
 *
 * @example
 * ```typescript
 * import { createVSCodeAgentLoop, cancellationTokenToAbortSignal } from '@agentsy/vscode';
 *
 * export async function handleAgentChat(
 *   request: vscode.ChatRequest,
 *   context: vscode.ChatContext,
 *   stream: vscode.ChatResponseStream,
 *   token: vscode.CancellationToken,
 * ) {
 *   const abortSignal = cancellationTokenToAbortSignal(token);
 *
 *   const renderer = createVSCodeAgentLoop({
 *     stream,
 *     showThinking: true,
 *     thinkingStyle: 'progress',
 *     abortSignal,
 *     onToolCall: (toolCall) => {
 *       // Handle tool invocation in agent workflow
 *     },
 *     onFinish: (reason, usage) => {
 *       // Log completion stats
 *     },
 *   });
 *
 *   // Run agent steps, streaming each to the renderer
 *   for await (const output of agent.run(request.prompt, { signal: abortSignal })) {
 *     await renderer.writeChunk(output);
 *   }
 *   await renderer.end();
 * }
 * ```
 */
export function createVSCodeAgentLoop(options: VSCodeAgentLoopOptions) {
  const mergedOptions = {
    ...options,
    showThinking: options.showThinking !== false
  };

  const renderer = createVSCodeChatRenderer(mergedOptions);

  let endPromise: Promise<void> | null = null;
  let detachAbortListener: (() => void) | undefined;

  const endOnce = async (): Promise<void> => {
    if (endPromise) {
      await endPromise;
      return;
    }

    detachAbortListener?.();
    detachAbortListener = undefined;

    endPromise = renderer.end().finally(() => {
      detachAbortListener?.();
      detachAbortListener = undefined;
    });

    return await endPromise;
  };

  const { abortSignal } = options;
  if (abortSignal) {
    const onAbort = () => {
      endOnce().catch(error => {
        console.warn('[VS Code Agent Loop] Error during cancellation cleanup:', error);
        if (error instanceof Error && error.stack) {
          console.warn('[VS Code Agent Loop] Cleanup error stack:', error.stack);
        }
      });
    };

    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener('abort', onAbort, { once: true });
      detachAbortListener = () => {
        abortSignal.removeEventListener('abort', onAbort);
      };
    }
  }

  return {
    end: endOnce,
    write: (content: unknown) => renderer.write(content as Parameters<typeof renderer.write>[0]),
    writeChunk: (content: unknown) => renderer.writeChunk(content as Parameters<typeof renderer.writeChunk>[0])
  };
}
