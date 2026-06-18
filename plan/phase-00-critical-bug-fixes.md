
## 5. Phase 0 — Critical Bug Fixes ✅ COMPLETE

**Status**: Landed on `develop` (branch `fix/phase0-critical-bugs` merged).
**Story points**: 3 (actuals reconciled at merge).
**What shipped** (treat as existing infrastructure; do not regress):

| # | Fix | File | Outcome |
|---|---|---|---|
| 0.1 | True streaming in `UniversalClient` | `packages/providers/src/universal-client/client.ts` | `stream()` is now an `AsyncGenerator<StreamChunk>`; first chunk yields before stream completes. |
| 0.2 | Tool calls preserved in conversation history | `packages/runtime/src/loop/simple-turn.ts` | Assistant message carries `tool_calls`; tool-result messages appended with `tool_call_id`. Multi-step tool use works. |
| 0.3 | Hook transform short-circuit patched | `packages/runtime/src/hooks/registry.ts` | Minimal patch logs collision warnings; full redesign deferred to Phase 3. |
| 0.4 | Gateway cost filter unit mismatch | `packages/gateway/src/selector.ts` | `maxUsdPer1KInput` × 1000 before comparing against `inputPer1MTokens`. 1000× bug closed. |
| 0.5 | Retry quota map per-provider | `packages/gateway/src/retry.ts` | `quotaRegistry` added to `RetryContext`; per-provider trackers used. |
| 0.6 | Daemon restart orphan server | `packages/memory/src/mcp/daemon.ts` | `runWithRestart()` recurses with new engine+server references; old refs dropped. |
| 0.7 | Tool-call ID dedup | `packages/core/src/stream-to-events.ts` | Uses provider-assigned `tc.id` instead of `tc.function.name`. |
| 0.8 | Retry jitter | `packages/core/src/retry/index.ts` | Full-jitter exponential backoff; `timer.unref()` for clean shutdown. |
| 0.9 | Provider error classification | `packages/gateway/src/retry.ts` | HTTP status codes checked first; specific regexes for rate-limit/quota/timeout/conn-error. |

**Downstream consumers**: all subsequent phases assume these fixes. Phase 3 will fully replace the Phase 0.3 minimal hook patch with the middleware composition model.

---
