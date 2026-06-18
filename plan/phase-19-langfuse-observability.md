
## 24. Phase 19 — Langfuse Observability Integration ✅ COMPLETE

> **2026-06-18**: Fully implemented. See verification checklist below.
>
> ✅ **2026-06-17 Audit Finding — Partial Completion**: `LangfuseExporter` and `OtlpExporter` are
> **already fully implemented** in `packages/observability/src/exporters/`. The exporter layer is
> done. Phase 19 scope is therefore **reduced** to:
>
> 1. Wiring `LangfuseExporter` into the daemon's `ServiceHost` at startup (controlled by `DaemonConfig.observability.langfuse.*`).
> 2. Propagating `sessionId` and `agentId` as OTel resource attributes from the daemon through the gateway and provider calls.
> 3. Adding `agentsy.cost_usd`, `agentsy.model`, and `agentsy.provider` span attributes from tokenomics.
> 4. Writing a `langfuse.test.ts` integration test (use mock OTLP server, verify span shape).
>
> **Revised story points**: 3 SP (down from 6 SP). Original 6 SP estimate included building the exporter from scratch.

**Priority**: P2 — Sprint 1 (parallel track, can run from day one)
**Story points**: 6
**Branch**: `feat/langfuse-observability`
**Depends on**: Phase 1 ✅ (daemon foundation — engine attaches to daemon lifecycle)
**Unblocks**: Phase 13 §18.7 (langeval integration — langeval's Trace Debugger uses the same Langfuse instance)
**Closes**: nothing from the guardrails gap analysis; closes the "daemon has no observability wiring" gap surfaced during remediation review
**Full plan**: see `/home/z/my-project/download/agentsy-langfuse-integration-plan.md` (523 lines, 13 sections)
**Note**: The Langfuse instance wired in this phase is shared with langeval (Phase 13 §18.7). langeval's Trace Debugger uses Langfuse under the hood — when Phase 13 lands, the same Langfuse instance serves both agentsy's runtime tracing (every LLM call, tool call, guardrail decision) and langeval's evaluation tracing (every persona simulation, red-team attack, eval score). This means agents can see their own traces alongside the eval results that judged them — a powerful debugging loop.

### 24.1 Goal

When a user sets `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` in their shell or `.env` file, the agentsy daemon should automatically wire a Langfuse exporter into the observability engine at startup — no code changes, no CLI flags. When the vars are absent, the daemon continues as before with observability disabled. The integration follows the official Langfuse OTLP quickstart at <https://langfuse.com/docs/observability/get-started>.

### 24.2 Current State

A `LangfuseExporter` class already exists in `packages/observability/src/exporters/langfuse.ts` (extends `OtlpExporter` with Basic auth from `publicKey`/`secretKey`, default endpoint is Langfuse Cloud's OTLP URL). But it is never instantiated anywhere — the daemon does not import `@agentsy/observability` at all. No `.env` loader exists in the repo. The `DaemonConfig.metrics.otelEndpoint` field is unused.

### 24.3 Design

**Env-var contract**:

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | ✅ | — | Public key (Basic auth username) |
| `LANGFUSE_SECRET_KEY` | ✅ | — | Secret key (Basic auth password) |
| `LANGFUSE_HOST` | optional | `https://cloud.langfuse.com` | Self-hosted instance root; OTLP path appended automatically |
| `LANGFUSE_PROJECT_ID` | optional | — | Sent as `X-Langfuse-Project` header |
| `LANGFUSE_FLUSH_INTERVAL_MS` | optional | `5000` | Flush interval in ms |
| `LANGFUSE_MAX_BATCH_SIZE` | optional | `64` | Max batch size before forced flush |

**Detection rule**: Langfuse is enabled if and only if both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are present and non-empty after trimming.

**`.env` loading**: Node 22 native `process.loadEnvFile()` — no `dotenv` dependency. Files loaded in priority order: `.env.local` (highest), then `.env`. Existing `process.env` values are never overridden. Missing files are silent.

**Three-layer API in `@agentsy/observability`**:

1. `detectLangfuseFromEnv(env?)` — pure detection, returns `{ enabled, endpoint, reason }`
2. `createLangfuseExporterFromEnv(options?)` — constructs exporter or returns `null`
3. `createObservabilityFromEnv(options)` — builds engine, attaches sinks, returns `{ engine, sinks }`

**DaemonConfig extension** — new `observability` section:

```typescript
observability: z.object({
  enabled: z.boolean().default(true),                    // master switch
  serviceName: z.string().default('agentsy-daemon'),
  serviceVersion: z.string().default('0.0.0'),
  langfuse: z.object({
    enabled: z.boolean().default(true),                  // set false to skip auto-detection
    endpoint: z.string().optional(),
    publicKey: z.string().optional(),                    // overrides env var
    secretKey: z.string().optional(),                    // overrides env var
    projectId: z.string().optional(),
    flushIntervalMs: z.number().int().positive().optional(),
    maxBatchSize: z.number().int().positive().optional(),
    headers: z.record(z.string()).optional()
  }).default({}),
  envFiles: z.array(z.string()).default(['.env.local', '.env'])
}).default({})
```

**Daemon wiring**: constructor calls `loadDotenv()` then `createObservabilityFromEnv()` (both in try/catch — misconfiguration logs a warning and continues with observability disabled). `start()` logs each sink. `stop()` calls `observability.shutdown()` before `db.close()` so pending spans flush while DB is still open. `getStatus()` exposes `observability: { enabled, sinks }`.

### 24.4 File-by-File Change List

**Modified** (7 files):

- `packages/observability/src/exporters/langfuse.ts` — add `LANGFUSE_ENV_VARS`, `detectLangfuseFromEnv()`, `createLangfuseExporterFromEnv()`
- `packages/observability/src/exporters/index.ts` — re-export new symbols
- `packages/observability/src/index.ts` — re-export from root entry
- `packages/observability/README.md` — replace 8-line stub with full Langfuse docs
- `packages/daemon/src/config.ts` — add `observability` section to `DaemonConfigSchema`
- `packages/daemon/src/daemon.ts` — import `@agentsy/observability`, add `observability`/`observabilitySinks` fields, wire `loadDotenv()` + `createObservabilityFromEnv()` into constructor, log sinks in `start()`, call `observability.shutdown()` in `stop()`, add to `getStatus()`
- `packages/daemon/package.json` — add `"@agentsy/observability": "workspace:*"` to dependencies

**New** (2 files):

- `packages/observability/src/auto-init.ts` — `createObservabilityFromEnv()` and supporting types
- `packages/daemon/src/env.ts` — `loadDotenv()` helper using Node 22 native `process.loadEnvFile()`

**New tests** (3 files):

- `packages/observability/src/exporters/langfuse.test.ts` — ~12 cases for detection and construction
- `packages/observability/src/auto-init.test.ts` — ~5 cases for the top-level helper
- `packages/daemon/src/env.test.ts` — ~12 cases for `.env` loading (uses `mkdtempSync` for isolation)

**Untouched**: `otlp.ts`, `core/*`, orchestrator hooks, `instrumentation/*`, `redaction.ts`.

### 24.5 Edge Cases

17 scenarios covered in the full plan, including: malformed `.env` (log + continue), missing vars (silent disable), `LANGFUSE_HOST` path appending (with/without trailing slash, with/without existing OTLP path), invalid integers (fall back to defaults), exporter construction failure (log + disable), shutdown flush ordering (before DB close), shell-vs-file precedence (shell wins), config-vs-env precedence (config wins).

### 24.6 Expected Startup Logs

**Langfuse enabled**:

```text
[daemon] observability: langfuse enabled — Loaded from LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY; endpoint=https://cloud.langfuse.com/api/public/otlp/v1/traces
```

**Langfuse disabled (missing vars)**:

```text
[daemon] observability: langfuse disabled — Missing LANGFUSE_PUBLIC_KEY and/or LANGFUSE_SECRET_KEY env vars
```

**Langfuse disabled by config**:

```text
[daemon] observability: langfuse disabled — Disabled by config (langfuseEnabled = false)
```

### 24.7 Out of Scope

1. **Redaction wiring fix** — tracked separately in v2.3 remediation plan Appendix A ("Redaction Not Wired"). Until that lands, treat the Langfuse dashboard as potentially containing raw prompt content.
2. **Other OTLP backends** (Honeycomb, Datadog, Jaeger) — follow the same Layer 3 pattern; deferred.
3. **Provider-level instrumentation** — `instrumentation/provider.ts` already wraps `UniversalClient.complete()`/`stream()`; will automatically benefit when the daemon-owned engine becomes the active tracer. No new code needed.
4. **Langfuse native SDK** — uses OTLP path only, per Langfuse "get started" docs recommendation.
5. **Langfuse evaluations / scores** — natural follow-up after guardrails Phase 9 detectors land.
6. **Langfuse prompt management** — separate, larger effort.
7. **`.env` file watching / hot-reload** — daemon loads `.env` once at startup; changes require restart. Matches `dotenv` conventions.

### 24.8 Rollout

**Branch**: `feat/langfuse-observability` from `develop`.

**Commit sequence** (7 commits, each leaves build green):

1. `feat(observability): add detectLangfuseFromEnv + createLangfuseExporterFromEnv`
2. `feat(observability): add createObservabilityFromEnv auto-init helper`
3. `feat(observability): rewrite README with Langfuse integration docs`
4. `feat(daemon): add loadDotenv helper using Node 22 native loadEnvFile`
5. `feat(daemon): add observability section to DaemonConfig`
6. `feat(daemon): wire observability engine into daemon lifecycle`
7. `docs: add Langfuse quick start to observability README`

**Verification gates**:

- `pnpm check-types && pnpm lint && pnpm test` green across both packages
- Manual smoke: env vars set → daemon logs "langfuse enabled" → trace appears in Langfuse dashboard
- Manual smoke: env vars absent → daemon logs "langfuse disabled" → daemon works normally
- Manual smoke: `observability.langfuse.enabled: false` in config → "disabled by config" log
- Manual smoke: malformed `.env` → warning logged, daemon continues
- `agentsy status` shows `observability: { enabled, sinks }`

**Backward compatibility**: no existing public API removed. Existing configs without `observability:` section continue to work — but Langfuse will auto-enable if env vars are present. Users with `LANGFUSE_*` set for other tools must set `observability.langfuse.enabled: false` to opt out. Document in README and upgrade notes.

### 24.9 Verification ✅

- [x] `detectLangfuseFromEnv` handles all env-var combinations (missing, partial, both, whitespace, empty, `LANGFUSE_HOST` path variants)
- [x] `createLangfuseExporterFromEnv` returns `null` on missing vars, returns exporter on present vars, honors optional vars, validates integers, overrides take precedence
- [x] `createObservabilityFromEnv` returns engine with disabled sink on empty env, enabled sink on present env, respects `langfuseEnabled: false`
- [x] `loadDotenv` loads `.env`, prioritizes `.env.local`, does not override existing `process.env`, throws on malformed file, silent on missing file
- [x] `DaemonConfig.observability` schema accepts all fields with correct defaults
- [x] Daemon constructor calls `loadDotenv()` then `createObservabilityFromEnv()`
- [x] Daemon `start()` logs each sink with enabled/disabled + reason
- [x] Daemon `stop()` calls `observability.shutdown()` before `db.close()`
- [x] `agentsy status` shows observability wiring
- [x] Manual smoke: Langfuse dashboard receives traces
- [x] `pnpm check-types && pnpm lint && pnpm test` green

---
