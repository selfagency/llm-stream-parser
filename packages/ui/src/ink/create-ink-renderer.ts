import type { LLMStreamProcessor } from '@agentsy/core/processor';
import type { Instance, RenderOptions } from 'ink';
import type * as reactNS from 'react';
import type { KeyboardOptions } from './components/keyboard-handler.js';
import { createInkRuntimeController, type InkRuntimeControllerOptions } from './ink-runtime-state.js';
import { default as InkStreamRenderer } from './ink-stream-renderer.tsx';
import { resolveTheme } from './themes/index.js';
import type { Theme, ThemeName } from './themes/types.js';

export interface InkRendererOptions {
  inkOptions?: Partial<RenderOptions>;
  keyboard?: KeyboardOptions;
  markdown?: boolean;
  onFinish?: () => void;
  onWarning: (message: string) => void;
  processor: LLMStreamProcessor;
  screenReader?: boolean;
  showThinking?: boolean;
  showToolCalls?: boolean;
  syntaxHighlight?: boolean;
  theme?: Theme | ThemeName;
  thinkingStyle?: 'blockquote' | 'inline' | 'suppress';
}

export interface InkRendererHandle {
  end(): void;
  instance: Instance;
  unmount(): void;
  write(chunk: string): void;
}

export async function createInkRenderer(options: InkRendererOptions): Promise<InkRendererHandle> {
  let ink: typeof import('ink');
  let react: typeof reactNS;
  try {
    ink = await import('ink');
    react = await import('react');
  } catch {
    throw new Error('ink and react are required peer dependencies. Install them with: pnpm add ink react');
  }

  const { createElement: h } = react;
  const { render } = ink;

  const controllerOptions: InkRuntimeControllerOptions = {
    onWarning: options.onWarning
  };
  if (options.onFinish !== undefined) {
    controllerOptions.onFinish = options.onFinish;
  }
  const { stateRef, forceUpdateRef, listeners } = createInkRuntimeController(controllerOptions);

  const { processor } = options;

  const resolvedTheme = resolveTheme(options.theme);

  const instance = render(
    h(InkStreamRenderer, {
      forceUpdateRef,
      options: {
        keyboard: options.keyboard,
        markdown: options.markdown,
        screenReader: options.screenReader,
        showThinking: options.showThinking,
        showToolCalls: options.showToolCalls,
        syntaxHighlight: options.syntaxHighlight,
        theme: resolvedTheme,
        thinkingStyle: options.thinkingStyle
      },
      setForceUpdate: (fn: () => void) => {
        forceUpdateRef.current = fn;
      },
      stateRef
    }),
    options.inkOptions
  );

  // Subscribe to processor events
  processor
    .on('done', listeners.done)
    .on('text', listeners.text)
    .on('thinking', listeners.thinking)
    .on('tool_call', listeners.tool_call);

  return {
    end(): void {
      stateRef.isStreaming = false;
      forceUpdateRef.current();
    },
    instance,
    unmount(): void {
      // Clean up processor listeners to prevent memory leaks
      instance.unmount();
    },
    write(_chunk: string): void {
      // Ink renderer is event-driven via processor; write is a no-op
    }
  };
}
