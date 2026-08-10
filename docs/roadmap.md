# Roadmap

This roadmap tracks implementation direction against the canonical plan in `plan/00-overview.md`. The current execution order for dogfood-first delivery lives in `plan/INDEX.md`.

## Status of sandbox isolation

- [✅] `VirtualSandbox` moved to `worker_threads` (or compatible async execution) to prevent main-thread hangs.
- [✅] `VirtualSandbox` supports hard timeouts with automatic termination.
- [🔄] `ContainerSandbox` (Rivet) promoted from 'Investigation' to 'Implementation'.
- [🔄] Drafting `RivetSandbox` provider for the `SandboxRouter`.
- [✅] Implemented virtual sandbox with hybrid architecture supporting both virtual first and container fallback.
- [🔄] Dogfood implementation is now tracked in `plan/INDEX.md`.

## Snapshot (May 2026)

### Established package foundations

The monorepo has active manifest-backed packages for:

- core processing (`@agentsy/core`)
- providers (`@agentsy/providers`)
- orchestration/runtime (`@agentsy/orchestrator`, `@agentsy/runtime`)
- session/memory/tokens (`@agentsy/session`, `@agentsy/memory`, `@agentsy/context`)
- integrations/surfaces (`@agentsy/vscode`, `@agentsy/cli`, `@agentsy/ui`, `@agentsy/renderers`)
- platform support packages (`@agentsy/types`, `@agentsy/tools`, `@agentsy/plugins`, `@agentsy/observability`, `@agentsy/prompts`, `@agentsy/secrets`)

### Plan-only domains to promote

The following domains existed as implementation plans and are now manifest-backed packages (Phase 11 complete):

- ✅ `packages/connectors` — Platform connectors (Discord, Slack, Telegram)
- ✅ `packages/guardrails` — Safety and validation boundaries
- ✅ `packages/mcp` — Model Context Protocol types and utilities
- ✅ `packages/retrieval` — RAG retrieval and indexing

## Execution priorities

### Priority 1 — boundary consistency and hardening

- Keep core/providers boundaries explicit and consistent in code/docs.
- Continue package-level implementation plan execution on manifest-backed packages.
- Preserve runtime/orchestrator split and session durability invariants.
- Follow `plan/INDEX.md` for CLI-first implementation order.

### Priority 2 — domain promotion (complete)

All plan-only domains have been promoted to manifest-backed packages (Phase 11):

- ✅ `packages/connectors`
- ✅ `packages/guardrails`
- ✅ `packages/mcp`
- ✅ `packages/retrieval`

Each promotion included:

- package manifest and exports
- build/typecheck/test integration
- migration and package docs updates

### Priority 3 — cross-domain integration quality

- tighten provider fallback/routing behavior
- strengthen runtime approval/policy controls
- deepen memory/retrieval integration surfaces
- maintain observability and token-governance feedback loops

## Quality gates

All roadmap work is gated by:

- `pnpm build`
- `pnpm check-types`
- `pnpm test`

And by architecture governance:

- no circular dependency regressions
- no stale package-boundary claims in docs
- package-level plans and master plan kept in sync for boundary-impacting changes

## What changed recently

- `plan/agentsy-platform-v2.md` was retired after consolidation.
- Master planning authority moved to `plan/00-overview.md`.
- Roadmap now reflects repository reality (manifest-backed vs plan-only domains) rather than historical package assumptions.
- **Phase 11 complete**: All plan-only domains (`connectors`, `guardrails`, `mcp`, `retrieval`) promoted to manifest-backed packages. CLI config system, MCP CLI, connectors CLI, and guardrails CLI integrated. Integration tests pass with MSW mocks covering all network calls.
