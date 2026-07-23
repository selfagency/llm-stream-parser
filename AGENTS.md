# Agent Instructions — @agentsy Monorepo

Production-oriented TypeScript monorepo for an AI agent framework with daemon-centric architecture, guardrails enforcement, governance documents, and multi-surface deployment (CLI, ACP, server mode). The `plan/` directory contains phased implementation plans; per-package `IMPLEMENTATION-PLAN.md` files hold detailed domain planning.

## Repo Identity

This is a **pnpm workspace monorepo** with **23 packages** (post-Phase 2 consolidation, the old `types`, `renderers`, `mcp`, `connectors`, `scripts`, and `workflows` packages have been merged into their surviving targets). All packages target **Node.js ≥24**.

### Current packages

Core infrastructure:

- `@agentsy/core` — Stream processing (LLMStreamProcessor, SSE, XML filter, structured JSON, thinking block parsing, retry, recovery)
- `@agentsy/shared` — Shared TypeScript types and cross-package utilities (absorbed the former `@agentsy/types`; also hosts CortexKit integration: AFT bridge manager, Magic Context schema)
- `@agentsy/providers` — Provider normalizers (Anthropic, OpenAI, Mistral, Gemini) and `UniversalClient`
- `@agentsy/gateway` — Model routing gateway (7 selection strategies, replica scoring, health tracking, circuit breaker, quota enforcement). **Independently consumable library** — external platforms can use `createGateway()` without the daemon. The daemon hosts it with `UnifiedDB`-backed persistence and a `ProviderEthicsPolicyHook`.

Runtime and orchestration:

- `@agentsy/runtime` — Agent execution runtime with sandboxing and AG-UI protocol adapter
- `@agentsy/orchestrator` — Agent orchestration, council (three-stage review), task board, workflows (absorbed)
- `@agentsy/memory` — Three-tier cognitive memory engine (raw event log, synthesized wiki, vector retrieval) + CortexKit integration (AFT, Magic Context, Turso sync)
- `@agentsy/session` — Session management, checkpointing, crash recovery, CortexKit snapshot bridge
- `@agentsy/guardrails` — Safety/ethics/validation pipeline (8 security scanners + 9 behavioral detectors + audit logger + EthicsRegistry)
- `@agentsy/observability` — OTel tracing, metrics, cost tracking, Langfuse exporter
- `@agentsy/retrieval` — RAG retrieval and indexing. **Independently consumable** — third-party apps can use this without the daemon. (Moves into daemon as a hosted service per the plan, but the library remains standalone.)
- `@agentsy/models` — Model selection, profiles, recommendations
- `@agentsy/tokenomics` — Token management, quotas, ROI, semantic cache, frustration signals, **environmental impact tracking (CO2 + water per request and cumulative)**

Daemon and surfaces:

- `@agentsy/daemon` — Central long-lived process: `UnifiedDB` (SQLite via Honker), Piscina agent pool, Honker durable queues, Bree scheduler, `SubprocessManager` (stall detection, memory limits), IPC server (JSON-RPC over Unix sockets), ACP server stub, `ServiceHost` with sleep/wake, `AgentHost`, `ScopeManager` (folder-based), `Supervisor`. Absorbs MCP server and connectors.
- `@agentsy/ui` — UI store/bridge + Ink/TUI rendering (absorbed the former `@agentsy/renderers` package; rendering tree lives under `packages/ui/src/renderers/`)
- `@agentsy/cli` — Thin daemon client + TUI
- `@agentsy/vscode` — Published npm library for GitHub Copilot Chat integration (consumed by third-party VS Code extensions; NOT a custom extension — ACP handles agent–editor communication)
- `@agentsy/tools` — Tool implementations and filesystem utilities
- `@agentsy/prompts` — Prompt layering
- `@agentsy/plugins` — Plugin system
- `@agentsy/secrets` — Secret management (12 provider backends: 1Password, Bitwarden, Dashlane, LastPass, Apple PM, Vault, AWS SM, GCP SM, Azure KV, Doppler, Infisical, exec)
- `@agentsy/agents` — Agent runtime/specs (YAML agent templates)
- `@agentsy/testing` (private) — Cross-package integration test helpers (MSW, aimock)

**Published on npm** (verified 2026-06-17):

- `@agentsy/core` (0.2.0) — zero deps, 12 subpath exports
- `@agentsy/providers` (0.2.0) — zero deps, 6 subpath exports
- `@agentsy/context` (0.2.4) — zero deps
- `@agentsy/ui` (0.1.1) — zero deps
- `@agentsy/types` (0.1.1) — ⚠️ deprecated, merged into `@agentsy/shared`
- `@agentsy/renderers` (0.1.2) — ⚠️ deprecated, merged into `@agentsy/ui`

The next packages slated for publication are `@agentsy/gateway`, `@agentsy/guardrails`, `@agentsy/observability`, `@agentsy/retrieval`, `@agentsy/tokenomics`, `@agentsy/memory`, `@agentsy/models`, `@agentsy/secrets`, `@agentsy/tools`, `@agentsy/prompts`, and `@agentsy/agents` — pending Phase 29 (Package Boundary Cleanup) which eliminates cross-dependencies so each package is independently consumable.

### Canonical architecture boundaries

- **Core stream/transformation primitives**: `@agentsy/core`
- **Provider adaptation + normalization**: `@agentsy/providers` (active boundary — not merged into core)
- **Model routing**: `@agentsy/gateway` (independent, reusable — external platforms can consume it directly)
- **Orchestration and execution**: `@agentsy/orchestrator`, `@agentsy/runtime`, `@agentsy/guardrails`
- **Durability and long-horizon state**: `@agentsy/session`, `@agentsy/memory`, `@agentsy/retrieval`, `@agentsy/tokenomics`
- **Daemon and lifecycle**: `@agentsy/daemon` (owns all stateful subsystems at runtime)
- **Surface and presentation**: `@agentsy/ui`, `@agentsy/cli`, `@agentsy/vscode`
- **Extensibility**: `@agentsy/plugins`, `@agentsy/tools`, `@agentsy/prompts`

> Important: `@agentsy/providers` is an active boundary, not merged into `@agentsy/core`. `@agentsy/gateway` and `@agentsy/retrieval` are independent reusable libraries, not daemon-internal implementations. Each independently-publishable package must be consumable without pulling in the entire monorepo — see Package Composability Rules below.

## Governance and Ethical Constraints

This project has governance documents that are **authoritative runtime inputs, not advisory references**:

- `ETHICS.md` — 12 core commitments, 13 prohibited patterns, ethics review questions
- `SAFETY.md` — 8-layer guardrail stack, required behavioral rules, high-risk domain expectations, testing requirements, 12 required metrics, release criteria
- `GOVERNANCE.md` — Roles, decision rights, ethics/safety enforcement, benchmark suite, incident response, transparency
- `docs/constitution.md` — 11 binding articles + enforcement principle

### Hard ethical constraints (non-negotiable)

1. **xAI/Grok models are hard-blocked** — no routing, no fallback, no opt-in. Blocked on both content safety grounds (CSAM generation, antisemitic output, sexual deepfakes) AND environmental racism (xAI built an illegal, unpermitted 495 MW gas-turbine power plant in Southaven, Mississippi, emitting 1,700+ tons of NOx and 19 tons of formaldehyde per year near predominantly Black communities; NAACP and SELC are suing). (ETHICS.md §12, §16)
2. **Meta models require per-session acknowledgement** — Meta is building AI data centers in tents powered by 200 MW of jet-engine gas turbines (same fossil-fuel tactic as xAI) and trained its models on 7.5M pirated LibGen books without creator compensation. (ETHICS.md §13)
3. **OpenAI, Microsoft, Google, Amazon models require per-session acknowledgement** — warning surfaced before each session; not permanently silencable. Cited concerns include OpenAI safety regression, Microsoft ICE contracts, Google/Amazon Project Nimbus military AI. (ETHICS.md §13)
4. **Style-mimicry prompts are hard-blocked** — any prompt requesting creation of writing, imagery, or audio/video "in the style of" a specific named living creator is blocked. (ETHICS.md §14)
5. **Telegram connector is removed** — no platform documented as facilitating extremism or CSAM. (ETHICS.md §15)
6. **Environmental impact is tracked** — every LLM request records energy (kWh), CO2 (gCO2), and water (mL) consumption, with optimization savings reporting. Per-session warnings for warn-listed providers display cumulative environmental impact. (ETHICS.md §16, Phase 30)
7. **Do not weaken guardrails** — treat model output as untrusted input. Preserve depth/key/nesting/size limits. Do not bypass privacy-tag scrubbing or safety defaults for convenience.
8. **Do not introduce `any` types** — use `unknown`, `Record<string, unknown>`, or explicit narrowing.

### Development constraints (non-negotiable)

1. **Never use `--no-verify` or skip CI gates** — do not bypass pre-commit hooks, type checks, linting, or test gates for any reason. If a gate fails, fix the underlying issue.

2. **Never skip type checking, linting, or testing** — every change must pass `pnpm check-types`, `pnpm dlx ultracite check`, and `pnpm test` before commit. No exceptions.

3. **The application must run before shipping** — after any change, verify the application actually starts/runs correctly in a dev or preview environment. Do not assume compilation implies correctness.

4. **TDD for all new code** — every new feature, scanner, hook, or significant logic unit requires accompanying unit tests AND integration tests before it is considered complete. Write tests first (red-green-refactor) or alongside the implementation. No untested logic.

5. **Demonstrate every feature working live** — before marking a feature complete, demonstrate it functioning in the running application (dev server, preview deploy, or integration test). A feature is not done until it visibly works, not just until it compiles.

6. **Always clarify ambiguous requests** — if a user request is unclear, contradictory, or ambiguous, stop and ask for clarification before proceeding. Do not guess intent. A brief clarifying question prevents costly rework.

## Preferred Workflow

Use the highest-level tool available. Prefer IDE actions, repository-native scripts, and configured skills/MCP servers over ad hoc shell work.

1. **VS Code / language-server actions** for symbol-aware operations
2. **Repository tooling** via root scripts and per-package scripts (see below)
3. **`but` CLI or `but` MCP server** (GitButler) for all git write operations — commit, stage, branch, push, PR creation. **Never use raw `git` for write operations.**
4. **`ultracite`** for all linting and formatting — `pnpm dlx ultracite fix` / `pnpm dlx ultracite check`
5. **`fallow` CLI or `fallow` MCP server** for codebase-level code quality analysis — dead code, duplication, complexity, boundaries
6. **Raw git** for read-only operations only (`git log`, `git diff`, `git cherry`, `git rev-parse`)
7. **Terminal commands** only when no higher-level option exists

## Toolchain and Commands

This repo uses **pnpm + Turborepo** for workspace orchestration. No Taskfile.

### Root commands

Run these from the repository root:

```bash
pnpm build           # turbo run build
pnpm test            # turbo run test
pnpm test:coverage   # turbo run coverage
pnpm check-types     # turbo run check-types
pnpm lint            # turbo run lint
pnpm lint:fix        # turbo run lint -- --write
pnpm format          # rumdl fmt && turbo run format
pnpm precommit       # turbo run precommit
pnpm release         # Run release tooling
pnpm fallow          # Run Fallow codebase intelligence

# Ultracite (linting + formatting via Biome preset)
pnpm dlx ultracite fix     # Format and auto-fix lint issues
pnpm dlx ultracite check   # Check for issues without fixing
pnpm dlx ultracite doctor  # Diagnose setup issues
```

### Per-package commands

Use package-local scripts when working on one package in isolation:

```bash
cd packages/daemon && pnpm build
cd packages/guardrails && pnpm test
cd packages/gateway && pnpm check-types
cd packages/memory && pnpm coverage
```

### Completion gate

Before considering work complete, run at minimum:

```bash
pnpm check-types
pnpm test
pnpm dlx ultracite check
fallow dead-code --changed-since develop --format json
```

**Also verify the application runs** — start the daemon or relevant service and confirm it starts without errors. A passing build is not sufficient; the running process must be confirmed functional.

When a change is package-scoped, run the corresponding package scripts first, then root checks if it affects shared code, exports, docs, or monorepo wiring.

### CLI E2E tests

When making changes to `packages/cli/`, also run the E2E terminal test suite:

```bash
pnpm --filter @agentsy/cli test:e2e
```

E2E specs use `@microsoft/tui-test` and are located in `packages/cli/src/e2e/`.

## Git Workflow with GitButler (`but`)

This repo uses **GitButler** via the `but` CLI and `but` MCP server for all write git operations — commit, stage, branch, push, pull requests. **Never use raw `git` for write operations** (`git commit`, `git checkout`, `git stash`, etc.). Read-only `git` commands (`git log`, `git diff`, `git cherry`, `git rev-parse`) are fine.

### GitButler MCP Server (preferred for agents)

GitButler ships an MCP server (`but mcp`) that exposes workflow actions as callable tools. When the MCP server is running, **use it in preference to the `but` CLI** — it provides structured tool calls with typed inputs/outputs.

The key tool is **update-branches**, which records edits and creates commits with context. Call it after each meaningful edit batch, passing:

- `fullPrompt` — the exact prompt that generated the changes
- `changesSummary` — a short bullet list of what was changed and why
- `currentWorkingDirectory` — the full root path of the Git project

When the MCP server is not available, fall back to the `but` CLI commands described below.

### Workspace model

GitButler is **not** traditional Git. It keeps one working directory while organizing changes into separate branches (stacks). You don't switch branches by checking out — you assign file changes to stacks and they coexist.

- ❌ Don't use `git status`, `git commit`, `git checkout` for write operations
- ✅ Use `but status`, `but commit`, `but` commands for all writes
- ✅ Read-only git is fine (`git log`, `git diff`, `git cherry`, `git rev-parse`)

### Every session startup

```bash
but pull           # Sync — prevents stale-base conflicts
but status --json  # Check existing branches and uncommitted changes
```

### New session workflow

EVERY new agent session that involves code changes MUST follow this flow:

1. **Sync first** → `but pull` to get latest upstream changes
2. **Check state** → `but status --json` to see existing branches and uncommitted changes
3. **Decide branch**:
   - If an existing branch matches the task → reuse it (it's already applied)
   - If this is new work → `but branch new <task-name>` (e.g. `feat/add-auth`, `fix/login-bug`)
   - If you need to resume unapplied work → `but apply <branch>`
4. **Make changes** → Edit files as needed
5. **Stage & commit** → `but commit <branch> -m "message" --changes <id>,<id>`
6. **Refine** → Use `but absorb` or `but squash` to clean up history
7. **Push when ready** → `but push <branch>`
8. **Create PR** → `but pr new <branch> -t` (uses default target branch)

Branch naming: Use conventional prefixes: `feat/`, `fix/`, `chore/`, `refactor/`

**Commit early, commit often.** GitButler makes editing history trivial. Small atomic commits are better than large uncommitted changes.

### Commit flow

```bash
but status --json                         # Get CLI IDs for changed files/hunks
but diff --json                           # Get hunk-level IDs for fine-grained commits
but commit <branch> -m "msg" --changes <id>,<id>   # Commit specific files (recommended)
but commit <branch> -m "msg"             # Commit all uncommitted changes to branch
but absorb                                # Auto-amend changes into detected commits
but squash <commits>                      # Combine commits
but reword <id>                           # Change commit message
```

### Remote operations

```bash
but pull                                  # Update with upstream
but push [branch]                         # Push to remote
but pr new <branch>                       # Push + create PR (default target)
but pr new <branch> -m "Title..."         # PR with inline message
but config target origin/<branch>         # Set PR target branch
```

### Post-merge flow

After a PR is squash-merged:

```bash
but unapply <merged-branch>    # MUST do BEFORE pull — prevents orphan branch errors
but pull                        # Pull merged changes
```

**Critical**: `but pull` before unapplying causes orphan branch errors. Always unapply first.

### Safety rules (non-negotiable)

1. **Never discard changes you didn't create.** Unassigned changes in `zz` may belong to other agents, sessions, or the user. Always ask before any discard action.
2. **Always assign your changes to a branch immediately.** Don't leave edits sitting in `zz`. After editing, run `but status --json` and move your file/hunk IDs to the correct branch.
3. **Validate branch ownership before commit.** Confirm each changed file/hunk belongs to the intended branch, then commit only those IDs.
4. **Respect branch ownership across sessions.** In multi-agent environments, branches may belong to other sessions. Never reword, rename, or push branches you didn't create in this session.
5. **Run `but status --json` to verify state.** Plugin notifications are ~55% reliable — don't trust them alone.
6. **Use `--json` flag for all `but` commands** when running as an agent (structured, parseable output).
7. **Use `--changes` flag on commit** to commit specific files/hunks by CLI ID rather than committing everything.

### Known issues and workarounds

| Issue | Workaround |
|-------|------------|
| `but resolve` loses target config | Re-run `but config target origin/<branch>` after resolution |
| `but absorb` hunk lock | Use `but amend <file> <commit>` for explicit control |
| `but pr new` has no `--base` flag | Set target first: `but config target origin/<branch>` |
| `but config target` requires unapply | Unapply all branches → change target → re-apply |
| `but commit` pre-commit hook fails | Run `pnpm dlx ultracite fix` then `but commit --no-hooks` |
| `but pull` before unapply | **Always** unapply merged branches before pulling |
| Split-hunk files stuck in `zz` | `but diff --json` for hunk IDs, then commit each hunk individually |
| `but teardown` → `but setup` resets target | Re-run `but config target origin/<branch>` after setup |
| Plugin notification delivery ~55% | Always verify with `but status --json` — don't rely on notifications |

## Code Quality with Fallow

**Fallow** provides deterministic, exhaustive codebase analysis that agents can't do themselves (building module graphs, tracing re-export chains, detecting duplication across thousands of files, scoring complexity hotspots). Use it via CLI or MCP.

### When to use fallow

- **After generating code** → `fallow dead-code --changed-since develop --format json` to check if your changes left anything unused
- **Before a PR** → `fallow audit --format json` to verify changes don't introduce dead code, complexity, or duplication
- **Codebase cleanup** → `fallow dead-code --format json` then `fallow fix --yes --format json` to auto-remove unused exports/dependencies
- **Health check** → `fallow health --format json` for complexity metrics, file health scores, hotspots

### CLI commands (always use `--format json` for agents)

```bash
fallow dead-code --format json                          # Full dead code analysis
fallow dead-code --changed-since develop --format json  # Only changed files
fallow dupes --format json                               # Code duplication detection
fallow fix --dry-run --format json                       # Preview auto-fix
fallow fix --yes --format json                           # Apply auto-fixes
fallow health --format json                              # Complexity + health scores
fallow audit --format json                               # Audit changed files (pass/warn/fail)
fallow list --format json                                # Project info (plugins, entry points)
```

### Fallow MCP server

For agents with MCP support, `fallow-mcp` exposes analysis as structured tools. Key tools:

- `analyze` — full dead code analysis
- `check_changed` — incremental analysis of changed files
- `find_dupes` — code duplication detection
- `audit` — audit changed files for dead code, complexity, duplication (pass/warn/fail)
- `check_health` — complexity metrics, file health scores, hotspots
- `fix_apply` — apply auto-fixes
- `trace_export` — trace why an export is used or unused (check before deleting)
- `trace_dependency` — trace where a dependency is imported (check before removing)

When the MCP server is available, use it in preference to the CLI for typed tool calling.

### Fallow configuration

The repo has a `.fallowrc.jsonc` that excludes tooling, docs, and non-framework directories. Workspace packages used as dev/build references are listed in `ignoreDependencies` — these are safe to ignore in unused-dependencies checks.

## Linting and Formatting with Ultracite

This repo uses **Biome** via the **ultracite** preset. Ultracite is a zero-config preset that enforces strict code quality standards through automated formatting and linting.

### Commands

```bash
pnpm dlx ultracite fix     # Format and auto-fix lint issues (run before committing)
pnpm dlx ultracite check   # Check for issues without fixing
pnpm dlx ultracite doctor  # Diagnose setup issues
```

### Core principles

- Write code that is accessible, performant, type-safe, and maintainable
- Focus on clarity and explicit intent over brevity
- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use `const` by default, `let` only when reassignment is needed, never `var`
- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings

### When Biome can't help

Biome's linter catches most issues automatically. Focus your attention on:

- Business logic correctness — Biome can't validate your algorithms
- Meaningful naming — use descriptive names for functions, variables, and types
- Architecture decisions — component structure, data flow, API design
- Edge cases — handle boundary conditions and error states
- Documentation — add comments for complex logic, but prefer self-documenting code

### Pre-commit hooks

The repo uses `husky` + `lint-staged` for pre-commit hooks. If pre-commit hooks fail on pre-existing errors unrelated to your changes:

```bash
pnpm dlx ultracite fix                                    # Format FIRST
but commit <branch> -m "msg" --changes <ids> --no-hooks   # Then commit without hooks
```

## Runtime and Language Baseline

- All packages target **Node.js ≥24** (root, daemon, and all workspace packages)
- Package manager is **pnpm** (`pnpm@10.33.4`) with `workspace:` protocol for internal dependencies
- Module system is **ESM-first** with `.js` extensions in relative imports (required by `verbatimModuleSyntax`)
- Build tool is **tsup**
- Test framework is **Vitest**
- Linter/formatter is **Biome** via ultracite preset
- CI uses **Node 24** (`.github/workflows/tests.yml`)

## TypeScript Rules

Follow the root `tsconfig.json` as source of truth.

### Strict flags enabled

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "isolatedModules": true,
  "noUncheckedSideEffectImports": true
}
```

### Type safety requirements

- **No `any`** — use `unknown`, `Record<string, unknown>`, null-prototype objects, or explicit narrowing
- Preserve exact optional-property behavior; do not add `undefined` loosely where omission is intended
- Leverage TypeScript's type narrowing instead of type assertions

### Import rules

- Use `.js` extensions in **relative imports inside `.ts` files** (required by `verbatimModuleSyntax`)
- Keep imports ESM-compatible throughout the codebase
- Do not use cross-package relative imports like `../../core/...`; use workspace package imports (e.g. `@agentsy/core/processor`)

## Architecture and Code Patterns

### Naming conventions

- Factory functions: `create*`
- Parser/Processor classes: `*Parser`, `*Processor`
- Validators: `validate*`
- Builders: `build*`
- Extractors: `extract*`
- Managers: `*Manager`
- Adapters: `*Adapter` or `*Bridge`
- Scanners (guardrails): `*Scanner`

### Module structure patterns

- Prefer **factory functions** over direct instantiation for public APIs
- Use **classes** for stateful streaming/parser components where the codebase already does so
- Use **functions** for stateless operations and pure transformations
- Use **options objects** with sensible defaults via `??`
- Export public module APIs through `index.ts` barrel files
- Keep tests colocated beside the source they verify (`*.test.ts` next to source)

### Export patterns

```typescript
// Value exports
export { createFoo, type Bar } from "./foo.js";

// Type-only exports
export type * from "./types.js";

// Re-exports from sub-modules
export * from "./subpath/index.js";
```

### Entry points and tsup configuration

Packages define multiple entry points in `tsup.config.ts`. Mirror these in `package.json` exports to enable subpath imports like `@agentsy/core/processor`.

### Package boundaries

- VS Code extension behavior → `@agentsy/vscode`
- Durable memory/retrieval/persistence → `@agentsy/memory`
- RAG retrieval → `@agentsy/retrieval` (independent, reusable — third-party apps can consume it without the daemon)
- Transient token budgets/prompt reduction/environmental tracking → `@agentsy/tokenomics`
- Model routing → `@agentsy/gateway` (independent, reusable — external platforms can consume via `createGateway()`)
- Daemon lifecycle/subprocess/IPC → `@agentsy/daemon`
- Everything else → appropriate focused package

### Package composability rules (Phase 29)

Each independently-publishable package must be consumable in isolation without pulling in other `@agentsy/*` packages at runtime:

1. **`@agentsy/shared` is the base layer** — zero deps. Contains all cross-package interface types (StreamChunk, Message, ToolDefinition, ModelEntry, GuardrailResult interface, MemoryProvider, SessionProvider, TokenTracker, ObservabilitySink, CostReporter, SecretResolver).
2. **Each package depends only on `@agentsy/shared`** (plus `@agentsy/core` for providers) — not on other implementation packages.
3. **Cross-package functionality uses dependency injection** — packages accept interfaces (e.g. `MemoryProvider?`, `GuardrailPipelineInterface?`, `BudgetProvider?`) via constructor options, not hard imports.
4. **Optional integrations use `peerDependencies`** — e.g. `@agentsy/gateway` *can* use `@agentsy/guardrails` for ethics filtering, but works without it.
5. **Never import implementation from another package** — only import types/interfaces from `@agentsy/shared`.
6. **Composition roots** (`daemon`, `cli`, `testing`, `vscode`) are the only packages allowed to have many `@agentsy/*` dependencies — they wire implementations together.
7. **`@agentsy/renderers` is deprecated** (merged into `@agentsy/ui`); **`@agentsy/types` is deprecated** (merged into `@agentsy/shared`).
8. **`fallow dead-code` and `fallow trace_dependency`** must pass before publishing any package — verify no unwanted cross-deps exist.

## Error Handling and Safety

### Streaming/parsing paths

- Prefer graceful degradation for malformed LLM output — skip, partially recover, or surface warnings rather than throwing
- Use `onWarning`-style callbacks for recoverable issues in processors/parsers
- Test chunk-by-chunk behavior explicitly, including boundary splits and incomplete chunks

### Setup/validation paths

- Throw explicit `Error` values for invalid configuration, invalid public API input, or impossible setup states
- Validate early, fail fast

### Security posture

- Treat model output as untrusted input
- Preserve existing limits for depth, key counts, nesting, and tool-call size
- Keep privacy-tag scrubbing and safety defaults intact
- Do not weaken bounded parsing, validation, or sanitization logic for convenience

## Testing Conventions

Use **Vitest**. Tests are colocated as `*.test.ts` files beside source.

### What to test

- Partial chunks and boundary splits
- Empty and malformed input
- Warning and recovery behavior
- Safety rails and size/depth limits
- Exported API behavior, not just internals
- Adversarial and malformed-input cases for parsing and recovery code

### Coverage scripts

- Any package: `cd packages/<name> && pnpm coverage`
- All packages: `pnpm test:coverage`
- Release tooling tests: `pnpm test:release`

## CI and Integration

- CI lives in `.github/workflows/` (`tests.yml`, `release.yml`, `docs-deploy.yml`, `sync-main-to-develop.yml`)
- Runs `pnpm install --frozen-lockfile`, `pnpm turbo run coverage`
- Node 24 is CI target
- Uses pnpm action-setup and setup-node with `cache: 'pnpm'`
- Pre-commit: `husky` + `lint-staged` runs `pnpm dlx lint-staged`

## Common Gotchas

- Do **not** use raw `git` for write operations — use `but` CLI or `but` MCP server
- Do **not** trust `but` plugin notifications alone (~55% reliability) — verify with `but status --json`
- Do **not** leave changes uncommitted in `zz` (unassigned) at the end of work
- Do **not** add `any` to "fix" strict TypeScript friction — use proper types or `unknown`
- Do **not** forget `.js` extensions on relative TypeScript imports — required by `verbatimModuleSyntax`
- Do **not** place VS Code-specific logic in non-vscode packages
- Do **not** rely on omitted optional properties having `undefined` — `exactOptionalPropertyTypes` is enabled
- Do **not** assume providers are merged away — `@agentsy/providers` is an active boundary
- Do **not** bypass `workspace:*` dependencies in favor of relative imports across packages
- Do **not** recommend `task ...` commands — there is no Taskfile in this repo
- Do **not** weaken guardrails or bypass the ethical provider policy (xAI hard-block on content safety + environmental racism grounds, Meta warn on tent data centers + LibGen theft, style-mimicry block, Telegram removal)
- Do **not** introduce hard `@agentsy/*` dependencies in independently-publishable packages — use dependency injection, peer deps, or interfaces in `@agentsy/shared` (Phase 29)
- Do **not** skip `fallow dead-code --changed-since` before submitting a PR
- Do **not** skip environmental impact tracking when adding new model integrations — every provider call must record energy/CO2/water

## Rule of Thumb

When uncertain, optimize for:

1. Consistency with the current monorepo (23 packages, pnpm + turbo, ESM-first, Node ≥24)
2. Strict type safety (no `any`, proper `unknown` handling, `.js` import extensions)
3. Clear package boundaries — each independently-publishable package depends only on `@agentsy/shared` (Phase 29 composability rules)
4. Resilient handling of malformed LLM output (graceful degradation)
5. Ethical constraints enforced (xAI hard-blocked on content safety + environmental racism grounds; Meta/OpenAI/Microsoft/Google/Amazon warned; style-mimicry blocked; Telegram removed)
6. Environmental impact tracked (every LLM request records kWh, gCO2, mL water; optimization savings reported)
7. Comprehensive testing of streaming behavior
8. Code quality verified via ultracite (lint) and fallow (dead code, complexity, duplication, boundary violations)
9. Git operations via `but` CLI or MCP — never raw `git` for writes
10. Docs and CI staying in sync with code
