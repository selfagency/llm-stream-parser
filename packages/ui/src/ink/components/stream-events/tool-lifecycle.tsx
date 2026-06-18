import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';

import { animationInterval, reducedMotion, spinnerFrames } from '../../theme/motion.ts';
import type { AcidPalette } from '../../theme/palette.ts';

export type ToolCallStatus = 'pending' | 'executing' | 'done' | 'failed';

export interface ToolCallEvent {
  /** Arguments (JSON string or object). */
  readonly args?: Record<string, unknown>;
  /** Tool call ID. */
  readonly id: string;
  /** Tool name (e.g. "read_file"). */
  readonly name: string;
  /** Result text (present when done/failed). */
  readonly result?: string;
  /** Current status. */
  readonly status: ToolCallStatus;
}

export interface ToolLifecycleProps {
  /** Ordered list of tool call events. */
  readonly calls: readonly ToolCallEvent[];
  /** Semantic palette. */
  readonly palette: AcidPalette;
}

const toolSpinner = ['⠋', '⠙', '⠸', '⠴'];

const statusColors: Record<ToolCallStatus, keyof AcidPalette> = {
  pending: 'pending',
  executing: 'info',
  done: 'success',
  failed: 'error'
};

const statusSymbols: Record<ToolCallStatus, string> = {
  pending: '○',
  executing: '◈',
  done: '✓',
  failed: '⊗'
};

/**
 * Tool call lifecycle display — renders each tool call with
 * status indicator, name, arguments, and optional result.
 */
export function ToolLifecycle({ calls, palette }: ToolLifecycleProps) {
  const [frame, setFrame] = useState(0);
  const frames = spinnerFrames(toolSpinner);

  useEffect(() => {
    if (reducedMotion()) {
      return;
    }
    const interval = setInterval(() => setFrame(f => (f + 1) % frames.length), animationInterval(120, 1200));
    return () => {
      clearInterval(interval);
    };
  }, [frames.length]);

  if (calls.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      {calls.map((call, idx) => {
        const colorKey = statusColors[call.status];
        const color = palette[colorKey];
        const symbol = call.status === 'executing' ? (frames[frame] ?? '◈') : statusSymbols[call.status];
        const borderStyleVal = 'bold' as const;

        return (
          <Box
            borderColor={color}
            borderStyle={borderStyleVal}
            flexDirection="column"
            key={call.id}
            marginBottom={idx < calls.length - 1 ? 1 : 0}
            paddingX={1}
          >
            {/* Header line: symbol + name */}
            <Box>
              <Text color={color}>{symbol} </Text>
              <Text bold color={color}>
                {call.name}
              </Text>
            </Box>

            {/* Arguments (compact JSON) */}
            {call.args && Object.keys(call.args).length > 0 ? (
              <Box marginLeft={2}>
                <Text color={palette.assistantDim} dimColor>
                  {JSON.stringify(call.args)}
                </Text>
              </Box>
            ) : null}

            {/* Result */}
            {call.result ? (
              <Box marginLeft={2} marginTop={0}>
                <Text
                  color={call.status === 'failed' ? palette.error : palette.assistantDim}
                  dimColor={call.status !== 'failed'}
                >
                  {call.result.length > 200 ? `${call.result.slice(0, 200)}…` : call.result}
                </Text>
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
