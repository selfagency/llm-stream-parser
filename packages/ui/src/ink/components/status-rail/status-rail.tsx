import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.js';

export interface StatusSegment {
  /** Whether to bold this segment. */
  readonly bold?: boolean;
  /** Optional color override. Defaults to palette.frameBright. */
  readonly color?: string;
  /** Separator after this segment (default '│'). Set to '' to suppress. */
  readonly separator?: string;
  /** Segment label/value. */
  readonly text: string;
}

export interface StatusRailProps {
  /** Left-side segments (mode, context, agent name). */
  readonly left: readonly StatusSegment[];
  /** Optional prompt text shown at far left (e.g. 'MAIN MENU'). */
  readonly mode?: string;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Right-side segments (time, node, connection). */
  readonly right?: readonly StatusSegment[];
}

/**
 * BBS-style bottom status rail.
 *
 * Renders a dense single-line status bar in the style of Cave BBS / Piranha:
 *
 *   [AGENT] agent-name @ workspace — task description  │  12:34:56 │ node 1
 *
 * Left segments: mode bracket, context info, current task.
 * Right segments: time, session info, connection status.
 * Separator: │ between segments.
 */
export function StatusRail({ left, right = [], palette, mode }: StatusRailProps) {
  return (
    <Box borderColor={palette.frameBorder} borderStyle="single" flexDirection="row" paddingX={1}>
      {/* Mode bracket — [AGENT] */}
      {mode ? (
        <Box marginRight={1}>
          <Text bold color={palette.assistantAccent}>
            {'['}
            {mode}
            {']'}
          </Text>
        </Box>
      ) : null}

      {/* Left segments */}
      {left.map((seg, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: seg.text is stable; index disambiguates
        <Box flexDirection="row" key={`${seg.text}-${index}`}>
          <Text color={seg.color ?? palette.frameBright} {...(seg.bold ? { bold: true } : {})}>
            {seg.text}
          </Text>
          {(seg.separator ?? '│') === '' ? null : <Text color={palette.frameDim}> {seg.separator ?? '│'} </Text>}
        </Box>
      ))}

      {/* Spacer pushes right segments to the right */}
      <Box flexGrow={1} />

      {/* Right segments */}
      {right.map((seg, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: seg.text is stable; index disambiguates
        <Box flexDirection="row" key={`${seg.text}-${index}`}>
          {index > 0 ? <Text color={palette.frameDim}>{' │ '}</Text> : null}
          <Text color={seg.color ?? palette.muted} {...(seg.bold ? { bold: true } : {})}>
            {seg.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
