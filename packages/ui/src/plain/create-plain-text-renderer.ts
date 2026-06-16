import { createOutputWriter, createSharedRendererHandle } from '../shared.js';
import type { BaseRendererOptions, RendererHandle, TextOutput } from '../types.js';

/**
 * Options for the plain text renderer.
 */
export interface PlainTextRendererOptions extends BaseRendererOptions {
  /** Output target: writable stream or callback function. @default process.stdout */
  output?: TextOutput;

  /** Prefix for thinking blocks. @default '[Thinking] ' */
  thinkingPrefix?: string;
}

/**
 * Create a plain text renderer that accumulates text and thinking blocks,
 * writing to a writable stream or callback function.
 *
 * This is a zero-dependency renderer suitable for CLI tools, logging, and
 * server-side streaming. Tool calls are silently skipped (not rendered).
 *
 * @param options - Configuration options
 * @returns A renderer handle with `write()` and `end()` methods
 *
 * @example
 * ```typescript
 * import { createPlainTextRenderer } from '@selfagency/llm-stream-parser/renderers/plain';
 *
 * const renderer = createPlainTextRenderer({
 *   showThinking: true,
 *   thinkingPrefix: '💭 ',
 *   output: (text) => console.log(text),
 * });
 *
 * await renderer.write('Chunk 1');
 * await renderer.write('Chunk 2');
 * await renderer.end();
 * ```
 */
export function createPlainTextRenderer(options: PlainTextRendererOptions = {}): RendererHandle {
  const { output = process.stdout, showThinking = false, thinkingPrefix = '[Thinking] ' } = options;
  const { onToolCall } = options;

  const writeOutput = createOutputWriter(output);

  return createSharedRendererHandle(
    options,
    {
      onText: (text: string) => {
        writeOutput(text);
        return Promise.resolve();
      },
      onThinking: (text: string) => {
        if (showThinking) {
          writeOutput(`${thinkingPrefix}${text}\n`);
        }
        return Promise.resolve();
      },
      ...(onToolCall !== undefined && {
        onToolCall: (part: Parameters<NonNullable<typeof options.onToolCall>>[0] & { type: 'tool_call' }) => {
          if (part) {
            const result = onToolCall(part);
            return result instanceof Promise ? result : Promise.resolve();
          }
          return Promise.resolve(undefined);
        }
      }),
      onEnd: () => {
        // Call end() on stream if it has one (but not on process.stdout)
        if (
          typeof output === 'object' &&
          output !== process.stdout &&
          'end' in output &&
          typeof output.end === 'function'
        ) {
          output.end();
        }
        return Promise.resolve();
      }
    },
    options.onError
  );
}
