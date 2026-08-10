
## 32. Appendix A — 15-Competitor Pattern Atlas

Condensed reference: for each competitor, the top patterns agentsy should borrow and the target phase in this plan. Updated from 12 to 15 competitors (Batch 4 adds openclaw, hermes-agent, gemini-cli).

### A.1 `Aider-AI/aider` (Python, CLI)

| Pattern | What it does | Target phase |
|---|---|---|
| RepoMap | tree-sitter tag extraction + NetworkX graph + PageRank with personalization | Phase 17 §22.1 |
| Edit-format DSLs | 5 formats (SEARCH/REPLACE, udiff, whole-file, apply-patch, architect) | Phase 17 §22.1 |
| Reflection loop | `run_one` → `apply_updates` → `auto_commit` → `lint_edited` → `auto_test`; failed lints become `reflected_message` → re-enter loop (max 3) | Phase 14 §19.5 |
| Auto-commit with attribution | git auto-commit with `--author` flags | (Not in scope — agentsy treats git as user-driven) |
| Cache warming thread | Ping every 4.5 min to keep Anthropic cache alive | (Future enhancement) |
| `model-settings.yml` | Declarative per-model config (`editFormat`, `weakModel`, `useRepoMap`, `cacheControl`, `reasoningTag`) | (Future enhancement) |

### A.2 `agent0ai/agent-zero` (Python, Web UI)

| Pattern | What it does | Target phase |
|---|---|---|
| `@extensible` AOP decorator | Any function can be intercepted; filesystem-discovered extensions, priority-ordered, hot-reload | (Future — plugin system) |
| `DirtyJson` tolerant parser | Handles trailing commas, comments, broken brackets, streaming `feed()` | Phase 17 §22.2 |
| Streaming secret masking | Prefix-suffix matching across chunk boundaries | Phase 6 §11.4 |
| `_infection_check` LLM gate | Background LLM classifier blocks tool execution until verdict | (Subsumed by Phase 17 Guardian) |
| Time-travel (git shadow repo) | Snapshot workdir after every file mutation | (Future enhancement) |
| Chat branching | Trim history at any log message; preserve summarized topics | Phase 17 §22.3 (session tree) |

### A.3 `earendil-works/pi` (TypeScript, CLI + RPC)

| Pattern | What it does | Target phase |
|---|---|---|
| Steering + follow-up queues | `QueueMode: "all" \| "one-at-a-time"`; mid-turn steering injection | Phase 14 §19.5 |
| `prepareNextTurn` / `shouldStopAfterTurn` | Pre-turn context/model swap; graceful stop signal | Phase 17 §22.3 |
| `convertToLlm` + `transformContext` two-stage | Clean separation of context transformation from LLM filtering | Phase 17 §22.3 |
| Session tree (fork/clone) | Each entry has `parentId`; fork/clone navigation; branch summarization | Phase 17 §22.3 |
| Tool `terminate` hint + `details` field | Tool can signal "stop after this batch"; structured details for logs | (Future enhancement) |
| Extension API | `registerCommand`, `registerTool`, `registerAutocompleteProvider`, UI context | (Future — plugin system) |
| OAuth device code + PKCE | For Anthropic, Copilot, Codex | (Future enhancement) |
| Trust manager (per-project) | `/trust` command, persisted trust decisions | (Future enhancement) |

### A.4 `can1357/oh-my-pi` (Rust + TS + Python)

| Pattern | What it does | Target phase |
|---|---|---|
| `pi-iso` isolation PAL | Cross-platform COW isolation: 8 backends (APFS clonefile, btrfs, ZFS, overlayfs, Linux reflink, Windows block clone, ProjFS, Rcopy fallback) | Phase 17 §22.7 |
| `pi-ast` structural summaries | Tree-sitter-based code summarization for context compression | Phase 17 §22.7 |
| `pi-shell` minimizer | In-process Rust bash shell + minimizer with 20+ language filters | Phase 17 §22.7 |
| `mnemopi` memory backend | Beam store, vector index, entity graph, temporal recall, veracity consolidation | (Large — future research) |
| `hashline` structured editing | Grammar, parser, patcher, snapshots, recovery | (Large — future research) |
| `pi-natives` (N-API) | Clipboard, grep, glob, fd, sixel, highlight, HTML, PTY, ISO, AST in Rust | (3-6 month investment) |

### A.5 `CodebuffAI/codebuff` (TypeScript, SDK + cloud)

| Pattern | What it does | Target phase |
|---|---|---|
| `handleSteps` async generator | Programmatic pre-LLM tool calls | (Future enhancement) |
| Output schema retry | If agent has `outputSchema` and didn't call `set_output`, inject reminder and retry | (Future enhancement) |
| Propose/commit two-phase | `propose_write_file` + `write_file` | (Future enhancement) |
| `inheritParentSystemPrompt` | Subagents inherit parent's system prompt | (Future enhancement) |
| Bare-string tool input repair | Per-tool field allowlist for malformed inputs | (Future enhancement) |
| `code-map` (tree-sitter) | Code map for context | (Future enhancement) |

### A.6 `AntigmaLabs/ante-preview` (Rust, SDK + closed daemon)

| Pattern | What it does | Target phase |
|---|---|---|
| `HeadTailBuffer` | Preserves head and tail of output, drops middle with omission marker | (Subsumed by `pi-shell` minimizer in Phase 17) |
| `ProcessPool` with LRU eviction | Bounded pool, recent protection, prefer evicting exited processes | (Future enhancement) |
| Process group isolation | `set_parent_death_signal(SIGTERM)` + `setsid()` + `killpg` | (Future enhancement) |
| Prefixed ULID/UUIDv7 session IDs | Time-ordered, lexicographically sortable, prefix-tagged | (Future enhancement) |
| `TurnPause`/`TurnResume` + `ReviewDecision` enum | `Accept \| Skip \| AcceptForSession \| AcceptAlways \| Abort` | (Future enhancement) |

### A.7 `openai/codex` (Rust + Python + TS)

| Pattern | What it does | Target phase |
|---|---|---|
| Bubblewrap + seccomp sandbox | Two-stage Linux sandbox: bubblewrap first, then seccomp via `--apply-seccomp-then-exec` | (Future — Phase 18 SandboxService) |
| MITM network policy proxy | `BlockedRequestObserver` pattern for egress enforcement | (Future — Phase 10 EgressScanner) |
| `Guardian` LLM-as-judge | Auto-approve/deny `on-request` actions; circuit breaker (3 denials/turn → abort) | Phase 17 §22.4 |
| Event-sourced rollout + reducer | JSONL append-only + materialized views | Phase 17 §22.4 |
| WebSocket Responses API | Prewarm + sticky routing for lower TTFT | Phase 17 §22.4 |
| `keep_forked_rollout_item` fork predicate | system+user+final-assistant only, drop reasoning/tool/output | Phase 17 §22.4 |
| Multi-agent v2 | wait/interrupt/followup_task | (Future enhancement) |
| Tool argument diff consumer | Streaming partial args | (Future enhancement) |

### A.8 `QwenLM/Qwen3-Coder` (Python, model docs + eval)

Excluded from architecture comparison — this is a model release with eval harness, not a framework. No patterns to borrow.

### A.9–A.11 Claude-Code (3 variants treated as one)

| Pattern | What it does | Target phase |
|---|---|---|
| Hook schema | command/prompt/http/agent with `if` filter, `async`/`asyncRewake`/`once` flags | Phase 3 §8.4 |
| Rich tool type | `isReadOnly`, `isConcurrencySafe`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `shouldDefer`, `alwaysLoad`, `searchHint`, `backfillObservableInput` | Phase 14 §19.5 |
| Disk-spilled tool results | Persist to disk when > `maxResultSizeChars`, return preview | Phase 14 §19.5 |
| Cache-stable tool ordering | Built-ins as contiguous prefix for prompt cache stability | (Future enhancement) |
| Skills system | Markdown + frontmatter, 5 sources, `paths` scoping, `allowedTools`, `whenToUse` | Phase 15 (via Skills.sh adapter) |
| Subagent system | `.claude/agents/` markdown, built-in agents, fork-with-cache-sharing | Phase 14 (multi-agent) |
| Slash commands | 70+, 3 types (prompt/local/menu), `$ARGUMENTS`/`$1`/`$2` substitution | Phase 17 §22.6 |
| Auto-dream | Idle consolidation LLM call | (Future enhancement) |
| Auto-compact reactive | Compaction when context window approaches limit | (Future enhancement) |
| Persistent shell | CWD tracking, env accumulation | Phase 17 §22.6 |

### A.12 `anomalyco/opencode` (TypeScript, HTTP/SSE + TUI)

| Pattern | What it does | Target phase |
|---|---|---|
| Effect structured concurrency | `Stream.runForEach`, `FiberSet`, `TurnTransitionError` defects | (Architectural — agentsy uses async/await, not Effect) |
| `failUnsettledTools` | Publish failure for pending tool calls on stream error | Phase 3 §8.5 |
| `ContextEpoch` revision tracking | Abort+rebuild on mid-turn model switch | Phase 17 §22.5 |
| Structured Markdown compaction | 8 sections: Goal, Constraints, Progress, Decisions, Next Steps, Critical Context, Relevant Files | Phase 17 §22.5 |
| `promptCacheKey` per session | Trivially enables OpenAI prompt caching | (Future enhancement) |
| `wrapSSE` idle timeout | Per-read timeout that aborts on idle | Phase 6 §11.3 |
| Permission rulesets | `Rule[]` with `action`/`resource`/`effect: allow\|ask\|deny`, last-match-wins + wildcards | (Future enhancement) |
| Pre-configured agent profiles | build/plan/general/explore with pre-baked rulesets | Phase 14 (default agents) |
| Provider-as-plugin | Each provider is a 17-line plugin | (Future enhancement) |
| Durable steer/queue inbox | `SessionInput.promoteSteers`/`promoteNextQueued` | Phase 14 §19.5 (steering queues) |

### A.13 `openclaw/openclaw` (TypeScript, CLI + daemon + ACP) — NEW (Batch 4)

Claude-Code derivative with 130+ extensions, 7857 .ts files, and the most mature ACP implementation found in any competitor.

| Pattern | What it does | Target phase |
|---|---|---|
| **ACP event ledger (50+ files)** | SQLite-backed event ledger (maxSessions=200, maxEventsPerSession=5000, maxSerializedBytes=16MB) with 13 translator sub-modules (replay, session-lineage, cancel-scoping, permission-relay, tool-streaming, error-kind, final-snapshots, prompt-prefix, prompt-size, session-snapshot, set-session-mode, stop-reason, session-rate-limit) | **Phase 14 (expand scope — openclaw is the reference)** |
| **Policy attestation/evidence system** | `PolicyAttestation` (checkedAt, policy path+hash, workspace hash, findingsHash, attestationHash) + `PolicyEvidence` with 14 evidence types. Enterprise compliance posture attestation with cryptographic hashes. | **Phase 28 (new)** |
| QA Lab (~150 files) | scenario-catalog, scenario-flow-runner, scorecard-evidence, scorecard-taxonomy, self-check-runner, harness-parity, runtime-parity, agentic-parity-report, token-efficiency-report, tool-coverage-report | **Phase 13 (extend — agentic QA harness)** |
| Tool-call repair grammar | Handles Harmony/Kimi channel markers (`<\|channel\|>`, `<\|message\|>`, `<\|call\|>`), bracketed JSON (`[tool_name]\n{...}`), balanced brace counting. Beyond DirtyJson. | **Phase 17 (extend — model-specific formats)** |
| Doctor migration contract | `openclaw doctor --fix` detects old config shape, explains, backs up, rewrites to canonical format. Each extension exposes `doctor-contract-api.ts`. | **Phase 28 (config evolution)** |
| Memory host SDK with swappable backends | Three swappable backends (memory-core, memory-lancedb, memory-wiki) share a stable engine contract. | Phase 23 (extend — swappable memory backends) |
| Code plugins vs bundle-style plugins | Code plugins (runtime hooks, providers, tools) vs Bundle-style plugins (skills, MCP servers, config). "Prefer bundle-style." | Phase 17 (extend — dual plugin model) |
| Active-memory circuit breaker | Prevents memory runaway by circuit-breaking when memory operations exceed threshold. | Phase 23 (extend — memory circuit breaker) |

### A.14 `nousresearch/hermes-agent` (Python, CLI + ACP + gateway) — NEW (Batch 4)

2037 .py files. Standout: operational resilience, self-improvement, and supply-chain hardening patterns found in no other competitor.

| Pattern | What it does | Target phase |
|---|---|---|
| **Multi-credential pool with lifecycle** | `PooledCredential` with `last_status` (OK/EXHAUSTED/DEAD), rotation strategies (FILL_FIRST, ROUND_ROBIN, RANDOM, LEAST_USED), per-status TTL cooldowns (401→5min, 429→1h), OAuth terminal reason detection, provider-supplied `reset_at` timestamps. | **Phase 17 (extend — credential pool)** |
| **22-reason API error taxonomy** | `FailoverReason` enum with 22 reasons; `ClassifiedError` with `retryable/should_compress/should_rotate_credential/should_fallback` hints. billing vs rate_limit disambiguation, image dimension extraction, multimodal tool content patterns. | **Phase 17 (extend — error taxonomy)** |
| **Auxiliary LLM client router** | Side tasks (compression, session search, vision) route through a separate LLM client that never touches the main session's prompt cache. Auto-detection fallback chain. | **Phase 17 (extend — auxiliary client)** |
| **Three-state prompt cache restoration** | Distinguishes `missing` (legitimate first turn), `null` (legacy session), `empty` (silent persistence bug, always warns), `present` (reused). | Phase 17 (extend — cache bug detection) |
| **Background skill curator** | `maybe_run_curator()` forks agent when idle >2h AND last_run >7d. Auto-transitions skill lifecycle (stale_after_days=30, archive_after_days=90). Never auto-deletes. | **Phase 27 (new — self-improvement)** |
| **Post-turn background review** | `spawn_background_review()` fires after every turn; forks agent with inherited runtime (same prefix cache). Tool whitelist (memory + skill management only). "Do NOT capture" list prevents hardening transient errors. | **Phase 27 (new — self-improvement)** |
| **Skill AST audit** | AST-based skill audit (vs regex-only). Parses skill scripts to detect malicious patterns. | **Phase 27 (new — skill security)** |
| **Tiered threat patterns with scope-based filtering** | Patterns organized by ATTACK CLASS. Scope-based filtering: `"all"`, `"context"` (broader for memory/tool results), `"strict"` (aggressive for memory writes/skill installs). `INVISIBLE_CHARS` (zero-width, BOM, directional). C2 framework names. | **Phase 9 (extend — tiered threat patterns)** |
| **OSV malware check for MCP extensions** | Queries OSV API before launching MCP servers via npx/uvx; only blocks `MAL-*` advisories; fail-open; 10s timeout. | **Phase 28 (new — supply-chain security)** |
| **Deterministic tool-call loop guardrails** | `allow/warn/block/halt` based on exact_failure count (same tool + same args hash), same_tool_failure count, no_progress count. `ToolCallSignature` = sha256(canonical_sorted_json(args)). | **Phase 17 (extend — loop detection)** |
| **Automation blueprints** | `AutomationBlueprint` with `BlueprintSlot` types (time/enum/text/weekdays); single source of truth rendered per surface (Dashboard, CLI, Agent, Docs with `hermes://` deep-link). | Phase 24 (extend — teams automation) |
| **Six terminal backends with serverless hibernation** | local, Docker, SSH, Singularity (HPC), Modal (serverless, hibernates), Daytona (serverless, hibernates). `file_sync.py` between environments. | Phase 24 (extend — remote execution) |
| **Exact-pinned dependencies** | Every direct dep is `==X.Y.Z` (no ranges). CVE comments. Lazy-deps for opt-in extras. Supply-chain hardening. | **Phase 28 (new — supply-chain hardening)** |
| **Iteration budget with refund semantics** | Thread-safe consume/refund counter; parent cap=90, subagent cap=50; `execute_code` iterations refunded. | Phase 17 (extend — budget semantics) |
| **Per-model temperature contracts** | `OMIT_TEMPERATURE` sentinel for Kimi (server-side managed); thinking models get 1.0, non-thinking get 0.6. | Phase 17 (extend — per-model config) |

### A.15 `google-gemini/gemini-cli` (TypeScript, CLI + A2A server) — NEW (Batch 4)

130 .ts files. Standout: A2A protocol, behavioral evals, graph-based context, and Conseca (LLM-generated security policy).

| Pattern | What it does | Target phase |
|---|---|---|
| **A2A protocol (full server + client)** | `@a2a-js/sdk` with `TaskStore`, `AgentExecutor`, `AgentExecutionEvent`, `RequestContext`, `ExecutionEventBus`. `CoderAgentExecutor` with task lifecycle. GCS persistence. CLI acts as both A2A server AND invokes remote A2A agents as subagents. | **Phase 26 (new — A2A protocol)** |
| **Behavioral evals with probabilistic pass policies** | `ALWAYS_PASSES` (100%, blocks PRs), `USUALLY_PASSES` (nightly, flaky OK), `USUALLY_FAILS` (negative tests). Trustworthy filter (60% nightly, 80% aggregate over 6 days). 50% pass rule (2/4). Dynamic baseline verification. 7-day incubation before promotion. `LLMJudge` with selfConsistencyRuns (1/3/5) + majority vote. | **Phase 13 §18.7 (via langeval integration — langeval provides DeepEval metrics + G-Eval LLM-as-a-Judge + CI/CD gates)** |
| **Memory + perf regression baselines** | `MemoryTestHarness` (gcCycles, 10% tolerance, leak detection) + `PerfTestHarness` (warmupCount, 15% tolerance, idle CPU). `baselines.json` with `UPDATE_*_BASELINES` env var. | **Phase 13 (extend — regression baselines)** |
| **Conseca — LLM-generated per-prompt security policy** | LLM generates a security policy from user prompt + tool definitions, then enforces it per tool call. `decision: allow/deny/ask_user`. Fundamentally different from static rules. | **Phase 28 (new — dynamic security policy)** |
| **Graph-based context manager** | `ConcreteNode` graph with `PipelineOrchestrator` (sync + async pipelines, `pipelineMutex`, `waitForPipelines()` pressure barrier). Hot Start Calibration. `renderCache`. 8 processors (blobDegradation, historyTruncation, nodeDistillation with `replacesId` lineage, nodeTruncation, rollingSummary, stateSnapshot sync+async, toolMasking). | **Phase 23 (extend — graph-based context) or Phase 26** |
| **Tool output distillation** | Saves raw output to disk + generates intent summary via LLM if oversized (`MAX_DISTILLATION_SIZE=1M` chars) + structural truncation. Beyond HeadTailBuffer. | Phase 17 (extend — output distillation) |
| **11-event hook system with BeforeModel + syntheticResponse** | 11 events (BeforeTool, AfterTool, BeforeAgent, AfterAgent, SessionStart, SessionEnd, PreCompress, **BeforeModel** with `syntheticResponse`, AfterModel, BeforeToolSelection, Notification). `HookType.Command` vs `HookType.Runtime`. | **Phase 3 (extend — 11-event system)** |
| **Cross-platform sandbox** | `LinuxSandboxManager` (bubblewrap), `MacOsSandboxManager` (seatbelt/sandboxd), `WindowsSandboxManager` with **C# sandbox binary** (`GeminiSandbox.cs`). | **Phase 18 (extend — cross-platform sandbox) or Phase 25** |
| **LLM-based model routing classifier** | FLASH vs PRO classification with rubric; 4-turn cleaned history; JSON schema response. | Phase 17 (extend — LLM routing) or Phase 5 |
| **4618-line auto-generated JSON Schema** | Published JSON Schema for IDE autocompletion. Auto-generated from TypeScript types. Docs auto-generated. | **Phase 28 (new — JSON Schema publication)** |
| `config.toml` with 7 layers | defaults → managed → global → project → profile → CLI → env. `ConfigLayerStack` with `ConfigLayerSource` provenance. | (Future enhancement — config layering) |

---
