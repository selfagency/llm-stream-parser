

## 31. Master Verification Checklist

This checklist combines the guardrails gap analysis verification items (43 findings), the v2.3 success criteria, and the competitive P0 closures. Organized by phase.

### Phase 0 — Critical Bug Fixes ✅
- [x] All 9 bug fixes landed on `develop`
- [x] `UniversalClient` true streaming
- [x] Tool calls preserved in conversation history
- [x] Hook short-circuit patched (full redesign in Phase 3)
- [x] Gateway cost filter unit mismatch fixed
- [x] Retry quota map per-provider
- [x] Daemon restart orphan server fixed
- [x] Tool-call ID dedup uses provider-assigned ID
- [x] Retry jitter added
- [x] Provider error classification uses HTTP status + specific regexes

### Phase 1 — Daemon Foundation ✅
- [x] `@agentsy/daemon` package exists
- [x] `UnifiedDB` consolidates memory.db + context.db + tokenomics.db into `~/.agentsy/agentsy.db`
- [x] `AgentPool` (Piscina) wired
- [x] `JobScheduler` (Bree on Honker) wired
- [x] `SQLiteWorker` offloads SQLite to worker thread
- [x] `SubprocessManager` with stall detection and memory limits
- [x] REST control API
- [x] IPC server (JSON-RPC 2.0 over Unix sockets, Zod-validated)
- [x] ACP server stub
- [x] `TerminalBridge`, `ServiceHost`, `AgentHost`, `ScopeManager`, `Supervisor`
- [x] `DaemonConfig` schema
- [x] CLI integration (`agentsy daemon start|stop|status|logs`)

### Phase 2 — Package Consolidation ✅
- [x] 27 → 25 packages
- [x] `workflows` → `orchestrator`
- [x] `types` → `shared`
- [x] `renderers` → `ui`
- [x] `scripts` → root
- [x] `mcp` → `daemon`
- [x] `connectors` → `daemon`
- [x] `@agentsy/vscode` preserved
- [x] `pnpm install && pnpm build && pnpm test` green

### Phase 3 — Hook Pipeline Redesign + Claude-Code Hook Schema ✅
- [x] `RuntimeHookRegistry.fire()` composes transforms left-to-right
- [x] `stop` short-circuits the pipeline and returns `stoppedBy`
- [x] Claude-Code hook schema parser handles command/prompt/http/agent types
- [x] `if` filter prevents unnecessary hook spawns
- [x] `failUnsettledTools` fires on stream error
- [x] All existing tests pass (no regressions)

### Phase 4 — Guardrails Honest Foundation ✅
- [x] `EthicsRegistry` exists; every clause has `implementedBy` or is marked as a known gap
- [x] `GuardrailDecisionReceipt` type exists with all 7 fields (`policyId`, `decision`, `reasonCode`, `riskTier`, `surface`, `timestamp`, `correlationId`)
- [x] `quarantine` and `allow-with-approval` are distinct states in `GuardrailResult`
- [x] `transformReason` distinguishes `redaction` | `rewrite` | `normalization`
- [x] `escalate` is differentiated from `block` in the runtime hook
- [x] `JsonlAuditLogger` persists receipts with PII/secret redaction
- [x] One canonical `GuardrailsConfig`; duplicate in `packages/shared` removed
- [x] README matches actual exports; Policy Enforcement Status table present
- [x] `IMPLEMENTATION-PLAN.md` checkboxes audited
- [x] `safety-changelog.md` exists with backfilled entries
- [x] PR template includes ethics review checklist

### Phase 5 — Gateway Daemon Hosting & Independent Package
- [ ] `@agentsy/gateway` package is independently consumable (no daemon dependency required)
- [ ] `createGateway()` factory works with in-memory defaults
- [ ] `PersistenceAdapter` interface defined; `InMemoryPersistenceAdapter` is the default
- [ ] `UnifiedDBPersistenceAdapter` saves/loads quota state, health history, routing decisions, circuit-breaker state
- [ ] `ProviderEthicsPolicyHook` interface defined; pluggable via `GatewayOptions.ethicsPolicy`
- [ ] Daemon's `RoutingService` instantiates `createGateway()` with `UnifiedDBPersistenceAdapter` + Phase 20 ethics policy
- [ ] Daemon's `RoutingService` does NOT reimplement routing logic (delegates to `Gateway`)
- [ ] `GatewayClient` IPC shim provides same interface as `Gateway` over IPC
- [ ] `connectToDaemon(socketPath)` convenience factory works
- [ ] External consumer example works as documented
- [ ] Gateway package README published with quick start, API reference, and extension points
- [ ] Per-provider `QuotaRegistry` persists to `UnifiedDB` when daemon-hosted; in-memory when standalone
- [ ] Routing decisions logged for audit when daemon-hosted
- [ ] Daemon restart preserves quota state

### Phase 6 — Streaming Architecture ✅
- [x] `StreamManager` runs as a `Service` in the daemon
- [x] `wrapSSE` aborts on idle
- [x] `StreamingSecretsFilter` masks secrets across chunk boundaries
- [x] `failUnsettledTools` fires on stream error
- [x] ACP `session/update` notifications emitted for all event types

### Phase 7 — RAG as Daemon Service ✅
- [x] `RetrievalService` runs as a `Service` in the daemon
- [x] Background indexing job scheduled and runs
- [x] Vector index persists in `UnifiedDB.rag_vectors`
- [x] Wiki invariant enforced (only `kind: 'semantic'` items indexed)

### Phase 8 — Learning Loop & Background Jobs
- [ ] `LearningJob` runs as a Bree-scheduled job
- [ ] Event bus uses Honker NOTIFY/LISTEN for cross-process wake
- [ ] Canary and observation events trigger learning immediately

### Phase 9 — Guardrails Behavioral Detectors
- [ ] `SycophancyScanner` exists with 20+ fixtures
- [ ] `AnthropomorphismScanner` exists with 20+ fixtures
- [ ] `DependencyScanner` exists with multi-turn fixtures (requires `SessionState`)
- [ ] `HighRiskDomainScanner` exists with fixtures for all 8 domains
- [ ] `DarkPatternScanner` exists (output phase) with 20+ fixtures
- [ ] `PrivacyScanner` exists with memory-disclosure fixtures
- [ ] `AGIFramingScanner` exists with 20+ fixtures
- [ ] `ProfessionalDisplacementScanner` exists with 20+ fixtures
- [ ] `BiasScanner` exists (runtime portion) with 20+ fixtures
- [ ] All 9 scanners wired into the default pipeline
- [ ] `EthicsRegistry.implementedBy` fields updated for all 9 clauses

### Phase 10 — Guardrails Missing Surfaces & Interaction Safeguards (+ §15.7 Ingress Extension)
- [ ] `GuardrailPhase` includes `retrieval`, `memory`, `action`, `egress`
- [ ] `RetrievalFirewallScanner` exists (runs `PromptInjectionScanner` on retrieved content — closes E-35)
- [ ] `MemoryPoisoningScanner` exists
- [ ] `ActionScanner` exists
- [ ] `EgressScanner` exists
- [ ] `SessionState` threaded through the pipeline (`turnCount`, `reassuranceSeekingCount`, `emotionalIntensityScore`, `scopeDeclarations`, `lastScopeDriftTurn`, `crisisMode`, `sensitiveContextActive`)
- [ ] `InteractionSafeguardsScanner` exists
- [ ] `CrisisEscalationScanner` exists (with `crisisResources` in receipt)
- [ ] `ScopeDriftScanner` exists
- [ ] Runtime hooks exist for `PreRetrieval`, `PostRetrieval`, `PreMemoryWrite`, `PreAction`, `PreEgress`
- [ ] Hook context includes `conversationHistory`, `sessionState`, `agentScopeDeclaration`
- [ ] **§15.7: `IngressScanner` exists and scans response bodies for prompt injection**
- [ ] **§15.7: MCP stdio server responses scanned before reaching the agent**
- [ ] **§15.7: MCP HTTP/SSE server responses scanned**
- [ ] **§15.7: `http_fetch` tool responses scanned; oversized responses disk-spilled**
- [ ] **§15.7: `SubprocessSpec.networkPolicy` field honored (allow-all | allowlist | block-all | proxy-inspect)**
- [ ] **§15.7: `HTTP_PROXY` / `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` / `GIT_SSL_CAINFO` injected into subprocess env when `proxy-inspect` is set (plumbing for Phase 25)**

### Phase 11 — Scope Accountability, Request Classification & High-Risk Domains
- [ ] `ScopeDeclaration` type exists
- [ ] `ScopeDeclarationScanner` enforces it; agent YAML specs consumed
- [ ] `ScopeDriftScanner` (from Phase 10) consumes `agentScopeDeclaration`
- [ ] `RequestClassifier` produces `RequestClassification` consumed by policy selection
- [ ] `HighRiskDomainPolicy` table covers all 8 SAFETY.md domains
- [ ] Crisis resources included in self-harm and abuse policies
- [ ] CLI `agentsy agent show <name> --scope` works

### Phase 12 — Guardrails Daemon Integration
- [ ] `@agentsy/daemon` depends on `@agentsy/guardrails` and `@agentsy/runtime`
- [ ] `GuardrailPipeline` and `HookRegistry` instantiated in `Daemon.start()`
- [ ] All 18 scanners wired (7 security + 9 behavioral + 4 surface + 3 interaction + 2 scope/classification)
- [ ] IPC handlers `agent.spawn`, `process.spawn`, `stream.start` route through hooks
- [ ] `DaemonConfig.guardrails` config section works
- [ ] Audit receipts persisted to `UnifiedDB.guardrail_decisions`
- [ ] Integration test: malicious IPC blocked

### Phase 13 — Guardrails Metrics, Benchmark Suite, Release Gate + langeval Integration
- [ ] All 12 required safety metrics tracked and exported (via OpenTelemetry or local JSON)
- [ ] Benchmark suite exists with all 12 required scenarios (20–50 cases each)
- [ ] `agentsy guardrails benchmark` CLI command runs the suite and produces a report
- [ ] Benchmark runs in CI on every PR touching `packages/guardrails/`
- [ ] `release-gate` script exists and gates first-party agent template PRs
- [ ] Intersectional adequacy benchmark included
- [ ] Benchmark results published in release notes
- [ ] **§18.7: `agentsy eval run` invokes langeval orchestrator API**
- [ ] **§18.7: `agentsy eval scenarios` lists available langeval scenarios**
- [ ] **§18.7: `agentsy eval red-team` launches red-teaming campaign**
- [ ] **§18.7: `agentsy eval battle <a> <b>` runs A/B comparison via Battle Arena**
- [ ] **§18.7: CI workflow runs langeval evals on PRs touching guardrails/agent templates**
- [ ] **§18.7: Release-gate script calls langeval API for the 12 SAFETY.md scenarios**
- [ ] **§18.7: langeval Trace Debugger links appear in PR comments on failure**
- [ ] **§18.7: 12 SAFETY.md scenarios mapped to langeval scenario types**
- [ ] **§18.7: Docker Compose for langeval stack works (shared Langfuse with Phase 19)**
- [ ] **§18.7: Memory + perf regression baselines (`MemoryTestHarness`, `PerfTestHarness`)**

### Phase 14 — ACP Agent & Multi-Agent Deployment
- [ ] ACP server handles all 20 methods in the compatibility matrix
- [ ] Folder-based scope isolation works across concurrent sessions
- [ ] Steering + follow-up queues work (`QueueMode: "all" | "one-at-a-time"`)
- [ ] Rich tool type fields respected (`isReadOnly`, `isConcurrencySafe`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `shouldDefer`, `alwaysLoad`, `searchHint`)
- [ ] Disk-spilled tool results work
- [ ] Reflection loop fires on lint/test failure (max 3)
- [ ] Default agents (coder, researcher, planner) loadable from YAML

### Phase 15 — Project Auto-Detection & Bootstrap
- [ ] `@agentsy/bootstrap` package exists (26th package)
- [ ] Scanner detects languages, frameworks, package managers, build systems, linters, test runners
- [ ] `.agentsy/config.yml` schema is stable (`schemaVersion: 1`)
- [ ] All 4 registry adapters (ECC Tools, Skills.sh, MCP Registry, Guardrails Hub) fetch from authoritative sources
- [ ] Recommendation engine produces relevant recommendations
- [ ] `agentsy install <type> <id>` and `agentsy install --recommended` work
- [ ] `AGENTS.md`, `.agentsy/aft.{md,json}`, Magic Context compartments generated
- [ ] `BootstrapService` runs in the daemon
- [ ] Multi-root workspaces supported via `/add-project-folder`

### Phase 16 — Guardrails CLI, Hub & Polish
- [ ] `agentsy guardrails install` writes to persistent `.agentsy/guardrails.yaml`
- [ ] `agentsy guardrails policy <path>` validates and test-evaluates
- [ ] `agentsy guardrails test <policy-path> <input>` prints decision receipts
- [ ] `agentsy guardrails hub <hub-uri>` resolves `npm://` and `file://` URIs
- [ ] `scanUICopy` API exists; first-party UI packages scanned in CI
- [ ] Custom YAML parser replaced with `yaml` package + Zod validation
- [ ] `DEFAULT_POLICY` rule conditions reference real annotations
- [ ] `ToxicityScanner` `nazi` pattern false positives mitigated
- [ ] `SecretDetectionScanner` Vercel/Postmark/Snyk patterns tightened
- [ ] `PIIScanner` redaction placeholders consistent (`[REDACTED:<id>]`)
- [ ] `RateLimiterScanner` per-key-type defaults
- [ ] `EntropyScanner` threshold lowered to 3.5
- [ ] `docs/safety-exceptions.md` exists (states "none" if none)

### Phase 17 — Competitive Gap-Closing Sprint
- [ ] `RepoMap` (aider) builds and ranks symbols via PageRank
- [ ] 3 edit-format DSLs (aider): SEARCH/REPLACE with RelativeIndenter, udiff, whole-file
- [ ] `DirtyJson` tolerant parser (agent-zero) handles malformed LLM JSON
- [ ] `prepareNextTurn` / `shouldStopAfterTurn` hooks (pi)
- [ ] `convertToLlm` + `transformContext` two-stage (pi)
- [ ] Session tree fork/clone (pi)
- [ ] `GuardianScanner` LLM-as-judge with circuit breaker (codex)
- [ ] Event-sourced rollout + reducer (codex)
- [ ] WebSocket Responses API support (codex)
- [ ] `ContextEpoch` revision tracking (opencode)
- [ ] Structured Markdown compaction template (opencode)
- [ ] Persistent shell with cwd tracking (Claude-Code)
- [ ] Tool deny-rule filtering at registration (Claude-Code)
- [ ] Slash command argument substitution (Claude-Code)
- [ ] `pi-iso` isolation PAL trait with 8 backends (oh-my-pi)
- [ ] `pi-shell` output minimizer (oh-my-pi)
- [ ] `pi-ast` structural summaries (oh-my-pi)

### Phase 18 — Missing Capabilities
- [ ] `OutputValidator` validates and auto-repairs structured output
- [ ] `CheckpointManager` creates and restores checkpoints
- [ ] `SandboxService` sandboxes tool execution
- [ ] `CrossSessionMemory` aggregates across sessions
- [ ] `ResilienceService` circuit breaks and falls back gracefully
- [ ] `DiagnosticsService` exposes comprehensive health report
- [ ] Image support in prompts works
- [ ] ACP session persistence works across daemon restarts

### Phase 19 — Langfuse Observability Integration ✅
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
- [x] Manual smoke: env vars absent → daemon logs "langfuse disabled" → daemon works normally
- [x] Manual smoke: `observability.langfuse.enabled: false` → "disabled by config" log
- [x] Manual smoke: malformed `.env` → warning logged, daemon continues
- [x] Observability README rewritten with Langfuse integration docs, env-var table, quick start, redaction caveat
- [x] `@agentsy/observability` added as dependency of `@agentsy/daemon`

### Phase 20 — Ethical Provider & Content Policy ✅
- [x] `PROVIDER_ETHICS_POLICY` contains 6 entries (xai block; openai/microsoft/google/amazon/meta warn)
- [x] `isProviderBlocked('xai')` returns `true`; all others return `false`
- [x] `requiresAcknowledgement('openai')` returns `true`; `requiresAcknowledgement('meta')` returns `true`; `requiresAcknowledgement('anthropic')` returns `false`
- [x] xAI block rationale cites both content safety (CSAM, antisemitism, deepfakes) AND environmental racism (illegal gas turbines, 495 MW, NOx/formaldehyde, NAACP lawsuit)
- [x] Meta warn rationale cites tent data centers (200 MW gas turbines) AND LibGen training-data theft
- [x] `RoutingService.selectModel()` removes blocked providers before returning candidates
- [x] `RoutingService.selectModel()` attaches `requiresAcknowledgement` to warn-listed providers
- [x] Daemon IPC `stream.start` returns `acknowledgement-required` error when ack is missing
- [x] Per-session warning can display cumulative environmental impact from Phase 30 ("You have used X for N requests, producing Y gCO2")
- [x] `agentsy acknowledge-provider --provider openai` records ack in `UnifiedDB.session_meta`
- [x] Acknowledgement is per-session — new session requires re-ack
- [x] `StyleMimicryScanner` blocks "in the style of [living creator]" for writing, imagery, audio
- [x] `StyleMimicryScanner` passes "in the style of Shakespeare" (historical)
- [x] `StyleMimicryScanner` passes "in a stream-of-consciousness style" (technique, no name)
- [x] `telegram.ts` deleted; no references remain in `packages/daemon` or `packages/cli`
- [x] `safety-changelog.md` has Telegram removal entry with sources
- [x] `ETHICS.md` §12–§16 added (§16: environmental racism as a block criterion); `EthicsRegistry` updated with `implementedBy` fields

### Phase 21 — Docker-Based Optional Tooling
- [ ] `DockerAvailabilityChecker` correctly detects Docker presence, daemon state, and resources
- [ ] `SuperLinterTool` returns graceful degradation when Docker is absent
- [ ] `SuperLinterTool` invokes `docker run` with correct args and parses output
- [ ] `PresidioScanner` returns `pass` when disabled
- [ ] `PresidioScanner` returns `pass` (graceful degradation) when Docker is absent
- [ ] `PresidioScanner` returns `transform` with redacted output when PII is detected
- [ ] `DaemonConfig.docker` schema has correct defaults (all disabled)
- [ ] Resource checks prevent invocation when memory/CPU insufficient

### Phase 22 — Web Fetcher HTML-to-Markdown
- [ ] `http_fetch` returns Markdown when content-type is `text/html`
- [ ] `http_fetch` returns raw body when content-type is not HTML
- [ ] `http_fetch` returns raw HTML when turndown conversion throws (graceful fallback)
- [ ] `bodyFormat` field correctly reports `markdown` | `html` | `<content-type>`

### Phase 23 — AFT, Magic Context & Task Board Integration Hardening
- [ ] `WikiManager.upsertPage({ writeBackToMagicContext: true })` writes to both wiki and MC `project_memories`
- [ ] Dreamer consumer syncs within 1s of MC epoch change (event-driven, not poll)
- [ ] `getAftBridgeOrNull()` returns `null` when AFT binary missing (no throw)
- [ ] Callers log a one-time warning and continue in degraded mode
- [ ] `Daemon.start()` starts AFT pool + opens MC database; `Daemon.stop()` shuts them down
- [ ] `todo_write` / `todo_read` / `todo_update` tools work and persist to `UnifiedDB.todos`
- [ ] Todos survive daemon restart
- [ ] `SqliteTaskBoard` persists tasks and attempts to `UnifiedDB`
- [ ] `task_list` / `task_claim` / `task_complete` tools work
- [ ] `AgentHost.forkWithCacheSharing()` creates a child agent that inherits parent's AFT bridge + MC compartment snapshot
- [ ] Sub-agent fork does not re-index the project (AFT session shared)
- [ ] `docs/developers/cortexkit-integration.md` updated

### Phase 24 — Teams & Remote Daemon Deployment (DEFERRED — verify when activated)
- [ ] `agentsy deploy init --topology local-docker` generates a working `docker-compose.local.yml`
- [ ] `agentsy deploy init --topology teams` generates `docker-compose.teams.yml` + `Caddyfile` + `.env.example`
- [ ] `docker compose up` starts the daemon in a container with a volume-mounted SQLite DB
- [ ] `agentsy login` initiates OAuth flow and returns a session JWT
- [ ] Session JWT validated on every IPC/ACP call
- [ ] Per-user spend tracked in `user_spend` table; spend limit enforced
- [ ] `agentsy team spend` / `agentsy team roi` produce correct reports
- [ ] Audit log records every prompt, tool call, guardrail decision, memory write, agent spawn, admin action
- [ ] Shared team memory: team members can read `team:<teamId>:folder:<hash>` scope
- [ ] Personal memory: `user:<userId>:personal` is not readable by other users or admins
- [ ] Turso Compose service syncs with daemon's `UnifiedDB`
- [ ] OAuth works with Okta, Google, Authentik, Auth0 (tested with at least 2)
- [ ] xAI block and style-mimicry block enforced in server mode (Phase 20 policy applies)

### Phase 25 — MITM Egress Proxy (DEFERRED — verify when activated)
- [ ] `agentsy proxy status` shows proxy running, CA present, port listening
- [ ] Subprocess with `proxy-inspect` policy routes HTTP through the proxy
- [ ] Subprocess with `proxy-inspect` policy routes HTTPS through the proxy (TLS interception works)
- [ ] Blocked request (xAI endpoint) returns 403 to subprocess; receipt persisted
- [ ] Blocked response (prompt injection in fetched page) returns 403 to subprocess; receipt persisted
- [ ] Style-mimicry prompt in subprocess HTTP request is blocked (Phase 20 policy enforced at network layer)
- [ ] Oversized response disk-spilled; subprocess receives preview + path
- [ ] WebSocket traffic intercepted (MCP server over WS)
- [ ] SSE traffic intercepted (MCP server over SSE)
- [ ] Per-language CA trust works (test with Node.js, Python, curl, git at minimum)
- [ ] `failOpen: true` — traffic passes when guardrail endpoint is down; daemon logs warning
- [ ] `failOpen: false` — traffic blocked when guardrail endpoint is down
- [ ] CA rotation works (new CA generated, proxy restarts, old subprocesses re-trust on next spawn)
- [ ] Subprocess identification via source-port lookup works
- [ ] Subprocess identification via `X-Agentsy-Subprocess` header works (opt-in)
- [ ] `DaemonConfig.proxy` schema accepts all fields with correct defaults

### Phase 26 — A2A Protocol Support (DEFERRED — verify when activated)
- [ ] A2A server endpoint accepts task creation, streaming, cancellation
- [ ] External A2A client (gemini-cli) can invoke an agentsy agent and receive streamed results
- [ ] `a2a_delegate` tool delegates to a remote A2A agent and returns the result
- [ ] A2A task attribution to user (spend tracking, audit logging) works in server mode
- [ ] A2A delegation respects guardrails (remote response scanned by `IngressScanner`)
- [ ] First call to a new A2A agent URL requires approval; subsequent calls auto-approved

### Phase 27 — Self-Improvement & Skill Curation (DEFERRED — verify when activated)
- [ ] Skill curator runs when daemon idle >2h and last run >7d
- [ ] Curator marks skills stale after 30 days, archives after 90 days, never deletes
- [ ] Post-turn review fires after every turn with inherited prefix cache
- [ ] Post-turn review respects tool whitelist (memory + skill management only)
- [ ] "Do NOT capture" list prevents transient errors from becoming persistent skills
- [ ] Skill AST audit blocks skills with critical findings (filesystem, network, eval, env, subprocess)
- [ ] Skill AST audit escalates skills with non-critical findings for review

### Phase 28 — Supply-Chain Security & Policy Attestation (DEFERRED — verify when activated)
- [ ] OSV malware scanner blocks `MAL-*` advisories on MCP/skill install
- [ ] OSV scanner fails open on timeout (10s)
- [ ] Policy attestation generates cryptographic hashes (policy, workspace, findings, attestation)
- [ ] `agentsy attestation generate` / `agentsy attestation verify` CLI commands work
- [ ] Conseca generates a per-prompt security policy from user intent + tools
- [ ] Conseca policy enforced per-tool-call (allowed/denied/ask_user)
- [ ] All `package.json` files use exact-pinned dependencies (no `^`, `~`, `>=`)
- [ ] `agentsy doctor --fix` detects, explains, backs up, and rewrites old config shapes
- [ ] JSON Schema for `DaemonConfig` and agent specs auto-generated and published

### Phase 29 — Package Boundary Cleanup & Composability
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
- [ ] Each independently-publishable package can be `pnpm build` and `pnpm test` in isolation

### Phase 30 — Environmental Impact Tracking (CO2 + Water)
- [ ] 4 model energy tiers with estimates matching research
- [ ] 12+ carbon intensity entries for major cloud regions
- [ ] WUE entries for AWS, Azure, GCP, local, default
- [ ] `calculateEnvironmentalImpact()` works for cloud and local requests
- [ ] Cache-hit impact near-zero with savings
- [ ] Cumulative tracking per session/user/team/project
- [ ] `environmental_impact` table in `UnifiedDB`
- [ ] CLI `agentsy env impact` produces report
- [ ] CLI `agentsy env breakdown` and `agentsy env savings` work
- [ ] Per-session warning can display cumulative env impact
- [ ] Local measurement works on Linux; falls back gracefully elsewhere
- [ ] Real-time API (optional) works with Electricity Maps key
- [ ] Limitations documented in README

### Cross-Cutting
- [ ] `pnpm check-types` passes on all phases
- [ ] `pnpm lint` passes on all phases
- [ ] `pnpm test` passes on all phases (new tests added in each phase)
- [ ] `safety-changelog.md` updated for each phase
- [ ] Every clause in `EthicsRegistry` has a non-null `implementedBy` OR a documented exception in `docs/safety-exceptions.md`
- [ ] First-party agent templates pass `release-gate` in CI

---

