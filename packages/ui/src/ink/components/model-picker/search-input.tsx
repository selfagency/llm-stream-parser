import { Box, Text } from 'ink';

import { showAnimatedCursor } from '../../theme/motion.ts';
import type { AcidPalette } from '../../theme/palette.ts';

export interface SearchInputProps {
  /** Whether the input is focused. */
  readonly focused?: boolean;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Placeholder shown when query is empty. */
  readonly placeholder?: string;
  /** Current query text. */
  readonly query: string;
}

/**
 * Search input field — renders the current query with an inline cursor
 * and placeholder text when empty.
 */
export function SearchInput({ query, palette, placeholder = 'Search…', focused = true }: SearchInputProps) {
  const showCursor = focused && showAnimatedCursor();

  return (
    <Box>
      <Text color={palette.info}>🔍 </Text>
      {query.length > 0 ? (
        <Text color={palette.emphasis}>
          {query}
          {showCursor ? <Text color={palette.assistantAccent}>▌</Text> : null}
        </Text>
      ) : (
        <Text color={palette.muted}>
          {placeholder}
          {showCursor ? <Text color={palette.assistantAccent}>▌</Text> : null}
        </Text>
      )}
    </Box>
  );
}
