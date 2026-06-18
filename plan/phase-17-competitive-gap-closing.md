

## 22. Phase 17 — Competitive Gap-Closing Sprint

**Priority**: P2 — Sprints 9–10
**Story points**: 12
**Branch**: `feat/competitive-gaps`
**Depends on**: Phase 3 ✅ (hooks), Phase 6 ✅ (streaming), Phase 14 ✅ (ACP)
**Closes**: Residual competitive P0 + P1 items not absorbed in earlier phases

This phase closes the remaining competitive gaps that don't have a natural architectural home in Phases 3, 6, or 14. Items are grouped by source framework.

### 22.1 From aider

**RepoMap (tree-sitter + PageRank context ranking)** — ~3 SP
Structural context ranking that complements vector search. Tree-sitter extracts symbols (functions, classes, methods) from every file in the project. NetworkX-style graph connects symbols by reference. PageRank with personalization (bias toward currently-open files) ranks symbols by importance. The top-N symbols' surrounding code becomes the "repo map" injected into the context.

```typescript
// packages/retrieval/src/repo-map.ts (NEW)

export class RepoMap {
  async build(rootPath: string): Promise<RepoMapIndex> {
    // 1. Walk all source files
    // 2. For each file, run tree-sitter to extract symbols
    // 3. Build a reference graph (symbol → referenced symbols)
    // 4. Run PageRank with personalization vector
    // 5. Return the ranked symbol list with file paths and line ranges
  }

  async getMap(scope: string, openFiles: string[], limit: number): Promise<RepoMapEntry[]> {
    // Return the top-N symbols, biased toward open files
  }
}
```

**Edit-format DSLs (SEARCH/REPLACE with RelativeIndenter, udiff, whole-file)** — ~4 SP
Open-model support. Many open models (DeepSeek, Qwen, Llama) struggle with structured tool calls but excel at edit-format DSLs. Implement 3 formats:
- **SEARCH/REPLACE** with `RelativeIndenter` (indentation-agnostic matching)
- **udiff** (unified diff format)
- **whole-file** (replace entire file content)

Each format has a parser that converts the model output into a `FileEdit` operation applied by the runtime.

### 22.2 From agent-zero

**DirtyJson tolerant parser** — ~1 SP
Handles malformed LLM JSON: trailing commas, comments, broken brackets, streaming `feed()`. Used as a fallback when strict JSON parsing fails.

```typescript
// packages/core/src/dirty-json.ts (NEW)

export class DirtyJson {
  feed(chunk: string): void { /* accumulate streaming input */ }
  parse<T>(): T | null { /* tolerant parse with recovery */ }
}

export function dirtyParse<T>(input: string): T | null {
  // 1. Try strict JSON.parse
  // 2. If fails, try removing trailing commas
  // 3. If fails, try adding missing closing brackets
  // 4. If fails, try extracting the first JSON object via brace matching
  // 5. If all fail, return null
}
```

### 22.3 From pi

**`prepareNextTurn` / `shouldStopAfterTurn` hooks** — ~1 SP
Allow compaction or model swap mid-session. `prepareNextTurn` runs before each turn and can swap context, model, or thinking configuration. `shouldStopAfterTurn` runs after each turn and can signal graceful stop.

**`convertToLlm` + `transformContext` two-stage** — ~0.5 SP
Clean separation of context transformation from LLM filtering. `transformContext` runs first (applies memory, compaction, scope filtering). `convertToLlm` runs second (converts internal message format to provider-specific format).

**Session tree (fork/clone)** — ~2 SP
Each entry has `parentId`. Fork creates a new branch from any entry. Clone duplicates a branch. `/tree` navigation. Branch summarization for long-running sessions.

### 22.4 From codex

**Guardian LLM-as-judge with circuit breaker** — ~2 SP
Dynamic safety gate. An LLM judges whether each tool call is safe. Circuit breaker: 3 denials per turn → abort. Sliding window: 10 denials per 50 turns → tighten approval policy.

```typescript
// packages/guardrails/src/scanners/guardian.ts (NEW)

export class GuardianScanner implements GuardrailScanner {
  readonly id = 'guardian';
  readonly phase: GuardrailPhase = 'tool-input';

  private consecutiveDenials = 0;
  private recentDenials: number[] = [];  // timestamps

  async evaluate(input: ToolCallInput, context: GuardrailContext): Promise<GuardrailResult> {
    // 1. Check circuit breaker
    if (this.consecutiveDenials >= 3) {
      return { status: 'block', phase: 'tool-input', reason: 'Guardian circuit breaker tripped' };
    }

    // 2. LLM judge
    const verdict = await this.llmJudge(input, context);
    if (verdict === 'deny') {
      this.consecutiveDenials++;
      this.recentDenials.push(Date.now());
      this.pruneOldDenials();
      return { status: 'block', phase: 'tool-input', reason: 'Guardian denied tool call' };
    }

    this.consecutiveDenials = 0;
    return { status: 'pass', phase: 'tool-input' };
  }
}
```

**Event-sourced rollout + reducer** — ~2 SP
JSONL append-only event log. Materialized views for conversation, tool calls, inference, compaction. Enables `keep_forked_rollout_item` fork predicate (system+user+final-assistant only, drop reasoning/tool/output).

**WebSocket Responses API support** — ~1 SP
Prewarm + sticky routing for lower TTFT. `response.create` with `generate=false` prewarms the connection. `x-codex-turn-state` enables sticky routing.

### 22.5 From opencode

**`ContextEpoch` revision tracking** — ~0.5 SP
Abort and rebuild on mid-turn model switch. Each context has an epoch; if the model changes mid-turn, the current turn is aborted and rebuilt with the new model.

**Structured Markdown compaction template** — ~0.5 SP
8 stable sections for grep-able summaries: Goal, Constraints, Progress, Decisions, Next Steps, Critical Context, Relevant Files. Compaction output is a Markdown file rather than free text.

### 22.6 From Claude-Code

**Persistent shell (cwd tracking, env accumulation)** — ~1 SP
A shell session that persists across tool calls. CWD tracks the user's location. Environment variables accumulate. Each `run_command` tool call uses this shell.

**Disk-spilled tool results** — already done in Phase 14 §19.5.

**Tool deny-rule filtering at registration** — ~0.5 SP
Strip tools from the tool list before the model sees them. Per-agent deny rules in the agent YAML:

```yaml
# packages/agents/src/specs/coder.yaml
tools:
  allow: [read_file, write_file, edit_file, run_command]
  deny: [delete_file, format_disk]  # Stripped before model sees them
```

**Slash command argument substitution** — ~0.5 SP
`$ARGUMENTS`, `$1`, `$2` substitution in slash commands:

```yaml
# .agentsy/commands/refactor.yaml
description: "Refactor the given file"
prompt: |
  Refactor $ARGUMENTS to improve readability and reduce complexity.
  Apply the SOLID principles where appropriate.
```

Invocation: `/refactor src/utils/parser.ts` → `$ARGUMENTS` = `src/utils/parser.ts`.

**`AGENTS.md` discovery** — already done in Phase 15 §20.8.

### 22.7 From oh-my-pi

**`pi-iso` isolation PAL trait** — ~1 SP
Cross-platform COW isolation. 8 backends: APFS clonefile (macOS), btrfs (Linux), ZFS, overlayfs, Linux reflink, Windows block clone, ProjFS, Rcopy fallback. `probe`/`start`/`stop`/`diff` API with automatic fallback.

**`pi-shell` output minimizer** — ~1 SP
Per-language output filters that reduce command output to essential signal. Filters for cargo, go, jvm, docker, git, npm, etc. Strips ANSI codes, progress bars, and verbose logs.

**`pi-ast` structural summaries** — ~1 SP
Tree-sitter-based code summarization for context compression. Replaces a long file's content with a structural summary (top-level functions, classes, exports).

### 22.8 Verification

- [ ] `RepoMap` builds and ranks symbols via PageRank
- [ ] 3 edit-format DSLs (SEARCH/REPLACE, udiff, whole-file) work
- [ ] `DirtyJson` parses malformed LLM JSON
- [ ] `prepareNextTurn` / `shouldStopAfterTurn` hooks work
- [ ] `convertToLlm` + `transformContext` two-stage separation
- [ ] Session tree fork/clone works
- [ ] `GuardianScanner` LLM-as-judge with circuit breaker
- [ ] Event-sourced rollout + reducer
- [ ] WebSocket Responses API support
- [ ] `ContextEpoch` revision tracking
- [ ] Structured Markdown compaction template
- [ ] Persistent shell with cwd tracking
- [ ] Tool deny-rule filtering at registration
- [ ] Slash command argument substitution
- [ ] `pi-iso` isolation PAL trait (8 backends)
- [ ] `pi-shell` output minimizer
- [ ] `pi-ast` structural summaries
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

