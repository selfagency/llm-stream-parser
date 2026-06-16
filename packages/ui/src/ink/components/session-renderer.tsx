import { Box } from 'ink';

import type { AcidPalette } from '../theme/palette.ts';
import type { ConnectionStatus } from './chat/status-footer.tsx';
import type { TranscriptTurn } from './chat/transcript.tsx';
import { Transcript } from './chat/transcript.tsx';
import { FramedPanel } from './framed-panel.tsx';
import { ModelDelta } from './stream-events/model-delta.tsx';
import { StreamThinkingBlock } from './stream-events/thinking-block.tsx';
import type { ToolCallEvent } from './stream-events/tool-lifecycle.tsx';
import { ToolLifecycle } from './stream-events/tool-lifecycle.tsx';

export interface SessionStreamEvent {
  /** Tool calls emitted so far. */
  readonly calls: readonly ToolCallEvent[];
  /** Whether thinking is still in progress. */
  readonly isThinking: boolean;
  /** Latest model text delta. */
  readonly modelDelta: string;
  /** Whether the model is actively streaming content. */
  readonly modelIsStreaming: boolean;
  /** Thinking text accumulated. */
  readonly thinkingText: string;
}

export interface InkSessionRendererProps {
  /** Cursor symbol while streaming. */
  readonly cursorSymbol?: string;
  /** Elapsed time in seconds. */
  readonly elapsedSec?: number;
  /** Input token count. */
  readonly inputTokens?: number;
  /** Whether the session is currently streaming. */
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
  /** Live stream events emitted during the current turn. */
  readonly streamEvent: SessionStreamEvent;
  /** Ordered list of conversation turns (prior messages). */
  readonly turns: readonly TranscriptTurn[];
}

/**
 * Full-session Ink renderer for a streaming agent conversation.
 *
 * Combines conversation transcript (prior turns) with live stream events
 * (thinking, tool calls, model deltas) in a framed layout.
 */
export function InkSessionRenderer({
  turns,
  palette,
  isStreaming,
  streamEvent,
  modelName,
  provider,
  status,
  elapsedSec,
  inputTokens = 0,
  outputTokens = 0,
  cursorSymbol
}: InkSessionRendererProps) {
  return (
    <Box flexDirection="column">
      {/* Conversation transcript (prior turns) */}
      <Transcript
        inputTokens={inputTokens}
        isStreaming={isStreaming}
        outputTokens={outputTokens}
        palette={palette}
        status={status}
        turns={turns}
        {...(cursorSymbol === undefined ? {} : { cursorSymbol })}
        {...(elapsedSec === undefined ? {} : { elapsedSec })}
        {...(modelName === undefined ? {} : { modelName })}
        {...(provider === undefined ? {} : { provider })}
      />

      {/* Live stream events — only shown during streaming */}
      {isStreaming ? (
        <FramedPanel palette={palette} showTitleSeparator={false} title="STREAM">
          <Box flexDirection="column" paddingX={1}>
            {/* Thinking block */}
            {streamEvent.isThinking || streamEvent.thinkingText.length > 0 ? (
              <StreamThinkingBlock
                expanded={true}
                isInProgress={streamEvent.isThinking}
                palette={palette}
                text={streamEvent.thinkingText}
              />
            ) : null}

            {/* Tool calls */}
            {streamEvent.calls.length > 0 ? <ToolLifecycle calls={streamEvent.calls} palette={palette} /> : null}

            {/* Model text delta */}
            {streamEvent.modelDelta.length > 0 ? (
              <ModelDelta isDelta={true} palette={palette} text={streamEvent.modelDelta} />
            ) : null}

            {/* No activity yet */}
            {streamEvent.thinkingText.length === 0 &&
            streamEvent.calls.length === 0 &&
            streamEvent.modelDelta.length === 0 ? (
              <ModelDelta isDelta={false} palette={palette} text="Waiting for response…" />
            ) : null}
          </Box>
        </FramedPanel>
      ) : null}
    </Box>
  );
}
