import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.ts';

export interface ModelDeltaProps {
  /** Whether this is an incremental delta (vs full text). */
  readonly isDelta: boolean;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Text delta from the model. */
  readonly text: string;
}

/**
 * Inline model response delta rendering.
 *
 * Renders streaming text content in the assistant colour.
 * For deltas, shows content inline without additional framing.
 */
export function ModelDelta({ text, palette, isDelta }: ModelDeltaProps) {
  if (!text) {
    return null;
  }

  return (
    <Box>
      <Text color={palette.assistantText}>
        {isDelta ? undefined : null}
        {text}
      </Text>
    </Box>
  );
}
