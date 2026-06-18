## Phase 33 — AIMock Full Integration

**Priority**: P1 — Sprint 5 (parallel with Phase 9 / Phase 21)
**Story points**: 5
**Branch**: `feat/aimock-full-integration`
**Depends on**: Phase 1 ✅ (daemon + MCP hosting), Phase 7 (RAG as Daemon Service)
**Unblocks**: Phase 13 (benchmark suite needs deterministic LLM responses), Phase 26-deferred (A2AMock enables A2A protocol testing)

---

### 33.1 Current State

`@copilotkit/aimock@^1.29.0` is installed in `@agentsy/testing` as a `devDependency`. Usage is
**incomplete**: only `LLMock` is integrated, and only in a single smoke test file.

| AIMock module | Available in v1.29 | Used in agentsy | Gap |
|---|---|---|---|
| **`LLMock`** — 14 LLM providers, streaming, tool calls, reasoning | ✅ | ✅ `aimock.test.ts` (smoke only) | Full wiring to gateway E2E tests missing; `onToolCall`, chaos mode, record/replay unused |
| **`MCPMock`** — JSON-RPC 2.0 MCP server, session management, tools/resources/prompts | ✅ | ❌ | Memory package RAG tests use hand-rolled MSW; daemon MCP tests use none |
| **`A2AMock`** — agent card discovery, message routing, SSE streaming | ✅ | ❌ | No A2A tests exist (Phase 26 deferred, but test harness should exist now) |
| **`AGUIMock`** — AG-UI event stream mocking for frontend testing | ✅ | ❌ | Phase 31 (AG-UI adapter) has no tests using AGUIMock |
| **`VectorMock`** — Pinecone/Qdrant/ChromaDB compatible endpoints | ✅ | ❌ | RAG/retrieval tests in `memory/` use custom MSW handlers (`test-msw.ts`) instead |
| **Record & Replay** — proxy real API calls → save fixtures → replay in CI | ✅ | ❌ | No fixture corpus exists |
| **Chaos** — inject 500s, malformed JSON, mid-stream disconnects | ✅ | ❌ | No fault-injection tests exist anywhere |
| **Drift Detection** — daily runs against live provider APIs | ✅ (CI config) | ❌ | No CI job configured |

MSW is still used in:
- `gateway/src/__tests__/e2e/gateway-e2e.test.ts` — should migrate to `LLMock`
- `memory/src/retrieval/rag/test-msw.ts` — should migrate to `VectorMock` + `MCPMock`
- `testing/src/integration.test.ts` — partial; connector/MCP handlers → `MCPMock`
- `testing/src/msw/handlers/providers.ts` — already `@deprecated` in comments, not yet removed

---

### 33.2 Why This Matters

**MSW is the wrong tool for LLM testing.** MSW is an HTTP interception library designed for REST API
testing. It requires hand-crafting SSE chunk sequences, tool-call message structures, and streaming
error payloads that are subtly different across the 14 providers agentsy supports. The existing MSW
provider handlers have already diverged from actual provider formats (no usage tracking, no schema
validation against real provider responses).

**AIMock solves all three problems MSW cannot**:
1. **Drift detection** — daily CI job catches provider format changes before they reach users
2. **Record/replay** — fixtures capture real provider behavior once; CI never hits live APIs
3. **Chaos mode** — proves retry/failover logic actually works under real failure conditions

The `@deprecated` comments in `msw/handlers/providers.ts` indicate the intent was always to migrate
— this phase completes it.

---

### 33.3 Deliverables

#### 33.3.1 Migrate Gateway E2E Tests → `LLMock`

```typescript
// packages/gateway/src/__tests__/e2e/gateway-e2e.test.ts — REPLACE MSW with LLMock

import { LLMock } from '@copilotkit/aimock';

let mock: LLMock;

beforeAll(async () => {
  mock = new LLMock({ port: 0 });

  // Deterministic responses keyed by model
  mock.onModel('gpt-4o', { content: 'Provider A response', usage: { input: 10, output: 5 } });
  mock.onModel('claude-3-5-sonnet', { content: 'Provider B response', usage: { input: 10, output: 5 } });

  // Chaos: provider A returns 429 after 2 requests (tests circuit breaker)
  mock.chaos({ endpoint: '/v1/chat/completions', after: 2, status: 429, message: 'rate_limit_exceeded' });

  await mock.start();
  process.env.OPENAI_BASE_URL = `${mock.url}/v1`;
  process.env.ANTHROPIC_BASE_URL = `${mock.url}/v1`;
});

afterAll(() => mock.stop());
```

**Tests to add**:
- Streaming failover: provider A returns mid-stream disconnect → gateway routes to provider B
- Tool call round-trip: `LLMock.onToolCall('search', { result: [...] })` → verify tool result injected
- Chaos 500: gateway retries 3× then exhausts → `AllProvidersExhaustedError`

#### 33.3.2 Migrate RAG/Memory Tests → `VectorMock`

```typescript
// packages/memory/src/retrieval/rag/test-msw.ts — REPLACE with VectorMock

import { VectorMock } from '@copilotkit/aimock';

const vectorMock = new VectorMock({ port: 0, format: 'qdrant' });

// Seed deterministic search results
vectorMock.upsert('agentsy-docs', [
  { id: 'doc-1', vector: Array(1536).fill(0.1), payload: { text: 'Agentsy daemon architecture' } },
]);
vectorMock.onQuery('agentsy-docs', { topK: 5, matches: ['doc-1'] });
```

This replaces `createRAGHandlers()` and `createMockRAGState()` with a standards-compliant vector DB
mock that validates request/response shapes against the actual Qdrant API schema.

#### 33.3.3 Wire `MCPMock` for MCP Tool Tests

```typescript
// packages/daemon/src/mcp/mcp.test.ts (NEW)

import { MCPMock } from '@copilotkit/aimock';

const mcpMock = new MCPMock({ port: 0 });

mcpMock.addTool({
  name: 'read_file',
  description: 'Read a file from the filesystem',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  handler: ({ path }) => ({ content: `Contents of ${path}` })
});

// Test: daemon SubprocessManager starts MCP server, tools/list returns registered tools
```

Replaces `testing/src/msw/handlers/mcp.ts`.

#### 33.3.4 Wire `AGUIMock` for Phase 31 Tests

```typescript
// packages/runtime/src/ag-ui/ag-ui.test.ts (NEW)

import { AGUIMock } from '@copilotkit/aimock';

const agUiMock = new AGUIMock({ port: 0 });

agUiMock.onRun('default', {
  events: [
    { type: 'RUN_STARTED', runId: 'run-1', threadId: 'thread-1' },
    { type: 'TEXT_MESSAGE_CONTENT', content: 'Hello from mock' },
    { type: 'RUN_FINISHED', runId: 'run-1' }
  ]
});

// Test: AG-UI SSE adapter correctly translates AGUIMock events → PipelineEvents
```

#### 33.3.5 Record/Replay Fixture Corpus

Configure record mode for CI:

```typescript
// packages/testing/vitest.config.ts — ADD

export default defineConfig({
  test: {
    globalSetup: ['./src/setup/aimock-record.ts']
  }
});
```

```typescript
// packages/testing/src/setup/aimock-record.ts (NEW)

import { LLMock } from '@copilotkit/aimock';

export async function setup() {
  if (process.env.AIMOCK_RECORD === 'true') {
    // Proxy to real providers, save fixtures to src/fixtures/
    process.env.AIMOCK_FIXTURE_DIR = './src/fixtures/provider-responses';
    // Run: AIMOCK_RECORD=true pnpm test → captures real provider responses
  }
}
```

Fixture directory: `packages/testing/src/fixtures/provider-responses/`
Format: `{provider}-{model}-{hash}.json` (deterministic by request hash)

#### 33.3.6 Chaos Test Suite

```typescript
// packages/testing/src/chaos.test.ts (NEW)

import { LLMock } from '@copilotkit/aimock';

describe('Chaos: provider failure modes', () => {
  it('handles mid-stream disconnect → gateway activates failover', async () => {
    mock.chaos({ after: 3, type: 'disconnect' }); // kills SSE mid-stream
    const result = await gateway.complete({ model: 'gpt-4o', messages });
    expect(result.provider).toBe('claude-3-5-sonnet'); // fell over to backup
  });

  it('handles malformed JSON chunk → parser recovers gracefully', async () => {
    mock.chaos({ at: 5, type: 'malformed-json' });
    await expect(gateway.stream({ model: 'gpt-4o', messages })).resolves.not.toThrow();
  });

  it('handles 429 rate limit → retry with backoff → succeeds', async () => {
    mock.chaos({ first: 2, status: 429 });
    const result = await gateway.complete({ model: 'gpt-4o', messages });
    expect(result.content).toBeDefined(); // third attempt succeeded
  });
});
```

#### 33.3.7 Drift Detection CI Job

```yaml
# .github/workflows/aimock-drift.yml (NEW)

name: AIMock Drift Detection
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 06:00 UTC
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - name: Run drift detection
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          AIMOCK_DRIFT_MODE: 'true'
        run: pnpm --filter @agentsy/testing test:drift
      - name: Alert on drift
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '⚠️ AIMock Drift Detected',
              labels: ['testing', 'provider-drift'],
              body: 'Daily drift detection found provider API format changes. Check workflow logs.'
            })
```

---

### 33.4 MSW Deprecation Plan

MSW is **not removed entirely** — it remains the right tool for:
- HTTP connector mocking (`connectors.ts` handlers — Discord/Slack webhooks)
- Non-LLM HTTP services (Turso sync, health endpoints)
- Custom service mocks without an aimock built-in (e.g. web search in Phase 22)

| Handler file | Action |
|---|---|
| `msw/handlers/providers.ts` | **Delete** after LLMock migration (already `@deprecated`) |
| `msw/handlers/mcp.ts` | **Delete** after MCPMock migration |
| `msw/handlers/memory.ts` | **Keep** — non-LLM memory engine HTTP endpoints |
| `msw/handlers/retrieval.ts` | **Replace** with VectorMock for vector ops; keep for non-vector retrieval HTTP |
| `msw/handlers/connectors.ts` | **Keep** — Discord/Slack webhook mocking stays in MSW |

---

### 33.5 Story Point Allocation

| Task | SP |
|---|---|
| Gateway E2E → LLMock (incl. tool calls + chaos) | 1.5 |
| RAG/memory → VectorMock | 1 |
| MCPMock wiring for daemon MCP tests | 0.5 |
| AGUIMock wiring for Phase 31 AG-UI tests | 0.5 |
| Record/replay fixture corpus + CI config | 0.5 |
| Chaos test suite | 0.5 |
| Drift detection CI job | 0.5 |
| MSW provider handler deprecation/removal | 0.5 (included in other tasks) |
| **Total** | **5** |

---

### 33.6 Verification

- [ ] `pnpm --filter @agentsy/testing test` passes with no MSW provider handler usage
- [ ] `LLMock` chaos test: 3 failure modes all handled by gateway retry/failover logic
- [ ] `MCPMock` test: daemon MCP tool dispatch returns correct tool result
- [ ] `VectorMock` test: RAG search returns seeded fixture results deterministically
- [ ] `AGUIMock` test: AG-UI adapter correctly translates all 7 AG-UI event types
- [ ] `AIMOCK_RECORD=true pnpm test` creates fixture files in `src/fixtures/`
- [ ] Drift detection CI job runs daily and opens a GitHub issue on format change
- [ ] `packages/testing/src/msw/handlers/providers.ts` deleted
