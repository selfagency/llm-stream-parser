// fallow-ignore-file unused-file

/**
 * Ink renderer module - streaming React/Ink renderer for terminal output
 */

export {
  AgentLog,
  type AgentLogProps,
  type LogEvent,
  type LogEventKind
} from './components/agent-log/index.js';
export {
  type AgentEntry,
  AgentPicker,
  type AgentPickerProps,
  type AgentProvenance
} from './components/agent-picker/index.tsx';
export {
  type ApprovalAction,
  ApprovalGate,
  type ApprovalGateProps
} from './components/approval-gate/index.js';
/* ── Chat/dialog components (TASK-072) ──────────────────────────────── */
export { MessageBubble, type MessageBubbleProps } from './components/chat/message-bubble.tsx';
export {
  type ConnectionStatus,
  StatusFooter,
  type StatusFooterProps
} from './components/chat/status-footer.tsx';
export { StreamingCursor, type StreamingCursorProps } from './components/chat/streaming-cursor.tsx';
export { TokenMeter, type TokenMeterProps } from './components/chat/token-meter.tsx';
export {
  Transcript,
  type TranscriptProps,
  type TranscriptTurn
} from './components/chat/transcript.tsx';
export {
  type CommandEntry,
  type CommandGroup,
  CommandPalette,
  type CommandPaletteProps
} from './components/command-palette/index.js';
export { type DiffHunk, type DiffLine, DiffViewer, type DiffViewerProps } from './components/diff-viewer/index.tsx';
export {
  DocumentViewer,
  type DocumentViewerProps,
  type LineRange
} from './components/document-viewer/index.tsx';
export { Dropdown, type DropdownOption, type DropdownProps } from './components/dropdown/index.ts';
/* ── Agent picker (TASK-SIA-013) ────────────────────────────────────── */
export { FramedPanel, type FramedPanelProps } from './components/framed-panel.tsx';
/* ── Existing components ────────────────────────────────────────── */
export type { KeyboardOptions } from './components/keyboard-handler.js';
export {
  type ModelEntry,
  ModelSelect,
  type ModelSelectProps
} from './components/model-picker/model-select.tsx';
export {
  type ProviderEntry,
  ProviderList,
  type ProviderListProps
} from './components/model-picker/provider-list.tsx';
/* ── Provider/model chooser (TASK-085) ──────────────────────────────── */
export {
  parseScope,
  ScopeToggle,
  type ScopeToggleProps,
  type ScopeValue
} from './components/model-picker/scope-toggle.tsx';
export { SearchInput, type SearchInputProps } from './components/model-picker/search-input.tsx';
export {
  CapabilityRefineFlow,
  ModelSearchFlow,
  ProviderDiscoveryFlow
} from './components/model-selection-flows.js';
export {
  type AgentConfig,
  OrchestratorConsole,
  type OrchestratorConsoleProps
} from './components/orchestrator-console/index.js';
/* ── Session renderer (TASK-012) ────────────────────────────────────── */
export {
  InkSessionRenderer,
  type InkSessionRendererProps,
  type SessionStreamEvent
} from './components/session-renderer.tsx';
export {
  StatusRail,
  type StatusRailProps,
  type StatusSegment
} from './components/status-rail/index.js';
export {
  ApprovalState,
  type ApprovalStateProps,
  type ApprovalStatus
} from './components/stream-events/approval-state.tsx';
/* ── Stream-event components (TASK-073) ─────────────────────────────── */
export { ModelDelta, type ModelDeltaProps } from './components/stream-events/model-delta.tsx';
export {
  StreamThinkingBlock,
  type StreamThinkingBlockProps
} from './components/stream-events/thinking-block.tsx';
export {
  type ToolCallEvent,
  type ToolCallStatus,
  ToolLifecycle,
  type ToolLifecycleProps
} from './components/stream-events/tool-lifecycle.tsx';
export {
  type ActiveTask,
  TaskProgress,
  type TaskProgressProps,
  type TaskStatus
} from './components/task-progress/index.js';
/* ── BBS Agentic IDE components ─────────────────────────────────────── */
export {
  WorkspaceShell,
  type WorkspaceShellProps,
  type WorkspaceTab
} from './components/workspace-shell/index.js';
export {
  type TreeNode,
  WorkspaceTree,
  type WorkspaceTreeProps
} from './components/workspace-tree/index.js';
/* ── Agent renderer (TASK-007) ──────────────────────────────────────── */
export {
  createInkAgentRenderer,
  type InkAgentRendererHandle,
  type InkAgentRendererOptions
} from './create-ink-agent-renderer.ts';
export {
  type ConversationTurn,
  createInkConversationRenderer,
  type InkConversationRendererHandle,
  type InkConversationRendererOptions
} from './create-ink-conversation-renderer.js';
export {
  createInkRenderer,
  type InkRendererHandle,
  type InkRendererOptions
} from './create-ink-renderer.ts';
export { createInkRuntimeController, loadInkRenderModules } from './ink-runtime-state.js';
export {
  type AsciiBanner,
  agentsyBanner,
  agentsyBannerCompact,
  createBanner,
  loadingBanner,
  pickBanner
} from './theme/ascii.ts';
export {
  type BorderConfig,
  bottomBorder,
  type FrameStyle,
  type FrameStyleName,
  frameStyles,
  inkBorderColor,
  inkBorderStyle,
  resolveBorderConfig,
  separatorLine,
  topBorder
} from './theme/frames.ts';
export {
  animationInterval,
  prefersReducedMotion,
  reducedMotion,
  resetReducedMotionCache,
  showAnimatedCursor,
  spinnerFrames
} from './theme/motion.ts';
/* ── Acid ANSI BBS theme system (TASK-089) ──────────────────────────── */
export {
  type AcidPalette,
  defaultAcidPalette,
  highContrastAcidPalette,
  monochromeAcidPalette
} from './theme/palette.ts';
/* ── Existing themes ─────────────────────────────────────────────── */
export {
  ayuMirageTheme,
  bbsAmberTheme,
  bbsCgaTheme,
  bbsIceTheme,
  bbsPhosphorTheme,
  catppuccinFrappeTheme,
  catppuccinLatteTheme,
  catppuccinMacchiatoTheme,
  catppuccinMochaTheme,
  darkTheme,
  defaultTheme,
  draculaTheme,
  githubDarkTheme,
  houstonTheme,
  lightTheme,
  minimalTheme,
  oneCandyTheme,
  oneDarkTheme,
  resolveTheme,
  type ThemeName
} from './themes/index.js';
export type {
  BorderTheme,
  HighlightTheme,
  TextTheme,
  Theme,
  ThinkingTheme,
  ToolCallTheme
} from './themes/types.js';
