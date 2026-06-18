import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.ts';

export type ScopeValue = 'local' | 'cloud';

export interface ScopeToggleProps {
  /** Current scope value. */
  readonly currentScope: ScopeValue;
  /** Whether this toggle is highlighted for keyboard navigation. */
  readonly focused?: boolean;
  /** Semantic palette. */
  readonly palette: AcidPalette;
}

/**
 * Two-state toggle for switching between local and cloud model scope.
 *
 * Renders both options side by side with the active one highlighted.
 */
export function ScopeToggle({ currentScope, palette, focused = false }: ScopeToggleProps) {
  const options: ScopeValue[] = ['local', 'cloud'];

  return (
    <Box paddingX={1}>
      <Text color={palette.frameDim}>scope: </Text>
      {options.map(opt => {
        const isActive = opt === currentScope;
        const activeColor = opt === 'cloud' ? palette.info : palette.success;
        const color = isActive ? activeColor : palette.muted;
        return (
          <Box key={opt} marginRight={1}>
            <Text bold={isActive} color={color} inverse={focused && isActive}>
              {isActive ? '●' : '○'} {opt}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Parse a string value into a ScopeValue, falling back to the default.
 */
export function parseScope(value: string | undefined, fallback: ScopeValue = 'cloud'): ScopeValue {
  if (value === 'local' || value === 'cloud') {
    return value;
  }
  return fallback;
}
