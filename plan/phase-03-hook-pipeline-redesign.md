
## 8. Phase 3 — Hook Pipeline Redesign + Claude-Code Hook Schema ✅ COMPLETE

**Priority**: P1 — Sprint 1
**Story points**: 5
**Branch**: `feat/hook-pipeline-redesign`
**Depends on**: Phase 0 ✅ (the minimal hook patch from 0.3 will be replaced)
**Unblocks**: Phase 4 (guardrails honest foundation needs the new composition model to thread `GuardrailDecisionReceipt`s), Phase 14 (ACP agent needs hook-driven tool interception), Phase 17 (competitive items build on this hook schema)
**Closes competitive gaps**: #1 (Claude-Code hook schema), #4 (failUnsettledTools from opencode)
> ⚠️ **2026-06-17 Audit Finding — API Shape Divergence**: The implemented hook registry uses the
> **factory function pattern** (`createRuntimeHookRegistry()` → `HookRegistry` interface) rather than
> the `RuntimeHookRegistry` class shown in plan examples. The `fire()` return type is also different:
>
> | | Plan examples | Actual implementation |
> |---|---|---|
> | Entry point | `new RuntimeHookRegistry(...)` | `createRuntimeHookRegistry()` |
> | `fire()` return | `{ payload, stopped, stoppedBy }` | `HookResult` (`{ continue }` / `{ transform }`) |
> | Transform shape | `HookTransformFn<T>` wrapping | Shallow object merge via `mergePayload()` |
>
> The factory-function implementation is **correct and working** — all tests pass. However, Phase 12
> code examples reference the class API (e.g. `new RuntimeHookRegistry({ logger })`) and must be
> updated to use `createRuntimeHookRegistry()`. The `registerBuiltinGuardrails()` function in
> `runtime/src/guardrails/builtin.ts` already uses the correct interface.
>
> **No rework required.** Update Phase 12 examples to match the factory pattern.

### 8.1 Current Problem

The Phase 0.3 patch stopped the silent data loss but kept the short-circuit semantics. The hook registry's `fire()` method still returns immediately on the first `transform` result. This means a guardrail hook that sanitizes the prompt prevents the memory hook from injecting context; a memory hook that injects context prevents guardrails from checking it; only the first-registered transform wins. The Phase 0.3 patch logs a warning when this happens but cannot prevent it without a redesign.

### 8.2 New Design: Middleware-Style Composition

Replace the short-circuit `fire()` with a Koa/Express-style middleware pipeline. Transforms compose left-to-right (lower priority first). A `stop` result short-circuits; `continue` and `transform` both pass through to the next handler.

```typescript
// packages/runtime/src/hooks/registry.ts (REDESIGNED)

export type HookTransformFn<T> = (payload: T) => T | Promise<T>;
export type HookResult<T> =
  | { action: 'continue' }
  | { action: 'stop'; reason?: string }
  | { action: 'transform'; transform: HookTransformFn<T> };

export interface HookHandler<T = unknown> {
  id: string;
  event: HookEventName;
  priority: number;               // Lower = runs first
  handler: (payload: T) => HookResult<T> | Promise<HookResult<T>>;
}

export class RuntimeHookRegistry {
  private handlers = new Map<string, HookHandler[]>();

  /**
   * Fire an event through the hook pipeline.
   * Transforms compose left-to-right (lower priority first).
   * A 'stop' result short-circuits the pipeline.
   */
  async fire<T extends HookEventName>(
    event: T,
    payload: HookContext<T>
  ): Promise<{ payload: HookContext<T>; stopped: boolean; stoppedBy?: string }> {
    const handlers = this.getHandlersForEvent(event);
    let currentPayload = payload;
    const transformChain: Array<{ id: string; fn: HookTransformFn<HookContext<T>> }> = [];

    for (const handler of handlers) {
      try {
        const result = await handler.handler(currentPayload);

        if (result.action === 'stop') {
          return { payload: currentPayload, stopped: true, stoppedBy: handler.id };
        }

        if (result.action === 'transform') {
          // Apply the transform immediately to update payload for subsequent hooks
          currentPayload = await result.transform(currentPayload);
          transformChain.push({ id: handler.id, fn: result.transform });
        }
        // 'continue' — pass through
      } catch (error) {
        this.logger.error(`Hook "${handler.id}" threw on event "${event}"`, error);
        // Continue to next handler — one bad hook doesn't break the chain
      }
    }

    return { payload: currentPayload, stopped: false };
  }
}
```

### 8.3 Composition Example: Guardrail + Memory

With the new composition model, the memory pre-turn hook and guardrail hook both transform the payload, and their transforms compose:

```typescript
// Memory pre-turn hook (priority 20 — runs after guardrails)
export function createMemoryPreTurnHook(deps: MemoryHookDeps): HookHandler {
  return {
    id: 'memory-pre-turn',
    event: 'UserPromptSubmit',
    priority: 20,
    handler: async (payload) => {
      const memories = await deps.memory.recall({
        query: payload.prompt,
        scope: payload.scope,
        limit: 5,
        minRelevance: deps.minRelevance ?? 0.6,
      });
      if (memories.length === 0) return { action: 'continue' };
      return {
        action: 'transform',
        transform: (p) => ({
          ...p,
          prompt: p.prompt + '\n\n' + formatMemoryContext(memories),
          memoryContext: memories,
        }),
      };
    },
  };
}

// Guardrail hook (priority 10 — runs first)
export function createGuardrailHook(deps: GuardrailHookDeps): HookHandler {
  return {
    id: 'guardrail',
    event: 'UserPromptSubmit',
    priority: 10,
    handler: async (payload) => {
      const violations = await deps.guardrails.check(payload.prompt);
      if (violations.length === 0) return { action: 'continue' };
      if (violations.some(v => v.severity === 'block')) {
        return { action: 'stop', reason: 'Guardrail blocked prompt' };
      }
      return {
        action: 'transform',
        transform: (p) => ({ ...p, prompt: deps.guardrails.sanitize(p.prompt, violations) }),
      };
    },
  };
}
```

**Execution order** for `UserPromptSubmit`:

1. Guardrail (priority 10) checks and potentially sanitizes the prompt.
2. Memory pre-turn (priority 20) appends memory context to the (possibly sanitized) prompt.
3. Both transforms compose — the model sees a sanitized prompt with memory context.

### 8.4 Port Claude-Code Hook Schema (Competitive #1)

Adopt Claude-Code's hook schema: command/prompt/http/agent hook types with an `if` filter, `async`/`asyncRewake`/`once` flags. The `if` filter uses permission-rule syntax (e.g. `"Bash(git *)"`) so a hook is only spawned when the matched tool fires — this avoids unnecessary hook spawns for unrelated events.

```typescript
// packages/runtime/src/hooks/schema.ts (NEW)

export interface HookConfig {
  id: string;
  type: 'command' | 'prompt' | 'http' | 'agent';
  event: HookEventName;
  if?: string;             // Permission-rule filter, e.g. "Bash(git *)"
  priority?: number;       // Default 50
  async?: boolean;         // Fire-and-forget; don't block pipeline
  asyncRewake?: boolean;   // Async, but re-awaken pipeline on completion
  once?: boolean;          // Only fire once per session
  command?: string;        // For type: 'command' — shell command to exec
  prompt?: string;         // For type: 'prompt' — prompt to inject
  url?: string;            // For type: 'http' — webhook URL
  agentId?: string;        // For type: 'agent' — subagent to spawn
}
```

Hooks load from `.agentsy/hooks/*.yaml` (project-local) and `~/.agentsy/hooks/*.yaml` (user-global). The hook registry merges by ID, with project-local taking precedence.

### 8.5 failUnsettledTools on Provider Error (Competitive #4)

When a provider stream errors mid-turn, any pending tool calls are orphaned. Port opencode's `failUnsettledTools` pattern: on stream error, publish a synthetic `tool_call_update` with `status: 'failed'` and the error message for every pending tool call. This prevents the agent from hanging waiting for tool results that will never arrive.

```typescript
// packages/runtime/src/loop/stream-error-handler.ts (NEW)

export async function failUnsettledTools(
  pendingToolCalls: Map<string, PendingToolCall>,
  error: unknown,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  for (const [toolCallId, pending] of pendingToolCalls) {
    emit({
      type: 'tool_call_update',
      toolCallId,
      status: 'failed',
      output: `Provider stream error: ${error instanceof Error ? error.message : String(error)}`,
    });
    pendingToolCalls.delete(toolCallId);
  }
}
```

Wire this into the stream error handler in `packages/runtime/src/loop/simple-turn.ts`.

### 8.6 Tests

- Unit: `fire()` composes two `transform` handlers in priority order; `stop` short-circuits; thrown handler doesn't break the chain.
- Unit: Claude-Code hook schema parser accepts all 4 hook types and the `if` filter.
- Unit: `failUnsettledTools` emits a `failed` update for every pending tool call.
- Integration: guardrail + memory hooks compose — model sees sanitized prompt with memory context.
- Integration: stream error mid-turn produces `tool_call_update` events for orphaned tools.

### 8.7 Verification

- [ ] `RuntimeHookRegistry.fire()` composes transforms left-to-right
- [ ] `stop` short-circuits the pipeline and returns `stoppedBy`
- [ ] Claude-Code hook schema parser handles command/prompt/http/agent types
- [ ] `if` filter prevents unnecessary hook spawns
- [ ] `failUnsettledTools` fires on stream error
- [ ] All existing tests pass (no regressions)
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---
