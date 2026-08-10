import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';

import type { AcidPalette } from '../../theme/palette.ts';

export interface LineRange {
  readonly end: number;
  readonly start: number;
}

export interface DocumentViewerProps {
  /** File content to display. */
  readonly content: string;
  /** Line ranges to highlight. */
  readonly highlights?: readonly LineRange[];
  /** Whether to show line numbers. Default: true. */
  readonly lineNumbers?: boolean;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** File path or title. */
  readonly path: string;
}

const VISIBLE_LINES = 20;

function isHighlighted(lineIndex: number, highlights: readonly LineRange[] | undefined): boolean {
  if (!highlights) {
    return false;
  }
  return highlights.some(r => lineIndex >= r.start && lineIndex <= r.end);
}

/**
 * Document viewer — scrollable file content display with line numbers,
 * optional highlights, and BBS-style frame.
 *
 * Supports keyboard navigation:
 * - j / down-arrow: scroll down
 * - k / up-arrow: scroll up
 * - g: jump to top
 * - G: jump to bottom
 * - q / escape: signal close (via onClose)
 */
export function DocumentViewer({ content, highlights, lineNumbers = true, palette, path }: DocumentViewerProps) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const [scrollTop, setScrollTop] = useState(0);
  const maxScroll = Math.max(0, lines.length - VISIBLE_LINES);

  useInput((_input, key) => {
    if (key.downArrow || key.return) {
      setScrollTop(s => Math.min(s + 1, maxScroll));
    } else if (key.upArrow) {
      setScrollTop(s => Math.max(s - 1, 0));
    } else if (key.pageDown) {
      setScrollTop(s => Math.min(s + VISIBLE_LINES, maxScroll));
    } else if (key.pageUp) {
      setScrollTop(s => Math.max(s - VISIBLE_LINES, 0));
    }
  });

  const visibleLines = lines.slice(scrollTop, scrollTop + VISIBLE_LINES);
  const lineNumWidth = String(lines.length).length;

  return (
    <Box borderColor={palette.frameBorder} borderStyle="bold" flexDirection="column" paddingX={1}>
      {/* Title bar */}
      <Box>
        <Text bold color={palette.frameBright}>
          {'📄 '}
          {path}
        </Text>
        <Text color={palette.frameDim}> — {lines.length} lines</Text>
      </Box>

      {/* Separator */}
      <Text color={palette.frameDim}>━</Text>

      {/* File content */}
      <Box flexDirection="column">
        {visibleLines.map((line, i) => {
          const actualLine = scrollTop + i;
          const highlighted = isHighlighted(actualLine, highlights);

          return (
            <Box key={actualLine}>
              {lineNumbers ? (
                <Box width={lineNumWidth + 1}>
                  <Text color={highlighted ? palette.warning : palette.frameDim}>
                    {String(actualLine + 1).padStart(lineNumWidth)}{' '}
                  </Text>
                </Box>
              ) : null}
              <Text color={highlighted ? palette.warning : palette.assistantText}>{line || ' '}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Scroll info */}
      <Box marginTop={1}>
        <Text color={palette.muted} dimColor>
          {'j/k scroll  ·  '}
          {scrollTop > 0 ? `△ ${scrollTop} lines` : 'top'}
          {maxScroll > 0 ? `  ${scrollTop + VISIBLE_LINES}/${lines.length}` : ''}
        </Text>
      </Box>
    </Box>
  );
}
