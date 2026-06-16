import { Box, Text } from 'ink';
import type { AcidPalette } from '../../theme/palette.ts';

export interface ModelEntry {
  /** Model capabilities. */
  readonly capabilities: readonly string[];
  /** Context window size. */
  readonly contextWindow?: number;
  /** Model identifier (e.g. "claude-sonnet-4-20250514"). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Provider name this model belongs to. */
  readonly provider: string;
  /** Whether model supports streaming. */
  readonly supportsStreaming?: boolean;
}

export interface ModelSelectProps {
  /** Highlighted index for keyboard navigation. */
  readonly highlightIndex: number;
  /** Available models. */
  readonly models: readonly ModelEntry[];
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Whether scope is local or cloud. */
  readonly scope?: 'local' | 'cloud';
  /** Scope toggle handler label. */
  readonly scopeLabel?: string;
  /** Currently selected model ID. */
  readonly selectedId?: string;
}

/**
 * Model selection list with capability details and scope toggle.
 *
 * Shows each model with name, context window, streaming support,
 * and capability badges. Arrow-key navigable.
 */
export function ModelSelect({
  models,
  selectedId,
  highlightIndex,
  palette,
  scope = 'cloud',
  scopeLabel
}: ModelSelectProps) {
  if (models.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={palette.muted}>No models available</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Scope indicator */}
      <Box marginBottom={1} paddingX={1}>
        <Text color={palette.frameDim}>scope: </Text>
        <Text bold color={scope === 'cloud' ? palette.info : palette.success}>
          {scope}
        </Text>
        {scopeLabel ? <Text color={palette.muted}> ({scopeLabel})</Text> : null}
      </Box>

      {/* Model list */}
      {models.map((model, idx) => {
        const isSelected = model.id === selectedId;
        const isHighlighted = idx === highlightIndex;
        const arrow = isHighlighted ? '▸' : ' ';
        let nameColor: string;
        if (isSelected) {
          nameColor = palette.success;
        } else if (isHighlighted) {
          nameColor = palette.emphasis;
        } else {
          nameColor = palette.assistantText;
        }

        return (
          <Box key={model.id} paddingX={1}>
            <Text color={palette.assistantAccent}>{arrow} </Text>
            <Text bold={isHighlighted || isSelected} color={nameColor}>
              {model.name}
            </Text>

            {/* Context window badge */}
            {model.contextWindow ? (
              <Text color={palette.frameDim}> {model.contextWindow.toLocaleString()} ctx</Text>
            ) : null}

            {/* Streaming badge */}
            {model.supportsStreaming === false ? <Text color={palette.warning}> no-stream</Text> : null}

            {/* Capability badges */}
            {model.capabilities.map(cap => (
              <Text color={palette.info} key={cap}>
                {' ['}
                {cap}
                {']'}
              </Text>
            ))}

            {/* Selection indicator */}
            {isSelected ? <Text color={palette.success}> ✓</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
