

## 7. Phase 2 — Package Consolidation ✅ COMPLETE

**Status**: PARTIALLY COMPLETE — 4 of 6 merges fully landed; 2 require cleanup (see §7.5).
**Story points**: 2 (actuals reconciled at merge).
**What shipped**: 27 → 25 packages in concept. `pnpm install && pnpm build && pnpm test` green.

> ⚠️ **2026-06-17 Audit Finding**: Four packages remain as filesystem artifacts after the merge:
> - `packages/renderers/` — `src/` deleted (ghost directory only). Clean up root dir in Phase 29.
> - `packages/types/` — `src/` deleted (ghost directory only). Clean up root dir in Phase 29.
> - `packages/mcp/` — **live source files still present** (`diagnostics.ts`, `types.ts`, `index.ts`) alongside `packages/daemon/src/mcp/`. Merge is incomplete. Tracked in Phase 29.
> - `packages/connectors/` — **live source files still present** (`connector-host.ts`, `discord.ts`, `slack.ts`, `telegram.ts`, `types.ts`) alongside `packages/daemon/src/connectors/`. Merge is incomplete. Tracked in Phase 29.
>
> The `mcp/` and `connectors/` duplication creates import ambiguity and a potential for divergent implementations. Phase 29 must fully remove the root-level stubs and ensure `@agentsy/daemon` is the canonical host.

| Merged | Into | Rationale |
|---|---|---|
| `workflows` (1 file, plan-only) | `orchestrator` | Workflows are orchestrated task sequences |
| `types` (27) | `shared` | Cross-package types belong with shared utilities; `@agentsy/shared` already hosts CortexKit context tables |
| `renderers` (120) | `ui` | Codebase rename `renderers`→`ui` already landed; 120-file Ink/TUI tree now lives under `packages/ui/src/renderers/` |
| `scripts` (20) | root `scripts/` | Build/release scripts don't need a package |
| `mcp` (11) | `daemon` | MCP server is daemon-hosted |
| `connectors` (13) | `daemon` | Third-party connectors are daemon-hosted |

**Preserved**: `@agentsy/vscode` (75 files) — published npm library consumed by third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat. ACP (agent–editor communication) and `@agentsy/vscode` (provider↔Copilot Chat integration) are complementary, not overlapping.

**Post-consolidation layout** (25 packages + root scripts):
```
packages/
├── daemon/        ← Central process (absorbs mcp, connectors)
├── core/          ← Stream processing, SSE, tool calls, retry
├── providers/     ← LLM provider adapters (14 providers)
├── gateway/       ← Becomes thin daemon client (Phase 5)
├── memory/        ← Cognitive memory engine
├── orchestrator/  ← Absorbs workflows; council, hooks, routing
├── runtime/       ← Agent turn loop, hooks execution
├── tokenomics/    ← Token management, quotas, frustration signals
├── shared/        ← Absorbs types; shared type definitions and utilities
├── ui/            ← Absorbs renderers; Ink/TUI rendering + UI store/bridge
├── models/        ← Model selector/profiles
├── tools/         ← Tool registry + builtins
├── secrets/       ← Secret injection/providers
├── guardrails/    ← Safety/policy/PII
├── observability/ ← OTel/tracing/cost
├── session/       ← Session management
├── retrieval/     ← Search/indexing (Phase 7 moves logic into daemon)
├── testing/       ← Test helpers/MSW/aimock
├── agents/        ← Agent runtime/specs
├── plugins/       ← Plugin system
├── prompts/       ← Prompt layering
├── vscode/        ← Copilot Chat integration library (published)
├── cli/           ← Thin daemon client + TUI
└── (bootstrap/ ← NEW in Phase 15)
```

**Downstream consumers**: All subsequent phases operate on the 25-package layout. Phase 15 adds `@agentsy/bootstrap` as the 26th package.

---

