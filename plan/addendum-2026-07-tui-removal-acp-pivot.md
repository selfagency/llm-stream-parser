# Addendum — 2026-07 TUI Removal & ACP-Centric Architecture Pivot

**Version**: 1.0
**Date**: 2026-07-21
**Status**: PROPOSED — fundamental shift from custom TUI to ACP protocol clients
**Impact**: Removes the Ink/React terminal chat app (~50 files under `packages/ui/src/ink/` + 1 dead adapter) and the empty `packages/renderers/` ghost dir; removes `agentsy chat`/`agentsy tui` CLI commands. **Does not touch** `@agentsy/ui`'s renderer infrastructure (`ui/`, `cli/`, `plain/`, `streaming-md/`, shared types) — that stays, since `@agentsy/vscode`'s Copilot Chat integration and CLI diagnostics depend on it. Elevates Phase 14 (ACP) to P0. Phase 31 (AG-UI) is **not** deprioritized — it remains P1 and fully supported as a co-equal primary interface alongside ACP.

---

## 0. Strategic Rationale

Agentsy's core value is the **harness** — the daemon, routing, guardrails, memory, tokenomics, multi-agent orchestration, and ACP protocol support. The custom TUI (`@agentsy/ui` with 147 Ink components) is a distraction that:

1. **Diverts resources** — TUI rendering, keyboard handling, state management, component lifecycle absorb dev effort that should go into the harness
2. **Competes with ACP** — we're building both a custom chat UI AND working on ACP protocol support, creating redundant interface layers
3. **Limits adoption** — users want to use Zed, VS Code, Neovim, Cursor, or other editors they already have; a custom TUI is a niche tool
4. **Contradicts the thesis** — signals we don't trust the harness to work through standard protocols; creates a "our UI is better" trap
5. **Maintenance burden** — Ink dependencies, React-style component lifecycle, terminal rendering bugs are ongoing friction

**The shift**: Build the perfect **harness**. Let ACP clients (Zed with native ACP support, VS Code via the ACP Client extension, etc.) be the interface. Phase 14 (ACP Agent) becomes the primary vertical slice, not Phase 2's TUI.

---

## 1. What Gets Removed

**Correction (2026-07-21):** `@agentsy/ui` is a **composable renderer library**, not just a TUI. It ships five renderer targets from one package: Ink (terminal chat), CLI (ANSI markdown), Plain (zero-dep text), Streaming Markdown (browser DOM), and — critically — the **VS Code Chat renderer that `@agentsy/vscode`'s Copilot Chat integration depends on** (`RendererHandle`, `BaseRendererOptions`, `ThinkingStyle`, `CancellationToken`, `createSharedRendererHandle` from `shared.ts`/`types.ts`/`ui/`). **We keep supporting VS Code extensions, so none of the shared renderer abstraction or the VS Code-facing renderer surface is removed.** Only the literal Ink/React terminal chat app — the thing that plays the role of "our own chat interface" — comes out.

Likewise, `packages/renderers/` (the root-level package) is **not a renderer source to delete** — the Phase 2 audit already found it to be an empty ghost directory (`src/` already deleted, content merged into `@agentsy/ui`). It stays exactly as scheduled in Phase 29 (remove the empty dir + turbo.json reference) — a cosmetic cleanup, unrelated to this pivot.

### 1.1 `@agentsy/ui` — remove only the Ink/React terminal chat app

**Files to delete:**

```text
packages/ui/src/ink/                      # Ink/React terminal chat app: components (chat, streaming-text,
                                           # tool-call-block, agent-log, model-picker, etc.), ink-runtime-state,
                                           # ink-stream-renderer, themes — the literal custom chat interface
packages/ui/src/adapters/cli-bridge.ts    # Only exists to bridge the runtime turn loop into Ink's
                                           # InkRuntimeListeners — dead code once ink/ is gone
```

**What is explicitly KEPT (no changes) — these are load-bearing for `@agentsy/vscode`:**

- `packages/ui/src/ui/` — `RendererHandle`/`store`/event-sourcing core (imported by `@agentsy/vscode`)
- `packages/ui/src/cli/` — CLI markdown renderer (used by CLI diagnostics output, e.g. `doctor`, `memory`)
- `packages/ui/src/plain/` — zero-dependency plain-text renderer
- `packages/ui/src/streaming-md/` — browser DOM streaming markdown
- `packages/ui/src/shared.ts`, `packages/ui/src/types.ts`, `packages/ui/src/types/` — shared renderer contracts (`BaseRendererOptions`, `ThinkingStyle`, `CancellationToken`, `createSharedRendererHandle`)
- `packages/ui/src/index.ts` barrel — update only to drop the `ink` re-export (§1.2), everything else unchanged
- `packages/ui/package.json` — drop the `./ink` and `./ink/themes` export subpaths and the `ink`/`react`/`ink-testing-library` (dev/peer) dependencies; **`./cli`, `./plain`, `./streaming-md`, `./adapters`, `./ui` exports are untouched**

**Rationale:** The Ink tree is the one and only piece of `@agentsy/ui` that constitutes "our own chat interface." Everything else in the package is renderer *infrastructure* consumed by `@agentsy/vscode` (Copilot Chat integration, which we are explicitly continuing to support) and by CLI diagnostics commands, which remain in scope as harness tooling.

### 1.2 `packages/renderers` (root package) — unchanged, cosmetic cleanup only

Already an empty ghost directory per the Phase 2/29 audit (`src/` deleted, everything merged into `@agentsy/ui` under Phase 2). **No renderer code lives here to remove as part of this pivot.** Phase 29's existing task (remove the empty dir, update `turbo.json`) proceeds unchanged and is unrelated to the TUI/chat removal. Since the user confirmed the dir is empty, delete it now rather than waiting for Phase 29 — it's a superset of that task, not a conflict.

### 1.3 CLI commands to remove

| Command | Current Purpose | Action |
|---|---|---|
| `agentsy chat` | Launch TUI chat interface | **DELETE** — users use ACP clients instead |
| `agentsy tui` | TUI launcher | **DELETE** — same rationale |
| `agentsy cli` (if exists) | CLI mode of the TUI | **DELETE** — all CLI work is harness diagnostics |

**Rationale:** These commands assume agentsy provides a user-facing interface. Post-pivot, agentsy is a backend harness; interfaces are external (Zed, VS Code, etc.).

### 1.4 Related dependencies

Remove from root `package.json` and `@agentsy/ui` package.json:

- `ink` — React-style TUI framework
- `ink-*` plugins (ink-box, ink-select-input, etc.)
- `react` — (likely already removed if ink is gone)
- `chalk` — terminal colors (keep for CLI diagnostics output only)
- `commander` — CLI parsing (keep; needed for `agentsy config`, `agentsy doctor`, etc.)

---

## 2. What Gets Elevated: Phase 14 → P0

### 2.1 Phase 14 becomes the new P0 vertical slice

**Current status:** Phase 14 (ACP Agent & Multi-Agent) is P2, Sprints 7–8, with an extension §19.10 suggesting +5 SP for event ledger + translators.

**New status:** Promote to **P0, Sprints 1–3** with the full 12 SP scope (including event ledger).

**Rationale:**

- ACP is now THE interface layer, not a secondary protocol
- Users access agentsy through ACP-compatible editors (Zed, VS Code ACP Client, etc.)
- The ACP server stub in the daemon (296 LOC across acp-server.ts and acp-session-bridge.ts) must become production-grade
- Event ledger and translators unlock crash recovery, session replay, and permission management — essential for editor integration

### 2.2 Default ACP implementation targets

By Phase 14 completion, the daemon must satisfy:

| ACP Capability | Status | Notes |
|---|---|---|
| `initialize` → AGENT_CAPABILITIES | ✅ Exists (acp-capabilities.ts) | Enumerate all supported features |
| `session/new` with folder scoping | ✅ Partially (acp-session-bridge.ts) | Full implementation of scope derivation + multi-root support |
| Streaming via `session/update` notifications | ✅ Partial (Phase 6 streams) | Complete daemon wiring in Phase 14 |
| Terminal access (subprocess management) | ✅ Exists (SubprocessManager) | Expose via ACP `terminal/*` methods |
| Permission relay (human approval UI) | ⚠️ Stub | Full implementation for restrictive operations |
| Event ledger (session replay, crash recovery) | ❌ Missing | **NEW in Phase 14 extension §19.10** |
| Translators (cancel-scoping, error-kind, tool-streaming) | ❌ Missing | **NEW in Phase 14 extension §19.10** |

### 2.3 Zed + VS Code ACP Client as the reference integration

**Phase 14 verification:**

- [ ] `agentsy daemon start` exposes ACP via stdio (for Zed native ACP support)
- [ ] `agentsy daemon start --acp-ws` exposes ACP via WebSocket (for VS Code ACP Client extension)
- [ ] Zed can connect to daemon, spawn an agent in a folder, send a prompt, receive streamed tool calls
- [ ] VS Code ACP Client can do the same
- [ ] Session persists across editor restarts (via UnifiedDB.acp_sessions)
- [ ] Event ledger enables session replay from a recorded session

---

## 3. Phase 31 (AG-UI) Fully Supported (Co-Equal with ACP)

### 3.1 AG-UI is P1, co-equal primary interface with ACP

**Current status:** Phase 31 is P1, Sprint 6, with 3 SP for daemon HTTP endpoint wiring.

**Status after pivot:** **Remains P1, fully supported.** AG-UI (CopilotKit protocol) and ACP are now **co-equal primary interface contracts**. Both are reference integrations.

**Rationale:**

- CopilotKit is a mature, widely-adopted agentic framework; AG-UI is the wire protocol for it
- Having multiple protocol clients (CopilotKit via AG-UI + editors via ACP) ensures agentsy never becomes hostage to any single client ecosystem
- The `packages/runtime/src/ag-ui/` adapter code is already production-quality and well-tested
- Supporting both AG-UI and ACP gives users choice: use Zed/VS Code (ACP) or use CopilotKit-based frontends (AG-UI)

**Action:**

- Phase 31 remains in the active critical path, Sprints 6–7 (parallel with Phase 14/ACP work)
- Keep the AG-UI adapter code in `packages/runtime/src/ag-ui/` (already implemented, fully functional)
- Complete daemon wiring so both ACP and AG-UI streams reach clients correctly

---

## 4. Updated Phase Ladder (Affected Phases Only)

### 4.1 Phase 2 (Package Consolidation) — add UI removal

**Amendment:**

| Action | Files | Owner |
|---|---|---|
| Delete `@agentsy/ui` Ink/React terminal chat app | `packages/ui/src/ink/*` (50+ component files + themes) | @agentsy/ui Ink removal |
| Delete `@agentsy/ui` Ink bridge adapter | `packages/ui/src/adapters/cli-bridge.ts` (dead code once Ink gone) | Consolidation |
| Keep `@agentsy/ui` renderer infrastructure (no change) | `packages/ui/src/{ui,cli,plain,streaming-md,types,shared.ts}` | **Preserved for vscode extension + diagnostics** |
| Delete `packages/renderers` empty ghost dir | `packages/renderers/*` | Phase 29 cleanup |
| Update `@agentsy/ui` package.json exports | Remove `./ink` and `./ink/themes` export paths | @agentsy/ui exports |
| Update `@agentsy/ui` package.json dependencies | Remove `ink`, `react` peer deps and `ink-testing-library` dev dep | @agentsy/ui deps |
| Publish `@agentsy/renderers` deprecation notice | npm registry (0.1.3) | Deprecated, empty since Phase 2 |

**Updated package count:** 25 → 24 packages (only renderers empty dir deleted; @agentsy/ui shrinks but stays).

### 4.2 Phase 6 (Streaming Architecture) — no change

Streaming still critical; the daemon streams to ACP clients.

### 4.3 Phase 14 (ACP Agent) — promote to P0, add event ledger

**Amendment:**

| Change | Impact |
|---|---|
| Priority: P2 → **P0** | Sprint 1–3 instead of Sprint 7–8 |
| Story points: 7 → **12** (includes §19.10 event ledger + translators) | +5 SP for production-grade ACP |
| Unblocks: Phase 17+ → **Blocks nothing** (now critical path) | ACP is the interface layer |
| Verification: Add Zed + VS Code ACP Client smoke tests | Concrete integration proof |

**New scope for Phase 14:**

- ACP server fully wired in daemon (`acp-server.ts` + `acp-session-bridge.ts` complete)
- **SQLite event ledger** — `UnifiedDB.acp_events` with replay capability
- **6 critical translators** — replay, session-lineage, cancel-scoping, permission-relay, tool-streaming, error-kind
- Default agents (coder, researcher, planner) fully spec'd and loadable
- Zed integration verified (stdio ACP)
- VS Code integration verified (WebSocket ACP)

### 4.4 Phase 31 (AG-UI Adapter) — Fully supported, co-equal with ACP

**Amendment:**

| Change | Impact |
|---|---|
| Priority: P1 → **P1 (unchanged, co-equal with ACP)** | Sprint 6, parallel with Phase 14 |
| Story points: 3 (unchanged) | Complete daemon HTTP endpoint wiring |
| Rationale | AG-UI (CopilotKit) and ACP (editors) are both fully supported primary interfaces; neither is deprioritized |

---

## 5. CLI Commands: Retained vs Removed

### 5.1 Commands to REMOVE

```bash
agentsy chat              # ❌ TUI chat — use Zed or VS Code ACP Client instead
agentsy tui               # ❌ TUI launcher — same
```

### 5.2 Commands to KEEP (harness diagnostics)

```bash
agentsy daemon start      # ✅ Start the daemon (now primary entry point)
agentsy config            # ✅ Manage configuration
agentsy doctor            # ✅ Diagnostics
agentsy secrets           # ✅ Manage secrets
agentsy memory            # ✅ Query/manage memory
agentsy tokenomics        # ✅ Token tracking
agentsy guardrails        # ✅ Safety policies
agentsy session           # ✅ Session management
agentsy mcp               # ✅ MCP server management
agentsy setup             # ✅ Project setup
agentsy sanitize          # ✅ Trust workflow
agentsy lb-status         # ✅ Load balancer status
agentsy retrieval         # ✅ RAG diagnostics
agentsy connectors        # ✅ Connector management (if kept)
```

---

## 6. Documentation Updates Required

### 6.1 Overview (`plan/00-overview.md`)

**Update AD-1 (Daemon as Central Process):**

Current:
> CLI and TUI are thin IPC clients over Unix domain sockets.

New:
> CLI is a thin daemon client. **TUI is removed.** Interfaces are external: Zed (native ACP), VS Code (ACP Client extension), other ACP-compatible editors.

**Update AD-10 (ACP Agent):**

Current:
> The daemon becomes an ACP Agent. This replaces the planned custom VS Code extension.

New (clarify):
> The daemon is an ACP Agent. This is the primary interface mechanism; ACP clients (Zed, VS Code via ACP Client, etc.) connect to the daemon. ACP is the interface contract, not the daemon's UI layer.

### 6.2 Phase 2 (`plan/phase-02-package-consolidation.md`)

Add section:

```markdown
### 7.6 TUI Removal (2026-07 Pivot)

**Status change (July 2026):** Remove the Ink/React terminal chat app from @agentsy/ui.

The custom TUI distracted from the core harness. Post-pivot, interfaces are external (ACP clients).
`@agentsy/ui` remains a composable renderer library — this removes only the standalone chat app,
not the renderer infrastructure that `@agentsy/vscode`'s Copilot Chat integration and CLI
diagnostics depend on.

**Files deleted:**
- packages/ui/src/ink/* (50+ component files, ink-runtime-state, ink-stream-renderer, themes)
- packages/ui/src/adapters/cli-bridge.ts (only existed to feed the Ink runtime)
- packages/renderers/* (empty ghost dir, already merged into @agentsy/ui in Phase 2 — cosmetic)

**Files retained (unchanged) — load-bearing for `@agentsy/vscode` and CLI diagnostics:**
- packages/ui/src/ui/* (RendererHandle/store/event-sourcing — consumed by @agentsy/vscode)
- packages/ui/src/cli/* (ANSI markdown renderer for CLI diagnostics output)
- packages/ui/src/plain/* (zero-dependency plain-text renderer)
- packages/ui/src/streaming-md/* (browser DOM streaming markdown)
- packages/ui/src/{shared.ts,types.ts,types/} (shared renderer contracts)

**CLI commands deleted:**
- agentsy chat
- agentsy tui
```

### 6.3 Phase 14 (`plan/phase-14-acp-agent-multi-agent.md`)

**Update header:**

Current:

```text
**Priority**: P2 — Sprints 7–8
**Story points**: 7
```

New:

```text
**Priority**: P0 — Sprints 1–3 ← ELEVATED (was P2)
**Story points**: 12 ← EXPANDED (was 7, includes §19.10)
```

Add note:

```markdown
> **2026-07 Pivot**: With TUI removal, ACP becomes the primary interface layer.
> Phase 14 is elevated to P0. The event ledger (§19.10) is now mandatory for
> production-grade editor integration (crash recovery, session replay).
```

### 6.4 Create new document: `plan/phase-14.5-tui-sunsetting.md`

Document the sunset plan:

- What's deprecated (TUI packages, commands)
- Migration path for users (use Zed, VS Code ACP Client)
- Deprecation notices in npm
- Removal timeline (v1 final code freeze, v2 ships without TUI)

---

## 7. Impact on Project Velocity

### 7.1 Story points freed

| Removal | Story Points |
|---|---|
| Delete TUI components (~50 files, 1000 LOC) | -1 SP (ongoing maintenance eliminated) |
| Delete renderers package cleanup | -0.5 SP |
| **Total freed** | **-1.5 SP** |

### 7.2 Story points added

| Addition | Story Points |
|---|---|
| Phase 14 event ledger + translators (§19.10) | +5 SP |
| Phase 14 Zed + VS Code smoke tests | +1 SP |
| CLI removal + verification | +0.5 SP |
| **Total added** | **+6.5 SP** |

### 7.3 Net impact

**Added**: +6.5 SP (higher-value harness work)  
**Freed**: -1.5 SP (low-value UI maintenance, renderers ghost-dir cleanup)  
**Net**: +5 SP to ACP/harness — cleaner focus with no resource conflict

---

## 8. Verification Checklist

### 8.1 Phase 2 (Package Consolidation)

- [ ] `packages/ui/src/ink/` deleted (50+ files removed)
- [ ] `packages/ui/src/adapters/cli-bridge.ts` deleted (Ink-only bridge, now dead code)
- [ ] `packages/ui/src/{ui,cli,plain,streaming-md,types,shared.ts}` **unchanged and building** — verify `@agentsy/vscode` still resolves `RendererHandle`, `BaseRendererOptions`, `ThinkingStyle`, `CancellationToken`, `createSharedRendererHandle`
- [ ] `packages/renderers/` empty ghost dir deleted (cosmetic; no functional renderer code lost)
- [ ] `packages/ui/package.json` exports updated (no `.ink`, `.ink/themes`; `.cli`/`.plain`/`.streaming-md`/`.adapters`/`.ui` untouched)
- [ ] `packages/ui/package.json` drops `ink`/`react` peerDependencies and `ink-testing-library` devDependency
- [ ] All monorepo packages building cleanly: `pnpm build` green, including `@agentsy/vscode`
- [ ] CLI `agentsy chat` and `agentsy tui` commands removed
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 8.2 Phase 14 (ACP Agent) — New P0

- [ ] ACP server fully wired in daemon (Phase 6 streams flow to ACP clients)
- [ ] SQLite event ledger stores `UnifiedDB.acp_events` with replay
- [ ] 6 translators implemented (replay, session-lineage, cancel-scoping, permission-relay, tool-streaming, error-kind)
- [ ] Default agents (coder, researcher, planner) loadable from YAML
- [ ] Zed smoke test: connect via stdio ACP → send prompt → receive streamed response
- [ ] VS Code ACP Client smoke test: connect via WebSocket → send prompt → receive streamed response
- [ ] Session persistence across editor restart
- [ ] Event ledger replay: recorded session plays back deterministically

### 8.3 Deprecations & NPM cleanup

- [ ] `@agentsy/renderers` npm package previously-published versions (0.1.2) marked as deprecated on npm (publish 0.1.3 with deprecation notice pointing to `@agentsy/ui`)
- [ ] Monorepo's `packages/renderers/` empty ghost dir deleted (cosmetic cleanup — no live renderer source code)
- [ ] No monorepo package imports from `@agentsy/renderers` (would only find empty dir anyway)

---

## 9. Migration Timeline

| Sprint | Phase | Action |
|---|---|---|
| 1 | Phase 2 (amended) | Delete TUI files, update exports, remove CLI commands |
| 1–3 | Phase 14 (elevated P0) | Implement ACP event ledger + translators, Zed/VS Code verification |
| 2–3 | Docs update | Update overview, phase docs, create phase-14.5 sunset plan |
| 3+ | Remaining active phases | Continue as planned (Phase 5–13, 15+) |
| 6–7 | Phase 31 (P1, parallel w/ 14) | Complete AG-UI daemon HTTP wiring; both ACP and AG-UI are co-equal primary interfaces |

---

## 10. Messaging to Users

**If users ask "where's the TUI?"**

> Agentsy's strength is the harness — routing, guardrails, memory, tokenomics, orchestration. Rather than maintain a custom chat UI, we're focused on being the perfect backend for your editor of choice.
> 
> Use **Zed** (native ACP support) or **VS Code** with the ACP Client extension to connect to the Agentsy daemon. Both give you the editor experience you know plus the full power of Agentsy's harness behind it.
> 
> This lets us focus on what we do best: build the harness. You use the interface you love.

---

**End of Addendum — 2026-07 TUI Removal & ACP-Centric Architecture Pivot**
