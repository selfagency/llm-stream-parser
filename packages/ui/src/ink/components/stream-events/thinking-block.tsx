import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';

import { animationInterval, reducedMotion, spinnerFrames } from '../../theme/motion.ts';
import type { AcidPalette } from '../../theme/palette.ts';

export interface StreamThinkingBlockProps {
  /** Whether to expand the thinking block. */
  readonly expanded?: boolean;
  /** Whether thinking is still in progress. */
  readonly isInProgress: boolean;
  /** Toggle expand/collapse handler. */
  readonly onToggle?: () => void;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Thinking text content. */
  readonly text: string;
}

const thinkingSpinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Expandable/collapsible thinking block.
 *
 * When collapsed: shows a single-line spinner with "[thinking…]".
 * When expanded: shows the full thinking content in dim ANSI.
 * Respects reduced-motion: static indicator when animation disabled.
 */
export function StreamThinkingBlock({
  text,
  palette,
  isInProgress,
  expanded = false,
  onToggle: _onToggle
}: StreamThinkingBlockProps) {
  const [frame, setFrame] = useState(0);
  const frames = spinnerFrames(thinkingSpinner);

  useEffect(() => {
    if (!isInProgress || reducedMotion()) {
      return;
    }
    const interval = setInterval(() => setFrame(f => (f + 1) % frames.length), animationInterval(80, 1000));
    return () => {
      clearInterval(interval);
    };
  }, [isInProgress, frames.length]);

  const spinner = frames[frame] ?? '⠋';
  const borderColor = palette.assistantDim;
  const borderStyleVal = 'bold' as const;

  if (!expanded) {
    return (
      <Box borderColor={borderColor} borderStyle={borderStyleVal} marginBottom={1} paddingX={1}>
        <Text color={palette.pending}>{isInProgress ? `${spinner} thinking…` : '◈ thinking complete'}</Text>
      </Box>
    );
  }

  return (
    <Box borderColor={borderColor} borderStyle={borderStyleVal} flexDirection="column" marginBottom={1} paddingX={1}>
      <Text bold color={palette.pending}>
        {isInProgress ? `${spinner} thinking…` : '◈ thinking'}
      </Text>
      <Text color={palette.assistantDim} dimColor>
        {text}
      </Text>
    </Box>
  );
}
