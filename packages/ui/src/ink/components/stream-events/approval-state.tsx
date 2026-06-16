import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';

import type { AcidPalette } from '../../theme/palette.ts';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalStateProps {
  /** Action being approved (e.g. "execute tool: read_file"). */
  readonly action: string;
  /** Countdown seconds (only when pending). */
  readonly countdownSec?: number;
  /** Semantic palette. */
  readonly palette: AcidPalette;
  /** Current approval status. */
  readonly status: ApprovalStatus;
}

const statusConfig: Record<ApprovalStatus, { color: keyof AcidPalette; symbol: string; label: string }> = {
  pending: { color: 'pending', symbol: '◔', label: 'awaiting approval' },
  approved: { color: 'success', symbol: '✓', label: 'approved' },
  rejected: { color: 'error', symbol: '⊗', label: 'rejected' }
};

/**
 * Approval state display — shows pending/approved/rejected
 * with action description and optional countdown timer.
 */
export function ApprovalState({ status, action, palette, countdownSec }: ApprovalStateProps) {
  const [pulse, setPulse] = useState(0);
  const cfg = statusConfig[status];

  // Pulse animation only when pending
  useEffect(() => {
    if (status !== 'pending') {
      setPulse(0);
      return;
    }
    const interval = setInterval(() => setPulse(p => (p + 1) % 3), 500);
    return () => {
      clearInterval(interval);
    };
  }, [status]);

  const color = palette[cfg.color];
  const pulseDots = status === 'pending' ? '.'.repeat(pulse) : '';

  return (
    <Box borderColor={color} borderStyle="bold" marginBottom={1} paddingX={1}>
      <Box flexDirection="column">
        <Box>
          <Text bold color={color}>
            {cfg.symbol} {cfg.label}
          </Text>
          {countdownSec !== undefined && status === 'pending' ? (
            <Text color={palette.frameDim}>
              {' '}
              ({countdownSec}s){pulseDots}
            </Text>
          ) : null}
        </Box>
        <Box marginLeft={2}>
          <Text color={palette.assistantDim} dimColor>
            {action}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
