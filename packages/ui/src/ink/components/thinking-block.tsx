import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';

import type { Theme } from '../themes/types.ts';

interface ThinkingBlockProps {
  readonly isStreaming: boolean;
  readonly screenReader?: boolean;
  readonly style: 'blockquote' | 'inline' | 'suppress';
  readonly text: string;
  readonly theme: Theme;
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function SuppressedThinking(): null {
  return null;
}

function ScreenReaderThinking({ text }: { readonly text: string }) {
  return <Text>{`\nThinking:\n${text}\n`}</Text>;
}

function InlineThinking({
  text,
  isStreaming,
  theme,
  screenReader
}: {
  readonly text: string;
  readonly isStreaming: boolean;
  readonly theme: Theme;
  readonly screenReader: boolean;
}) {
  if (screenReader) {
    return <ScreenReaderThinking text={text} />;
  }

  const textColor = theme.thinking.textColor || undefined;
  return (
    <Text dimColor={theme.text.dimColor} italic {...(textColor ? { color: textColor } : {})}>
      [Thinking] {text}
      {isStreaming && '…'}
    </Text>
  );
}

function BlockquoteThinking({
  text,
  frame,
  isStreaming,
  theme,
  screenReader
}: {
  readonly text: string;
  readonly frame: number;
  readonly isStreaming: boolean;
  readonly theme: Theme;
  readonly screenReader: boolean;
}) {
  if (screenReader) {
    return <ScreenReaderThinking text={text} />;
  }

  const borderStyle: 'single' | 'double' | 'round' | 'bold' | undefined =
    theme.border.style === 'single' ||
    theme.border.style === 'double' ||
    theme.border.style === 'round' ||
    theme.border.style === 'bold'
      ? theme.border.style
      : undefined;
  const borderColor = theme.border.color || undefined;
  const spinnerSymbol = spinnerFrames.at(frame) ?? '⠋';
  const spinnerColor = isStreaming ? theme.thinking.spinnerColor || undefined : theme.thinking.textColor || undefined;

  return (
    <Box borderStyle={borderStyle} {...(borderColor ? { borderColor } : {})} marginBottom={1} paddingLeft={1}>
      <Text {...(spinnerColor ? { color: spinnerColor } : {})}>
        {isStreaming ? `${spinnerSymbol} thinking…` : text}
      </Text>
    </Box>
  );
}

export function ThinkingBlock({ text, style, isStreaming, theme, screenReader = false }: ThinkingBlockProps) {
  const [frame, setFrame] = useState(0);
  const spinnerInterval = theme.thinking.spinnerIntervalMs ?? 80;

  useEffect(() => {
    if (style === 'blockquote' && isStreaming && !screenReader) {
      const interval = setInterval(() => {
        setFrame(f => (f + 1) % spinnerFrames.length);
      }, spinnerInterval);
      return () => {
        clearInterval(interval);
      };
    }
  }, [style, isStreaming, screenReader, spinnerInterval]);

  if (style === 'suppress') {
    return <SuppressedThinking />;
  }

  if (style === 'inline') {
    return <InlineThinking isStreaming={isStreaming} screenReader={screenReader} text={text} theme={theme} />;
  }

  return (
    <BlockquoteThinking frame={frame} isStreaming={isStreaming} screenReader={screenReader} text={text} theme={theme} />
  );
}
