# aImock Migration Plan

**Authority:** `plan/18-PHASE-AIMOCK-INTEGRATION.md`  
**Created:** 2026-05-28  
**Status:** ✅ Complete

---

## Current State

### What exists

- **MSW server** (`packages/testing/src/msw/`) — `createTestServer()` combining provider, memory, and retrieval handlers
- **Provider handlers** (`packages/testing/src/msw/handlers/providers.ts`) — OpenAI streaming + non-streaming, Anthropic streaming, Gemini streaming
- **Memory handlers** (`packages/testing/src/msw/handlers/memory.ts`) — health, documents CRUD, search
- **Retrieval handlers** (`packages/testing/src/msw/handlers/retrieval.ts`) — health, embed, re-rank
- **Fixtures** (`packages/testing/fixtures/providers/`) — `default-streams.json`, `error-responses.json`
- **Test file** (`packages/testing/src/msw.test.ts`) — 8 tests verifying MSW server bootstrap
- **Pipeline tests** (`packages/testing/src/sse-pipeline.test.ts`) — 7 tests using raw SSE strings (no MSW, no HTTP)

### What needs to change

| Component | Current | Target | Migration effort |
|-----------|---------|--------|-----------------|
| Provider handler factories | MSW `http.post()` → SSE text | aImock `LLMock.onMessage()` + fixtures | Medium |
| `msw.test.ts` smoke tests | `createTestServer()` + `fetch()` | `useAimock()` + `fetch()` | Low |
| `sse-pipeline.test.ts` | Raw SSE strings → `createPipeline()` | **No change needed** — these are pure unit tests with no HTTP | None |
| Memory/retrieval handlers | MSW `http.post()`/`http.get()` | **Keep MSW** — simple CRUD, no LLM semantics | None |
| `createTestServer` | MSW server with all handlers | MSW server with memory/retrieval only + aImock for providers | Medium |

### Migration strategy

1. **Install aImock** as dev dependency
2. **Create aImock fixtures** from existing `default-streams.json` and `error-responses.json`
3. **Create aImock test file** alongside `msw.test.ts` to verify the Vitest plugin works
4. **Add aImock to `createTestServer`** — compose aImock for providers, keep MSW for memory/retrieval
5. **Deprecate MSW provider handlers** — add `@deprecated` JSDoc, keep for backward compat
6. **Update documentation** — `README.md` reflects new dual approach

---

## Execution Steps

### Step 1: Install aImock

```bash
pnpm add -D @copilotkit/aimock --filter @agentsy/testing
```

### Step 2: Create aImock fixtures

Create `packages/testing/fixtures/aimock/` with:

- `openai-streaming.json` — from `default-streams.json` openai.streaming
- `openai-non-streaming.json` — from `default-streams.json` openai.nonStreaming
- `anthropic-streaming.json` — from `default-streams.json` anthropic.streaming
- `gemini-streaming.json` — from `default-streams.json` gemini.streaming
- `error-scenarios.json` — from `error-responses.json`

### Step 3: Create aImock verification test

`packages/testing/src/aimock.test.ts` — verify `useAimock()` plugin works with all 3 providers

### Step 4: Update `createTestServer`

Add optional `useAimock` config flag that starts an aImock server alongside MSW for provider mocking.

### Step 5: Deprecate MSW provider handlers

Add `@deprecated` JSDoc to `createOpenAIHandler`, `createAnthropicHandler`, `createGeminiHandler`, `createAllProviderHandlers`.

### Step 6: Update documentation

Update `packages/testing/README.md` to document aImock + MSW coexistence.

---

## Risk Mitigation

- **Pipeline tests** (`sse-pipeline.test.ts`) are pure unit tests — no changes needed
- **Memory/retrieval handlers** stay on MSW — no LLM semantics, simple CRUD
- **Backward compat** — `createTestServer()` API unchanged, aImock is opt-in via config
- **MSW stays installed** — not removed, just deprecated for provider mocking
