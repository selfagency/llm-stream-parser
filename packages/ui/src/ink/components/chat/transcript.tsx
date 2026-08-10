import { Box } from 'ink';

import type { AcidPalette } from '../../theme/palette.ts';
import { FramedPanel } from '../framed-panel.tsx';
import { MessageBubble } from './message-bubble.tsx';
import { type ConnectionStatus, StatusFooter } from './status-footer.tsx';
import { StreamingCursor } from './streaming-cursor.tsx';
import { TokenMeter } from './token-meter.tsx';

export interface TranscriptTurn {
  readonly dim?: boolean;
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly text: string;
  readonly timestamp?: string;
}

export interface TranscriptProps {
  /** Cursor symbol while streaming. */
  readonly cursorSymbol?: string;
  /** Elapsed time in seconds. */
  readonly elapsedSec?: number;
  /** Input token count. */
  readonly inputTokens?: number;
  /** Whether streaming is in progress. */
  readonly isStreaming: boolean;
  /** Active model name. */
  readonly modelName?: string;
  /** Output token count. */
  readonly outputTokens?: number;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Provider name. */
  readonly provider?: string;
  /** Current connection status. */
  readonly status: ConnectionStatus;
  /** Ordered list of conversation turns. */
  readonly turns: readonly TranscriptTurn[];
}

/**
 * BBS-framed conversation transcript — wraps chat turns inside
 * a heavy box-drawing panel with a CONVERSATION title bar.
 */
export function Transcript({
  turns,
  palette,
  isStreaming,
  modelName,
  provider,
  status,
  elapsedSec,
  inputTokens = 0,
  outputTokens = 0,
  cursorSymbol
}: TranscriptProps) {
  return (
    <FramedPanel palette={palette} showTitleSeparator={true} title="CONVERSATION">
      <Box flexDirection="column" paddingX={1}>
        {/* Conversation turns */}
        {turns.map(turn => (
          <MessageBubble
            key={turn.id}
            palette={palette}
            role={turn.role}
            text={turn.text}
            {...(turn.timestamp === undefined ? {} : { timestamp: turn.timestamp })}
            {...(turn.dim === undefined ? {} : { dim: turn.dim })}
          />
        ))}

        {/* Streaming cursor */}
        {isStreaming ? (
          <Box marginBottom={1}>
            <StreamingCursor
              color={palette.assistantAccent}
              isStreaming={isStreaming}
              {...(cursorSymbol === undefined ? {} : { symbol: cursorSymbol })}
            />
          </Box>
        ) : null}

        {/* Token meter */}
        {inputTokens > 0 || outputTokens > 0 ? (
          <TokenMeter input={inputTokens} output={outputTokens} palette={palette} />
        ) : null}

        {/* Status footer */}
        <StatusFooter
          palette={palette}
          status={status}
          {...(modelName === undefined ? {} : { modelName })}
          {...(elapsedSec === undefined ? {} : { elapsedSec })}
          {...(provider === undefined ? {} : { provider })}
        />
      </Box>
    </FramedPanel>
  );
}
