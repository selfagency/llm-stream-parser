# Phase 12 — Production Hardening, Cross-Surface Parity & Release

**Effort:** ~10 hours  
**Milestone:** GA-ready; all surfaces aligned; closure artifact signed  
**Packages:** All (final validation pass)  
**Gate:** Smoke tests passing; CI gates enabled; closure checklist signed  
**Outcome:** `plan/PHASE-CLI-PRODUCTION-COMPLETION.md`

---

## Overview

Final hardening pass. Production smoke tests. CI gates. Cross-surface parity validation. Release readiness checklist.

---

## TASK-055: Release Readiness Checklist

**Location:** `packages/scripts/src/release/`

```typescript
export const RELEASE_CHECKLIST = [
  {
    category: 'Package Boundaries',
    checks: [
      'No circular dependencies',
      'All exports from index.ts',
      'TSDoc on public APIs',
      'Breaking changes documented'
    ]
  },
  {
    category: 'Documentation',
    checks: ['README.md current', 'CHANGELOG.md updated', 'Migration guides present', 'Architecture docs aligned']
  },
  {
    category: 'Code Quality',
    checks: [
      'pnpm check-types passes',
      'pnpm test passes (all packages)',
      'pnpm build passes',
      'No linting violations (oxlint)',
      'Test coverage >70%'
    ]
  },
    {
      category: 'Integration',
      checks: [
        'E2E smoke tests pass',
        'aImock fixtures comprehensive',
        'Drift detection green (daily CI)',
        'No real network calls in CI',
        'Chaos tests pass',
        'Cross-package contract tests pass'
      ]
    },
    {
      category: 'Workflows',
      checks: [
        'All YAML workflows validate against Zod schema',
        'Default workflows load without errors',
        'Trigger matching deterministic',
        'State machine transitions reproducible',
        'Value capture via JSONPath works for nested results',
        'Gate nodes return handles for external approval',
        'Bash nodes enforce timeout and retry limits'
      ]
    },
    {
      category: 'Context Pruning',
      checks: [
        'compress tool callable by LLM',
        'Deduplication detects repeated tool calls',
        'Protected tools never pruned or deduplicated',
        'Protected file patterns respected',
        'Nudge system fires at correct thresholds',
        'Per-model context limits override defaults',
        'Turn protection keeps recent outputs intact'
      ]
    },
    {
      category: 'ECC Integration',
      checks: [
        'ECC integration optional (not required)',
        'Agent catalog expands when installed',
        'Skills library available when installed',
        'Hook profiles configurable via env vars',
        'Multi-language rules loadable',
        'Install advisor guides selection',
        'Continuous learning extracts patterns',
        'Loop guard prevents infinite loops',
        'Quality gate command works',
        'Status snapshots show health',
        'Cost audit skill tracks spending',
        'Installation wizard guides setup'
      ]
    },
    {
      category: 'External Adoptions',
      checks: [
        'Memory API has remember/recall/forget/improve',
        'Session memory with background sync',
        'Recall auto-routes to best strategy',
        'Selector Agent filters candidate functions',
        'Validation Feedback corrects AI args',
        'Workflow pause/resume/interrupt works',
        'Dependency-aware parallel execution',
        'Progressive skill loading',
        'Isolated sub-agent context',
        'IM channels integrated',
        'Context summarization for long tasks',
        'Human approval with admin-block tools',
        'Context providers for live data',
        'AG-UI + A2A interface exposure',
        'Tool card standardization'
      ]
    },
    {
      category: 'Council Mode',
      checks: [
        'Council executor runs all 3 stages',
        'First opinions collected in parallel',
        'Cross-review anonymizes model identities',
        'Rankings aggregated from all reviews',
        'Chairman synthesizes with dissenting opinions',
        'Council presets load successfully',
        'CLI /council command works',
        'VS Code council mode toggle functional',
        'Events emitted for stage transitions',
        'Token usage tracked per-member'
      ]
    },  {
    category: 'Security',
    checks: [
      'No hardcoded secrets',
      'Secrets broker functional',
      'Approval gates working',
      'Input sanitization validated',
      'Output redaction tested'
    ]
  },
  {
    category: 'Performance',
    checks: [
      'TUI responsiveness <100ms',
      'First token latency <500ms',
      'Long-session memory bounded',
      'Budget gates enforced'
    ]
  }
];

export async function validateRelease(): Promise<ReleaseReport> {
  const results = [];

  for (const category of RELEASE_CHECKLIST) {
    const categoryResults = [];

    for (const check of category.checks) {
      const result = await runCheck(check);
      categoryResults.push(result);
    }

    results.push({
      category: category.category,
      passed: categoryResults.every(r => r.passed),
      results: categoryResults
    });
  }

  return { timestamp: new Date(), results };
}
```

---

## TASK-056: Smoke Test Suite

**Location:** `packages/cli/src/e2e/smoke/`

```typescript
describe('Smoke Tests', () => {
  test('fresh chat session', async () => {
    // 1. Start CLI
    // 2. Type message
    // 3. Receive streaming response
    // 4. Display complete
    // Verify: No crashes, output correct format
  });

  test('provider switch mid-session', async () => {
    // 1. Start with OpenAI
    // 2. /model gpt-4o
    // 3. Continue chat
    // Verify: New provider used for next request
  });

  test('tool approval + execution', async () => {
    // 1. Agent requests file write
    // 2. CLI shows approval prompt
    // 3. User approves
    // 4. Tool executes
    // Verify: File created, result displayed
  });

  test('resume from snapshot', async () => {
    // 1. Chat 3 turns
    // 2. Exit
    // 3. /resume <sessionId>
    // 4. Continue chatting
    // Verify: Messages restored, context intact
  });

  test('memory search', async () => {
    // 1. Chat with personal preferences mentioned
    // 2. /memory search \"preferences\"
    // 3. Display results
    // Verify: Retrieved correctly
  });

  test('retrieval + citation', async () => {
    // 1. /index /path/to/doc
    // 2. Ask question about doc
    // 3. Agent cites sources
    // Verify: Citations accurate
  });

  test('trace export', async () => {
    // 1. Run chat turn
    // 2. /trace export
    // 3. Write JSON file
    // Verify: File contains span tree
  });

  test('observability: cost summary', async () => {
    // 1. Run chat
    // 2. After response, check status bar
    // 3. Verify: input tokens | output tokens | cost displayed
  });
});
```

---

## TASK-057: CI Gates

**Location:** `.github/workflows/tests.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  build-check-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'

      - run: pnpm install

      - name: Build
        run: pnpm build

      - name: Type check
        run: pnpm check-types

      - name: Test
        run: pnpm test -- --coverage

      - name: Coverage
        run: |
          if [ \"$(grep 'lines.*' coverage/coverage-summary.json | grep -o '[0-9.]*' | head -1)\" -lt 70 ]; then
            echo \"Coverage below 70%\"
            exit 1
          fi

      - name: Smoke tests
        run: pnpm test:e2e:smoke

      - name: Integration tests
        run: pnpm test:integration

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## TASK-058: Performance Assertions

```typescript
test('TUI responsiveness', async () => {
  const start = Date.now();
  // Type input + receive response
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(100); // ms
});

test('first token latency', async () => {
  const start = Date.now();
  // Streaming starts
  let firstTokenTime = 0;

  stream.on('text-delta', () => {
    if (firstTokenTime === 0) firstTokenTime = Date.now() - start;
  });

  expect(firstTokenTime).toBeLessThan(500); // ms
});

test('session memory bounds', async () => {
  // Run 100 turns
  const heapBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < 100; i++) {
    await chat(randomMessage());
  }

  const heapAfter = process.memoryUsage().heapUsed;
  const growth = heapAfter - heapBefore;

  expect(growth).toBeLessThan(100 * 1024 * 1024); // 100 MB for 100 turns = 1 MB/turn
});

test('budget gates', async () => {
  const config = { budget: { outputCap: 1000 } };
  const session = createSession(config);

  // Try to generate 2000 output tokens
  expect(() => session.checkBudget(2000)).toThrow(BudgetExceededError);
});
```

---

## TASK-059: Production Runbook

**Location:** `docs/developers/releasing.md` + `docs/developer-guide.md`

```markdown
# Release Checklist

## Pre-Release (Day 1)

- [ ] Update CHANGELOG.md with all Phase 1-12 work
- [ ] Verify `pnpm check-types` monorepo green
- [ ] Run `pnpm test:all` — all tests pass
- [ ] Run smoke tests locally (3 iterations)
- [ ] Security audit: no hardcoded secrets
- [ ] Performance audit: latency/memory/budget within bounds

## Release (Day 2)

- [ ] Tag version (e.g., `v1.0.0`)
- [ ] Push tag: `git push origin v1.0.0`
- [ ] GitHub Actions builds + publishes
- [ ] Verify npm packages available
- [ ] Update docs landing page

## Post-Release (Day 3)

- [ ] Monitor error telemetry for 24h
- [ ] No critical issues? Mark \"stable\"
- [ ] Create release post

---

## Incident Response

If critical issue discovered:

1. Revert with `git revert <commit>`
2. Tag patch: `v1.0.1`
3. Communicate to users
4. Post-mortem in INCIDENTS.md
```

---

## TASK-060: Closure Artifact

**Location:** `plan/PHASE-CLI-PRODUCTION-COMPLETION.md`

```markdown
# @agentsy CLI Production Completion

**Date:** 2026-05-25 + Phase 12 completion  
**Status:** ✅ GA READY

## Evidence Links

### Phase Completions

- Phase 0: [PHASE-0-FOUNDATION.md](phases/01-PHASE-0-FOUNDATION.md) ✅
- Phase 1: [PHASE-1-CONTRACT-STABILIZATION.md](phases/03-PHASE-1-CONTRACT-STABILIZATION.md) ✅
- Phase 2: [PHASE-2-TUI-VERTICAL-SLICE.md](phases/04-PHASE-2-TUI-VERTICAL-SLICE.md) ✅
- Phases 3-12: [phases/](phases/) directory ✅

### Test Suites

- **Unit Tests** (pnpm test): [Coverage Report](../coverage/coverage-summary.json) >70%
- **E2E Smoke Tests** (pnpm test:e2e:smoke): All passing
- **Integration Tests** (pnpm test:integration): All passing
- **Performance Assertions**: Latency <500ms, Memory bounded, Budget gated

### Security Audit

- **Secret Detection**: 0 hardcoded secrets (automated scan + manual audit)
- **Approval Gating**: Destructive ops deny-by-default ✅
- **Input Sanitization**: All untrusted inputs validated
- **Output Redaction**: Secrets + PII redacted automatically

### Documentation

- README.md: [Updated](../../README.md)
- Architecture: [docs/architecture/](../../docs/architecture/)
- Getting Started: [docs/getting-started.md](../../docs/getting-started.md)
- Developer Guide: [docs/developers/](../../docs/developers/)

### Package Manifests

- ✅ All 25 packages have package.json + IMPLEMENTATION-PLAN.md
- ✅ All public APIs documented (TSDoc)
- ✅ No circular dependencies
- ✅ All exports from index.ts

### Cross-Surface Validation

- CLI: Fully functional ✅
- VS Code Extension: Parity with CLI ✅
- UI: Parity with CLI ✅

## Sign-Off

**Prepared by:** Engineering team  
**Verified by:** QA lead  
**Approved by:** Technical lead

**Date:** 2026-05-25 + Phase 12 completion

**Confirmation:** All quality gates passed. System ready for production deployment.
```

---

## TASK-070: Cross-Surface Parity

**Effort:** ~1.5 hours

Validate runtime + orchestrator behavior consistency across:

1. **CLI** (`@agentsy/cli`)
2. **VS Code** (`@agentsy/vscode`)
3. **UI** (`@agentsy/ui`)

**Parity contract:**

```typescript
export interface SurfaceParity {
  agentLoop: 'identical behavior across surfaces';
  hookFiring: 'same sequence, same results';
  policyEnforcement: 'approval gates work same way';
  memoryRetrieval: 'same content injected';
  budgetEnforcement: 'same caps respected';
  errorHandling: 'same recovery flows';
}

// Test example:
test('agent loop parity: CLI vs VS Code', async () => {
  const cliResult = await runInCli(userMessage);
  const vsCodeResult = await runInVsCode(userMessage);

  expect(cliResult.messages).toEqual(vsCodeResult.messages);
  expect(cliResult.budget.spent).toBe(vsCodeResult.budget.spent);
  expect(cliResult.span.durationMs).toBeCloseTo(vsCodeResult.span.durationMs, 100);
});
```

---

## TASK-071: Test-Factory + Fixture Hardening

**Effort:** ~1.5 hours

**Location:** `packages/testing/src/`

```typescript
// Reusable fixtures
export const AGENT_FIXTURES = {
  default: { id: 'default', name: 'Default' },
  research: { id: 'research', name: 'Research' },
  code: { id: 'code', name: 'Code' }
};

export const PROVIDER_FIXTURES = {
  openai: { id: 'openai', type: 'openai' },
  anthropic: { id: 'anthropic', type: 'anthropic' },
  ollama: { id: 'ollama-local', type: 'ollama' }
};

// Test factories
export function createMockSession(overrides = {}) {
  return {
    id: uuidv4(),
    messages: [],
    state: {},
    ...overrides
  };
}

export function createMockToolCall(overrides = {}) {
  return {
    id: uuidv4(),
    name: 'test_tool',
    args: {},
    annotations: { readOnlyHint: true, ... },
    ...overrides
  };
}

// Deterministic seeding
export function seedRandom(seed: number) {
  Math.random = seedrandom(seed);
}
```

---

## Quality Gates (All Required)

- ✅ `pnpm build` passes monorepo-wide
- ✅ `pnpm check-types` passes monorepo-wide
- ✅ `pnpm test` passes all packages (>70% coverage)
- ✅ `pnpm test:e2e:smoke` all tests pass
- ✅ No real HTTP calls in CI (all MSW)
- ✅ Performance benchmarks within spec
- ✅ Security audit: zero hardcoded secrets
- ✅ Cross-surface parity validated
- ✅ Documentation complete + accurate
- ✅ Release readiness checklist signed

---

## Success Criteria

✅ GA-ready production release  
✅ All phases 1-12 verified complete  
✅ Closure artifact signed  
✅ No known critical issues  
✅ Performance meets spec  
✅ Security audit passed

---

**Next:** Publish GA release. Post-release monitoring. Incident response.
