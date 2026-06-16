import { Box, Text, useInput } from 'ink';

import type { AcidPalette } from '../../theme/palette.js';

export interface AgentConfig {
  /** Active tool count. */
  readonly activeTools?: number;
  /** Max tokens budget. */
  readonly maxTokens?: number;
  /** Model identifier. */
  readonly model: string;
  /** Agent name/id. */
  readonly name: string;
  /** Session id. */
  readonly sessionId: string;
  /** Agent status. */
  readonly status: 'idle' | 'running' | 'paused' | 'error';
  /** Current token usage. */
  readonly tokensUsed?: number;
}

export interface OrchestratorConsoleProps {
  /** Current agent configuration. */
  readonly agent: AgentConfig;
  /** Whether this console is focused. */
  readonly isFocused?: boolean;
  /** Called when config is opened (C key). */
  readonly onConfig?: () => void;
  /** Called when model change is requested (M key). */
  readonly onModelChange?: () => void;
  /** Called when session reset is requested (R key). */
  readonly onReset?: () => void;
  /** Called when agent is paused/resumed (P key). */
  readonly onTogglePause?: () => void;
  /** Semantic palette. */
  readonly palette: AcidPalette;
}

const STATUS_COLORS = new Map<AgentConfig['status'], keyof AcidPalette>([
  ['idle', 'muted'],
  ['running', 'success'],
  ['paused', 'warning'],
  ['error', 'error']
]);

const STATUS_LABELS = new Map<AgentConfig['status'], string>([
  ['idle', 'IDLE'],
  ['running', 'RUNNING'],
  ['paused', 'PAUSED'],
  ['error', 'ERROR']
]);

/**
 * BBS-style orchestrator / sysop console.
 *
 * Renders agent configuration and session controls in the style of
 * Mystic BBS's sysop console (the "C Configuration" modal):
 *
 *   ═Orchestrator══════════════════════════════════════
 *   Agent    : agent-name                  ● RUNNING
 *   Model    : claude-opus-4               [M] Change
 *   Session  : ses_abc123                  [R] Reset
 *   Tokens   : 12,847 / 100,000  ████░░░░  [P] Pause
 *   Tools    : 3 active                    [C] Config
 *   ───────────────────────────────────────────────────
 *   [M]odel  [R]eset  [P]ause  [C]onfig  [?]Help
 *
 * Aesthetic: Mystic BBS sysop panel — dense info rows, hotkey strip at bottom.
 */
export function OrchestratorConsole({
  agent,
  palette,
  onModelChange,
  onReset,
  onTogglePause,
  onConfig,
  isFocused = true
}: OrchestratorConsoleProps) {
  useInput(
    input => {
      const lower = input.toLowerCase();
      if (lower === 'm') {
        onModelChange?.();
      } else if (lower === 'r') {
        onReset?.();
      } else if (lower === 'p') {
        onTogglePause?.();
      } else if (lower === 'c') {
        onConfig?.();
      }
    },
    { isActive: isFocused }
  );

  const statusColorKey = STATUS_COLORS.get(agent.status) ?? 'muted';
  const statusColor = palette[statusColorKey];
  const statusLabel = STATUS_LABELS.get(agent.status) ?? agent.status.toUpperCase();

  // Token progress bar
  const tokenBar = buildTokenBar(agent.tokensUsed, agent.maxTokens, palette);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text color={palette.frameBorder}>{'═'}</Text>
        <Text bold color={palette.frameBright}>
          {'Orchestrator'}
        </Text>
        <Text color={palette.frameBorder}>{'═'}</Text>
      </Box>

      {/* Agent row */}
      <Box flexDirection="row">
        <Text color={palette.muted}>{'Agent    : '}</Text>
        <Text bold color={palette.frameBright}>
          {agent.name}
        </Text>
        <Box flexGrow={1} />
        <Text bold color={statusColor}>
          {'● '}
          {statusLabel}
        </Text>
      </Box>

      {/* Model row */}
      <Box flexDirection="row">
        <Text color={palette.muted}>{'Model    : '}</Text>
        <Text color={palette.assistantAccent}>{agent.model}</Text>
        <Box flexGrow={1} />
        <Text color={palette.frameDim}>{'[M] Change'}</Text>
      </Box>

      {/* Session row */}
      <Box flexDirection="row">
        <Text color={palette.muted}>{'Session  : '}</Text>
        <Text color={palette.info}>{agent.sessionId}</Text>
        <Box flexGrow={1} />
        <Text color={palette.frameDim}>{'[R] Reset'}</Text>
      </Box>

      {/* Token usage row */}
      {agent.maxTokens === undefined ? null : (
        <Box flexDirection="row">
          <Text color={palette.muted}>{'Tokens   : '}</Text>
          <Text color={palette.frameBright}>
            {(agent.tokensUsed ?? 0).toLocaleString()}
            {' / '}
            {agent.maxTokens.toLocaleString()}
          </Text>
          <Text color={palette.frameDim}>{'  '}</Text>
          <Text>{tokenBar}</Text>
          <Box flexGrow={1} />
          <Text color={palette.frameDim}>{'[P] Pause'}</Text>
        </Box>
      )}

      {/* Active tools row */}
      {agent.activeTools === undefined ? null : (
        <Box flexDirection="row">
          <Text color={palette.muted}>{'Tools    : '}</Text>
          <Text color={agent.activeTools > 0 ? palette.warning : palette.muted}>
            {agent.activeTools}
            {' active'}
          </Text>
          <Box flexGrow={1} />
          <Text color={palette.frameDim}>{'[C] Config'}</Text>
        </Box>
      )}

      {/* Separator */}
      <Text color={palette.frameDim}>{'─'.repeat(40)}</Text>

      {/* Hotkey strip */}
      <Box flexDirection="row" flexWrap="wrap">
        {[
          { key: 'M', label: 'odel' },
          { key: 'R', label: 'eset' },
          { key: 'P', label: 'ause' },
          { key: 'C', label: 'onfig' }
        ].map((cmd, i) => (
          <Box key={cmd.key} marginRight={i < 3 ? 2 : 0}>
            <Text bold color={palette.assistantAccent}>
              {'['}
              {cmd.key}
              {']'}
            </Text>
            <Text color={palette.frameBright}>{cmd.label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function buildTokenBar(used: number | undefined, max: number | undefined, _palette: AcidPalette): string {
  if (used === undefined || max === undefined || max === 0) {
    return '';
  }
  const pct = Math.min(1, used / max);
  const width = 8;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  // Return plain string — color applied by caller if needed
  return '█'.repeat(filled) + '░'.repeat(empty);
}
