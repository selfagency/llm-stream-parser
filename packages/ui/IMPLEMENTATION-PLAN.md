---
goal: @agentsy/renderers production implementation plan
version: 1.0
date_created: 2026-05-15
last_updated: 2026-05-25
owner: renderers-maintainers
status: In progress
tags: [feature, architecture, renderers, ink, ansi]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

This plan defines the production implementation order for `@agentsy/renderers` as the canonical cross-surface rendering engine.

## 1. Requirements & Constraints

- **REQ-RENDERERS-001**: Renderer API remains unified across CLI, Ink, plain text, browser, and VS Code bridge targets.
- **REQ-RENDERERS-002**: Ink primitives remain renderer-owned and are composed by host surfaces; shared interactive widgets should prefer `@inkjs/ui` as the base component library wherever a matching primitive exists.
- **REQ-RENDERERS-003**: Visual language supports acid ANSI BBS chrome with semantic palette roles and fallbacks.
- **REQ-RENDERERS-004**: Non-interactive/plain output preserves readable structure.
- **REQ-RENDERERS-005**: Focus and keyboard behavior in interactive components remains deterministic.
- **REQ-RENDERERS-006**: Renderers must provide an agent-mode picker component for bundled, user, and workspace-discovered modes with provenance, search, and keyboard navigation.
- **SEC-RENDERERS-001**: Remote display outputs are sanitized at boundary emission.
- **SEC-RENDERERS-002**: Terminal pane command spawn config prevents untrusted interpolation.
- **CON-RENDERERS-001**: No direct vscode runtime dependency in renderer core package.
- **CON-RENDERERS-002**: Orchestration/policy logic remains outside renderers.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-RENDERERS-001: API and visual contract stabilization.

| Task               | Description                                                             | Completed | Date |
| ------------------ | ----------------------------------------------------------------------- | --------- | ---- |
| TASK-RENDERERS-001 | Stabilize top-level renderer interfaces and subpath export contracts.   |           |      |
| TASK-RENDERERS-002 | Finalize semantic palette tokens, frame primitives, and fallback rules. |           |      |
| TASK-RENDERERS-003 | Document ownership boundaries vs CLI/UI/VS Code consumers.              |           |      |

### Implementation Phase 2 — DOGFOOD Phase 2 Vertical Slice

- GOAL-RENDERERS-002: Core adapter and Ink suite implementation.

| Task               | Description                                                                                                                                                                                                 | Completed | Date |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-089           | DOGFOOD Phase 2: Establish acid ANSI BBS visual system — semantic palette tokens (palette.ts), chromed frame primitives (frames.ts), ASCII banner support (ascii.ts), reduced-motion fallbacks (motion.ts). |           |      |
| TASK-072           | DOGFOOD Phase 2: Implement Ink chat/dialog components — transcript (transcript.tsx), message-bubble (message-bubble.tsx), streaming-cursor, token-meter, status-footer.                                     |           |      |
| TASK-073           | DOGFOOD Phase 2: Implement Ink stream-event components — model-delta, thinking-block (expandable/collapsible), tool-lifecycle (status indicators), approval-state.                                          |           |      |
| TASK-085           | DOGFOOD Phase 2: Implement Ink provider/model chooser — search-input, provider-list (capability badges), model-select, scope-toggle (local/cloud).                                                          |           |      |
| TASK-011           | DOGFOOD Phase 2: Implement renderer bridge for CLI streaming — createCliStreamBridge(), renderStreamToInk(), createInkSessionRenderer(). Located in renderers/src/adapters/cli-bridge.ts.                   |           |      |
| TASK-RENDERERS-004 | Complete adapter implementations for CLI/plain/browser/vscode contracts.                                                                                                                                    |           |      |
| TASK-RENDERERS-005 | Implement Ink chat/chooser/diff/document/worktree/terminal components on shared visual system.                                                                                                              |           |      |
| TASK-RENDERERS-006 | Implement banner/motion system with reduced-motion and low-color fallbacks.                                                                                                                                 |           |      |
| TASK-RENDERERS-013 | Implement renderer-owned Ink agent-mode picker/search component with provenance badges (`bundled`, `user`, `workspace`, `external`) and calm fallback output.                                               |           |      |

### Implementation Phase 3

- GOAL-RENDERERS-003: Integration and quality validation.

| Task               | Description                                                                                                     | Completed | Date |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-RENDERERS-007 | Integrate component suite with CLI-hosted workspace layouts and event routing.                                  |           |      |
| TASK-RENDERERS-008 | Add integration/snapshot tests for dark/light/mono/reduced-motion variants.                                     |           |      |
| TASK-RENDERERS-009 | Validate non-TTY/log readability and accessibility-safe structure output.                                       |           |      |
| TASK-RENDERERS-014 | Add accessibility and snapshot coverage for the agent-mode picker in keyboard-first and non-TTY fallback modes. |           |      |

### Implementation Phase 4

- GOAL-RENDERERS-004: Hardening and release gates.

| Task               | Description                                                                      | Completed | Date |
| ------------------ | -------------------------------------------------------------------------------- | --------- | ---- |
| TASK-RENDERERS-010 | Add regression suites for streaming correctness and interleaved event rendering. |           |      |
| TASK-RENDERERS-011 | Align package docs/examples with shipped visual and API behavior.                |           |      |
| TASK-RENDERERS-012 | Pass package and monorepo release gates.                                         |           |      |

### Implementation Phase 4.5 — Agent picker component

- GOAL-RENDERERS-004.5: Implement Ink agent picker component for agent mode selection in CLI.

| Task               | Description                                                                                                                                                                           | Completed | Date |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-RENDERERS-015 | Implement `AgentPickerComponent` in `src/ink/components/agent-picker/` — searchable list with provenance badges (bundled, user, workspace), arrow-key navigation, Enter to select.    |           |      |
| TASK-RENDERERS-016 | Define component props interface: `agents: AgentPickerRow[]`, `onSelect(id: string)`, `onCancel()`, `filter: string`. Each row shows name, description, model preference, tool count. |           |      |
| TASK-RENDERERS-017 | Add renderer integration tests: snapshot for empty, partial, full agent lists; keyboard navigation; non-TTY fallback text rendering.                                                  |           |      |

## 3. Acceptance Criteria

- **ACC-RENDERERS-001**: Renderer API and component contracts are stable and test-covered.
- **ACC-RENDERERS-002**: CLI integration and visual fallback behavior are validated.
- **ACC-RENDERERS-003**: Security and release gates pass.

## 4. Sources Synthesized

- `plan/MASTER-IMPLEMENTATION-PLAN.md`
- `plan/feature-cli-dogfood-production-order-1.md`
- `docs/packages/renderers.md`
- `packages/renderers/README.md`
- `packages/renderers/IMPLEMENTATION-PLAN.md`

## 5. Existing Package Deep-Dive (Preserved)

---

## @agentsy/renderers — Implementation Plan

## Role in Framework Ecosystem

`@agentsy/renderers` is the **visual engine** of the framework. It decouples the core logic of agent loops and stream processing from the specific details of how that information is displayed to a human. Whether the output is destined for a raw terminal, a rich TUI, or an integrated editor like VS Code, this package provides the necessary adapters.

It is consumed by `@agentsy/cli`, `@agentsy/vscode`, and any other interactive surface that needs to show agent progress.

This package is the canonical implementation home for Ink-based terminal widgets consumed by `@agentsy/cli`; CLI hosts and composes those widgets, but renderer-owned components and adapter contracts live here.

### Ecosystem Sketch

```text
[ @agentsy/cli ]    [ @agentsy/vscode ]    [ Custom App ]
         |                |                    |
         +--------+-------+----------+---------+
                  |
                  v
         [ @agentsy/renderers ] <--- Output Adaptation
                  |
         +-----------------------+-----------------------+
         |                       |                       |
         v                       v                       v
 [ CLI Renderer ]        [ TUI Renderer ]        [ VS Code Bridge ]
 (ANSI / Markdown)       (Panes / Status)        (Chat API)
```

## Fulfillment of Role

The package fulfills its role by providing:

1. **Unified Renderer API**: A single interface for consuming streams of text, thoughts, and tool calls.
2. **Pluggable Adapters**: Specialized logic for different target environments.
3. **Rich Component Rendering**: Standardized ways to display complex objects like tool call results or reasoning "thinking" blocks.
4. **ANSI & Markdown Support**: Robust handling of terminal formatting and rich-text conversion.
5. **Interactive terminal widgets**: Canonical Ink implementations for chat, stream events, model/provider choosers, diff/document viewers, worktree browsers, and terminal panes.

## Detailed Functionality

### 1. Target Adapters (`src/adapters/`)

- **CLI Adapter**: Optimized for standard terminal output. Supports color (chalk), spinners (ora), and progress bars.
- **TUI Adapter**: Uses libraries like `ink` or `blessed` to provide a pane-based interface with scrolling and status bars.
- **Plain Text**: A minimal renderer that strips all formatting, useful for log files and non-interactive contexts.

### 2. Component Rendering (`src/components/`)

- **Ink UI Base**: Build input, select, spinner, badge, alert, list, progress, and status widgets from `@inkjs/ui` first; extend with Agentsy wrappers only when a project-specific composition is needed.
- **Thinking Blocks**: Render `<think>` tags as framed, optionally collapsible BBS-style panels with explicit labels, subdued gutters, and a plain-text fallback that remains readable without color.
- **Tool Calls**: Visualize active tool execution as chromed ANSI status cards that show arguments, results, approvals, and errors in a structured format.
- **Streaming Logic**: Implement smooth "typing" and scanline-friendly motion effects for LLM output, preventing jerky UI updates while honoring reduced-motion and non-interactive fallbacks.

#### Visual Language: Acid ANSI BBS

Ink components in this package should lean into a classic acid-ANSI BBS aesthetic while staying legible and accessible:

- Use **semantic palette roles** rather than hardcoded colors so themes can shift between classic green-screen, cyan/magenta neon, and high-contrast BBS chrome variants.
- Prefer a **4-bit ANSI-first** palette; only enhance with higher-color terminals when it improves fidelity without reducing readability.
- Frame panels with **ASCII borders, beveled separators, and chrome-like header bars** so transcripts, tool calls, choosers, and viewers feel like modern BBS terminals instead of generic cards.
- Treat motion as **decorative, not critical**: animated banners, marquee text, and scanline effects should be opt-in or automatically reduced when the terminal indicates reduced-motion or when the user requests calmer output.
- Make all important structure **programmatically determinable** from the text layout so screen readers and non-TTY logs still expose headings, labels, and state transitions.
- Support **frame-based ASCII art assets** for banners and splash screens, with a maintainable asset pipeline similar to rune/inkscii-style frame delivery rather than ad-hoc inline art.

### 3. Themes & Styling (`src/themes/`)

- **Responsibility**: Aesthetic consistency and terminal-safe visual identity.
- **Functionality**: Defines semantic color palettes, iconography, border styles, and animation intensity for different agent states (e.g., success, warning, error, streaming, approval, idle).
- **Style Targets**:
  - classic acid ANSI BBS chrome
  - neon-but-readable highlight states
  - green-screen / monochrome-safe variants
  - reduced-motion and low-color fallbacks

#### Theme Rules

- Map theme tokens to semantics (`accent`, `muted`, `danger`, `warning`, `success`, `info`, `chrome`, `panel`, `text`, `subtle`) instead of binding widgets directly to color names.
- Preserve contrast on custom terminal backgrounds; never rely on a single exact hue to communicate state.
- Prefer thin decorative effects such as borders, underlines, inverse video, and ASCII dividers before reaching for heavy animation.
- Allow BBS-style theme packs to swap framing, chrome, and banner art without changing component logic.

## Logic & Data Flow

### 1. The Rendering Loop

1. `@agentsy/cli` (or another consumer) initializes a `Renderer` (e.g., `TerminalRenderer`).
2. As chunks arrive from `@agentsy/core`, the consumer calls `renderer.onChunk(chunk)`.
3. The renderer determines the content type (Text, Thought, Tool) and applies the appropriate transformation.
4. The transformed output is buffered and then flushed to the target surface (e.g., `process.stdout`).

### 2. Event Rendering

1. When a framework event occurs (e.g., `tool_call_started`), the consumer calls `renderer.onEvent(event)`.
2. The renderer displays the event status (e.g., showing a spinner while a tool is running).

## Key Interfaces

### Renderer

```typescript
export interface Renderer {
  onChunk(chunk: NormalizedChunk): void;
  onEvent(event: FrameworkEvent): void;
  clear(): void;
  flush(): void;
}
```

### Formatting Options

```typescript
export interface RendererOptions {
  theme: "dark" | "light" | "mono";
  color: boolean;
  verbosity: "quiet" | "normal" | "verbose";
  typingSpeed: number; // ms per chunk
}
```

## Implementation Details

### Streaming Correctness

The renderer must be able to handle "interleaved" content safely—for example, when a tool result arrives while the LLM is still generating text.

### VS Code Integration

The VS Code adapter should map framework events to the VS Code Chat API's `ResponseStream`, ensuring that Agentsy agents look and feel like native VS Code participants.

### Rendering SLOs

Rendering must meet SLOs: first-chunk-to-screen < 100ms for TUI/Ink renderers, < 200ms for CLI text renderers. Streaming updates should batch at max 16ms intervals (60fps equivalent). These SLOs should be tested in CI.

---

## Standalone Renderers Expansion (migrated from `plan/agentsy-standalone-v1.md`)

### Package boundary and export requirements

- Keep `@agentsy/renderers` standalone: no imports from orchestration packages.
- Maintain subpath exports for tree-shaking: `plain`, `cli`, `vscode`, `browser`, `ink`.
- Keep `vscode` renderer duck-typed (no direct `import 'vscode'` in renderers package).
- Expose shared renderer types and `DisplayPort` from top-level package.
- Treat renderer API surface (`RendererHandle`, `BaseRendererOptions`, `ThinkingStyle`, `DisplayPort`) as semver-major on breaking changes.
- Treat `@inkjs/ui` as the canonical base component library for Ink surfaces; custom components should wrap or compose Ink UI primitives instead of reimplementing equivalent controls.
- Treat Ink panes and chooser widgets as renderer-owned primitives; CLI may not duplicate them as ad-hoc local components.
- Treat the Ink visual language as a first-class contract: BBS-style framing, semantic ANSI palettes, and motion-safe banner/bannerless fallbacks must remain composable across CLI, VS Code, browser, and future desktop surfaces.

### DisplayPort evolution

- `DisplayPort.write(content): Promise<void>` remains async for backpressure.
- Browser renderer should accept either `DisplayPort` or `HTMLElement` target.
- Support future GUI bridges (Electron/Tauri/Webview/WebSocket) via thin `DisplayPort` adapters.

### Ink component roadmap (interactive suite)

- Existing/future interactive components must gate key handling with `isFocused`.
- Composite components must implement internal single-focus routing.
- Controlled component pattern for editor/selectors (`value` + `onChange`/`onSelect`).
- Planned exports include: `DiffViewer`, `WorktreeBrowser`, `TextEditor`, `TerminalPane` (+ fallback), `FileBrowser`, `ChatHistory`, `Chat`, `AgentSelector`, `ModelSelector`, `ModelParamEditor`, `SkillSelector`, `MCPServerManager`, `ContextPicker`, `TokenUsageMeter`.

#### Ink visual implementation phases

1. **Phase A — Theme tokens and frame primitives**
   - add semantic ANSI roles and palette packs
   - implement reusable BBS/chrome frame primitives
   - establish reduced-motion and no-color fallbacks
2. **Phase B — Banner and motion system**
   - add frame-based banner support for static and animated ASCII scenes
   - provide opt-in motion effects (typing, marquee, scanline, pulse)
   - ensure screen-reader-safe labels and static output equivalents
3. **Phase C — Component suite rollout**
   - migrate chat, chooser, diff, document, worktree, and terminal panes onto the shared visual system
   - add snapshot tests for light/dark/mono/reduced-motion variants
   - verify non-TTY and log output remains legible and structured

### Security additions

- Remote display adapters sanitize output before emission.
- WebView targets require DOM sanitization (no raw `innerHTML`).
- `TerminalPane` command spawn config must be static (no untrusted command interpolation).
- Symbol search subprocess calls must use literal arg arrays with `shell: false`.

### Future extension compatibility

- Architecture should remain composable for a thin VS Code extension package and a desktop app package without introducing new core streaming primitives.

## Sources Synthesized

`agentsy-standalone-v1.md`, `agentsy-tech.md`, `agentsy-features-v1.md`, `docs/packages/renderers.md`, `packages/renderers/IMPLEMENTATION-PLAN.md`.

---

## Extracted Technical API Surface (from `plan/agentsy-tech.md`)

### Renderer/platform responsibilities

- Keep `DisplayPort` as the platform extension seam for CLI/editor/browser/desktop targets.
- Preserve duck-typed VS Code renderer contract (no direct vscode dependency in renderers package).
- Keep AG-UI protocol adaptation out of renderers package; runtime remains canonical AG-UI owner.

### Subpath responsibilities retained

- `plain`: zero peer deps
- `cli`: terminal-focused formatting
- `ink`: interactive terminal components
- `vscode`: bridge renderer using duck-typed surface contracts
- `browser`: sanitized DOM-target rendering contracts
