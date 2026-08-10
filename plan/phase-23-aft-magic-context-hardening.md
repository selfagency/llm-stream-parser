# Phase 23: AFT & Magic Context Integration Hardening

> **Epic**: Agentsy Core Hardening
> **Status**: Planned
> **Estimate**: 28 story points
> **Depends on**: Phase 12 (Guardrails Daemon Integration), Phase 15 (Project Auto-Detection & Bootstrap)
> **Blocks**: Phase 24+, production release gate

---

## 0. Executive Summary

Phase 23 closes the five integration gaps between agentsy's tool/context/memory layers and the CortexKit external components (AFT and Magic Context). The current state is **structurally connected but functionally dormant**: `@cortexkit/aft-bridge` is a hard dependency with a working `BridgePool` and one live tool (`lintImports`), while Magic Context's SQLite schema is defined and the database is openable — but neither is wired into agentsy's main runtime flows.

This phase transforms that skeleton into a live integration using a **direct-import architecture** (not the OpenCode/Pi plugin wrappers). The AFT Rust binary and Magic Context SQLite database are consumed through their public TypeScript APIs (`@cortexkit/aft-bridge` and `better-sqlite3` reads), with agentsy owning all host policies: tool registration, governance, config, TUI rendering, and model routing.

### What This Phase Delivers

| # | Deliverable | Gap Closed |
|---|---|---|
| 1 | Full AFT tool surface registered in `ToolRegistry` (replacing naive `fs_read`/`fs_write`/`fs_patch`) | G1: Tool duplication |
| 2 | Governance hooks wrapping all AFT tool calls | G2: Governance bypass |
| 3 | Magic Context read/write wired into runtime hooks | G3: Memory dead-end |
| 4 | Per-project AFT config with search + semantic indexes enabled | G4: Index dormancy |
| 5 | TUI widgets for AFT status and Magic Context browser | G5: TUI absence |

---

## 1. Integration Architecture Decision

### 1.1 Direct Import, Not Plugin

**Decision**: Import `@cortexkit/aft-bridge` as a library dependency and access Magic Context's SQLite database directly via `better-sqlite3`. Do NOT consume AFT or Magic Context as OpenCode/Pi plugins.

**Rationale**:

The OpenCode plugin wrappers are closed implementations that register tools with the host and return opaque results. Using them as plugins would:

- Prevent agentsy from intercepting or transforming tool behavior through its hook system
- Block governance enforcement (approval gates, guardrail scanning, audit logging)
- Make tool composition impossible (can't build "safe refactor" as a compound tool)
- Couple agentsy to OpenCode's plugin SDK and update mechanism
- Prevent model routing of historian/dreamer/sidekick through agentsy's gateway

By importing the bridge library directly, agentsy retains full control:

| Concern | Plugin Approach | Direct Import Approach |
|---|---|---|
| Tool registration | Opaque, host-controlled | Agentsy's `ToolRegistry` with full annotations |
| Governance | None | `PreToolCall`/`PostToolCall` hooks with guardrails |
| Tool composition | Impossible | Compound tools chaining multiple AFT primitives |
| Model routing | Fixed per-role | Gateway-tier routing with budget enforcement |
| TUI rendering | Closed sidebar | Custom Ink widgets with full data access |
| Auto-update | Host-managed `npm install` | Standard `pnpm update` versioning |
| Config | `.opencode/aft.jsonc` / `.pi/aft.jsonc` | Agentsy config system with `aft.*` namespace |

### 1.2 What We Get From Direct Import

The `@cortexkit/aft-bridge` package exposes exactly the public surface we need:

```text
BridgePool          — One persistent aft process per project root
BinaryBridge        — JSON-over-stdio transport to the Rust binary
findBinary()        — Locate cached/named/PATH binary
ensureBinary()      — Download from GitHub releases with SHA-256 verification
ensureOnnxRuntime() — Manage ONNX runtime for semantic search
StatusBarCounts     — Errors, warnings, dead code, unused exports, duplicates, TODOs
formatStatusBar()   — ASCII status bar formatting
All protocol types  — Request/response envelopes, tool results
```

Magic Context's database is a standard SQLite file at `~/.local/share/cortexkit/magic-context/context.db`. Agentsy already has `openCortexKitDb()` / `openCortexKitDbReadOnly()` in `@agentsy/shared/cortexkit/db.ts`.

### 1.3 What We Must Implement (Host Policies)

These are the host-responsibility layers that the OpenCode/Pi plugins provide but that we must build ourselves:

| Host Policy | Where It Lives In Agentsy |
|---|---|
| Config loading (Zod schema + merge) | `@agentsy/cli` config system — add `aft.*` and `magicContext.*` namespaces |
| Tool registration | `@agentsy/tools/cortexkit/` — register bridge commands as `ToolDefinition`s |
| Tool hoisting (replace `fs_read` etc.) | New `ToolRegistry.replace()` method or `PreToolCall` hook interception |
| Governance wrapping | `@agentsy/runtime/hooks/cortexkit/` — `PreToolCall` + `PostToolCall` hooks |
| TUI widgets | `@agentsy/ui/cortexkit/` — Ink components as `WorkspaceTab`s |
| Auto-update | Standard pnpm dependency management; `ensureBinary()` handles the Rust binary |
| Notification routing | Agentsy's event system, not OpenCode's `tui.showToast()` |

---

## 2. Gap 1 — Full AFT Tool Surface

### 2.1 Problem

Agentsy currently registers 7 baseline tools. The only CortexKit-aware tool is `lintImports()` in `@agentsy/tools/cortexkit`, which calls `aft_import organize`. Meanwhile, AFT's Rust binary exposes 55 command modules — tree-sitter parsing, symbol extraction, semantic search, LSP integration, structural grep, call graph analysis, and validated editing — none of which are accessible to agentsy agents.

The naive `fs_read`, `fs_write`, and `fs_patch` tools lack syntax validation, auto-formatting, backup/rollback, fuzzy matching, batch editing, and all AST-aware capabilities. This forces agents to work with raw text when structural operations would be more reliable and token-efficient.

### 2.2 Solution: AFT Tool Registry

Create `@agentsy/tools/cortexkit` as the comprehensive CortexKit tool surface. Each AFT bridge command becomes a first-class `ToolDefinition` in agentsy's `ToolRegistry` with proper annotations.

#### 2.2.1 File Structure

```text
packages/tools/src/cortexkit/
├── index.ts                 # Public exports: registerAllAftTools(registry, bridgePool)
├── registry.ts              # registerAllAftTools — iterates all tool definitions
├── types.ts                 # AftToolConfig, AftToolAnnotations mapping
├── bridge-helpers.ts        # callAft(bridge, command, params) — thin wrapper
├── tools/
│   ├── hoisted/
│   │   ├── read.ts          # Replaces fs_read — syntax validation footer, language detection
│   │   ├── write.ts         # Replaces fs_write — backup + format + validate + rollback
│   │   ├── edit.ts          # Replaces fs_patch — fuzzy match + batch + glob + validate
│   │   ├── grep.ts          # Trigram-indexed regex search
│   │   ├── glob.ts          # File discovery with index
│   │   └── bash.ts          # Optional: command rewriting + output compression
│   ├── sensory/
│   │   ├── outline.ts       # aft_outline — symbol listing
│   │   ├── zoom.ts          # aft_zoom — symbol inspection + callgraph annotations
│   │   ├── search.ts        # aft_search — hybrid semantic + lexical
│   │   ├── callgraph.ts     # aft_callgraph — callers/callees/impact
│   │   └── inspect.ts       # aft_inspect — codebase health report
│   ├── motor/
│   │   ├── refactor.ts      # aft_refactor — symbol move/extract/inline
│   │   ├── imports.ts       # aft_import — add/remove/organize (already exists)
│   │   ├── ast-grep-search.ts
│   │   └── ast-grep-replace.ts
│   ├── lsp/
│   │   ├── diagnostics.ts
│   │   ├── hover.ts
│   │   ├── goto-definition.ts
│   │   ├── find-references.ts
│   │   ├── rename.ts
│   │   └── prepare-rename.ts
│   └── brainstem/
│       ├── bash-status.ts
│       ├── bash-kill.ts
│       ├── bash-watch.ts
│       ├── bash-write.ts
│       ├── bash-drain-completions.ts
│       └── safety.ts        # undo, checkpoints
```

#### 2.2.2 Tool Definition Pattern

Each tool follows this pattern — a thin adapter that maps agentsy's `ToolDefinition` to AFT's bridge protocol:

```typescript
// packages/tools/src/cortexkit/tools/hoisted/read.ts
import type { ToolDefinition, ToolAnnotations } from '../../types.js';

export function createAftReadTool(callBridge: CallBridgeFn): ToolDefinition {
  return {
    name: 'read',
    description: 'Read file contents with syntax validation footer and language detection.',
    parameters: [
      { name: 'path', type: 'string', required: true, description: 'File path to read' },
      { name: 'offset', type: 'number', description: 'Line offset (0-indexed)' },
      { name: 'limit', type: 'number', description: 'Number of lines to read' },
    ],
    annotations: {
      readOnlyHint: true,
    } satisfies ToolAnnotations,
    handler: async (input) => {
      const result = await callBridge('read', input);
      return { ok: result.success, data: result };
    },
  };
}
```

#### 2.2.3 Tool Surface Tiers

AFT defines three tool surface levels. Agentsy should default to `recommended` and allow override:

| Tier | Tools Included | Use Case |
|---|---|---|
| `minimal` | `aft_outline`, `aft_zoom`, `aft_safety` | Maximum restriction |
| `recommended` | minimal + hoisted (`read`/`write`/`edit`/`grep`/`glob`) + LSP + AST grep + imports + inspect | Default for all projects |
| `all` | recommended + callgraph + delete + move + refactor + brainstem (bash_*) | Full power |

#### 2.2.4 Tool Hoisting — Replacing Naive Tools

The `ToolRegistry` needs a `replace()` method. Current API only supports `register`, `remove`, `execute`:

```typescript
// packages/tools/src/registry.ts — addition
class ToolRegistry {
  // ... existing methods ...

  /**
   * Replace an existing tool registration. If the tool doesn't exist,
   * registers it as new. Returns the previous registration if any.
   * This is the mechanism for "hoisting" — AFT tools replace baseline
   * tools by name while preserving their annotations in the registry.
   */
  replace(name: string, definition: ToolDefinition): ToolRegistration | null {
    const previous = this.#tools.get(name) ?? null;
    this.#tools.set(name, { ...definition, name });
    return previous;
  }
}
```

Hoisting sequence in the CLI/session startup:

```typescript
// 1. Register baseline tools (fs_read, fs_write, fs_patch, shell_exec, ...)
registerBaselineTools(registry);

// 2. If AFT bridge is available, hoist with AFT-backed replacements
if (await isAftAvailable()) {
  const pool = await getAftBridge({ projectRoot });
  const callBridge = createCallBridgeFn(pool, projectRoot);

  // These replace the baseline tools by name
  registry.replace('read', createAftReadTool(callBridge));
  registry.replace('write', createAftWriteTool(callBridge));
  registry.replace('fs_patch', createAftEditTool(callBridge));
  registry.replace('fs_read', createAftReadTool(callBridge)); // alias
  registry.replace('fs_write', createAftWriteTool(callBridge)); // alias

  // These are new tools
  registry.register(createAftGrepTool(callBridge));
  registry.register(createAftGlobTool(callBridge));
  registry.register(createAftOutlineTool(callBridge));
  // ... etc for all recommended-tier tools
}
```

#### 2.2.5 Bridge Helper

The `callBridge` abstraction isolates tool definitions from the bridge pool:

```typescript
// packages/tools/src/cortexkit/bridge-helpers.ts
import type { BinaryBridge } from '@cortexkit/aft-bridge';

export type CallBridgeFn = (
  command: string,
  params: Record<string, unknown>,
  options?: { sessionId?: string; timeoutMs?: number }
) => Promise<AftResponse>;

export function createCallBridgeFn(
  pool: BridgePool,
  projectRoot: string
): CallBridgeFn {
  return async (command, params, options) => {
    const bridge = pool.getBridge(projectRoot);
    const response = await bridge.send(command, {
      ...params,
      session_id: options?.sessionId,
    }, { timeoutMs: options?.timeoutMs });
    return response;
  };
}
```

#### 2.2.6 Tool Annotation Mapping

AFT tools map to agentsy's safety annotations as follows:

| AFT Tool | `readOnlyHint` | `destructiveHint` | `requiresApproval` | `openWorldHint` |
|---|---|---|---|---|
| `read` | true | | | |
| `write` | | true | true | true |
| `edit` | | true | true | |
| `grep` / `glob` | true | | | |
| `aft_outline` | true | | | |
| `aft_zoom` | true | | | |
| `aft_search` | true | | | |
| `aft_callgraph` | true | | | |
| `aft_inspect` | true | | | |
| `aft_refactor` | | true | true | |
| `aft_import` | | true | | |
| `ast_grep_replace` | | true | true | |
| `lsp_rename` | | true | true | |
| `lsp_diagnostics` | true | | | |
| `lsp_hover` | true | | | |
| `lsp_goto_definition` | true | | | |
| `lsp_find_references` | true | | | |
| `bash_kill` | | true | true | |
| `aft_safety` (restore) | | true | true | |

### 2.3 Acceptance Criteria

- [ ] All `recommended`-tier AFT tools are registered in `ToolRegistry` when AFT bridge is available
- [ ] `fs_read`, `fs_write`, `fs_patch` are replaced by AFT-backed versions (hoisted)
- [ ] Fallback to baseline tools when AFT bridge is unavailable (graceful degradation)
- [ ] All tools carry correct `ToolAnnotations` for the governance system
- [ ] `ToolRegistry.replace()` method implemented and tested
- [ ] Bridge helper isolates tool definitions from pool management
- [ ] Tool surface tier is configurable via agentsy config (`aft.toolSurface`)

---

## 3. Gap 2 — Governance Wrapping

### 3.1 Problem

When AFT tools are registered directly, they bypass agentsy's governance pipeline. AFT's `write` can modify any file without approval. AFT's `bash` can execute arbitrary commands. The `requiresApproval` annotation exists on the tool definition, but there's no hook that enforces it for AFT-sourced tool calls specifically, and no audit trail for AFT mutations.

### 3.2 Solution: CortexKit Governance Hooks

Create a dedicated hook module in `@agentsy/runtime/hooks/cortexkit/` that wraps all AFT tool invocations through the existing governance pipeline.

#### 3.2.1 File Structure

```text
packages/runtime/src/hooks/cortexkit/
├── index.ts                 # Public exports
├── pre-tool-call.ts         # AFT-specific PreToolCall handler
├── post-tool-call.ts        # AFT-specific PostToolCall handler
├── audit-logger.ts          # Structured audit log for AFT mutations
└── types.ts                 # AftToolCallEvent, AftAuditEntry
```

#### 3.2.2 PreToolCall Hook

The hook intercepts every tool call, identifies AFT tools, and applies governance:

```typescript
// packages/runtime/src/hooks/cortexkit/pre-tool-call.ts

const AFT_TOOL_PREFIXES = [
  'read', 'write', 'edit', 'grep', 'glob', 'bash',
  'aft_', 'ast_grep_', 'lsp_'
];

export function createAftGovernanceHook(
  approvalGate: ApprovalGate,
  guardrailScanner: GuardrailScanner
): RuntimeHook {
  return {
    id: 'cortexkit:aft-governance',
    priority: 90, // Below approval hook (100) but above defaults
    handler: async (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreToolCall') return { continue: true };

      const { toolName, args } = event;
      if (!isAftTool(toolName)) return { continue: true };

      // 1. Tool input guardrail scanning
      const guardrailResult = await guardrailScanner.scan(args);
      if (!guardrailResult.passed) {
        return {
          continue: false,
          reason: `Guardrail blocked ${toolName}: ${guardrailResult.violations.join(', ')}`
        };
      }

      // 2. Approval gate for destructive tools (handled by existing createApprovalHook)
      // This hook runs at priority 90; approval hook at 100 handles requiresApproval.
      // We just ensure AFT tools have correct annotations for it.

      return { continue: true };
    },
  };
}

function isAftTool(toolName: string): boolean {
  return AFT_TOOL_PREFIXES.some(p => toolName === p || toolName.startsWith(p + '_'));
}
```

#### 3.2.3 PostToolCall Audit Hook

```typescript
// packages/runtime/src/hooks/cortexkit/post-tool-call.ts

export function createAftAuditHook(auditLog: AuditLog): RuntimeHook {
  return {
    id: 'cortexkit:aft-audit',
    priority: 10, // Low priority — runs after all other post-processing
    handler: async (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PostToolCall') return { continue: true };
      if (!isAftTool(event.toolName)) return { continue: true };

      const entry: AftAuditEntry = {
        timestamp: Date.now(),
        sessionId: event.sessionId,
        tool: event.toolName,
        args: sanitizeArgs(event.args),  // Don't log full file contents
        success: event.result?.ok ?? false,
        backupId: event.result?.data?.backup_id,
        rollback: event.result?.data?.rolled_back,
        statusBar: event.result?.data?.status_bar,
        durationMs: event.durationMs,
      };

      auditLog.append(entry);
      return { continue: true, transform: event.result };
    },
  };
}
```

#### 3.2.4 Hook Registration Order

Hooks fire in priority order (highest first). The CortexKit hooks slot into the existing pipeline:

```text
Priority 100: createApprovalHook          — Gates requiresApproval tools
Priority  90: createAftGovernanceHook     — Guardrail scanning for AFT tools
Priority  50: createToolInputGuardrailHook — General tool input guardrails
Priority  10: createAftAuditHook          — Audit logging for AFT tools
Priority   5: createMemoryPostTurnHook    — Memory capture from tool results
```

### 3.3 Acceptance Criteria

- [ ] All AFT tool calls pass through `PreToolCall` governance hook
- [ ] Destructive AFT tools (`write`, `edit`, `aft_refactor`, `lsp_rename`) require approval via `ApprovalManager`
- [ ] Tool input guardrail scanning applies to AFT tool arguments
- [ ] All AFT mutations are audit-logged with tool name, success, backup ID, rollback status
- [ ] `StatusBarCounts` from AFT responses are captured for TUI consumption
- [ ] Hook priority ordering is documented and tested

---

## 4. Gap 3 — Magic Context Runtime Wiring

### 4.1 Problem

Agentsy can open Magic Context's SQLite database via `openCortexKitDbReadOnly()`, and the schema is defined in `@agentsy/shared/cortexkit/schema.ts`. But no runtime hook reads from or writes to the database. The `@agentsy/memory` package operates its own three-layer memory system (event log, AgentFS wiki, RAG) that is entirely disconnected from Magic Context's compartment/memory system.

The result: agentsy has two parallel memory/context systems that don't share state. Magic Context captures project memories and session compartments during OpenCode sessions that agentsy never sees, and agentsy's memory system produces data that Magic Context never consolidates.

### 4.2 Solution: Dual-Path Memory Architecture

Rather than replacing agentsy's memory system with Magic Context or vice versa, wire them together so each reinforces the other. Agentsy's `@agentsy/memory` remains the primary memory layer for agentsy-specific concerns (wiki, RAG, Turso sync). Magic Context's database becomes the **cross-session project memory and context compaction layer** that both systems share.

#### 4.2.1 Read Path: Memory Injection Before Model Calls

```typescript
// packages/runtime/src/hooks/cortexkit/memory-injection.ts

export function createCortexKitMemoryHook(
  db: () => CortexKitDb | null
): RuntimeHook {
  return {
    id: 'cortexkit:memory-injection',
    priority: 20, // Before default memory hooks
    handler: async (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreModelCall') return { continue: true };

      const cortexDb = db();
      if (!cortexDb) return { continue: true };

      // 1. Read active project memories
      const memories = cortexDb.query(
        'SELECT content, category, importance FROM project_memories WHERE status = ? ORDER BY importance DESC, retrieval_count DESC LIMIT ?',
        ['active', 150]  // ~4000 token budget
      );

      // 2. Format as XML block for context injection
      const memoryBlock = formatProjectMemoriesXml(memories);

      // 3. Inject into the system prompt area
      return {
        continue: true,
        transform: {
          contextAdditions: {
            projectMemory: memoryBlock,
          },
        },
      };
    },
  };
}
```

#### 4.2.2 Write Path: Observation Extraction After Tool Calls

```typescript
// packages/runtime/src/hooks/cortexkit/memory-capture.ts

export function createCortexKitCaptureHook(
  db: () => CortexKitDb | null,
  llmClient: LlmClient  // Cheap model for extraction
): RuntimeHook {
  return {
    id: 'cortexkit:memory-capture',
    priority: 15, // After audit, before session-end
    handler: async (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PostToolCall') return { continue: true };
      if (!isAftTool(event.toolName)) return { continue: true };

      // Only capture from significant mutations, not reads
      if (isReadOnlyAftTool(event.toolName)) return { continue: true };

      const cortexDb = db();
      if (!cortexDb) return { continue: true };

      // Extract observations from the tool result
      // (what was changed, what decisions were made, what conventions were followed)
      const observations = await extractObservations(llmClient, event);

      for (const obs of observations) {
        cortexDb.run(
          `INSERT OR IGNORE INTO project_memories
            (project_path, category, content, normalized_hash, importance, source_session_id, source_type, status)
            VALUES (?, ?, ?, ?, ?, ?, 'agentsy', 'active')`,
          [obs.projectPath, obs.category, obs.content, obs.hash, obs.importance, event.sessionId]
        );
      }

      return { continue: true };
    },
  };
}
```

#### 4.2.3 Compaction Delegation

When agentsy's context window fills up, delegate compaction to Magic Context's compartment system rather than agentsy's own compaction:

```typescript
// packages/runtime/src/hooks/cortexkit/compaction.ts

export function createCortexKitCompactionHook(
  db: () => CortexKitDb | null
): RuntimeHook {
  return {
    id: 'cortexkit:compaction',
    priority: 100, // Highest — overrides default compaction
    handler: async (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreCompact') return { continue: true };

      const cortexDb = db();
      if (!cortexDb) return { continue: true }; // Fall through to default compaction

      // Write current conversation tail to Magic Context's compartment format
      // The historian (if running in OpenCode/Pi alongside) will pick it up
      // For standalone agentsy, we write compartments directly
      const compartment = await compressToCompartment(event.context, event.sessionId);

      cortexDb.run(
        `INSERT INTO compartments (session_id, p1, p2, p3, p4, episode_type, seq, importance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.sessionId, compartment.verbose, compartment.normal, compartment.terse, compartment.anchor, 'work', 1, 50]
      );

      // Signal that compaction was handled — skip default compaction
      return { continue: false, reason: 'delegated-to-cortexkit' };
    },
  };
}
```

#### 4.2.4 Schema Alignment

The existing `@agentsy/shared/cortexkit/schema.ts` defines 4 tables. Phase 23 should extend this to cover the full Magic Context schema (38 tables in production). At minimum, add:

| Table | Purpose | Why Needed |
|---|---|---|
| `memories` (full) | Complete memory model with embeddings, verification, merge tracking | Replace simplified `project_memories` view |
| `memory_embeddings` | Vector embeddings for semantic recall | Enables `ctx_search`-style retrieval |
| `memories_fts` | FTS5 full-text search on memories | Keyword fallback for memory search |
| `compartments` (full) | Complete compartment model with compression tiers, events | Full context history access |
| `session_facts` | Per-session extracted facts | Session-scoped knowledge |
| `dream_queue` / `dream_runs` | Dreamer task scheduling | If agentsy orchestrates the dreamer |
| `notes` | Scratchpad and smart notes | Deferred intentions |

#### 4.2.5 Historian/Dreamer Orchestration

Magic Context's historian and dreamer currently run as OpenCode/Pi-spawned subagents. In the direct-import architecture, agentsy can orchestrate them through its own runtime:

```text
agentsy orchestrator
├── Historian agent (triggered at 65% context usage)
│   ├── Model: routed through gateway (cheapest available)
│   ├── Tools: read, aft_outline, aft_zoom, aft_search (read-only)
│   ├── Output: XML compartment blocks → written to compartments table
│   └── Governance: deny-all baseline, explicit allows only
│
├── Dreamer agent (scheduled overnight)
│   ├── Model: routed through gateway
│   ├── Tools: read, grep, glob, bash, write, edit, aft_*, ctx_memory, ctx_search
│   ├── Tasks: consolidate → verify → archive-stale → improve → maintain-docs
│   └── Governance: full tool access with budget limits
│
└── Sidekick agent (on-demand via /ctx-aug)
    ├── Model: routed through gateway
    ├── Tools: ctx_search, aft_outline, aft_zoom (read-only)
    └── Output: memory augmentation block
```

This is Phase 23's stretch goal — the read/write hooks (4.2.1–4.2.3) are the primary deliverable. Full subagent orchestration can be deferred to Phase 24 if needed.

### 4.3 Acceptance Criteria

- [ ] `PreModelCall` hook reads active project memories from Magic Context DB and injects into context
- [ ] `PostToolCall` hook extracts observations from AFT mutations and writes to Magic Context DB
- [ ] `PreCompact` hook delegates compaction to Magic Context's compartment system
- [ ] Schema extended to cover memory embeddings, FTS, session facts
- [ ] Graceful degradation: if Magic Context DB is absent, all hooks pass through to default behavior
- [ ] Memory injection budget is configurable (default 4000 tokens, ~150 memories)
- [ ] Audit trail captures all Magic Context writes with source session ID

---

## 5. Gap 4 — Per-Project Search & Semantic Indexes

### 5.1 Problem

AFT's trigram index and semantic embedding index are both **off by default** (`search_index: false`, `semantic_search: false`). Without them, `grep` falls back to direct scanning (no persistence, no speedup) and `aft_search` (semantic search) is not registered as a tool at all. Agentsy currently has no mechanism to configure these per-project, so every project starts without indexed search.

### 5.2 Solution: Default-On Config with Per-Project Override

#### 5.2.1 Config Schema Extension

Add `aft` and `magicContext` namespaces to agentsy's config system:

```typescript
// packages/cli/src/config/schema/aft.ts

export const AftConfigSchema = z.object({
  enabled: z.boolean().default(true),
  toolSurface: z.enum(['minimal', 'recommended', 'all']).default('recommended'),
  searchIndex: z.boolean().default(true),        // ON by default for agentsy
  semanticSearch: z.boolean().default(true),     // ON by default for agentsy
  semantic: z.object({
    backend: z.enum(['fastembed', 'openai_compatible', 'ollama']).default('fastembed'),
    model: z.string().default('all-MiniLM-L6-v2'),
    base_url: z.string().optional(),              // USER-ONLY — not settable from project config
    api_key_env: z.string().optional(),           // USER-ONLY
    timeout_ms: z.number().default(25000),
    max_batch_size: z.number().default(64),
    max_files: z.number().default(20000),
  }).default({}),
  hoistBuiltinTools: z.boolean().default(true),
  autoUpdate: z.boolean().default(false),         // Disabled — agentsy manages versions via pnpm
  lsp: z.object({
    autoInstall: z.boolean().default(false),      // USER-ONLY
    servers: z.record(z.any()).optional(),         // USER-ONLY
  }).optional(),
}).default({});
```

```typescript
// packages/cli/src/config/schema/magic-context.ts

export const MagicContextConfigSchema = z.object({
  enabled: z.boolean().default(true),
  dbPath: z.string().optional(),                  // Override default XDG path
  memory: z.object({
    enabled: z.boolean().default(true),
    injectionBudgetTokens: z.number().default(4000),
    autoSearchEnabled: z.boolean().default(true),
    autoPromote: z.boolean().default(true),
  }).default({}),
  embedding: z.object({
    provider: z.enum(['local', 'openai_compatible', 'off']).default('local'),
    model: z.string().default('Xenova/all-MiniLM-L6-v2'),
  }).default({}),
}).default({});
```

#### 5.2.2 Config Merge Logic

Three-level merge (same pattern as agentsy's existing config):

```text
Priority (highest wins):
  1. CLI flags (--aft.search-index=false)
  2. Environment variables (AGENTSY_AFT_SEARCH_INDEX=false)
  3. Project config (<project>/.agentsy/config.json → aft.*)
  4. User config (~/.config/agentsy/config.json → aft.*)
  5. Schema defaults
```

**Trust boundary enforcement**: Fields marked USER-ONLY above (`semantic.base_url`, `semantic.api_key_env`, `lsp.autoInstall`, `lsp.servers`) are stripped from project-level config during merge. A project's `.agentsy/config.json` cannot set these values.

#### 5.2.3 Index Initialization

When AFT bridge starts for a project, pass the resolved config:

```typescript
// In bridge initialization (aft-manager.ts extension)
const bridge = pool.getBridge(projectRoot);

// Send configure command with resolved search settings
await bridge.send('configure', {
  search_index: resolvedConfig.aft.searchIndex,
  semantic_search: resolvedConfig.aft.semanticSearch,
  semantic: resolvedConfig.aft.semantic,
  // ... other config fields
});
```

The `configure` command tells the running `aft` process to enable/disable indexes. The trigram index builds in the background on first enable. The semantic index downloads the ONNX model on first enable and builds embeddings progressively.

#### 5.2.4 First-Run Experience

On first session in a new project:

1. AFT bridge starts with `searchIndex: true` and `semanticSearch: true`
2. Trigram index begins background build (fast — seconds for small projects, minutes for large)
3. Semantic index downloads ONNX model (~90MB, once) then builds embeddings (longer — depends on file count)
4. StatusRail shows index build progress: `AFT: indexing... 45%`
5. Tools degrade gracefully: `grep` uses direct scan until trigram index is ready; `aft_search` returns "index building" until semantic index is ready

### 5.3 Acceptance Criteria

- [ ] `search_index` defaults to `true` in agentsy config
- [ ] `semantic_search` defaults to `true` in agentsy config
- [ ] Per-project config can override both settings
- [ ] Trust boundary strips user-only fields from project config
- [ ] Index build progress is visible in TUI status
- [ ] Tools degrade gracefully when indexes are building
- [ ] `configure` command is sent to AFT bridge on session start
- [ ] ONNX model download happens automatically on first semantic search enable

---

## 6. Gap 5 — TUI Widgets

### 6.1 Problem

AFT provides only a one-line ASCII status bar appended to tool output text. Magic Context provides a proper TUI sidebar, but it's implemented as a separate OpenCode TUI plugin using an RPC notification queue. Agentsy's TUI (built on Ink in `@agentsy/ui`) has neither.

### 6.2 Solution: Native Ink Widgets

Build AFT and Magic Context widgets as native Ink (React-for-terminal) components within `@agentsy/ui/cortexkit/`, integrated into the existing `WorkspaceShell` tab system.

#### 6.2.1 File Structure

```text
packages/ui/src/cortexkit/
├── index.ts                     # Public exports
├── AftDashboard.tsx             # Main AFT status tab
├── AftStatusBarSegment.tsx      # StatusRail segment for AFT
├── MagicContextBrowser.tsx      # Main Magic Context tab
├── MagicContextStatusSegment.tsx # StatusRail segment for context
├── components/
│   ├── IndexStatus.tsx          # Trigram + semantic index build state
│   ├── MemoryList.tsx           # Project memories by category
│   ├── MemoryDetail.tsx         # Single memory with metadata
│   ├── CompartmentTimeline.tsx  # Session history tiers
│   ├── InspectionSummary.tsx    # AFT inspect results (errors, warnings, etc.)
│   └── LspStatusBar.tsx         # LSP server status indicators
└── hooks/
    ├── useAftStatus.ts          # Poll AFT status from bridge
    ├── useMemoryCounts.ts       # Read memory counts from MC DB
    └── useCompactionState.ts    # Read compaction state from MC DB
```

#### 6.2.2 AFT Dashboard Widget

```tsx
// packages/ui/src/cortexkit/AftDashboard.tsx

export function AftDashboard({ palette, bridge }: AftDashboardProps) {
  const status = useAftStatus(bridge);  // Polls every 2s

  return (
    <FramedPanel title="AFT Code Intelligence" palette={palette}>
      {/* Index Status */}
      <IndexStatus
        trigramReady={status.trigramIndex.ready}
        trigramFiles={status.trigramIndex.fileCount}
        semanticReady={status.semanticIndex.ready}
        semanticFiles={status.semanticIndex.fileCount}
        semanticModel={status.semanticIndex.model}
        palette={palette}
      />

      {/* LSP Servers */}
      <LspStatusBar servers={status.lspServers} palette={palette} />

      {/* Codebase Health (from last inspect or status bar counts) */}
      <InspectionSummary
        errors={status.errors}
        warnings={status.warnings}
        deadCode={status.deadCode}
        unusedExports={status.unusedExports}
        duplicates={status.duplicates}
        todos={status.todos}
        palette={palette}
      />

      {/* Undo/Checkpoint State */}
      <Box>
        <Text color={palette.muted}>Undo depth: {status.undoDepth}/20</Text>
        <Text color={palette.muted}>Checkpoints: {status.checkpointCount}</Text>
      </Box>
    </FramedPanel>
  );
}
```

#### 6.2.3 Magic Context Browser Widget

```tsx
// packages/ui/src/cortexkit/MagicContextBrowser.tsx

export function MagicContextBrowser({ palette, dbPath }: MagicContextBrowserProps) {
  const [selectedCategory, setCategory] = useState<string>('all');
  const memories = useMemoryCounts(dbPath, selectedCategory);
  const compaction = useCompactionState(dbPath);

  return (
    <FramedPanel title="Magic Context" palette={palette}>
      {/* Context Window Usage */}
      <Box flexDirection="row" gap={2}>
        <Text>Context: {compaction.usagePercent}%</Text>
        <Text color={compaction.historianActive ? palette.success : palette.muted}>
          Historian: {compaction.historianActive ? 'running' : 'idle'}
        </Text>
      </Box>

      {/* Memory Categories */}
      <Dropdown
        options={['all', 'ARCHITECTURE', 'CONSTRAINTS', 'CONFIG_VALUES', 'NAMING', 'PROJECT_RULES']}
        selected={selectedCategory}
        onChange={setCategory}
        palette={palette}
      />

      {/* Memory List */}
      <MemoryList memories={memories} palette={palette} />
    </FramedPanel>
  );
}
```

#### 6.2.4 StatusRail Integration

Add AFT and Magic Context status to the bottom status bar:

```tsx
// In the CLI app that assembles StatusRail:
const statusSegments: StatusSegment[] = [
  // ... existing segments (mode, context, agent name) ...
  { text: `E${aftStatus.errors}`, color: aftStatus.errors > 0 ? palette.error : palette.success },
  { text: `W${aftStatus.warnings}`, color: aftStatus.warnings > 0 ? palette.warning : palette.muted },
  { text: `${memoryCount}mem`, color: palette.info },
  { text: `ctx:${compactionUsage}%`, color: compactionUsage > 65 ? palette.warning : palette.muted },
];
```

#### 6.2.5 WorkspaceShell Tab Registration

```typescript
// In the CLI app that assembles WorkspaceShell:
const tabs: WorkspaceTab[] = [
  { key: '1', label: 'Session', content: <InkSessionRenderer .../> },
  { key: '2', label: 'Files', content: <WorkspaceTree .../> },
  { key: '3', label: 'AFT', content: <AftDashboard palette={palette} bridge={bridge} /> },
  { key: '4', label: 'Context', content: <MagicContextBrowser palette={palette} dbPath={dbPath} /> },
  { key: '5', label: 'Log', content: <AgentLog .../> },
  { key: '6', label: 'Console', content: <OrchestratorConsole .../> },
];
```

#### 6.2.6 Data Hooks

```typescript
// packages/ui/src/cortexkit/hooks/useAftStatus.ts
export function useAftStatus(bridge: BinaryBridge | null) {
  const [status, setStatus] = useState<AftStatus | null>(null);

  useEffect(() => {
    if (!bridge) return;
    const interval = setInterval(async () => {
      try {
        const response = await bridge.send('status', {});
        setStatus(parseStatusResponse(response));
      } catch {
        // Bridge may not be ready yet
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [bridge]);

  return status;
}
```

```typescript
// packages/ui/src/cortexkit/hooks/useMemoryCounts.ts
export function useMemoryCounts(dbPath: string | null, category: string) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);

  useEffect(() => {
    if (!dbPath) return;
    const db = openCortexKitDbReadOnly();
    if (!db) return;

    const query = category === 'all'
      ? 'SELECT * FROM project_memories WHERE status = ? ORDER BY importance DESC LIMIT 50'
      : 'SELECT * FROM project_memories WHERE status = ? AND category = ? ORDER BY importance DESC LIMIT 50';

    const rows = db.query(query, ['active', category]);
    setMemories(rows);
  }, [dbPath, category]);

  return memories;
}
```

### 6.3 Acceptance Criteria

- [ ] AFT Dashboard tab renders in WorkspaceShell with live polling
- [ ] Dashboard shows: index status, LSP server status, codebase health metrics, undo state
- [ ] Magic Context Browser tab renders with memory list, category filter, context usage
- [ ] StatusRail shows AFT error/warning counts and memory count
- [ ] All widgets use `FramedPanel` and `AcidPalette` for consistent theming
- [ ] Widgets degrade gracefully when AFT bridge or MC DB is unavailable
- [ ] Polling intervals are configurable (default 2s for AFT, 5s for MC)

---

## 7. Auto-Update Strategy

### 7.1 Decision

**Disable CortexKit plugin auto-update. Use standard pnpm dependency management.**

The OpenCode/Pi plugin auto-updater:

- Runs `npm install` into the host's plugin directory
- Reads `findPluginEntry(ctx.directory)` to locate the plugin in host config
- These mechanisms have no target in a direct-import architecture

Instead:

- `@cortexkit/aft-bridge` version is managed in agentsy's `package.json`
- `pnpm update @cortexkit/aft-bridge` updates the TypeScript bridge package
- `ensureBinary()` in the bridge package handles AFT Rust binary download automatically
- Binary auto-download is independent of plugin auto-update and works regardless

### 7.2 Version Pinning

```json
// package.json (agentsy root)
{
  "dependencies": {
    "@cortexkit/aft-bridge": "^0.39.4"
  },
  "pnpm": {
    "overrides": {
      "@cortexkit/aft-bridge": "$@cortexkit/aft-bridge"
    }
  }
}
```

The `^` semver range allows patch/minor updates via `pnpm update`. Major version bumps require explicit `package.json` changes.

### 7.3 Binary Version Coordination

The bridge package and Rust binary share a version. `ensureBinary()` resolves the binary matching the bridge package version. If the binary is missing or outdated, it downloads from GitHub releases with SHA-256 verification. No additional coordination needed.

---

## 8. Implementation Sequence

### 8.1 Sprint Breakdown

| Sprint | Tasks | Story Points | Dependencies |
|---|---|---|---|
| **23.1** | G1: `ToolRegistry.replace()` + bridge helper + hoisted tools (read/write/edit/grep/glob) | 5 | Phase 12 |
| **23.2** | G1: Sensory tools (outline/zoom/search/callgraph/inspect) + motor tools (refactor/imports/ast-grep) | 5 | 23.1 |
| **23.3** | G1: LSP tools (6) + brainstem tools (safety/bash-status) + tool surface tier config | 5 | 23.1 |
| **23.4** | G2: Governance hooks (PreToolCall guardrails + PostToolCall audit) | 3 | 23.1 |
| **23.5** | G4: Config schema (aft.* + magicContext.*) + per-project merge + trust boundary | 3 | — |
| **23.6** | G4: Index enablement (configure command on bridge start) + first-run UX | 2 | 23.5 |
| **23.7** | G3: Memory injection hook (PreModelCall → read MC DB → inject) | 3 | 23.5 |
| **23.8** | G3: Memory capture hook (PostToolCall → extract → write MC DB) | 2 | 23.7 |
| **23.9** | G3: Compaction delegation hook (PreCompact → write compartment) | 2 | 23.7 |
| **23.10** | G5: AFT Dashboard widget + StatusRail segment | 3 | 23.2, 23.4 |
| **23.11** | G5: Magic Context Browser widget + StatusRail segment | 3 | 23.7 |
| **23.12** | Schema extension + integration tests + documentation | 2 | All above |

**Total: 38 story points** (revised from initial 28 estimate after full analysis — the TUI widgets and schema extension added scope)

### 8.2 Critical Path

```text
23.1 (ToolRegistry.replace + hoisted tools)
├── 23.2 (sensory + motor tools)
│   └── 23.10 (AFT Dashboard widget)
├── 23.3 (LSP + brainstem tools)
├── 23.4 (governance hooks)
└── (parallel) ───────────────────────────────┐
                                               │
23.5 (config schema)                           │
├── 23.6 (index enablement)                    │
├── 23.7 (memory injection)                    │
│   ├── 23.8 (memory capture)                  │
│   ├── 23.9 (compaction delegation)           │
│   └── 23.11 (MC Browser widget)              │
└── 23.12 (schema extension + tests + docs) ◄──┘
```

### 8.3 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@cortexkit/aft-bridge` API changes break integration | Medium | High | Pin version in package.json; abstract behind `callBridge` helper; watch changelog |
| ONNX Runtime not available on all platforms | Low | Medium | `ensureOnnxRuntime()` handles installation; fallback to `openai_compatible` backend |
| Magic Context DB schema version mismatch | Medium | Medium | Schema fence in existing `openCortexKitDb()` — fail-closed on version mismatch |
| Large project index build blocks first session | High | Low | Background build with progress; tools degrade gracefully to direct scan |
| Governance hooks add latency to every tool call | Low | Low | Hook is a fast check (annotation lookup + conditional guardrail scan); profile in CI |
| `ToolRegistry.replace()` breaks existing code | Low | High | New method, doesn't change existing `register`/`remove` behavior; comprehensive tests |

---

## 9. Testing Strategy

### 9.1 Unit Tests

- `ToolRegistry.replace()` — verify hoisting, aliasing, fallback
- Config schema — validate merge logic, trust boundary stripping, defaults
- Bridge helper — mock `BinaryBridge` responses, verify parameter mapping
- Governance hooks — mock events, verify approval gating and audit logging
- Memory hooks — mock MC DB, verify injection format and capture extraction

### 9.2 Integration Tests

- Bridge lifecycle: start → configure → tool calls → status → shutdown
- Tool hoisting: register baseline → replace with AFT → verify AFT-backed execution → verify fallback on bridge failure
- Index build: enable search_index → verify background build → verify trigram grep uses index
- Semantic search: enable semantic_search → verify ONNX model download → verify hybrid search results
- MC DB round-trip: write memory via capture hook → read via injection hook → verify content matches
- Compaction: trigger PreCompact → verify compartment written to MC DB → verify default compaction skipped

### 9.3 End-to-End Tests

- Full session: start agentsy with AFT + MC enabled → agent reads file (AFT read with syntax footer) → agent edits file (AFT edit with validation + rollback test) → verify audit log → verify memories captured → trigger compaction → verify compartment in MC DB
- TUI: start agentsy TUI → verify AFT Dashboard tab renders with live data → verify MC Browser tab shows memories → verify StatusRail segments update

### 9.4 Mock Strategy

- AFT bridge: Create `MockBinaryBridge` that returns fixture responses
- Magic Context DB: Use in-memory SQLite (`:memory:`) with schema applied
- Gateway: Mock for historian/dreamer model routing tests

---

## 10. Metrics & Observability

### 10.1 Key Metrics

| Metric | Source | Alert Threshold |
|---|---|---|
| AFT bridge startup time | `aft-manager.ts` | > 5s |
| Index build time (trigram) | Bridge `configure` response | > 60s |
| Index build time (semantic) | Bridge `configure` response | > 300s |
| Tool call latency (AFT vs baseline) | PostToolCall hook | > 2x baseline |
| Governance hook latency | Hook timing | > 50ms per call |
| Memory injection token count | PreModelCall hook | > 5000 tokens |
| Memory capture rate | PostToolCall hook | < 1 observation per 10 mutations |
| MC DB write latency | Capture hook | > 100ms |
| Compaction delegation success rate | PreCompact hook | < 95% |
| TUI widget poll success rate | Widget hooks | < 99% |

### 10.2 Health Check

Add AFT and Magic Context to `agentsy doctor`:

```text
$ agentsy doctor cortexkit

AFT Bridge:
  ✓ Binary found: ~/.cache/aft/bin/v0.39.4/aft
  ✓ Bridge pool: 1 active, 0 idle
  ✓ Trigram index: ready (12,345 files indexed)
  ✓ Semantic index: ready (all-MiniLM-L6-v2, 12,345 files)
  ✗ LSP: typescript-language-server not found (install: pnpm add -g typescript-language-server)

Magic Context:
  ✓ Database: ~/.local/share/cortexkit/magic-context/context.db
  ✓ Schema version: 38 (matches)
  ✓ Memories: 847 active, 23 archived
  ✓ Compartments: 12 sessions, 156 total
  ✗ Dreamer: last run 72h ago (schedule: 02:00-06:00)
```

---

## Appendix A: AFT Tool Surface Reference

Complete list of AFT bridge commands mapped to agentsy tool names:

| Bridge Command | Agentsy Tool Name | Tier | Annotations |
|---|---|---|---|
| `read` | `read` | recommended | `readOnly` |
| `write` | `write` | recommended | `destructive`, `approval`, `openWorld` |
| `edit` | `edit` | recommended | `destructive`, `approval` |
| `grep` | `grep` | recommended* | `readOnly` (*requires search_index) |
| `glob` | `glob` | recommended* | `readOnly` (*requires search_index) |
| `outline` | `aft_outline` | recommended | `readOnly` |
| `zoom` | `aft_zoom` | recommended | `readOnly` |
| `semantic_search` | `aft_search` | recommended* | `readOnly` (*requires semantic_search) |
| `callgraph` | `aft_callgraph` | all | `readOnly` |
| `inspect` | `aft_inspect` | recommended | `readOnly` |
| `move_symbol` | `aft_refactor` | all | `destructive`, `approval` |
| `extract_function` | `aft_refactor` | all | `destructive`, `approval` |
| `inline_symbol` | `aft_refactor` | all | `destructive`, `approval` |
| `organize_imports` | `aft_import` | recommended | `destructive` |
| `add_import` | `aft_import` | recommended | `destructive` |
| `remove_import` | `aft_import` | recommended | `destructive` |
| `ast_search` | `ast_grep_search` | recommended | `readOnly` |
| `ast_replace` | `ast_grep_replace` | recommended | `destructive`, `approval` |
| `lsp_diagnostics` | `lsp_diagnostics` | recommended | `readOnly` |
| `lsp_hover` | `lsp_hover` | recommended | `readOnly` |
| `lsp_goto_definition` | `lsp_goto_definition` | recommended | `readOnly` |
| `lsp_find_references` | `lsp_find_references` | recommended | `readOnly` |
| `lsp_rename` | `lsp_rename` | recommended | `destructive`, `approval` |
| `lsp_prepare_rename` | `lsp_prepare_rename` | recommended | `readOnly` |
| `status` | (internal) | — | — |
| `configure` | (internal) | — | — |
| `checkpoint` | `aft_checkpoint` | all | — |
| `restore_checkpoint` | `aft_checkpoint` | all | `destructive`, `approval` |
| `undo` | `aft_undo` | all | `destructive`, `approval` |
| `bash_status` | `bash_status` | all | `readOnly` |
| `bash_kill` | `bash_kill` | all | `destructive`, `approval` |
| `bash_watch` | `bash_watch` | all | `readOnly` |
| `bash_write` | `bash_write` | all | `openWorld` |
| `bash_drain_completions` | `bash_drain` | all | `readOnly` |
| `conflicts` | `aft_conflicts` | all | `readOnly` |
| `delete_file` | `aft_delete` | all | `destructive`, `approval` |
| `move_file` | `aft_move` | all | `destructive`, `approval` |

---

## Appendix B: Magic Context Database Schema (Extended)

Tables to add to `@agentsy/shared/cortexkit/schema.ts` beyond the current 4:

| Table | Key Columns | Purpose |
|---|---|---|
| `memories` | `id`, `project_path`, `category`, `content`, `normalized_hash`, `importance`, `source_session_id`, `source_type`, `status`, `verification_status`, `expires_at`, `metadata_json` | Full memory model |
| `memory_embeddings` | `memory_id`, `embedding` (BLOB), `model_id` | Vector embeddings |
| `memories_fts` | (FTS5 virtual table on memories.content) | Full-text search |
| `session_facts` | `session_id`, `fact`, `category`, `source_turn` | Per-session extracted facts |
| `notes` | `id`, `project_path`, `content`, `surface_condition`, `status` | Scratchpad + smart notes |
| `dream_queue` | `id`, `project_path`, `task`, `status`, `enqueued_at` | Dreamer task scheduling |
| `dream_runs` | `id`, `project_path`, `task`, `started_at`, `completed_at`, `result` | Dreamer execution history |
| `pending_ops` | `id`, `session_id`, `op_type`, `payload`, `expires_at` | Cache-aware deferred operations |
| `compartment_events` | `id`, `session_id`, `event_type`, `payload` | Compartment lifecycle events |

---

## Appendix C: Config Reference

### User-Level Config (`~/.config/agentsy/config.json`)

```jsonc
{
  "aft": {
    "enabled": true,
    "toolSurface": "recommended",
    "searchIndex": true,
    "semanticSearch": true,
    "semantic": {
      "backend": "fastembed",
      "model": "all-MiniLM-L6-v2",
      "base_url": "https://api.openai.com/v1",  // USER-ONLY
      "api_key_env": "OPENAI_API_KEY",           // USER-ONLY
      "timeout_ms": 25000,
      "max_batch_size": 64,
      "max_files": 20000
    },
    "hoistBuiltinTools": true,
    "lsp": {
      "autoInstall": false,  // USER-ONLY
      "servers": {}          // USER-ONLY
    }
  },
  "magicContext": {
    "enabled": true,
    "memory": {
      "enabled": true,
      "injectionBudgetTokens": 4000,
      "autoSearchEnabled": true,
      "autoPromote": true
    },
    "embedding": {
      "provider": "local",
      "model": "Xenova/all-MiniLM-L6-v2"
    }
  }
}
```

### Project-Level Config (`<project>/.agentsy/config.json`)

```jsonc
{
  "aft": {
    "searchIndex": true,          // Can disable per-project if needed
    "semanticSearch": true,
    "semantic": {
      "model": "all-MiniLM-L6-v2",
      "max_files": 5000           // Smaller cap for large monorepos
      // base_url and api_key_env are STRIPPED — cannot be set here
    },
    "toolSurface": "all"          // Full power for this project
  },
  "magicContext": {
    "memory": {
      "injectionBudgetTokens": 6000  // More memory context for complex projects
    }
  }
}
```
