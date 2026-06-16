import { LLMStreamProcessor } from '@agentsy/core/processor';

import { createStepChangeEmitter, createWriteChunkHandler } from '../shared.js';
import type { BaseRendererOptions, RendererHandle } from '../types.js';

/**
 * Structural interface for browser DOM elements.
 * Matches HTMLElement-like objects without hard dependency on DOM types.
 */
interface DOMElement {
  appendChild?(element: DOMElement): DOMElement;
  className?: string;
  id?: string;
  innerHTML?: string;
  textContent?: string;
  [key: string]: unknown;
}

/**
 * Interface for streaming-markdown module.
 */
interface StreamingMarkdownModule {
  parser_create: (options: { target: DOMElement }) => unknown;
  parser_end?: (parser: unknown) => void;
  parser_write?: (parser: unknown, chunk: string) => void;
}

/**
 * Interface for DOMPurify module.
 */
interface DOMPurifyModule {
  removed?: unknown[];
  sanitize: (content: string) => string | DOMElement;
}

/**
 * Options for the browser streaming markdown renderer.
 */
export interface StreamingMarkdownRendererOptions extends BaseRendererOptions {
  /** Callback fired if a security violation is detected during sanitization. */
  onSecurityViolation?: () => void;
  /** Target DOM element where markdown will be rendered. Required. */
  target: DOMElement;

  /** Optional container for thinking blocks. If not provided, thinking is rendered inline. */
  thinkingContainer?: DOMElement | null;
}

/**
 * Create a browser streaming markdown renderer that appends markdown content
 * to a target DOM element with append-only updates, security sanitization,
 * and proper thinking block handling.
 *
 * Requires `streaming-markdown` and `dompurify` as peer dependencies.
 * This renderer is ESM-only; CJS environments will throw an error.
 *
 * @param options - Configuration options (target element required)
 * @returns A renderer handle with `write()` and `end()` methods
 *
 * @example
 * ```typescript
 * import { createStreamingMarkdownRenderer } from '@selfagency/llm-stream-parser/renderers/streaming-md';
 *
 * const target = document.getElementById('content');
 * const renderer = createStreamingMarkdownRenderer({
 *   target,
 *   showThinking: true,
 *   onSecurityViolation: () => console.warn('XSS attempt blocked'),
 * });
 *
 * await renderer.write('# Title\n\n');
 * await renderer.write('Markdown content');
 * await renderer.end();
 * ```
 */
// Lazily load streaming-markdown and dompurify with clear error messages
async function getStreamingMarkdownDeps(): Promise<{
  smd: StreamingMarkdownModule;
  DOMPurify: DOMPurifyModule;
}> {
  try {
    const smdImported = await import('streaming-markdown');
    const smdModule = (smdImported as { default: unknown }).default ?? smdImported;
    const dompurifyImported = await import('dompurify');
    const dompurifyModule = (dompurifyImported as { default: unknown }).default ?? dompurifyImported;

    return {
      DOMPurify: dompurifyModule as DOMPurifyModule,
      smd: smdModule as StreamingMarkdownModule
    };
  } catch {
    throw new Error(
      'Streaming markdown renderer requires "streaming-markdown" and "dompurify" peer dependencies. Install with: npm install streaming-markdown dompurify'
    );
  }
}

export function createStreamingMarkdownRenderer(options: StreamingMarkdownRendererOptions): RendererHandle {
  const { target, showThinking = false, onSecurityViolation, processor, onError, onFinish } = options;

  if (!target) {
    throw new Error('Target element is required for streaming markdown renderer');
  }

  // Create processor if not provided (owns it internally)
  const llmProcessor = processor ?? new LLMStreamProcessor();

  // Guard flag to prevent double onFinish callback invocation
  const finishedRef = { current: false };
  const emitStepChange = createStepChangeEmitter(options.onStep);

  // Accumulator for markdown content
  let accumulatedMarkdown = '';
  let parser: unknown = null;

  // Initialize parser lazily on first write
  async function ensureParser(): Promise<void> {
    if (parser === null) {
      const { smd } = await getStreamingMarkdownDeps();
      if (smd.parser_create) {
        parser = smd.parser_create({ target });
      }
    }
  }

  /**
   * Process parts from output, accumulating markdown content.
   * @internal
   */
  function processParts(parts: { type: string; text?: string }[]): void {
    for (const part of parts) {
      if (part.type === 'text' && part.text) {
        accumulatedMarkdown += part.text;
      } else if (part.type === 'thinking' && showThinking && part.text) {
        accumulatedMarkdown += `\n> **💭 Thinking:** ${part.text}\n`;
      }
    }
  }

  /**
   * Handles security validation and DOM rendering for accumulated markdown.
   * @internal
   */
  async function renderAccumulatedMarkdown(chunk: string): Promise<void> {
    if (!(accumulatedMarkdown && parser)) {
      return;
    }

    const { smd, DOMPurify } = await getStreamingMarkdownDeps();

    // Security check: sanitize accumulated markdown
    DOMPurify.sanitize(accumulatedMarkdown);

    if ((DOMPurify.removed?.length ?? 0) > 0) {
      // Security violation detected
      if (smd.parser_end) {
        smd.parser_end(parser);
      }
      if (onSecurityViolation) {
        onSecurityViolation();
      }
      return;
    }

    // Append new content to DOM
    try {
      if (smd.parser_write) {
        smd.parser_write(parser, chunk);
      }
    } catch {
      // Continue even if streaming fails
    }
  }

  return {
    async end(): Promise<void> {
      let result: ReturnType<typeof llmProcessor.flush> | undefined;
      try {
        result = llmProcessor.flush();
        processParts(result.parts);
        await emitStepChange(result);

        // Initialize parser if not yet initialized
        await ensureParser();

        // Finalize streaming: write any remaining markdown to parser
        if (accumulatedMarkdown && parser) {
          const { smd } = await getStreamingMarkdownDeps();

          // Write final markdown to parser
          if (smd.parser_write) {
            smd.parser_write(parser, accumulatedMarkdown);
          }
        }

        // End the parser (creates final DOM output)
        if (parser) {
          const { smd } = await getStreamingMarkdownDeps();
          if (smd.parser_end) {
            smd.parser_end(parser);
          }
        }
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(error);
        } else {
          throw error;
        }
      }

      // Fire onFinish callback to signal stream completion (guard against double invocation)
      if (!finishedRef.current && result?.done && onFinish) {
        finishedRef.current = true;
        await onFinish(result.finishReason, result.usage);
      }
    },

    async write(chunk: string): Promise<void> {
      try {
        const result = llmProcessor.process({ content: chunk });
        processParts(result.parts);

        // Initialize parser on first write and render accumulated markdown
        await ensureParser();
        await renderAccumulatedMarkdown(chunk);
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(error);
        } else {
          throw error;
        }
      }
    },

    writeChunk: createWriteChunkHandler(llmProcessor, processParts, emitStepChange, finishedRef, onFinish, onError)
  };
}
