/**
 * Renderers for llm-stream-parser: composable output targets for streamed LLM responses.
 *
 * Each renderer follows the `RendererHandle` interface (`write(chunk)` / `end()`) and can be
 * plugged into any pipeline that generates streaming chunks. Renderers own their internal
 * `LLMStreamProcessor` instance (factory pattern) and emit to their configured output target.
 *
 * ## Available Renderers
 *
 * - **Plain Text** (`./plain`) — Zero-dependency text accumulation, configurable thinking blocks
 * - **CLI** (`./cli`) — ANSI-rich markdown rendering for terminal output (requires `cli-markdown` peer dep)
 * - **Streaming Markdown** (`./streaming-md`) — Append-only DOM streaming for browsers (requires `streaming-markdown` + `dompurify` peer deps)
 * - **VS Code Chat** (`./vscode`) — Streaming output for VS Code extensions via ChatResponseStream (no new deps, uses duck-typed interface)
 * - **Ink** (`./ink`) — Streaming React/Ink renderer for terminal output (requires `ink` + `react` peer deps)
 *
 * @example
 * ```typescript
 * import { createPlainTextRenderer } from '@selfagency/llm-stream-parser/renderers/plain';
 *
 * const renderer = createPlainTextRenderer({
 *   showThinking: true,
 *   output: (text) => console.log(text),
 * });
 *
 * await renderer.write('Hello ');
 * await renderer.write('World');
 * await renderer.end();
 * ```
 */

export { createInkRuntimeController, loadInkRenderModules } from './ink/ink-runtime-state.js';
export { createPlainTextRenderer, type PlainTextRendererOptions } from './plain/index.js';
export { createSharedRendererHandle, createStepChangeEmitter } from './shared.js';
export type {
  BaseRendererOptions,
  CancellationToken,
  OnToolCall,
  RendererHandle,
  TextOutput,
  ThinkingStyle
} from './types.js';
