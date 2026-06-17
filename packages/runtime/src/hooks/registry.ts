import type { HookResult, RuntimeHookEvent } from './types.js';

/** A registered hook handler with an optional priority for ordering. */
export interface HookHandler {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority?: number;
}

/**
 * Typed event emitter for runtime lifecycle hooks.
 *
 * Handlers are registered by event type and fired in priority order
 * (highest first). If any handler returns `{ continue: false }` the
 * chain stops and the block reason is returned.
 */
export interface HookRegistry {
  /**
   * Fire an event through all registered handlers in priority order.
   *
   * Returns the final `HookResult`. If any handler blocks, the chain
   * stops immediately and the block reason propagates.
   */
  fire(event: RuntimeHookEvent): Promise<HookResult>;

  /**
   * List all currently registered handlers (for diagnostics / OTel).
   */
  list(): { eventType: RuntimeHookEvent['type']; handlerId: string; priority: number }[];
  /**
   * Register a handler for a specific event type.
   *
   * @returns A function that removes the handler when called.
   */
  register(
    eventType: RuntimeHookEvent['type'],
    handler: (event: RuntimeHookEvent) => Promise<HookResult>,
    options?: { id?: string; priority?: number }
  ): { unregister: () => void };

  /**
   * Remove a handler by its registration id.
   */
  unregister(id: string): void;
}

let _handlerIdCounter = 0;
function nextHandlerId(): string {
  _handlerIdCounter++;
  return `hook_${_handlerIdCounter}`;
}

/**
 * Create a `HookRegistry` — an empty registry with no handlers.
 *
 * @example
 * ```ts
 * const registry = createRuntimeHookRegistry();
 *
 * registry.register('UserPromptSubmit', async (event) => {
 *   if (event.input.includes('SEKRET')) {
 *     return { continue: false, reason: 'Secret detected in prompt' };
 *   }
 *   return { continue: true };
 * });
 *
 * const result = await registry.fire({
 *   type: 'UserPromptSubmit',
 *   input: 'hello world',
 *   sessionId: 'sess_123'
 * });
 * // result → { continue: true }
 * ```
 */
export function createRuntimeHookRegistry(): HookRegistry {
  const handlersByEvent = new Map<RuntimeHookEvent['type'], Map<string, HookHandler>>();

  function register(
    eventType: RuntimeHookEvent['type'],
    handler: (event: RuntimeHookEvent) => Promise<HookResult>,
    options?: { id?: string; priority?: number }
  ): { unregister: () => void } {
    const id = options?.id ?? nextHandlerId();
    const entry: HookHandler = {
      id,
      handler,
      priority: options?.priority ?? 0
    };

    let handlers = handlersByEvent.get(eventType);
    if (!handlers) {
      handlers = new Map();
      handlersByEvent.set(eventType, handlers);
    }
    handlers.set(id, entry);

    return {
      unregister: () => {
        handlers?.delete(id);
        if (handlers?.size === 0) {
          handlersByEvent.delete(eventType);
        }
      }
    };
  }

  function unregister(id: string): void {
    for (const handlers of handlersByEvent.values()) {
      if (handlers.delete(id)) {
        if (handlers.size === 0) {
          // We don't know the event type from just the id, so we iterate
          for (const [eventType, map] of handlersByEvent) {
            if (map === handlers) {
              handlersByEvent.delete(eventType);
              break;
            }
          }
        }
        return;
      }
    }
  }

  async function fire(event: RuntimeHookEvent): Promise<HookResult> {
    const handlers = handlersByEvent.get(event.type);
    if (!handlers || handlers.size === 0) {
      return { continue: true };
    }

    // Sort by priority descending
    const sorted = [...handlers.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    let currentPayload: unknown = event;
    let hasTransform = false;

    for (const entry of sorted) {
      try {
        const result = await entry.handler(event);

        // If result is a transform, compose it
        if ('transform' in result) {
          const transform = result.transform as Record<string, unknown>;
          if (hasTransform) {
            // Multiple transforms: compose by merging into accumulated payload
            currentPayload = { ...(currentPayload as Record<string, unknown>), ...transform };
          } else {
            currentPayload = { ...event, ...transform };
            hasTransform = true;
          }
          continue;
        }

        // If result blocks, stop the chain immediately
        if (!result.continue) {
          return result;
        }
      } catch {
        // If a handler throws, we continue to the next handler.
        // This ensures that thrown handlers don't break the chain.
      }
    }

    if (hasTransform) {
      return { transform: currentPayload };
    }

    return { continue: true };
  }

  function list(): { eventType: RuntimeHookEvent['type']; handlerId: string; priority: number }[] {
    const result: { eventType: RuntimeHookEvent['type']; handlerId: string; priority: number }[] = [];
    for (const [eventType, handlers] of handlersByEvent) {
      for (const [, entry] of handlers) {
        result.push({
          eventType,
          handlerId: entry.id,
          priority: entry.priority ?? 0
        });
      }
    }
    return result;
  }

  return { register, unregister, fire, list };
}
