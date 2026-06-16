/**
 * CLI stream bridge (TASK-011).
 *
 * Converts `TurnEventOptions`-compatible callbacks from `createSimpleTurnLoop`
 * into `InkRuntimeListeners` so the Ink TUI can consume streaming events
 * directly from the runtime turn loop.
 *
 * This module sits at the boundary between `@agentsy/runtime/loop` and
 * `@agentsy/ui/ink` — it is intentionally thin and stateless.
 */

import type { XmlToolCall } from '@agentsy/core/tool-calls';
import type { JsonObject } from '@agentsy/shared';

import type { InkRuntimeListeners } from '../ink/ink-runtime-state.js';

// ── Bridge event shape ───────────────────────────────────────────────────────

/**
 * Subset of `TurnEventOptions` from `@agentsy/runtime/loop` that the bridge
 * forwards to an `InkRuntimeController`.
 *
 * Defined locally so `@agentsy/ui` does not take a hard dependency on
 * `@agentsy/runtime`.
 */
export interface CliStreamBridgeEvents {
  onDone?: (
    finishReason?: string,
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  ) => void;
  onError?: (error: Error) => void;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  /**
   * Called when a tool call is completed.
   * Receives `(id, name, args)` from the turn loop — args is the raw `unknown`
   * value accumulated from the provider stream.
   */
  onToolCall?: (id: string, name: string, args: unknown) => void;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a `CliStreamBridgeEvents` object whose handlers forward streaming
 * events from the runtime turn loop to the provided `InkRuntimeListeners`.
 *
 * Tool calls are converted from the `(id, name, args)` tuple that
 * `createSimpleTurnLoop` emits to the `XmlToolCall` shape that Ink components
 * expect.  The `format` is set to `'native-json'` because the args have
 * already been parsed by the provider normalizer.
 *
 * @example
 * ```ts
 * const bridge = createCliStreamBridge(controller.listeners);
 * await loop.run(userInput, bridge);
 * ```
 */
export function createCliStreamBridge(listeners: InkRuntimeListeners): CliStreamBridgeEvents {
  return {
    onDone(_finishReason) {
      listeners.done();
      // finishReason / usage not consumed by InkRuntimeListeners — no-op
    },

    onError(error) {
      listeners.warning(error.message);
      listeners.done();
    },

    onText(delta) {
      listeners.text(delta);
    },

    onThinking(delta) {
      listeners.thinking(delta);
    },

    onToolCall(id, name, args) {
      const toolCall: XmlToolCall = {
        format: 'native-json',
        id,
        name,
        parameters:
          args != null && typeof args === 'object' && !Array.isArray(args)
            ? (args as JsonObject)
            : ({ value: args } as JsonObject)
      };
      listeners.tool_call(toolCall);
    }
  };
}
