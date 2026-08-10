# @agentsy/cli

CLI utilities for the Agentsy monorepo.

## Status

Internal package; APIs and scripts may evolve.

## Operator commands

- `setup [memory|vscode] [--json]`
- `doctor [memory|vscode] [--json]`

Framework-wide setup and doctor ownership belongs to this package. Lower-level packages expose reusable diagnostics or setup hints; the CLI owns the human-facing command experience.

## Existing development commands

- `compress --level <lite|full|ultra> --text <content>`
- `compress --level <lite|full|ultra> --file <path>`
- `compress-memory --file <path>` (writes backup to `<path>.original.md`)
- `memory-sync-dev [--json] [--server-db <path>] [--replica-db <path>] [--bind <host:port>] [--server-url <url>] [--sync-interval-ms <ms>]`

## Local Turso sync server wiring

Use the `memory-sync-dev` command to print a local development wiring example for the Turso sync server flow used by `@agentsy/memory`.

- default server command: `tursodb ./.agentsy/local-sync-server.db --sync-server 0.0.0.0:8080`
- default client URL: `http://localhost:8080`
- auth token: omitted for local sync server development

Example:

- `memory-sync-dev`
- `memory-sync-dev --json`

## Dogfood implementation order

This package is governed by [`plan/INDEX.md`](../../plan/INDEX.md). CLI work should follow the phase order in that plan, starting with the Phase 1 foundation and then the streaming chat slice.

## Testing

CLI E2E tests use [`@microsoft/tui-test`](https://github.com/microsoft/tui-test) — a Playwright-inspired terminal testing framework that spawns real PTY sessions.

### Running tests

```bash
# Unit tests (Vitest)
pnpm test

# E2E terminal tests (builds CLI, then runs tui-test)
pnpm test:e2e

# E2E tests only (assumes dist/ is already built)
pnpm test:e2e:dev
```

### E2E test specs

Located in `src/e2e/`:

| Spec | Covers |
|---|---|
| `compress.spec.ts` | `compress --text`, `--file`, invalid level, missing input |
| `compress-memory.spec.ts` | `compress-memory --file`, `--no-backup`, missing flag |
| `memory-sync-dev.spec.ts` | `memory-sync-dev`, `--json`, custom flags, invalid args |
| `chat.spec.ts` | `/exit`, message send, `/help` |
| `cli-basics.spec.ts` | Unknown command, default entry, supported command list |
| `setup.spec.ts` | `setup`, `setup --json`, target selection |
| `doctor.spec.ts` | `doctor`, `doctor --json`, target selection |

### Adding tests for new commands

When adding a new CLI command:

1. Add unit tests alongside the command source (`.test.ts` colocated with source)
2. Create a `src/e2e/<command>.spec.ts` file with a tui-test spec
3. Run `pnpm test:e2e` to verify
4. Update this README's spec table
