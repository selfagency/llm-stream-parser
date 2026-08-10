import { Box, Text } from 'ink';
import { useEffect, useMemo, useState } from 'react';

import type { Theme } from '../themes/types.ts';
import { markdownToAnsi } from '../utils/markdown-to-ansi.ts';

interface StreamingTextProps {
  readonly isStreaming: boolean;
  readonly markdown?: boolean;
  readonly screenReader?: boolean;
  readonly syntaxHighlight?: boolean;
  readonly text: string;
  readonly theme: Theme;
}

export function StreamingText({
  text,
  markdown = true,
  isStreaming,
  theme,
  screenReader = false,
  syntaxHighlight = false
}: StreamingTextProps) {
  // nosemgrep: react-use-state-destructure
  // _tick is intentionally unused; setTick is used to force re-renders for cursor animation.
  const [_tick, setTick] = useState(0);

  const { stablePrefix, unstableSuffix } = useMemo(() => {
    if (!isStreaming) {
      return { stablePrefix: text, unstableSuffix: '' };
    }

    const lastBlockBoundary = text.lastIndexOf('\n\n');
    if (lastBlockBoundary === -1) {
      return { stablePrefix: '', unstableSuffix: text };
    }

    return {
      stablePrefix: text.slice(0, lastBlockBoundary + 2),
      unstableSuffix: text.slice(lastBlockBoundary + 2)
    };
  }, [text, isStreaming]);

  const [ansiPrefix, setAnsiPrefix] = useState('');
  const [ansiSuffix, setAnsiSuffix] = useState('');

  const effectiveMarkdown = screenReader ? false : markdown;

  useEffect(() => {
    let canceled = false;

    async function render() {
      const prefix = effectiveMarkdown ? await markdownToAnsi(stablePrefix, { syntaxHighlight }) : stablePrefix;
      const suffix = effectiveMarkdown ? await markdownToAnsi(unstableSuffix, { syntaxHighlight }) : unstableSuffix;

      if (!canceled) {
        setAnsiPrefix(prefix);
        setAnsiSuffix(suffix);
      }
    }

    render();

    return () => {
      canceled = true;
    };
  }, [stablePrefix, unstableSuffix, effectiveMarkdown, syntaxHighlight]);

  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        setTick(t => t + 1);
      }, 100);
      return () => {
        clearInterval(interval);
      };
    }
  }, [isStreaming]);

  return (
    <Box flexDirection="column">
      <Text>{ansiPrefix}</Text>
      <Text>
        {ansiSuffix}
        {isStreaming && !screenReader && theme.text.cursorSymbol}
      </Text>
    </Box>
  );
}
