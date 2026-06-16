## Durability and long-horizon state

| Package | Role | Status | Docs |
| --- | --- | --- | --- |
| `@agentsy/context` | Context shaping primitives: compression, drift/coherence, compaction, rewind, and hydration helpers | Published | [Package page](./packages/agentsy-context.md) |
| `@agentsy/memory` | Memory engine, wiki/RAG, MCP server, lifecycle hooks, and sync | Published | [Package page](./packages/memory.md) |
| `@agentsy/session` | Session persistence, serialization, and branching | Published | [Package page](./packages/session.md) |
| `@agentsy/retrieval` | RAG retrieval and indexing | Published | [Package page](./packages/retrieval.md) |

## Provider and protocol integration

| Package | Role | Status | Docs |
| --- | --- | --- | --- |
| `@agentsy/providers` | Provider adapters, normalizers, and pipelines | Published | [Package page](./packages/providers.md) |
| `@agentsy/mcp` | Model Context Protocol types, utilities, and MCP CLI | Published | [Package page](./packages/mcp.md) |
| `@agentsy/gateway` | Model-tier routing, replica selection, failover, and health tracking | Internal | [Package page](./packages/gateway.md) |

> Routing authority now lives in `@agentsy/gateway`; model-replica routing details are documented in [Routing architecture](./architecture/routing-architecture.md).

## Surface and presentation

| Package | Role | Status | Docs |
| --- | --- | --- | --- |
| `@agentsy/renderers` | CLI, TUI, and renderers (plain text, streaming markdown, Ink components) | Published | [Package page](./packages/renderers.md) |
| `@agentsy/ui` | UI components and event sourcing | Published | [Package page](./packages/ui.md) |
| `@agentsy/vscode` | VS Code Language Model Chat Provider integration | Published | [Package page](./packages/vscode.md) |
| `@agentsy/cli` | CLI commands, config system, MCP CLI, connectors CLI, guardrails CLI | Published | [Package page](./packages/cli.md) |
| `@agentsy/connectors` | Platform connectors (Discord, Slack, Telegram) | Published | [Package page](./packages/connectors.md) |

## Orchestration and execution

| Package | Role | Status | Docs |
| --- | --- | --- | --- |
| `@agentsy/daemon` | Long-lived daemon process with IPC, ACP, subprocess management, and lifecycle orchestration | Internal | [Package page](./packages/daemon.md) |
| `@agentsy/orchestrator` | Agent orchestration and scheduling | Published | [Package page](./packages/orchestrator.md) |
| `@agentsy/runtime` | Agent execution runtime with sandboxing and AG-UI protocol adapter | Published | [Package page](./packages/runtime.md) |
| `@agentsy/guardrails` | Safety and validation boundaries | Published | [Package page](./packages/guardrails.md) |
