import { Box, Text } from 'ink';

import { reducedMotion } from '../../theme/motion.ts';
import type { AcidPalette } from '../../theme/palette.ts';

export type ConnectionStatus = 'connecting' | 'connected' | 'streaming' | 'idle' | 'error';

export interface StatusFooterProps {
  /** Elapsed time in seconds. */
  readonly elapsedSec?: number;
  /** Active model name (e.g. "claude-sonnet-4"). */
  readonly modelName?: string;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Provider name (e.g. "anthropic", "openai"). */
  readonly provider?: string;
  /** Current connection/streaming status. */
  readonly status: ConnectionStatus;
}

const statusSymbols = new Map<ConnectionStatus, string>([
  ['connecting', '◇'],
  ['connected', '◇'],
  ['streaming', '◈'],
  ['idle', '○'],
  ['error', '⊘']
]);

const statusColors = new Map<ConnectionStatus, keyof AcidPalette>([
  ['connecting', 'info'],
  ['connected', 'success'],
  ['streaming', 'assistantAccent'],
  ['idle', 'muted'],
  ['error', 'error']
]);

/**
 * Status footer — connection status, model name, elapsed time.
 *
 * Renders as a single-line footer at the bottom of the chat area.
 */
export function StatusFooter({ status, modelName, elapsedSec, palette, provider }: StatusFooterProps) {
  const statusKey = statusColors.get(status) ?? 'muted';
  const color = palette[statusKey];

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const _parts: string[] = [];

  const symbol = reducedMotion() ? '●' : (statusSymbols.get(status) ?? '●');

  return (
    <Box>
      <Text color={color}> {symbol} </Text>
      <Text color={palette.frameDim}>{status}</Text>
      {modelName ? (
        <>
          <Text color={palette.frameDim}> · </Text>
          <Text color={palette.assistantText}>{modelName}</Text>
        </>
      ) : null}
      {provider ? (
        <>
          <Text color={palette.frameDim}> via </Text>
          <Text color={palette.info}>{provider}</Text>
        </>
      ) : null}
      {elapsedSec === undefined ? null : (
        <>
          <Text color={palette.frameDim}> · </Text>
          <Text color={palette.frameBright}>{formatTime(elapsedSec)}</Text>
        </>
      )}
    </Box>
  );
}
