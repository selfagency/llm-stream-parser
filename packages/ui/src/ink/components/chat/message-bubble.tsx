import { Box, Text } from 'ink';

import type { AcidPalette } from '../../theme/palette.ts';

export interface MessageBubbleProps {
  /** Whether to dim the text (e.g., for thinking/metadata). */
  readonly dim?: boolean;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Message role — determines alignment and colour. */
  readonly role: 'user' | 'assistant' | 'system';
  /** Message content text. */
  readonly text: string;
  /** Optional timestamp string (e.g. "12:34:56"). */
  readonly timestamp?: string;
}

/**
 * Individual message bubble — user right-aligned (green), assistant left-aligned (cyan).
 */
export function MessageBubble({ text, role, palette, timestamp, dim = false }: MessageBubbleProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  let textColor: string;
  if (isSystem) {
    textColor = palette.warning;
  } else if (isUser) {
    textColor = palette.userText;
  } else {
    textColor = palette.assistantText;
  }

  let roleLabel: string;
  if (isUser) {
    roleLabel = '▸ you';
  } else if (isSystem) {
    roleLabel = '◆ system';
  } else {
    roleLabel = '◈ assistant';
  }

  return (
    <Box alignItems={isUser ? 'flex-end' : 'flex-start'} flexDirection="column" marginBottom={1}>
      {/* Role label */}
      <Box>
        <Text bold color={textColor}>
          {roleLabel}
        </Text>
        {timestamp ? <Text color={palette.frameDim}> {timestamp}</Text> : null}
      </Box>

      {/* Bubble content — BBS heavy box-drawing */}
      <Box borderColor={textColor} borderStyle="bold" flexDirection="column" marginTop={0} paddingX={1}>
        <Text color={textColor} dimColor={dim}>
          {text}
        </Text>
      </Box>
    </Box>
  );
}
