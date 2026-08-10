import { appendToBlockquote } from '@agentsy/core/formatting';
import type { OutputPart } from '@agentsy/core/processor';
import type { BaseRendererOptions, RendererHandle, ThinkingStyle } from '@agentsy/ui';
import { createSharedRendererHandle } from '@agentsy/ui';

import { mapUsageToVSCode } from '../usage-tracking/map-usage.js';
import { toVSCodeToolCallPart } from './tool-call-lifecycle.js';

/** Module-level counter for generating unique fallback tool call IDs. */
let _toolCallCounter = 0;

/**
 * Structural interface matching VS Code's ChatResponseStream.
 * Stable API methods are required; proposed API methods are optional (capability detection).
 * Allows renderer to work with actual VS Code ChatResponseStream without hard dependency on vscode module.
 */
export interface MinimalChatResponseStream {
  /** Begin a tool invocation (proposed API). */
  beginToolInvocation?(toolCallId: string, toolName: string, streamData?: unknown): void;
  /** Emit markdown content to the chat response. */
  markdown(content: string): void;

  /** Emit a progress indicator (e.g., for thinking blocks). */
  progress?(content: string): void;

  /** Emit thinking progress (proposed API). */
  thinkingProgress?(delta: { text?: string | string[]; id?: string; metadata?: Record<string, unknown> }): void;

  /** Update a tool invocation (proposed API). */
  updateToolInvocation?(toolCallId: string, streamData: unknown): void;

  /** Report token usage (proposed API). */
  usage?(usage: { promptTokens: number; completionTokens: number; outputBuffer?: number }): void;
}

/**
 * Full structural interface matching VS Code's ChatResponseStream.
 * Includes advanced methods that are not required by agentsy renderers.
 */
export interface ChatResponseStream extends MinimalChatResponseStream {
  /** Anchor to a file or symbol. */
  anchor(
    value:
      | { scheme: string; path: string }
      | {
          uri: { scheme: string; path: string };
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
        },
    title?: string
  ): void;

  /** Begin a tool invocation (proposed API). */
  beginToolInvocation?(toolCallId: string, toolName: string, streamData?: unknown): void;

  /** Emit a button that runs a command. */
  button(command: { command: string; title: string; arguments?: unknown[] }): void;

  /** Emit a file tree. */
  filetree(value: { name: string; children?: unknown[] }[], baseUri: { scheme: string; path: string }): void;

  /** Push a response part (stable or proposed). */
  push?(part: unknown): void;

  /** Reference a file, location, or variable. */
  reference(
    value:
      | { scheme: string; path: string }
      | {
          uri: { scheme: string; path: string };
          range: {
            start: { line: number; character: number };
            end: { line: number; character: number };
          };
        }
      | { variableName: string; value?: { scheme: string; path: string } },
    iconPath?:
      | { scheme: string; path: string }
      | {
          light: { scheme: string; path: string };
          dark: { scheme: string; path: string };
        }
  ): void;

  // Proposed API methods (optional, capability-detection pattern)

  /** Emit thinking progress (proposed API). */
  thinkingProgress?(delta: { text?: string | string[]; id?: string; metadata?: Record<string, unknown> }): void;

  /** Update a tool invocation (proposed API). */
  updateToolInvocation?(toolCallId: string, streamData: unknown): void;

  /** Report token usage (proposed API). */
  usage?(usage: { promptTokens: number; completionTokens: number; outputBuffer?: number }): void;
}

/**
 * Options for the VS Code chat renderer.
 */
export interface VSCodeChatRendererOptions extends BaseRendererOptions {
  /** VS Code ChatResponseStream instance. Required. */
  stream: MinimalChatResponseStream;

  /** How to render thinking blocks. Default: 'blockquote'. */
  thinkingStyle?: ThinkingStyle;
}

/**
 * Create a VS Code extension chat renderer that streams markdown content
 * to a ChatResponseStream with support for thinking blocks and tool call callbacks.
 *
 * This renderer integrates with VS Code's chat interface, sending markdown
 * content incrementally as it arrives from the LLM. Thinking blocks can be
 * rendered as either blockquotes or progress indicators.
 *
 * @param options - Configuration options (stream required)
 * @returns A renderer handle with `write()` and `end()` methods
 *
 * @example
 * ```typescript
 * import { createVSCodeChatRenderer } from '@agentsy/vscode';
 *
 * const renderer = createVSCodeChatRenderer({
 *   stream, // ChatResponseStream from VS Code
 *   showThinking: true,
 *   thinkingStyle: 'progress',
 * });
 *
 * await renderer.write('# Response\n\n');
 * await renderer.write('Some content here');
 * await renderer.end();
 * ```
 */
export function createVSCodeChatRenderer(options: VSCodeChatRendererOptions): RendererHandle {
  const {
    stream,
    showThinking = false,
    thinkingStyle = 'blockquote',
    onError,
    onToolCall,
    onToolCallDelta,
    onFinish
  } = options;

  if (!stream) {
    throw new Error('ChatResponseStream is required for VS Code chat renderer');
  }

  let blockquoteThinkingStarted = false; // Track if blockquote header already emitted
  let blockquoteNeedsPrefix = true; // Track if next chunk needs blockquote prefix

  function handleThinkingPart(text: string): void {
    if (!showThinking || thinkingStyle === 'suppress') {
      return;
    }

    if (stream.thinkingProgress) {
      stream.thinkingProgress({ id: 'thinking', text });
    } else if (thinkingStyle === 'progress') {
      stream.progress?.(text);
    } else {
      // Blockquote style with proper multi-line support
      if (!blockquoteThinkingStarted) {
        stream.markdown('\n\n> 💭 **Thinking**\n>\n');
        blockquoteThinkingStarted = true;
        blockquoteNeedsPrefix = true;
      }

      const blockquoteContent = appendToBlockquote(text, blockquoteNeedsPrefix);
      stream.markdown(blockquoteContent);
      blockquoteNeedsPrefix = text.endsWith('\n');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const sharedOnFinish: BaseRendererOptions['onFinish'] = async (finishReason, usage) => {
    const mappedUsage = mapUsageToVSCode(usage);
    if (mappedUsage && stream.usage) {
      stream.usage(mappedUsage);
    }

    if (blockquoteThinkingStarted && thinkingStyle === 'blockquote') {
      stream.markdown('\n\n');
      blockquoteThinkingStarted = false;
    }

    if (onFinish) {
      await onFinish(finishReason, usage);
    }
  };

  const sharedOptions: BaseRendererOptions = {
    onFinish: sharedOnFinish
  };

  if (options.processor) {
    sharedOptions.processor = options.processor;
  }

  if (options.onStep) {
    sharedOptions.onStep = options.onStep;
  }

  return createSharedRendererHandle(
    sharedOptions,
    {
      // biome-ignore lint/suspicious/useAwait: must match Promise-returning handler interface
      onEnd: async () => {
        if (blockquoteThinkingStarted && thinkingStyle === 'blockquote') {
          stream.markdown('\n\n');
          blockquoteThinkingStarted = false;
        }
      },
      // biome-ignore lint/suspicious/useAwait: must match Promise-returning handler interface
      onText: async (text: string) => {
        stream.markdown(text);
      },
      // biome-ignore lint/suspicious/useAwait: must match Promise-returning handler interface
      onThinking: async (text: string) => {
        handleThinkingPart(text);
      },
      onToolCall: async part => {
        if (onToolCall) {
          await onToolCall(part);
        }

        if (stream.beginToolInvocation && typeof part.call?.name === 'string') {
          const vscodePart = toVSCodeToolCallPart(part, {
            fallbackCallId: `tool_call_${part.call.name}_${++_toolCallCounter}`
          });
          stream.beginToolInvocation(vscodePart.callId, vscodePart.name, vscodePart.input);
        }
      },
      // biome-ignore lint/suspicious/useAwait: must match Promise-returning handler interface
      onToolCallDelta: async (part: Extract<OutputPart, { type: 'tool_call_delta' }>) => {
        if (onToolCallDelta) {
          onToolCallDelta(part);
        }
        const toolPart = part;
        if (stream.updateToolInvocation && typeof toolPart.id === 'string') {
          stream.updateToolInvocation(toolPart.id, toolPart);
        }
      }
    },
    onError
  );
}
