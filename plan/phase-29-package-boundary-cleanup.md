
## 45. Phase 29 — Package Boundary Cleanup & Composability

> **2026-06-17 Audit Update**: Code review confirmed the following revised scope for Phase 29:
>
> | Package | Status | Action |
> |---|---|---|
> | `packages/renderers/` | Ghost dir — `src/` already deleted | Remove empty dir, update turbo.json |
> | `packages/types/` | Ghost dir — `src/` already deleted | Remove empty dir, update turbo.json |
> | `packages/mcp/` | **Live code** — `diagnostics.ts`, `types.ts`, `index.ts` remain alongside `daemon/src/mcp/` | Complete the merge: move remaining source into daemon, delete root package |
> | `packages/connectors/` | **Live code** — 5 source files remain alongside `daemon/src/connectors/` | Complete the merge: move to daemon, delete root package |
>
> The ghost directories for `renderers` and `types` are harmless but should be removed to avoid
> confusing tooling (turbo.json, pnpm workspace glob). The `mcp` and `connectors` live-code splits
> are the higher-priority cleanup.

**Priority**: P0 — Sprint 1–2 (can run in parallel with Phase 5; must complete before any new packages are published)
**Story points**: 8
**Branch**: `refactor/package-boundary-cleanup`
**Depends on**: Phase 2 ✅ (consolidation complete), Phase 4 ✅ (guardrails foundation — EthicsRegistry, GuardrailDecisionReceipt types are part of the shared interface contracts)
**Unblocks**: clean npm publication of `@agentsy/gateway`, `@agentsy/guardrails`, `@agentsy/observability`, `@agentsy/retrieval`, `@agentsy/memory`, `@agentsy/tokenomics`, `@agentsy/models`, `@agentsy/tools`, `@agentsy/prompts`, `@agentsy/secrets`, `@agentsy/agents`, `@agentsy/runtime`, `@agentsy/orchestrator`
**Closes**: the cross-dependency problem that prevents independent consumption of agentsy packages

### 45.1 The Problem

agentsy was designed as a composable framework where each package can be used independently by third-party consumers. In practice, 12 packages have hard `@agentsy/*` dependencies that make independent consumption impossible without pulling in the entire monorepo:

**Current cross-dependency graph (problematic edges marked)**:

```text
@agentsy/shared (base layer — zero deps ✅)
├── @agentsy/core → shared ✅
├── @agentsy/guardrails → shared ✅
├── @agentsy/models → shared ✅
├── @agentsy/observability → shared ✅
├── @agentsy/session → shared ✅
├── @agentsy/plugins → shared ✅
├── @agentsy/prompts → shared ✅
├── @agentsy/tools → shared ✅
│
├── @agentsy/ui → core, models, shared ❌ (should be shared only)
├── @agentsy/providers → core, tokenomics, shared ❌ (should be core + shared only)
├── @agentsy/tokenomics → core, observability, shared ❌ (should be shared only)
├── @agentsy/retrieval → core, shared ❌ (should be shared only)
├── @agentsy/memory → shared, tokenomics ❌ (should be shared only)
├── @agentsy/secrets → runtime, shared ❌ (should be shared only)
├── @agentsy/runtime → guardrails, memory, session, tokenomics, shared ❌ (should be shared only)
├── @agentsy/gateway → core, guardrails, models, observability, providers, secrets, tokenomics, shared ❌ (should be shared + optional injection only)
├── @agentsy/agents → core, runtime, shared ❌ (should be shared only)
└── @agentsy/orchestrator → core, gateway, memory, observability, runtime, shared ❌ (should be shared only)
```

**Composition roots (correct to have many deps)**:

- `@agentsy/daemon` → memory, observability, shared ✅ (composition root — will gain more deps as it hosts more services)
- `@agentsy/cli` → many ✅ (composition root — thin client that wires everything)
- `@agentsy/testing` → many ✅ (test utility)
- `@agentsy/vscode` → core, providers, ui, shared ✅ (composition surface)

### 45.2 Target Architecture: Dependency Injection + Peer Dependencies

The fix is not to remove the functionality that crosses package boundaries, but to invert the dependency direction. Packages that currently import other `@agentsy/*` packages at runtime should instead:

1. **Define interfaces in `@agentsy/shared`** — any type that crosses a package boundary (e.g. `MemoryProvider`, `GuardrailPipeline`, `TokenTracker`, `ObservabilitySink`) must be defined as an interface in `shared`, not in the implementing package.
2. **Accept dependencies via constructor injection** — instead of importing `@agentsy/tokenomics` at the top of `@agentsy/memory`, the memory package accepts a `TokenTracker?` (optional) in its constructor options.
3. **Use `peerDependencies` + `optionalDependencies`** — when a package *can* use another package but doesn't *require* it, declare it as a peer/optional dep, not a hard dep. Example: `@agentsy/gateway` *can* use `@agentsy/guardrails` for ethics filtering, but should work without it.
4. **Never import implementation from another package** — only import types/interfaces from `@agentsy/shared`.

### 45.3 Package-by-package fixes

#### 45.3.1 `@agentsy/ui` — remove `core` and `models` deps

**Current**: imports from `@agentsy/core` (stream types) and `@agentsy/models` (model metadata for display).
**Fix**: Move the stream-display types and model-display types to `@agentsy/shared`. UI package becomes `@agentsy/ui → @agentsy/shared` only.

#### 45.3.2 `@agentsy/providers` — remove `tokenomics` dep

**Current**: imports `@agentsy/tokenomics` for cost tracking during provider calls.
**Fix**: Define a `CostReporter` interface in `@agentsy/shared`. Providers accept an optional `CostReporter?` in their constructor. The daemon injects the real `TokenTracker` (from tokenomics) at composition time. `@agentsy/providers → @agentsy/core, @agentsy/shared` only.

#### 45.3.3 `@agentsy/tokenomics` — remove `core` and `observability` deps

**Current**: imports `@agentsy/core` (stream chunk types for token counting) and `@agentsy/observability` (for metric reporting).
**Fix**: Define `StreamChunk` (or the minimal token-counting subset) in `@agentsy/shared`. Define a `MetricsSink` interface in `@agentsy/shared`. Tokenomics accepts an optional `MetricsSink?`. `@agentsy/tokenomics → @agentsy/shared` only.

#### 45.3.4 `@agentsy/retrieval` — remove `core` dep

**Current**: imports `@agentsy/core` for stream/structured types.
**Fix**: The retrieval package should only depend on `@agentsy/shared`. Move any shared types it needs from `core` to `shared`. `@agentsy/retrieval → @agentsy/shared` only. **This package must remain independently consumable by third-party apps** — it's a RAG retrieval library, not an agentsy-internal module.

#### 45.3.5 `@agentsy/memory` — remove `tokenomics` dep

**Current**: imports `@agentsy/tokenomics` for budget tracking during memory operations.
**Fix**: Define a `BudgetProvider` interface in `@agentsy/shared`. Memory accepts an optional `BudgetProvider?`. The daemon injects the real `TokenTracker` at composition time. `@agentsy/memory → @agentsy/shared` only.

#### 45.3.6 `@agentsy/secrets` — remove `runtime` dep

**Current**: imports `@agentsy/runtime` for... (needs investigation — likely tool execution context or session context).
**Fix**: Define the minimal interface secrets needs in `@agentsy/shared`. Accept it via constructor injection. `@agentsy/secrets → @agentsy/shared` only.

#### 45.3.7 `@agentsy/runtime` — remove `guardrails`, `memory`, `session`, `tokenomics` deps

**Current**: imports 4 other packages — this is the worst offender. The runtime directly imports `GuardrailPipeline`, `MemoryEngine`, `SessionStore`, and `TokenTracker`.
**Fix**: Define `GuardrailPipelineInterface`, `MemoryProvider`, `SessionProvider`, `BudgetProvider` interfaces in `@agentsy/shared`. Runtime accepts all four as optional constructor injections. The daemon wires the real implementations. `@agentsy/runtime → @agentsy/shared` only.

This is the biggest change — the runtime becomes a pure execution engine that doesn't know about guardrails, memory, sessions, or tokenomics until the daemon injects them.

#### 45.3.8 `@agentsy/gateway` — remove `core`, `guardrails`, `models`, `observability`, `providers`, `secrets`, `tokenomics` deps

**Current**: imports 7 other packages. This contradicts the Phase 5 goal of an independently consumable gateway.
**Fix**: The gateway already has the `ProviderEthicsPolicyHook` and `PersistenceAdapter` interfaces (Phase 5 design). Extend the same pattern:

- `ModelRegistry` accepts `ModelEntry[]` (plain data — no `@agentsy/models` import)
- `HealthRegistry` accepts an optional `MetricsSink?` (no `@agentsy/observability` import)
- `QuotaRegistry` accepts an optional `BudgetProvider?` (no `@agentsy/tokenomics` import)
- Provider ethics is already via `ProviderEthicsPolicyHook` (no `@agentsy/guardrails` import)
- Provider adapters are passed in via `registerProvider()` (no `@agentsy/providers` import)
- Secret resolution is via an optional `SecretResolver?` (no `@agentsy/secrets` import)
- Core stream types moved to `@agentsy/shared` (no `@agentsy/core` import)

`@agentsy/gateway → @agentsy/shared` only (plus `peerDependencies` for optional integrations).

#### 45.3.9 `@agentsy/agents` — remove `core` and `runtime` deps

**Current**: imports `@agentsy/core` (stream types) and `@agentsy/runtime` (agent execution).
**Fix**: Agent specs (YAML templates) are pure data — they should only need `@agentsy/shared` for their types. The runtime integration is via injection. `@agentsy/agents → @agentsy/shared` only.

#### 45.3.10 `@agentsy/orchestrator` — remove `core`, `gateway`, `memory`, `observability`, `runtime` deps

**Current**: imports 5 other packages.
**Fix**: The orchestrator accepts all dependencies via constructor injection: `RuntimeEngine?`, `Gateway?`, `MemoryProvider?`, `ObservabilitySink?`. `@agentsy/orchestrator → @agentsy/shared` only.

### 45.4 Types that need to move to `@agentsy/shared`

The following types are currently defined in their implementation packages but are imported by other packages. They must move to `@agentsy/shared` (as interfaces/types only — implementations stay in their packages):

| Type | Currently in | Used by | Action |
|---|---|---|---|
| `StreamChunk`, `NormalizedChunk` | `core` | providers, tokenomics, ui, retrieval, gateway | Move to shared |
| `CompletionRequest`, `CompletionResponse` | `core` | providers, gateway | Move to shared |
| `Message` | `core` | runtime, agents, orchestrator | Move to shared |
| `ToolDefinition`, `ToolResult` | `core` | runtime, tools, agents | Move to shared |
| `ModelEntry`, `ModelTier` | `models` | gateway, ui | Move to shared |
| `GuardrailResult`, `GuardrailPhase` | `guardrails` | runtime | Define interface in shared; implementation stays in guardrails |
| `MemoryProvider` | `memory` | runtime, orchestrator | Define interface in shared |
| `SessionProvider` | `session` | runtime | Define interface in shared |
| `TokenTracker`, `BudgetProvider` | `tokenomics` | providers, memory, runtime | Define interface in shared |
| `ObservabilitySink`, `MetricsSink` | `observability` | tokenomics, gateway, orchestrator | Define interface in shared |
| `CostReporter` | (new) | providers | Define in shared |
| `SecretResolver` | (new) | gateway | Define in shared |
| `HealthRecord`, `QuotaSnapshot` | `gateway` | (stays — gateway owns these) | No action |

`@agentsy/shared` becomes the **interface contract layer** — it contains all types and interfaces that cross package boundaries, with zero runtime code. Packages import from `shared` for types; they accept implementations via constructor injection.

### 45.5 Eliminate `@agentsy/renderers` (complete the merge)

Phase 2 was supposed to merge `renderers` into `ui` and eliminate the package. The npm package `@agentsy/renderers` (0.1.2) is still published. Action:

1. Ensure all renderer source code is under `packages/ui/src/renderers/` (already done in Phase 2)
2. **Deprecate** `@agentsy/renderers` on npm — publish a final 0.1.3 with a deprecation notice in README and a postinstall warning
3. Remove `@agentsy/renderers` from all `package.json` dependencies across the monorepo
4. Update `@agentsy/ui` to re-export everything that `@agentsy/renderers` used to export (already done — verify)
5. Add a redirect in `@agentsy/ui`'s README pointing `renderers` consumers to `ui`

### 45.6 `@agentsy/types` → `@agentsy/shared` migration

The old `@agentsy/types` package (published as 0.1.1 on npm) was merged into `@agentsy/shared` in Phase 2. Action:

1. **Deprecate** `@agentsy/types` on npm — publish a final 0.1.2 that re-exports from `@agentsy/shared` with a deprecation warning
2. Ensure no package in the monorepo imports from `@agentsy/types` (all should use `@agentsy/shared`)
3. Update external consumers via README

### 45.7 Published packages (current and target)

**Currently published on npm** (verified 2026-06-17):

| Package | Version | Status |
|---|---|---|
| `@agentsy/core` | 0.2.0 | ✅ Published, zero deps — clean |
| `@agentsy/providers` | 0.2.0 | ✅ Published, zero deps — clean (but has `tokenomics` dep in repo; published version may differ) |
| `@agentsy/context` | 0.2.4 | ✅ Published, zero deps — clean |
| `@agentsy/types` | 0.1.1 | ⚠️ Published but deprecated — merged into `shared` |
| `@agentsy/ui` | 0.1.1 | ✅ Published, zero deps — clean |
| `@agentsy/renderers` | 0.1.2 | ⚠️ Published but deprecated — merged into `ui` |

**Target: publish after Phase 29 cleanup**:

| Package | Deps after cleanup | Notes |
|---|---|---|
| `@agentsy/shared` | (none) | Base layer — all cross-package types/interfaces |
| `@agentsy/core` | shared | Stream processing, SSE, XML filter, structured JSON |
| `@agentsy/providers` | core, shared | Provider normalizers + UniversalClient |
| `@agentsy/gateway` | shared | Independent routing library (peerDeps for optional integrations) |
| `@agentsy/guardrails` | shared | Safety/ethics pipeline |
| `@agentsy/observability` | shared | OTel tracing, metrics, Langfuse |
| `@agentsy/retrieval` | shared | RAG retrieval (independently consumable by third-party apps) |
| `@agentsy/models` | shared | Model selection/profiles |
| `@agentsy/tokenomics` | shared | Token management, quotas, ROI |
| `@agentsy/ui` | shared | UI store/bridge + Ink/TUI rendering |
| `@agentsy/vscode` | core, providers, ui, shared | VS Code integration (composition surface) |
| `@agentsy/tools` | shared | Tool implementations |
| `@agentsy/prompts` | shared | Prompt layering |
| `@agentsy/secrets` | shared | Secret management (12 backends) |
| `@agentsy/agents` | shared | Agent specs/templates |

**Composition roots (not independently publishable — they wire everything together)**:

- `@agentsy/runtime` → shared (accepts guardrails, memory, session, tokenomics via injection)
- `@agentsy/orchestrator` → shared (accepts runtime, gateway, memory, observability via injection)
- `@agentsy/daemon` → memory, observability, shared (will gain more as it hosts more services)
- `@agentsy/cli` → many (thin client)
- `@agentsy/testing` → many (test utility)

### 45.8 Verification

- [ ] `@agentsy/shared` contains all cross-package interface types (StreamChunk, Message, ToolDefinition, ModelEntry, GuardrailResult interface, MemoryProvider, SessionProvider, TokenTracker interface, ObservabilitySink, CostReporter, SecretResolver)
- [ ] `@agentsy/ui` depends only on `@agentsy/shared`
- [ ] `@agentsy/providers` depends only on `@agentsy/core` and `@agentsy/shared`
- [ ] `@agentsy/tokenomics` depends only on `@agentsy/shared`
- [ ] `@agentsy/retrieval` depends only on `@agentsy/shared`
- [ ] `@agentsy/memory` depends only on `@agentsy/shared`
- [ ] `@agentsy/secrets` depends only on `@agentsy/shared`
- [ ] `@agentsy/runtime` depends only on `@agentsy/shared`
- [ ] `@agentsy/gateway` depends only on `@agentsy/shared` (plus peerDeps for optional integrations)
- [ ] `@agentsy/agents` depends only on `@agentsy/shared`
- [ ] `@agentsy/orchestrator` depends only on `@agentsy/shared`
- [ ] `@agentsy/renderers` deprecated on npm (0.1.3 with deprecation notice)
- [ ] `@agentsy/types` deprecated on npm (0.1.2 re-exporting from shared)
- [ ] No monorepo package imports from `@agentsy/renderers` or `@agentsy/types`
- [ ] `fallow dead-code` passes with no new findings
- [ ] `pnpm check-types && pnpm lint && pnpm test` green across all packages
- [ ] Each independently-publishable package can be `pnpm build` and `pnpm test` in isolation without errors

---
