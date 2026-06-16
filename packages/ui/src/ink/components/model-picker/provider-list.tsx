import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.ts';

export interface ProviderEntry {
  /** Available capability tags. */
  readonly capabilities: readonly string[];
  /** Provider identifier (e.g. "anthropic"). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Whether this provider is currently selected. */
  readonly selected: boolean;
}

export interface ProviderListProps {
  /** Currently highlighted index. */
  readonly highlightIndex: number;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** List of available providers. */
  readonly providers: readonly ProviderEntry[];
}

/**
 * Filterable provider list with capability badges.
 */
export function ProviderList({ providers, palette, highlightIndex }: ProviderListProps) {
  if (providers.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={palette.muted}>No providers found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {providers.map((provider, idx) => {
        const isHighlighted = idx === highlightIndex;
        const arrow = isHighlighted ? '▸' : ' ';
        let nameColor: string;
        if (provider.selected) {
          nameColor = palette.success;
        } else if (isHighlighted) {
          nameColor = palette.emphasis;
        } else {
          nameColor = palette.frameBright;
        }

        return (
          <Box key={provider.id}>
            <Text color={palette.assistantAccent}>{arrow} </Text>
            <Text bold={isHighlighted} color={nameColor}>
              {provider.name}
            </Text>
            {provider.capabilities.length > 0 ? (
              <Box marginLeft={1}>
                {provider.capabilities.map(cap => (
                  <Text color={palette.info} key={cap}>
                    {' ['}
                    {cap}
                    {']'}
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
