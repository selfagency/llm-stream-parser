import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { AcidPalette } from '../theme/palette.ts';

export interface FramedPanelProps {
  /** Panel content. */
  readonly children: ReactNode;
  /** Optional bottom margin. Default: 1. */
  readonly marginBottom?: number;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Whether to show a thin separator line below the title. Default: true. */
  readonly showTitleSeparator?: boolean;
  /** Panel title (appears as a title bar inside the bold frame). */
  readonly title?: string;
}

/**
 * BBS-style framed panel with heavy box-drawing borders (┏━┓┃).
 *
 * Renders content inside an Ink `<Box borderStyle="bold">` which
 * maps to the Unicode heavy box-drawing character set — the
 * authentic BBS/warez-scene panel aesthetic.
 *
 * When a `title` is provided, it appears as a bright title bar
 * just inside the top border, optionally followed by a dim
 * separator line.
 */
export function FramedPanel({
  title,
  palette,
  children,
  marginBottom = 1,
  showTitleSeparator = true
}: FramedPanelProps) {
  return (
    <Box
      borderColor={palette.frameBorder}
      borderStyle="bold"
      flexDirection="column"
      marginBottom={marginBottom}
      paddingX={1}
    >
      {title ? (
        <Box flexDirection="column">
          <Box>
            <Text bold color={palette.frameBright}>
              {title}
            </Text>
          </Box>
          {showTitleSeparator ? <Text color={palette.frameDim}>━</Text> : null}
        </Box>
      ) : null}
      {children}
    </Box>
  );
}
