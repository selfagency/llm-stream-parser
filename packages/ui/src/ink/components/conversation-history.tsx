import { Box, Static, Text } from 'ink';

import type { ConversationTurn } from '../create-ink-conversation-renderer.ts';
import type { Theme } from '../themes/types.ts';
import { StreamingText } from './streaming-text.tsx';
import { ThinkingBlock } from './thinking-block.tsx';
import { ToolCallBlock } from './tool-call-block.tsx';

interface ConversationHistoryProps {
  readonly options: {
    readonly showThinking?: boolean | undefined;
    readonly thinkingStyle?: 'blockquote' | 'inline' | 'suppress' | undefined;
    readonly showToolCalls?: boolean | undefined;
    readonly markdown?: boolean | undefined;
    readonly syntaxHighlight?: boolean | undefined;
  };
  readonly screenReader?: boolean | undefined;
  readonly theme: Theme;
  readonly turns: readonly ConversationTurn[];
}

export function ConversationHistory({ turns, theme, screenReader = false, options }: ConversationHistoryProps) {
  const {
    showThinking = true,
    thinkingStyle = 'blockquote',
    showToolCalls = true,
    markdown = true,
    syntaxHighlight = false
  } = options;

  return (
    <Static items={turns as ConversationTurn[]}>
      {turn => (
        <Box flexDirection="column" key={turn.id} marginBottom={1}>
          {turn.role === 'user' ? (
            <Text bold>{`› ${turn.text}`}</Text>
          ) : (
            <Box flexDirection="column">
              {showThinking && turn.thinking && (
                <ThinkingBlock
                  isStreaming={false}
                  screenReader={screenReader}
                  style={thinkingStyle}
                  text={turn.thinking}
                  theme={theme}
                />
              )}
              {showToolCalls &&
                turn.toolCalls.map(call => (
                  <ToolCallBlock call={call} key={call.id} screenReader={screenReader} theme={theme} />
                ))}
              <StreamingText
                isStreaming={false}
                markdown={markdown}
                screenReader={screenReader}
                syntaxHighlight={syntaxHighlight}
                text={turn.text}
                theme={theme}
              />
            </Box>
          )}
        </Box>
      )}
    </Static>
  );
}
