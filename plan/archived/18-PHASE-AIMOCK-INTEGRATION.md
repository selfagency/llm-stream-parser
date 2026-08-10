# aImock Integration Plan

**Authority:** Governance & Quality Gates (plan/17-GOVERNANCE-QUALITY-GATES.md)  
**Created:** 2026-05-28  
**Status:** Draft — awaiting review

---

## Executive Summary

Integrate [@copilotkit/aimock](https://github.com/CopilotKit/aimock) as the primary mock infrastructure for AI application testing across the @agentsy monorepo, supplementing and gradually replacing the existing MSW-based testing approach. aImock provides purpose-built mocking for LLM APIs, MCP, A2A, AG-UI, vector DBs, and search — all protocols this monorepo uses.

### Why aImock

- **Purpose-built for AI** — MSW is a general HTTP mock; aImock understands OpenAI/Claude/Gemini response shapes, streaming semantics, tool calls, and SSE frame timing
- **Vitest plugin** — `useAimock()` handles server lifecycle, env patching, and cleanup automatically (zero-config per-test setup)
- **Record & Replay** — Proxy real APIs once, save as fixtures, replay deterministically forever (replaces manual fixture creation)
- **Drift Detection** — Three-way comparison (SDK types ↔ real API ↔ mock) catches provider API changes before they break tests
- **Multi-protocol** — Single package mocks LLMs, MCP tools, A2A agents, AG-UI streams, vector DBs, search, rerank, moderation
- **Zero dependencies** — Everything from Node.js builtins, no dependency bloat
- **Chaos testing** — 500 errors, malformed JSON, mid-stream disconnects at configurable probability

### Current State

- **Testing framework:** Vitest across 13 packages
- **Current mocking:** MSW via `@agentsy/testing` package (`createTestServer` with handler composition)
- **Test coverage:** 100+ test files, 44 tests in `packages/testing` alone
- **Fixtures:** JSON fixtures in `fixtures/providers/` and `fixtures/rag/`
- **CI:** `.github/workflows/tests.yml` — build, type-check, test, coverage upload

---

## Integration Phases

### Phase A: Foundation — Dependency + Vitest Plugin

**Effort:** ~2 hours  
**Goal:** aImock installed, Vitest plugin working alongside existing MSW tests

#### TASK-AIMOCK-001: Install aImock

**Location:** Monorepo root

```bash
pnpm add -D @copilotkit/aimock
```

- Add to root `package.json` devDependencies
- Verify zero-dependency claim (audit `node_modules/@copilotkit/aimock/package.json`)
- Confirm TypeScript types available

#### TASK-AIMOCK-002: Vitest Plugin Integration

**Location:** `packages/testing/vitest.config.ts` + new test file

```typescript
// packages/testing/src/aimock-setup.test.ts
import { useAimock } from "@copilotkit/aimock/vitest";

const mock = useAimock({ fixtures: "./fixtures/aimock" });

it("responds to hello via aimock", async () => {
  // OPENAI_BASE_URL is already set by the plugin
  const client = new OpenAI();
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hello" }],
  });
  expect(res.choices[0]?.message?.content).toBe("Hi there!");
});
```

- Create `fixtures/aimock/` directory with initial fixture
- Verify `beforeAll`/`afterAll` lifecycle (server start/stop, env patch/restore)
- Confirm `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` auto-patching

#### TASK-AIMOCK-003: Fixture Format Migration Guide

**Location:** `docs/testing-aimock-patterns.md`

Document the fixture format difference between MSW and aImock:

```json
// aImock fixture format (simplified)
{
  "name": "hello-greeting",
  "request": {
    "messages": [{ "role": "user", "content": "hello" }]
  },
  "response": {
    "content": "Hi there!"
  }
}
```

- Include examples for OpenAI Chat, Anthropic Messages, Gemini generateContent
- Document multi-turn fixture format with `turnIndex` matching
- Document streaming fixture format with frame arrays

---

### Phase B: LLM Provider Mocking — Replace MSW Handler Sets

**Effort:** ~4 hours  
**Goal:** All LLM provider tests use aImock fixtures instead of MSW handlers

#### TASK-AIMOCK-004: OpenAI Chat Completions Fixtures

**Location:** `fixtures/aimock/openai/`

Migrate existing `fixtures/providers/default-streams.json` to aImock format:

- Non-streaming text response
- Streaming text response (frame-by-frame)
- Tool call response
- Error response (rate limit, invalid key)
- Usage chunk (`stream_options.include_usage: true`)

#### TASK-AIMOCK-005: Anthropic Messages Fixtures

**Location:** `fixtures/aimock/anthropic/`

- Non-streaming text
- Streaming with thinking blocks
- Tool use response
- Error responses

#### TASK-AIMOCK-006: Gemini Fixtures

**Location:** `fixtures/aimock/gemini/`

- generateContent (non-streaming)
- streamGenerateContent
- embedContent

#### TASK-AIMOCK-007: Update Provider Tests

**Location:** `packages/testing/src/` and `packages/providers/src/__tests__/`

Update existing MSW-based provider tests to use `useAimock()`:

```typescript
// Before (MSW)
import { createTestServer } from "@agentsy/testing";
const server = createTestServer({ providers: "openai" });

// After (aImock)
import { useAimock } from "@copilotkit/aimock/vitest";
const mock = useAimock({ fixtures: "./fixtures/aimock/openai" });
```

- Maintain test count parity (all existing tests must still pass)
- Add streaming physics tests (TTFT, TPS, jitter)

#### TASK-AIMOCK-008: MSW Deprecation Path

**Location:** `packages/testing/src/`

- Mark `createTestServer` as deprecated with JSDoc `@deprecated`
- Add migration guide in `docs/testing-msw-patterns.md`
- Keep MSW available for non-LLM HTTP mocking (memory API, retrieval API endpoints that aren't LLM-specific)
- Document which tests should use aImock vs MSW

---

### Phase C: Advanced Mocking — MCP, AG-UI, Vector, Services

**Effort:** ~4 hours  
**Goal:** Mock all AI protocols used by the monorepo

#### TASK-AIMOCK-009: MCP Mocking

**Location:** `fixtures/aimock/mcp/` + `packages/mcp/src/__tests__/`

```typescript
import { useAimock } from "@copilotkit/aimock/vitest";

const mock = useAimock({
  fixtures: "./fixtures/aimock/mcp",
});

it("lists MCP tools", async () => {
  // MCPMock handles tools/list, tools/call, resources, prompts
  const tools = await mcpClient.listTools();
  expect(tools).toHaveLength(3);
});
```

- Mock MCP tool definitions matching `@agentsy/mcp` types
- Mock tool call responses
- Mock resource and prompt endpoints

#### TASK-AIMOCK-010: AG-UI Mocking

**Location:** `fixtures/aimock/agui/` + `packages/runtime/src/__tests__/`

The monorepo already has AG-UI adapter in `@agentsy/runtime`. Mock AG-UI event streams:

- Agent turn start/end
- Text delta events
- Tool call events
- Error events

#### TASK-AIMOCK-011: Vector DB Mocking

**Location:** `fixtures/aimock/vector/` + `packages/retrieval/src/__tests__/`

Mock Pinecone/Qdrant/ChromaDB-compatible endpoints:

- Index upsert
- Query with vector
- Query with text (implicit embedding)
- Delete operations

#### TASK-AIMOCK-012: Service Mocking

**Location:** `fixtures/aimock/services/`

- Tavily search
- Cohere rerank
- OpenAI moderation
- ElevenLabs TTS

---

### Phase D: Record & Replay — Fixture Generation Pipeline

**Effort:** ~3 hours  
**Goal:** Generate fixtures from real API calls instead of hand-writing JSON

#### TASK-AIMOCK-013: Record Mode Setup

**Location:** `scripts/record-fixtures.ts`

```bash
# Record real OpenAI responses
npx @copilotkit/aimock llmock --record \
  --provider-openai https://api.openai.com \
  -p 4010 \
  -f ./fixtures/aimock/openai
```

- Create script that runs test scenarios against real APIs (requires API keys)
- Save responses as fixtures
- Document which fixtures were recorded vs hand-written

#### TASK-AIMOCK-014: Fixture Validation

**Location:** `scripts/validate-fixtures.ts`

- Validate fixture JSON against expected schema
- Check for required fields (messages, response shape)
- Flag fixtures that may be stale

#### TASK-AIMOCK-015: CI Fixture Pipeline

**Location:** `.github/workflows/`

- Add workflow step to validate fixtures on PR
- Reject PRs with malformed fixture JSON
- Cache fixtures for faster CI runs

---

### Phase E: Drift Detection — Provider API Conformance

**Effort:** ~3 hours  
**Goal:** Catch provider API changes before they break production

#### TASK-AIMOCK-016: Drift Test Setup

**Location:** `packages/testing/src/drift/`

```typescript
// packages/testing/src/drift/openai-chat.drift.ts
import { extractShape, triangulate } from "@copilotkit/aimock/drift";

// Three-way: SDK types ↔ real API ↔ aimock mock
// Run only when OPENAI_API_KEY is set
```

- Create drift tests for OpenAI Chat, Anthropic Messages, Gemini
- Skip when API keys not available (safe for local dev)
- Run daily in CI via scheduled workflow

#### TASK-AIMOCK-017: Drift CI Workflow

**Location:** `.github/workflows/test-drift.yml`

```yaml
name: Drift Detection

on:
  schedule:
    - cron: "0 6 * * *"  # 6 AM UTC daily
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:drift
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

- Daily scheduled run with real API keys
- Create GitHub Issue on drift detection
- Slack notification on failure (if Slack integration configured)

#### TASK-AIMOCK-018: Drift Remediation Workflow

Document the process when drift is detected:

1. Review drift report (field-level diffs)
2. Update aimock fixtures or report upstream bug
3. Run `pnpm test:drift` locally to verify fix
4. Commit fixture updates

---

### Phase F: Chaos Testing — Resilience Validation

**Effort:** ~2 hours  
**Goal:** Test agent behavior under failure conditions

#### TASK-AIMOCK-019: Chaos Test Fixtures

**Location:** `fixtures/aimock/chaos/`

- 500 Internal Server Error at 10% probability
- Malformed JSON responses
- Mid-stream disconnects
- Rate limit (429) with `Retry-After` headers

#### TASK-AIMOCK-020: Resilience Tests

**Location:** `packages/runtime/src/__tests__/` and `packages/orchestrator/src/__tests__/`

```typescript
it("retries on 500 error", async () => {
  const mock = useAimock({
    fixtures: "./fixtures/aimock/chaos",
  });

  // aimock returns 500 for first 2 calls, succeeds on 3rd
  const result = await agentLoop.run("hello");
  expect(result.retries).toBe(2);
  expect(result.success).toBe(true);
});
```

- Test retry logic in `@agentsy/core` recovery
- Test budget enforcement under error conditions
- Test graceful degradation when provider is unavailable

---

### Phase G: Governance & Quality Gate Updates

**Effort:** ~2 hours  
**Goal:** Update plan documents to reflect aImock integration

#### TASK-AIMOCK-021: Update Governance Document

**Location:** `plan/17-GOVERNANCE-QUALITY-GATES.md`

Add aImock-specific quality gates:

```markdown
### Mocking Standards

- ✅ LLM provider tests use aImock fixtures (not MSW)
- ✅ All fixtures validated against real APIs (drift detection)
- ✅ No real network calls in CI (all aimock or MSW)
- ✅ Chaos tests pass (error handling verified)
- ✅ Record & replay fixtures deterministic
```

Update Testing Standards section:

```markdown
### Integration Tests

- ✅ Cross-package contracts validated
- ✅ Data flow end-to-end
- ✅ All aImock fixtures current (drift detection green)
- ✅ Deterministic fixtures (seed random if needed)
- ✅ Chaos tests for error paths
```

#### TASK-AIMOCK-022: Update Phase 12 Hardening Plan

**Location:** `plan/15-PHASE-12-HARDENING-RELEASE.md`

Update TASK-055 Release Readiness Checklist:

```typescript
{
  category: 'Mocking & Fixtures',
  checks: [
    'aImock fixtures comprehensive',
    'Drift detection green (daily CI)',
    'No real network calls in CI',
    'Chaos tests pass',
    'Record & replay deterministic'
  ]
}
```

Update TASK-057 CI Gates to include drift detection:

```yaml
- name: Drift detection
  run: pnpm test:drift
  if: github.event_name == 'schedule'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

#### TASK-AIMOCK-023: Update Implementation Compliance Matrix

**Location:** `plan/IMPLEMENTATION-COMPLIANCE-MATRIX.md`

Add aImock integration status:

| Package | aImock Status | Notes |
|---------|--------------|-------|
| testing | 🟡 In Progress | Vitest plugin integrated, MSW migration in progress |
| providers | 🟡 In Progress | OpenAI fixtures migrated, Anthropic/Gemini pending |
| mcp | ⬜ Planned | MCPMock fixtures pending |
| runtime | ⬜ Planned | AG-UI mocking pending |
| retrieval | ⬜ Planned | Vector DB mocking pending |

---

## Migration Strategy

### Coexistence Period

aImock and MSW will coexist during migration:

| Test Type | Mocking Tool | Rationale |
|-----------|-------------|-----------|
| LLM provider tests | aImock | Purpose-built, understands streaming/tool calls |
| Memory API tests | MSW | Simple CRUD, no LLM semantics needed |
| Retrieval API tests | MSW | Embedding/rerank endpoints are simple HTTP |
| MCP tests | aImock (MCPMock) | Protocol-specific session management |
| AG-UI tests | aImock (AGUIMock) | Event stream semantics |
| Vector DB tests | aImock (VectorMock) | Provider-compatible endpoints |
| CLI E2E tests | aImock | Full-stack LLM mocking |

### MSW Retirement Criteria

MSW handler sets can be retired when:

1. All LLM provider tests pass with aImock fixtures
2. Drift detection is green for all providers
3. Chaos tests cover error paths
4. No test references `createTestServer` for LLM mocking

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| aImock doesn't support a provider we use | Medium | Fall back to MSW for that provider; contribute upstream |
| Fixture format migration breaks existing tests | High | Run both MSW and aImock in parallel during migration |
| Drift detection requires API keys in CI | Low | Keys stored as GitHub secrets; tests skip when absent |
| aImock introduces new dependency | Low | Zero dependencies claim verified; audit on install |
| Record mode costs real API calls | Low | One-time recording; replay is free and deterministic |

---

## Success Criteria

- [ ] `pnpm test` passes with aImock fixtures (all packages)
- [ ] No real HTTP calls in CI (verified by network monitoring)
- [ ] Drift detection runs daily and is green
- [ ] Chaos tests pass (error handling verified)
- [ ] MSW deprecation warnings in place for LLM mocking
- [ ] Documentation updated (`docs/testing-aimock-patterns.md`)
- [ ] Governance document updated with aImock quality gates
- [ ] Implementation compliance matrix updated

---

## Dependencies

- GitHub secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` (for drift detection)
- Node.js 22 (already CI target)
- pnpm workspace (already configured)

---

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| A: Foundation | 2h | None |
| B: LLM Provider Mocking | 4h | Phase A |
| C: Advanced Mocking | 4h | Phase A |
| D: Record & Replay | 3h | Phase B |
| E: Drift Detection | 3h | Phase B, GitHub secrets |
| F: Chaos Testing | 2h | Phase B |
| G: Governance Updates | 2h | All phases |
| **Total** | **~20 hours** | |

---

**Next:** Review this plan, approve, then begin Phase A implementation.
