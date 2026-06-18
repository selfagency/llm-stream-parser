# Governance & Quality Gates

**Authority:** User profile contract + Phase sequencing  
**Updated:** 2026-05-25

---

## Universal Quality Gates (Per Slice)

All deliverables must satisfy before merging:

### Build Gates

```bash
pnpm build                     # Compiles
pnpm check-types              # TS strict mode passes
pnpm test                     # All tests green
```

### Dependency Gates

- ✅ No circular dependencies
- ✅ No unpinned external deps (use catalogs)
- ✅ No `any` types in TS code
- ✅ All exports from `src/index.ts`

### Documentation Gates

- ✅ Touched package IMPLEMENTATION-PLAN.md updated
- ✅ TSDoc on public APIs (interfaces, functions, exports)
- ✅ README.md reflects current capabilities
- ✅ Breaking changes documented in CHANGELOG.md

### Security Invariants

## SEC-001: No Hardcoded Secrets

```bash
# Pre-commit hook
git secrets scan --all
# OR
grep -r \"sk-\" src/ && exit 1
grep -r \"AKIA\" src/ && exit 1
```

## SEC-002: Approval-Gating for Destructive Ops

```typescript
if (toolCall.annotations.destructiveHint) {
  const approved = await approvalManager.request(...);
  if (!approved) throw new BlockedError();
}
```

## SEC-003: Untrusted Content Discipline

```typescript
// Retrieved content, model output treated as hostile
const sanitized = sanitize(untrustedInput, {
  allowedTags: ['b', 'i', 'code'], // Whitelist-based
  disallowedAttributes: ['onclick', 'onerror']
});
```

## SEC-004: Structured Logging with Redaction

```typescript
const redacted = redactSecrets(logMessage);
tracer.info('event', { ...data }); // Secrets never logged
```

### Performance Invariants (QOS-001/002)

- ✅ Preserve low-latency streaming (first token <500ms)
- ✅ Preserve deterministic resume (bit-for-bit replay)
- ✅ Preserve bounded memory/token behavior (no unbounded growth)
- ✅ AgentFS Phase 4: 10× faster sandbox startup, ≥90% virtual-path execution, <10ms content-address lookup

### Workflow Quality Gates (WF-001)

- ✅ All YAML workflows validate against Zod schema
- ✅ No circular state references in workflow graphs
- ✅ Every workflow has at least one terminal state
- ✅ JSON Schema for IDE validation generated from Zod source
- ✅ Default workflows load without errors
- ✅ Trigger matching is case-insensitive and deterministic
- ✅ Value capture via JSONPath handles missing paths gracefully
- ✅ Gate nodes return handles for external approval (Slack/Telegram/CLI)
- ✅ Bash nodes enforce timeout and retry limits
- ✅ Parallel nodes use Promise.allSettled (no uncaught rejections)

### Context Pruning Quality Gates (DCP-001)

- ✅ `compress` tool registered and callable by LLM
- ✅ Deduplication detects repeated tool calls (same tool + args)
- ✅ Protected tools never pruned or deduplicated
- ✅ Protected file patterns respected during compression
- ✅ Nudge system fires at correct context thresholds
- ✅ Per-model context limits override global defaults
- ✅ Turn protection keeps recent tool outputs intact
- ✅ Compression summaries preserve protected content

### ECC Integration Quality Gates (ECC-001)

- ✅ ECC integration is optional (not required for core system)
- ✅ Agent catalog expands when ECC package installed
- ✅ Skills library available when installed
- ✅ Hook profiles configurable via environment variables
- ✅ Multi-language rules loadable per-language
- ✅ Install advisor guides component selection
- ✅ Continuous learning extracts patterns from sessions
- ✅ Loop guard prevents infinite agent loops
- ✅ Quality gate command runs checks
- ✅ Status snapshots show system health
- ✅ Cost audit skill tracks spending
- ✅ Installation wizard guides setup

### External Pattern Adoptions (EXT-001)

- ✅ Memory API exposes `remember`/`recall`/`forget`/`improve` operations
- ✅ Session memory with background sync to knowledge graph
- ✅ Recall auto-routes to best search strategy
- ✅ Selector Agent filters candidate functions to minimize context
- ✅ Validation Feedback detects and corrects AI arg mistakes
- ✅ Workflow pause/resume/interrupt with task_snapshot recovery
- ✅ Dependency-aware parallel agent execution
- ✅ Progressive skill loading (only when needed)
- ✅ Isolated sub-agent context
- ✅ IM channel integration (Telegram, Slack, Discord)
- ✅ Context summarization for long tasks
- ✅ Human approval with admin-block tools
- ✅ Context providers for live data
- ✅ AG-UI + A2A interface exposure
- ✅ Tool card standardization

### Council Mode Quality Gates (COUNCIL-001)

- ✅ Council executor runs all 3 stages successfully
- ✅ First opinions collected in parallel from all members
- ✅ Cross-review anonymizes model identities
- ✅ Rankings aggregated from all reviews
- ✅ Chairman synthesizes final answer with dissenting opinions
- ✅ Council presets load and validate successfully
- ✅ CLI `/council` command works
- ✅ VS Code council mode toggle functional
- ✅ Events emitted for each stage transition
- ✅ Token usage tracked per-member and aggregated

### Accessibility (WCAG 2.2 AA)

- ✅ Semantic HTML / proper heading hierarchy
- ✅ Keyboard navigation (arrows, Tab, Enter, Esc)
- ✅ 4.5:1 contrast ratio (colors in Ink components)
- ✅ REDUCE_MOTION environment variable respected
- ✅ ARIA labels where needed

---

## Completion Verification Protocol

**Before marking task ✅:**

1. **Verify implementation exists:**
   - Function/class/module exists in codebase
   - Exports documented API from src/index.ts
   - Types correct (no `any`)

2. **Run quality gates:**
   - `pnpm check-types` package passes
   - `pnpm test` package tests pass
   - Related integration tests pass

3. **Update tracking files:**
   - Package IMPLEMENTATION-PLAN.md: mark TASK-XXX ✅ with date
   - `plan/IMPLEMENTATION-COMPLIANCE-MATRIX.md`: update percentage
   - If multi-package: update all affected plans

4. **No completion claims without verification:**
   - Incomplete work documented in IMPLEMENTATION-PLAN.md with reason
   - Blocked tasks noted with dependency
   - Deferral explicit (phase X or later)

---

## Git Workflow (Strict)

### Commit Philosophy

- **One logical change per commit**
- **Conventional Commits** format:

  ```text
  feat(packages): implement TASK-XXX

  - Behavior 1
  - Behavior 2

  Fixes #issue-id
  ```

- **Atomic:** Single commit should not break tests
- **Reversible:** `git revert <commit>` leaves clean state

### Pre-Commit Checks

```bash
# Installed via Husky + lint-staged
- pnpm check-types (only changed files)
- oxlint (only changed files)
- No hardcoded secrets
- No console.log in production paths
```

### PR Requirements

- Title references issue (e.g., \"feat: implement TASK-067\")
- Description includes:
  - What changed (2-3 sentences)
  - Why (rationale)
  - Testing approach
- ✅ All CI checks pass
- ✅ Reviewed + approved by 1 maintainer minimum

### Merge Strategy

- **Squash merge** for feature branches (clean history)
- **Rebase merge** for bugfixes (preserve context)
- **Fast-forward** never (keeps feature branches visible)

---

## Testing Standards

### Mocking Standards

- ✅ LLM provider tests use aImock fixtures (not MSW) — see `plan/18-PHASE-AIMOCK-INTEGRATION.md`
- ✅ All fixtures validated against real APIs (drift detection green)
- ✅ No real network calls in CI (all aImock or MSW for non-LLM endpoints)
- ✅ Chaos tests pass (error handling verified under 500s, malformed JSON, disconnects)
- ✅ Record & replay fixtures are deterministic

### Unit Tests

- ✅ All public functions tested
- ✅ Happy path + error cases
- ✅ Mocks for external dependencies (MSW, database, filesystem)
- ✅ Deterministic (no flaky timeouts)

### Integration Tests

- ✅ Cross-package contracts validated
- ✅ Data flow end-to-end
- ✅ All aImock fixtures current (drift detection green)
- ✅ Deterministic fixtures (seed random if needed)
- ✅ Chaos tests for error paths (retry, budget enforcement, graceful degradation)

### E2E Tests

- ✅ Real CLI / UI / API surfaces
- ✅ User-visible workflows
- ✅ Smoke tests for each phase
- ✅ Performance benchmarks

### Coverage Baseline

- ✅ >70% line coverage monorepo-wide
- ✅ >80% for critical paths (runtime, memory, orchestrator)
- ✅ All new code has tests before merging

---

## Documentation Governance

### Required Files

**Per package:**

- `package.json` (exports, version, scripts)
- `src/index.ts` (re-exports public API)
- `README.md` (purpose, quick-start, API overview)
- `IMPLEMENTATION-PLAN.md` (task tracking)

**Monorepo:**

- `README.md` (project overview)
- `docs/architecture/` (layer model, data flow)
- `docs/packages.md` (all packages, maturity status)
- `docs/getting-started.md` (user walkthrough)
- `docs/developers/` (contributor guides)
- `CHANGELOG.md` (version history)

### Rules

- ✅ Do NOT describe plan-only domains as shipped
- ✅ Do NOT claim providers merged unless code + exports prove it
- ✅ Keep package names consistent with `packages/*/package.json`
- ✅ When architecture changes, update packages/ plans + master + docs in same PR
- ✅ When adopting external standard, document adapter boundary + fallback + ownership

---

## Phase Sequencing & Gates

### Gate Before Proceeding

| Milestone     | Gate                    | Evidence                                                           |
| ------------- | ----------------------- | ------------------------------------------------------------------ |
| End Phase 0-1 | Foundations verified ✅ | Observability, runtime, orchestrator, types all in code            |
| End Phase 2   | TUI dogfoodable         | Chat streaming E2E working                                         |
| End Phase 4   | Before tools            | Hooks, skills, agents, secrets, budget all wired                   |
| End Phase 5   | Before autonomous mode  | Approval gates, guardrails, tool execution verified                |
| End Phase 9   | Before GA               | Cost tracking, structured logging, performance benchmarks passing  |
| End Phase 12  | Release                 | Closure artifact signed, smoke tests passing, zero critical issues |

---

## Issue Tracking (GitHub)

### Issue Creation

- **Bug:** Reproducible, with steps + expected vs actual
- **Feature:** User story (\"As a user, I want...\"), acceptance criteria
- **Task:** Subtask of feature (technical work)
- **Epic:** Tracks multiple features (e.g., \"Phase 2 TUI\")

### Labels

- `phase/X` (phase number)
- `package/name` (affected package)
- `type/bug`, `type/feature`, `type/task`
- `status/blocked`, `status/in-progress`, `status/ready-review`
- `priority/critical`, `priority/high`, `priority/medium`

### Issue Closing

- PR references issue (`Fixes #123`)
- Commit history linked
- Test coverage verified
- Related plan files updated

---

## Release Protocol

### Version Bumping

**Semantic Versioning:**

- Major (1.0.0): Breaking changes
- Minor (0.1.0): New features, backward-compatible
- Patch (0.0.1): Bugfixes only

**Per package:** Independent versioning in package.json

### Release Checklist (Phase 12)

See `15-PHASE-12-HARDENING-RELEASE.md` TASK-055 + TASK-059.

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit clean
- [ ] Documentation complete
- [ ] CHANGELOG.md updated
- [ ] Tag + push to GitHub
- [ ] npm publish (GitHub Actions)

### Post-Release

- Monitor telemetry for 24h
- No P0 issues? Mark \"stable\"
- Plan post-mortem if needed

---

## Escalation & Decisions

### Architectural Decisions

**Document in:** `docs/adr/` (Architecture Decision Records)

Format:

```text
# ADR-001: Hook Taxonomy Design

## Status: Accepted

## Context
Runtime needed... (problem)

## Decision
We will... (solution)

## Consequences
This means... (tradeoffs)

## References
- Phase 0: Hook taxonomy
- RFC: ...
```

### Breaking Changes

**Require:**

- Explicit ADR
- Migration guide in CHANGELOG.md
- Deprecation period (1 minor version) before removal
- User communication

### Feature Flags

**For experimental work:**

```typescript
const EXPERIMENTAL_FEATURE = process.env.AGENTSY_EXPERIMENTAL_X === 'true';

if (EXPERIMENTAL_FEATURE) {
  // New code path
} else {
  // Existing code path
}
```

Removed once stable.

---

## Continuous Improvement

### Lessons Learned

Captured in: `plan/LESSONS-LEARNED.md`

- What worked well
- What was painful
- What to avoid next time
- Process improvements

### Retrospectives

Post-phase (every 1-2 weeks during active development):

- What did we ship?
- What surprised us?
- How can we improve?

---

## Code of Conduct

- Be respectful
- Assume good intent
- Technical disagreements are healthy
- Decisions are made via consensus or by technical lead
- All decisions reversible (no permanent mistakes)

---

**Authority:** User profile contract. Enforcement: pre-commit hooks + CI gates + manual code review.

---
